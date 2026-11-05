import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ ingest: vi.fn(), getSessionUser: vi.fn(), driver: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { driver: { findUnique: mocks.driver } } }));
vi.mock('@/lib/auth-guard', () => ({
  getSessionUser: mocks.getSessionUser,
  requireRole: vi.fn(),
}));
vi.mock('@/lib/rate-limit', () => ({ withRateLimit: (handler: unknown) => handler, RATE_LIMIT_CONFIG: { LOCATION_INGEST: {} } }));
vi.mock('@/server/tracking/service', () => ({ ingestLocations: mocks.ingest }));

import { POST } from '@/app/api/tracking/locations/route';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSessionUser.mockResolvedValue({ id: 'user', role: 'DRIVER' });
  mocks.driver.mockResolvedValue({ id: 'driver' });
});

it('maps service rejection indexes back to their original batch positions', async () => {
  mocks.ingest.mockResolvedValue({ accepted: 1, rejected: [{ index: 0, reason: 'Accuracy exceeds cap' }] });
  const point = { lat: 21, lng: 105, accuracyM: 10, recordedAt: new Date().toISOString() };
  const request = new NextRequest('https://example.test/api/tracking/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: [{ ...point, lat: 200 }, { ...point, accuracyM: 300 }, point] }),
  });
  const response = await POST(request, undefined);
  expect(response.status).toBe(200);
  const { data } = await response.json();
  expect(data.accepted).toBe(1);
  expect(data.rejected).toEqual([
    expect.objectContaining({ index: 0 }),
    { index: 1, reason: 'Accuracy exceeds cap' },
  ]);
  expect(mocks.ingest).toHaveBeenCalledWith('driver', expect.arrayContaining([expect.objectContaining({ accuracyM: 300 })]));
});
