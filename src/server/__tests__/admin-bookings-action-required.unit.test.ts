import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BookingStatus } from '@prisma/client';

import { ApiError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  bookingCount: vi.fn(),
  dispatchSweep: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  getSessionUser: mocks.user,
  requireRole: (user: { role: string }, role: string) => {
    if (user.role !== role) {
      throw new ApiError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: {
      count: mocks.bookingCount,
    },
  },
}));

vi.mock('@/server/dispatch/service', () => ({
  dispatchSweep: mocks.dispatchSweep,
}));

import { GET } from '@/app/api/admin/bookings/action-required/route';

describe('GET /api/admin/bookings/action-required', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects non-admin role with 403', async () => {
    mocks.user.mockResolvedValue({ id: 'user-1', name: 'User Regular', role: 'USER' });

    const res = await GET(new NextRequest('https://example.test/api/admin/bookings/action-required'), undefined);
    expect(res.status).toBe(403);
  });

  it('rejects driver role with 403', async () => {
    mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Driver KCIC', role: 'DRIVER' });

    const res = await GET(new NextRequest('https://example.test/api/admin/bookings/action-required'), undefined);
    expect(res.status).toBe(403);
  });

  it('returns count of bookings needing action for admin', async () => {
    mocks.user.mockResolvedValue({ id: 'admin-1', name: 'Admin Fleet', role: 'ADMIN' });
    mocks.dispatchSweep.mockResolvedValue(undefined);
    mocks.bookingCount.mockResolvedValue(3);

    const res = await GET(new NextRequest('https://example.test/api/admin/bookings/action-required'), undefined);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.count).toBe(3);

    expect(mocks.bookingCount).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            status: {
              in: [
                BookingStatus.PENDING,
                BookingStatus.ADMIN_INTERVENTION,
                BookingStatus.NO_DRIVER_AVAILABLE,
              ],
            },
          },
          {
            status: BookingStatus.PENDING_COMPLETION,
            rejectedReason: null,
          },
        ],
      },
    });
  });

  it('handles background dispatchSweep failure gracefully and still returns count', async () => {
    mocks.user.mockResolvedValue({ id: 'admin-1', name: 'Admin Fleet', role: 'ADMIN' });
    mocks.dispatchSweep.mockRejectedValue(new Error('Sweep failed'));
    mocks.bookingCount.mockResolvedValue(1);

    const res = await GET(new NextRequest('https://example.test/api/admin/bookings/action-required'), undefined);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.data.count).toBe(1);
  });
});
