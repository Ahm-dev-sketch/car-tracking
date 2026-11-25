import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

import { ApiError } from '@/lib/errors';

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  bookingFindUnique: vi.fn(),
  driverFindUnique: vi.fn(),
  chatFindMany: vi.fn(),
  offerFindUnique: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  getSessionUser: mocks.getSessionUser,
  // Faithful reimplementation of requireRole so we still exercise the real
  // role-gating semantics without pulling in the next-auth config at import.
  requireRole: (user: { role?: string } | null | undefined, ...allowedRoles: string[]) => {
    if (!user || !user.role) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        `Insufficient permissions: required one of [${allowedRoles.join(', ')}]`
      );
    }
    return user;
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { findUnique: mocks.bookingFindUnique },
    driver: { findUnique: mocks.driverFindUnique },
    fleetChatMessage: { findMany: mocks.chatFindMany },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: false,
  supabase: {
    from: vi.fn(),
    channel: vi.fn().mockReturnValue({
      send: vi.fn().mockResolvedValue({}),
    }),
  },
}));

import { GET as getBooking } from '@/app/api/bookings/[id]/route';
import { POST as cancelBooking } from '@/app/api/bookings/[id]/cancel/route';
import { GET as getChatMessages } from '@/app/api/chat/messages/route';
import { POST as acceptOfferRoute } from '@/app/api/driver/offers/[id]/accept/route';
import { GET as getAdminStatsRoute } from '@/app/api/admin/stats/route';
import { GET as getDriverRoute } from '@/app/api/drivers/[id]/route';

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/bookings/[id] — cross-user read (IDOR)', () => {
  it('rejects passenger A reading passenger B booking with 403', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'user-a', role: 'USER' });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'b-1',
      userId: 'user-b',
      status: 'PENDING',
      driver: null,
    });

    const req = new NextRequest('https://example.test/api/bookings/b-1');
    const res = await getBooking(req, { params: Promise.resolve({ id: 'b-1' }) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });
});

describe('POST /api/bookings/[id]/cancel — cross-user cancel (IDOR)', () => {
  it('rejects passenger A cancelling passenger B booking with 403', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'user-a', role: 'USER' });
    // First lookup: route status pre-check (select id,status).
    // Second lookup: transitionBooking (include) with a foreign owner.
    mocks.bookingFindUnique
      .mockResolvedValueOnce({ id: 'b-1', status: 'PENDING' })
      .mockResolvedValueOnce({
        id: 'b-1',
        userId: 'user-b',
        status: 'PENDING',
        driver: null,
      });

    const req = new NextRequest('https://example.test/api/bookings/b-1/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: 'not mine' }),
    });
    const res = await cancelBooking(req, { params: Promise.resolve({ id: 'b-1' }) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/chat/messages — non-participant read (IDOR)', () => {
  it('rejects passenger A reading passenger B booking chat with 403', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'user-a', role: 'USER' });
    mocks.bookingFindUnique.mockResolvedValue({
      id: 'b-101',
      userId: 'user-b',
      driver: { userId: 'driver-b' },
    });

    const req = new NextRequest('https://example.test/api/chat/messages?bookingId=b-101');
    const res = await getChatMessages(req, undefined);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
    expect(mocks.chatFindMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/driver/offers/[id]/accept — cross-driver offer (IDOR)', () => {
  it('rejects driver A accepting driver B offer with 403', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'driver-a-user', role: 'DRIVER' });
    mocks.driverFindUnique.mockResolvedValue({ id: 'driver-a' });
    mocks.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ bookingOffer: { findUnique: mocks.offerFindUnique } })
    );
    mocks.offerFindUnique.mockResolvedValue({
      id: 'offer-1',
      driverId: 'driver-b',
      status: 'SENT',
      expiresAt: new Date(Date.now() + 60_000),
      bookingId: 'b-1',
    });

    const req = new NextRequest('https://example.test/api/driver/offers/offer-1/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await acceptOfferRoute(req, { params: Promise.resolve({ id: 'offer-1' }) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/admin/stats — non-admin (BAC)', () => {
  it('rejects a USER-role session with 403', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', role: 'USER' });

    const req = new NextRequest('https://example.test/api/admin/stats');
    const res = await getAdminStatsRoute(req, undefined);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
  });
});

describe('GET /api/drivers/[id] — driver PII for non-admin (BAC)', () => {
  it('rejects a USER-role session with 403 before any driver read', async () => {
    mocks.getSessionUser.mockResolvedValue({ id: 'u1', role: 'USER' });

    const req = new NextRequest('https://example.test/api/drivers/drv-1');
    const res = await getDriverRoute(req, { params: Promise.resolve({ id: 'drv-1' }) });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe('FORBIDDEN');
    expect(mocks.driverFindUnique).not.toHaveBeenCalled();
  });
});
