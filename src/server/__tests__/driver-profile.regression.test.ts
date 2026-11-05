import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ user: vi.fn(), driver: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { driver: { findUnique: mocks.driver } } }));
vi.mock('@/lib/auth-guard', () => ({ getSessionUser: mocks.user }));
import { GET } from '@/app/api/me/route';

beforeEach(() => vi.resetAllMocks());

it('returns only the authenticated driver profile using explicit safe fields', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-user', role: 'DRIVER' });
  mocks.driver.mockResolvedValue({ id: 'driver', status: 'OFFLINE', licenseNumber: 'LICENSE', currentVehicle: null });
  const response = await GET(new NextRequest('https://example.test/api/me'), undefined);
  expect(response.status).toBe(200);
  expect((await response.json()).driver.id).toBe('driver');
  expect(mocks.driver).toHaveBeenCalledWith({
    where: { userId: 'driver-user' },
    select: {
      id: true, status: true, licenseNumber: true,
      currentVehicle: { include: { homeLocation: true, currentOperationalLocation: true } },
    },
  });
});

it('does not look up or expose a driver profile for unrelated users', async () => {
  mocks.user.mockResolvedValue({ id: 'passenger', role: 'USER' });
  const response = await GET(new NextRequest('https://example.test/api/me'), undefined);
  expect((await response.json()).driver).toBeNull();
  expect(mocks.driver).not.toHaveBeenCalled();
});
