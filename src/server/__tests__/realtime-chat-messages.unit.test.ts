import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRawUnsafe: mocks.queryRawUnsafe,
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

import { GET, POST, PATCH } from '@/app/api/chat/messages/route';

beforeEach(() => {
  vi.resetAllMocks();
});

it('rejects GET /api/chat/messages when neither bookingId nor tripId is supplied', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  const req = new NextRequest('https://example.test/api/chat/messages');
  const res = await GET(req, undefined);

  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error.code).toBe('INVALID_PARAMS');
});

it('returns messages for bookingId via fallback query when Supabase not configured', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.queryRawUnsafe.mockResolvedValue([
    {
      id: 'msg-1',
      bookingId: 'b-101',
      tripId: null,
      senderId: 'user-1',
      senderName: 'John Doe',
      senderRole: 'USER',
      receiverId: 'driver-1',
      message: 'Saya sudah di lobby',
      isRead: false,
      createdAt: '2026-11-06T10:00:00Z',
    },
  ]);

  const req = new NextRequest('https://example.test/api/chat/messages?bookingId=b-101');
  const res = await GET(req, undefined);

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.data).toHaveLength(1);
  expect(json.data[0].message).toBe('Saya sudah di lobby');
});

it('rejects POST /api/chat/messages with empty message payload', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', message: '' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(400);
});

it('saves and returns 201 for valid POST /api/chat/messages', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.queryRawUnsafe.mockResolvedValue([
    {
      id: 'msg-new',
      booking_id: 'b-101',
      trip_id: null,
      sender_id: 'user-1',
      sender_name: 'John Doe',
      sender_role: 'USER',
      receiver_id: 'driver-1',
      message: 'Halo Pak Driver',
      is_read: false,
      created_at: '2026-11-06T10:05:00Z',
    },
  ]);

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId: 'b-101',
      receiverId: 'driver-1',
      message: 'Halo Pak Driver',
    }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.data.message).toBe('Halo Pak Driver');
});

it('returns messages when both bookingId and tripId are provided without excluding messages with null tripId', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Budi Driver', role: 'DRIVER' });
  mocks.queryRawUnsafe.mockResolvedValue([
    {
      id: 'msg-user',
      bookingId: 'b-101',
      tripId: null,
      senderId: 'user-1',
      senderName: 'John Doe',
      senderRole: 'USER',
      receiverId: 'driver-1',
      message: 'Saya sudah tunggu di depan lobi',
      isRead: false,
      createdAt: '2026-11-06T10:00:00Z',
    },
  ]);

  const req = new NextRequest('https://example.test/api/chat/messages?bookingId=b-101&tripId=t-202');
  const res = await GET(req, undefined);

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.data).toHaveLength(1);
  expect(json.data[0].message).toBe('Saya sudah tunggu di depan lobi');
  expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('OR ($2::text IS NOT NULL AND trip_id = $2)'),
    'b-101',
    't-202'
  );
});

it('rejects PATCH /api/chat/messages when neither bookingId nor tripId is supplied', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Budi Driver', role: 'DRIVER' });
  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  const res = await PATCH(req, undefined);
  expect(res.status).toBe(400);
  const json = await res.json();
  expect(json.error.code).toBe('INVALID_PARAMS');
});

it('marks messages as read via PATCH /api/chat/messages', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Budi Driver', role: 'DRIVER' });
  mocks.queryRawUnsafe.mockResolvedValue([]);

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101' }),
  });

  const res = await PATCH(req, undefined);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);

  expect(mocks.queryRawUnsafe).toHaveBeenCalledWith(
    expect.stringContaining('UPDATE fleet_chat_messages'),
    'driver-1',
    'b-101',
    null
  );
});
