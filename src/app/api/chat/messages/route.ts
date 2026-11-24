import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { supabase } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// Single, indistinguishable 403 message so a non-participant cannot tell
// "doesn't exist" apart from "exists but excluded".
const FORBIDDEN_MESSAGE = 'Anda tidak memiliki akses ke percakapan ini.';

const sendMessageSchema = z.object({
  bookingId: z.string().trim().optional().nullable(),
  tripId: z.string().trim().optional().nullable(),
  receiverId: z.string().trim().optional().nullable(),
  message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(1000),
  senderName: z.string().trim().optional(),
});

interface ResolvedBooking {
  id: string;
  userId: string;
  driver: { userId: string } | null;
}

/**
 * Canonicalizes the chat context to a SINGLE booking and asserts the caller is
 * a participant (booking user, assigned driver, or admin). The trip (when
 * supplied) is always resolved and cross-checked against the booking so a
 * caller can never smuggle a foreign trip into the read/write path. Returns the
 * single canonical bookingId and the validated tripId so callers never
 * reconstruct a union of raw inputs.
 */
async function authorizeChat(
  user: { id: string; role: string },
  bookingId?: string | null,
  tripId?: string | null
): Promise<{ bookingId: string; tripId: string | null; booking: ResolvedBooking }> {
  let bid = bookingId ?? null;
  const tid = tripId ?? null;

  if (tid) {
    let tripBookingId: string | null = null;
    try {
      const trip = await prisma.trip.findUnique({
        where: { id: tid },
        select: { bookingId: true },
      });
      tripBookingId = trip?.bookingId ?? null;
    } catch {
      // ignore link resolution errors; fall through to 403
    }

    if (!tripBookingId) {
      throw new ApiError(403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
    }
    if (bid && bid !== tripBookingId) {
      throw new ApiError(403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
    }
    bid = tripBookingId;
  }

  if (!bid) {
    throw new ApiError(403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bid },
    select: { id: true, userId: true, driver: { select: { userId: true } } },
  });

  if (!booking) {
    throw new ApiError(403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
  }

  const isParticipant =
    booking.userId === user.id ||
    booking.driver?.userId === user.id ||
    user.role === 'ADMIN';

  if (!isParticipant) {
    throw new ApiError(403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
  }

  return { bookingId: bid, tripId: tid, booking };
}

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  const { searchParams } = new URL(req.url);
  const bookingId = searchParams.get('bookingId');
  const tripId = searchParams.get('tripId');

  if (!bookingId && !tripId) {
    return NextResponse.json(
      { error: { code: 'INVALID_PARAMS', message: 'bookingId atau tripId diperlukan' } },
      { status: 400 }
    );
  }

  const { bookingId: bid } = await authorizeChat(user, bookingId, tripId);

  try {
    const messages = await prisma.fleetChatMessage.findMany({
      where: { bookingId: bid },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    return NextResponse.json({ data: messages });
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/chat/messages GET:', err);
    throw new ApiError(503, 'CHAT_UNAVAILABLE', 'Pesan tidak dapat dimuat. Coba lagi.');
  }
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  const body = await req.json();
  const validated = sendMessageSchema.parse(body);

  const { bookingId: bid, tripId: canonicalTripId, booking } = await authorizeChat(
    user,
    validated.bookingId,
    validated.tripId
  );

  const senderName = validated.senderName || user.name || 'User';
  // senderRole is derived server-side; a session user can never be SYSTEM.
  const senderRole = user.role;

  // Auto-link bookingId -> tripId (store the active trip when omitted). The
  // active trip is scoped to `bid`, so it always belongs to the canonical booking.
  let tid = canonicalTripId;
  if (!tid) {
    try {
      const activeTrip = await prisma.trip.findFirst({
        where: { bookingId: bid, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeTrip) tid = activeTrip.id;
    } catch {
      // ignore link resolution errors
    }
  }

  // Derive / validate receiverId server-side
  const validReceivers = [booking.userId, booking.driver?.userId ?? null].filter(
    (x): x is string => Boolean(x)
  );
  let resolvedReceiverId: string | null;
  if (validated.receiverId) {
    if (!validReceivers.includes(validated.receiverId)) {
      throw new ApiError(403, 'FORBIDDEN', FORBIDDEN_MESSAGE);
    }
    resolvedReceiverId = validated.receiverId;
  } else if (user.role === 'DRIVER') {
    resolvedReceiverId = booking.userId;
  } else {
    resolvedReceiverId = booking.driver?.userId ?? null;
  }

  // Presence: only drivers have an online/offline state via an ACTIVE session.
  let delivered = true;
  if (resolvedReceiverId) {
    const d = await prisma.driver.findFirst({
      where: { OR: [{ userId: resolvedReceiverId }, { id: resolvedReceiverId }] },
      select: { sessions: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } },
    });
    if (d) {
      delivered = d.sessions.length > 0;
    }
  }

  let saved;
  try {
    saved = await prisma.fleetChatMessage.create({
      data: {
        bookingId: bid,
        tripId: tid,
        senderId: user.id,
        senderName,
        senderRole,
        receiverId: resolvedReceiverId,
        message: validated.message,
        isRead: false,
      },
    });
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/chat/messages POST:', err);
    throw new ApiError(503, 'CHAT_UNAVAILABLE', 'Pesan tidak dapat disimpan. Coba lagi.');
  }

  // Best-effort broadcast (unreliable; persistence + delivered is source of truth)
  const channelName = `chat:booking-${bid}`;
  try {
    const channel = supabase.channel(channelName);
    await channel.send({
      type: 'broadcast',
      event: 'new-message',
      payload: saved,
    });
  } catch {
    // Ignore channel broadcast error
  }

  return NextResponse.json({ data: saved, delivered }, { status: 201 });
});

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  const body = await req.json().catch(() => ({}));
  const bookingId = body.bookingId;
  const tripId = body.tripId;

  if (!bookingId && !tripId) {
    return NextResponse.json(
      { error: { code: 'INVALID_PARAMS', message: 'bookingId atau tripId diperlukan' } },
      { status: 400 }
    );
  }

  const { bookingId: bid } = await authorizeChat(user, bookingId, tripId);

  await prisma.fleetChatMessage.updateMany({
    where: { senderId: { not: user.id }, bookingId: bid },
    data: { isRead: true },
  });

  // Best-effort broadcast read event
  const channelName = `chat:booking-${bid}`;
  try {
    const channel = supabase.channel(channelName);
    await channel.send({
      type: 'broadcast',
      event: 'messages-read',
      payload: { readerId: user.id, bookingId: bid, tripId },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ success: true });
});
