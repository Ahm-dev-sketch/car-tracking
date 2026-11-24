import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  bookingFindUnique: vi.fn(),
  driverFindFirst: vi.fn(),
  tripFindUnique: vi.fn(),
  tripFindFirst: vi.fn(),
  chatCreate: vi.fn(),
  chatFindMany: vi.fn(),
  chatUpdateMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    booking: { findUnique: mocks.bookingFindUnique },
    driver: { findFirst: mocks.driverFindFirst },
    trip: { findUnique: mocks.tripFindUnique, findFirst: mocks.tripFindFirst },
    fleetChatMessage: {
      create: mocks.chatCreate,
      findMany: mocks.chatFindMany,
      updateMany: mocks.chatUpdateMany,
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

import { GET, POST, PATCH } from '@/app/api/chat/messages/route';

const participantBooking = (overrides: Record<string, unknown> = {}) => ({
  id: 'b-101',
  userId: 'user-1',
  driver: { userId: 'driver-1' },
  ...overrides,
});

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

it('returns messages for bookingId via Prisma model', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.chatFindMany.mockResolvedValue([
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
      createdAt: new Date('2026-11-06T10:00:00Z'),
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
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.tripFindFirst.mockResolvedValue(null);
  mocks.driverFindFirst.mockResolvedValue({ sessions: [] });
  mocks.chatCreate.mockResolvedValue({
    id: 'msg-new',
    bookingId: 'b-101',
    tripId: null,
    senderId: 'user-1',
    senderName: 'John Doe',
    senderRole: 'USER',
    receiverId: 'driver-1',
    message: 'Halo Pak Driver',
    isRead: false,
    createdAt: new Date('2026-11-06T10:05:00Z'),
  });

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

it('returns messages when both bookingId and tripId are provided', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Budi Driver', role: 'DRIVER' });
  mocks.tripFindUnique.mockResolvedValue({ bookingId: 'b-101' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.chatFindMany.mockResolvedValue([
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
      createdAt: new Date('2026-11-06T10:00:00Z'),
    },
  ]);

  const req = new NextRequest('https://example.test/api/chat/messages?bookingId=b-101&tripId=t-202');
  const res = await GET(req, undefined);

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.data).toHaveLength(1);
  expect(json.data[0].message).toBe('Saya sudah tunggu di depan lobi');
  expect(mocks.chatFindMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { bookingId: 'b-101' },
    })
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
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.chatUpdateMany.mockResolvedValue({ count: 1 });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101' }),
  });

  const res = await PATCH(req, undefined);
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.success).toBe(true);

  expect(mocks.chatUpdateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { senderId: { not: 'driver-1' }, bookingId: 'b-101' },
      data: { isRead: true },
    })
  );
});

it('returns 403 for a non-participant caller on POST', async () => {
  mocks.user.mockResolvedValue({ id: 'other-user', name: 'Stranger', role: 'USER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error.code).toBe('FORBIDDEN');
});

it('returns 503 CHAT_UNAVAILABLE when fleetChatMessage.create rejects', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.tripFindFirst.mockResolvedValue(null);
  mocks.driverFindFirst.mockResolvedValue({ sessions: [] });
  mocks.chatCreate.mockRejectedValue(new Error('db down'));

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', receiverId: 'driver-1', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(503);
  const json = await res.json();
  expect(json.error.code).toBe('CHAT_UNAVAILABLE');
});

it('returns delivered:false when receiver driver has no ACTIVE session', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.tripFindFirst.mockResolvedValue(null);
  mocks.driverFindFirst.mockResolvedValue({ sessions: [] });
  mocks.chatCreate.mockResolvedValue({
    id: 'msg-1',
    bookingId: 'b-101',
    tripId: null,
    senderId: 'user-1',
    senderName: 'John Doe',
    senderRole: 'USER',
    receiverId: 'driver-1',
    message: 'Halo',
    isRead: false,
    createdAt: new Date(),
  });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', receiverId: 'driver-1', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.delivered).toBe(false);
});

it('returns delivered:true when receiver driver has an ACTIVE session', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.tripFindFirst.mockResolvedValue(null);
  mocks.driverFindFirst.mockResolvedValue({ sessions: [{ id: 'sess-1' }] });
  mocks.chatCreate.mockResolvedValue({
    id: 'msg-2',
    bookingId: 'b-101',
    tripId: null,
    senderId: 'user-1',
    senderName: 'John Doe',
    senderRole: 'USER',
    receiverId: 'driver-1',
    message: 'Halo',
    isRead: false,
    createdAt: new Date(),
  });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', receiverId: 'driver-1', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.delivered).toBe(true);
});

it('derives receiverId to booking.userId when sender is DRIVER and receiverId omitted', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Budi Driver', role: 'DRIVER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.tripFindFirst.mockResolvedValue(null);
  mocks.driverFindFirst.mockResolvedValue(null);
  mocks.chatCreate.mockResolvedValue({
    id: 'msg-3',
    bookingId: 'b-101',
    tripId: null,
    senderId: 'driver-1',
    senderName: 'Budi Driver',
    senderRole: 'DRIVER',
    receiverId: 'user-1',
    message: 'Halo',
    isRead: false,
    createdAt: new Date(),
  });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json.data.receiverId).toBe('user-1');
  expect(mocks.chatCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ receiverId: 'user-1' }),
    })
  );
});

it('returns 403 for GET with bookingId and a foreign tripId', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.tripFindUnique.mockResolvedValue({ bookingId: 'b-202' });

  const req = new NextRequest('https://example.test/api/chat/messages?bookingId=b-101&tripId=t-202');
  const res = await GET(req, undefined);

  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error.code).toBe('FORBIDDEN');
  expect(mocks.bookingFindUnique).not.toHaveBeenCalled();
  expect(mocks.chatFindMany).not.toHaveBeenCalled();
});

it('returns 403 for POST with bookingId and a foreign tripId', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.tripFindUnique.mockResolvedValue({ bookingId: 'b-202' });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', tripId: 't-202', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error.code).toBe('FORBIDDEN');
  expect(mocks.chatCreate).not.toHaveBeenCalled();
});

it('returns 403 for PATCH with bookingId and a foreign tripId', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.tripFindUnique.mockResolvedValue({ bookingId: 'b-202' });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', tripId: 't-202' }),
  });

  const res = await PATCH(req, undefined);
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error.code).toBe('FORBIDDEN');
  expect(mocks.chatUpdateMany).not.toHaveBeenCalled();
});

it('returns 403 for POST with a tripId belonging to a booking the caller is not part of', async () => {
  mocks.user.mockResolvedValue({ id: 'user-1', name: 'John Doe', role: 'USER' });
  mocks.tripFindUnique.mockResolvedValue({ bookingId: 'b-202' });
  mocks.bookingFindUnique.mockResolvedValue({
    id: 'b-202',
    userId: 'someone-else',
    driver: { userId: 'other-driver' },
  });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tripId: 't-202', message: 'Halo' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(403);
  const json = await res.json();
  expect(json.error.code).toBe('FORBIDDEN');
  expect(mocks.chatCreate).not.toHaveBeenCalled();
});

it('derives senderRole from the session user, ignoring a client-supplied senderRole', async () => {
  mocks.user.mockResolvedValue({ id: 'driver-1', name: 'Budi Driver', role: 'DRIVER' });
  mocks.bookingFindUnique.mockResolvedValue(participantBooking());
  mocks.tripFindFirst.mockResolvedValue(null);
  mocks.driverFindFirst.mockResolvedValue(null);
  mocks.chatCreate.mockResolvedValue({
    id: 'msg-4',
    bookingId: 'b-101',
    tripId: null,
    senderId: 'driver-1',
    senderName: 'Budi Driver',
    senderRole: 'DRIVER',
    receiverId: 'user-1',
    message: 'Halo',
    isRead: false,
    createdAt: new Date(),
  });

  const req = new NextRequest('https://example.test/api/chat/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookingId: 'b-101', message: 'Halo', senderRole: 'SYSTEM' }),
  });

  const res = await POST(req, undefined);
  expect(res.status).toBe(201);
  expect(mocks.chatCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ senderRole: 'DRIVER' }),
    })
  );
});
