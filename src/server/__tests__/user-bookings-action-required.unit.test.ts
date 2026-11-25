import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BookingStatus } from '@prisma/client';

import { ApiError } from '@/lib/errors';
import { computeUserActionBadgeCount } from '@/lib/user-booking-badge';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  bookingCount: vi.fn(),
  bookingUpdateMany: vi.fn(),
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
      updateMany: mocks.bookingUpdateMany,
    },
  },
}));

import { GET, POST } from '@/app/api/user/bookings/action-required/route';

describe('User My bookings badge logic (computeUserActionBadgeCount)', () => {
  it('counts all non-terminal/active bookings and ignores COMPLETED and CANCELLED', () => {
    const bookings = [
      { id: 'b-1', status: 'PENDING' },
      { id: 'b-2', status: 'APPROVED' },
      { id: 'b-3', status: 'SEARCHING_DRIVER' },
      { id: 'b-4', status: 'DRIVER_NOTIFIED' },
      { id: 'b-5', status: 'DRIVER_ASSIGNED' },
      { id: 'b-6', status: 'DRIVER_EN_ROUTE' },
      { id: 'b-7', status: 'ARRIVED' },
      { id: 'b-8', status: 'IN_PROGRESS' },
      { id: 'b-9', status: 'PENDING_COMPLETION' },
      { id: 'b-10', status: 'NO_DRIVER_AVAILABLE' },
      { id: 'b-11', status: 'ADMIN_INTERVENTION' },
      { id: 'b-12', status: 'COMPLETED' },
      { id: 'b-13', status: 'CANCELLED' },
    ];

    expect(computeUserActionBadgeCount(bookings)).toBe(11);
  });

  it('counts REJECTED when unseen and decrements by 1 when seen without resetting active bookings', () => {
    const initial = [
      { id: 'active-1', status: 'IN_PROGRESS', rejectionSeenAt: null },
      { id: 'nota-1', status: 'PENDING_COMPLETION', rejectionSeenAt: null },
      { id: 'rej-1', status: 'REJECTED', rejectionSeenAt: null },
      { id: 'rej-2', status: 'REJECTED', rejectionSeenAt: null },
      { id: 'done-1', status: 'COMPLETED', rejectionSeenAt: null },
    ];

    // 2 active/action-required + 2 unseen rejected = 4
    expect(computeUserActionBadgeCount(initial)).toBe(4);

    // Clicking/opening rej-1 reduces count by 1 (via server timestamp OR local seen set)
    const afterServerAck = [
      ...initial.slice(0, 2),
      { id: 'rej-1', status: 'REJECTED', rejectionSeenAt: '2026-11-25T10:00:00.000Z' },
      initial[3],
      initial[4],
    ];
    expect(computeUserActionBadgeCount(afterServerAck)).toBe(3);
    expect(computeUserActionBadgeCount(initial, ['rej-1'])).toBe(3);

    // After both REJECTED are seen, the 2 active bookings stay counted
    expect(computeUserActionBadgeCount(initial, ['rej-1', 'rej-2'])).toBe(2);
  });
});

describe('/api/user/bookings/action-required', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects ADMIN and DRIVER roles with 403', async () => {
    mocks.user.mockResolvedValue({ id: 'admin-1', role: 'ADMIN' });
    const resAdmin = await GET(
      new NextRequest('https://example.test/api/user/bookings/action-required'),
      undefined
    );
    expect(resAdmin.status).toBe(403);

    mocks.user.mockResolvedValue({ id: 'drv-1', role: 'DRIVER' });
    const resDriver = await GET(
      new NextRequest('https://example.test/api/user/bookings/action-required'),
      undefined
    );
    expect(resDriver.status).toBe(403);
  });

  it('queries active + unseen REJECTED bookings scoped to session.user.id', async () => {
    mocks.user.mockResolvedValue({ id: 'user-1', role: 'USER' });
    mocks.bookingCount.mockResolvedValue(3);

    const res = await GET(
      new NextRequest('https://example.test/api/user/bookings/action-required'),
      undefined
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.count).toBe(3);

    expect(mocks.bookingCount).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        OR: [
          {
            status: {
              notIn: [
                BookingStatus.COMPLETED,
                BookingStatus.CANCELLED,
                BookingStatus.REJECTED,
              ],
            },
          },
          {
            status: BookingStatus.REJECTED,
            rejectionSeenAt: null,
          },
        ],
      },
    });
  });

  it('marks REJECTED booking as seen on POST and returns remaining active count', async () => {
    mocks.user.mockResolvedValue({ id: 'user-1', role: 'USER' });
    mocks.bookingUpdateMany.mockResolvedValue({ count: 1 });
    mocks.bookingCount.mockResolvedValue(2);

    const req = new NextRequest('https://example.test/api/user/bookings/action-required', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'rej-1' }),
    });

    const res = await POST(req, undefined);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ updatedCount: 1, count: 2 });

    expect(mocks.bookingUpdateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        id: { in: ['rej-1'] },
        status: BookingStatus.REJECTED,
        rejectionSeenAt: null,
      },
      data: {
        rejectionSeenAt: expect.any(Date),
      },
    });
  });

  it('validates that POST body includes at least one bookingId', async () => {
    mocks.user.mockResolvedValue({ id: 'user-1', role: 'USER' });

    const req = new NextRequest('https://example.test/api/user/bookings/action-required', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req, undefined);
    expect(res.status).toBe(400);
    expect(mocks.bookingUpdateMany).not.toHaveBeenCalled();
  });
});
