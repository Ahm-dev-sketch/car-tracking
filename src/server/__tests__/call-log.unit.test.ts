import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  executeRawUnsafe: vi.fn(),
  queryRawUnsafe: vi.fn(),
  tripFindFirst: vi.fn(),
  tripFindUnique: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRawUnsafe: mocks.executeRawUnsafe,
    $queryRawUnsafe: mocks.queryRawUnsafe,
    trip: {
      findFirst: mocks.tripFindFirst,
      findUnique: mocks.tripFindUnique,
    },
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  getSessionUser: mocks.user,
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

import { POST } from '@/app/api/call/log/route';

beforeEach(() => {
  vi.resetAllMocks();
});

it('rejects unauthenticated requests with 401', async () => {
  mocks.user.mockRejectedValue(new Error('Authentication required'));
  const req = new NextRequest('https://example.test/api/call/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'MISSED' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(500);
});

it('rejects POST /api/call/log with invalid status', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  const req = new NextRequest('https://example.test/api/call/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-1', status: 'INVALID_STATUS' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(400);
});

it('logs MISSED call and creates system chat message successfully', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.executeRawUnsafe.mockResolvedValue(1);
  mocks.queryRawUnsafe.mockResolvedValue([
    {
      id: 'msg-system-1',
      booking_id: 'b-101',
      trip_id: null,
      sender_id: 'user-1',
      sender_name: 'Sistem',
      sender_role: 'SYSTEM',
      receiver_id: 'driver-1',
      message: '📞 Panggilan suara tak terjawab (30 detik)',
      is_read: false,
      created_at: '2026-11-10T07:30:00Z',
    },
  ]);

  const req = new NextRequest('https://example.test/api/call/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: 'b-101',
      receiverId: 'driver-1',
      status: 'MISSED',
      durationSeconds: 0,
    }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.data.status).toBe('MISSED');
  expect(json.data.message).toBe('📞 Panggilan suara tak terjawab (30 detik)');
  expect(mocks.executeRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO fleet_call_logs'),
    'b-101',
    null,
    'user-1',
    'driver-1',
    'MISSED',
    0
  );
  expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('INSERT INTO fleet_chat_messages'),
    'b-101',
    null,
    'user-1',
    'Sistem',
    'SYSTEM',
    'driver-1',
    '📞 Panggilan suara tak terjawab (30 detik)'
  );
});

it('logs COMPLETED call and formats duration in system message', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Driver KCIC', role: 'DRIVER' });
  mocks.executeRawUnsafe.mockResolvedValue(1);
  mocks.queryRawUnsafe.mockResolvedValue([
    {
      id: 'msg-system-2',
      booking_id: 'b-101',
      trip_id: 't-202',
      sender_id: 'driver-1',
      sender_name: 'Sistem',
      sender_role: 'SYSTEM',
      receiver_id: 'user-1',
      message: '📞 Panggilan Suara Berakhir (02:45)',
      is_read: false,
      created_at: '2026-11-10T07:35:00Z',
    },
  ]);

  const req = new NextRequest('https://example.test/api/call/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: 'b-101',
      tripId: 't-202',
      receiverId: 'user-1',
      status: 'COMPLETED',
      durationSeconds: 165, // 2m 45s
    }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.success).toBe(true);
  expect(json.data.status).toBe('COMPLETED');
  expect(json.data.message).toBe('📞 Panggilan Suara Berakhir (02:45)');
});

