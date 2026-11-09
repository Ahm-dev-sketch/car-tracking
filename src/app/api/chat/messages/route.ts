import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const sendMessageSchema = z.object({
  bookingId: z.string().trim().optional().nullable(),
  tripId: z.string().trim().optional().nullable(),
  receiverId: z.string().trim().optional().nullable(),
  message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(1000),
  senderName: z.string().trim().optional(),
  senderRole: z.enum(['USER', 'DRIVER', 'ADMIN']).optional().default('USER'),
});

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

  // Single source of truth: Prisma (server-side postgres role). The anon-key REST
  // path was removed — with RLS deny-all it silently returned [] instead of falling
  // through, emptying chat history.
  // Direct PostgreSQL via Prisma queryRaw
  try {
    const messages = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, booking_id AS "bookingId", trip_id AS "tripId", sender_id AS "senderId", 
              sender_name AS "senderName", sender_role AS "senderRole", receiver_id AS "receiverId", 
              message, is_read AS "isRead", created_at AS "createdAt"
       FROM fleet_chat_messages
       WHERE (
         ($1::text IS NOT NULL AND booking_id = $1)
         OR ($2::text IS NOT NULL AND trip_id = $2)
       )
       ORDER BY created_at ASC
       LIMIT 100`,
      bookingId ?? null,
      tripId ?? null
    );
    return NextResponse.json({ data: messages });
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/chat/messages GET:', err);
    // If table doesn't exist yet, return empty list gracefully
    return NextResponse.json({ data: [] });
  }
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  const body = await req.json();
  const validated = sendMessageSchema.parse(body);

  const senderId = user.id;
  const senderName = validated.senderName || user.name || 'User';

  // Auto-link bookingId and tripId if one is omitted
  if (validated.bookingId && !validated.tripId) {
    try {
      const activeTrip = await prisma.trip.findFirst({
        where: { bookingId: validated.bookingId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (activeTrip) {
        validated.tripId = activeTrip.id;
      }
    } catch {
      // ignore
    }
  } else if (validated.tripId && !validated.bookingId) {
    try {
      const trip = await prisma.trip.findUnique({
        where: { id: validated.tripId },
        select: { bookingId: true },
      });
      if (trip?.bookingId) {
        validated.bookingId = trip.bookingId;
      }
    } catch {
      // ignore
    }
  }

  let savedMessage: any = null;

  // 1. Try insert via Supabase client if configured
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('fleet_chat_messages')
        .insert({
          booking_id: validated.bookingId || null,
          trip_id: validated.tripId || null,
          sender_id: senderId,
          sender_name: senderName,
          sender_role: validated.senderRole,
          receiver_id: validated.receiverId || null,
          message: validated.message,
          is_read: false,
        })
        .select()
        .single();

      if (!error && data) {
        savedMessage = data;
      }
    } catch {
      // Fallback to direct PostgreSQL
    }
  }

  // 2. Direct PostgreSQL insert fallback via Prisma if Supabase direct insert didn't run
  if (!savedMessage) {
    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO fleet_chat_messages (
            booking_id, trip_id, sender_id, sender_name, sender_role, receiver_id, message, is_read
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
         RETURNING id, booking_id AS "booking_id", trip_id AS "trip_id", sender_id AS "sender_id", 
                   sender_name AS "sender_name", sender_role AS "sender_role", receiver_id AS "receiver_id", 
                   message, is_read AS "is_read", created_at AS "created_at"`,
        validated.bookingId ?? null,
        validated.tripId ?? null,
        senderId,
        senderName,
        validated.senderRole,
        validated.receiverId ?? null,
        validated.message
      );
      savedMessage = rows[0];
    } catch (err: unknown) {
      // In-memory format fallback if DB table not yet migrated
      savedMessage = {
        id: `local-${Date.now()}`,
        booking_id: validated.bookingId,
        trip_id: validated.tripId,
        sender_id: senderId,
        sender_name: senderName,
        sender_role: validated.senderRole,
        receiver_id: validated.receiverId,
        message: validated.message,
        is_read: false,
        created_at: new Date().toISOString(),
      };
    }
  }

  // Broadcast message over Supabase channel for instant delivery
  const channelName = validated.bookingId
    ? `chat:booking-${validated.bookingId}`
    : `chat:trip-${validated.tripId}`;

  try {
    const channel = supabase.channel(channelName);
    await channel.send({
      type: 'broadcast',
      event: 'new-message',
      payload: savedMessage,
    });
  } catch {
    // Ignore channel broadcast error
  }

  return NextResponse.json({ data: savedMessage }, { status: 201 });
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

  // 1. Try Supabase update if configured
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('fleet_chat_messages')
        .update({ is_read: true })
        .neq('sender_id', user.id);

      if (bookingId && tripId) {
        query = query.or(`booking_id.eq.${bookingId},trip_id.eq.${tripId}`);
      } else if (bookingId) {
        query = query.eq('booking_id', bookingId);
      } else if (tripId) {
        query = query.eq('trip_id', tripId);
      }

      await query;
    } catch {
      // ignore
    }
  }

  // 2. Direct PostgreSQL update fallback via Prisma
  try {
    await prisma.$queryRawUnsafe(
      `UPDATE fleet_chat_messages
       SET is_read = true
       WHERE sender_id != $1
         AND (
           ($2::text IS NOT NULL AND booking_id = $2)
           OR ($3::text IS NOT NULL AND trip_id = $3)
         )`,
      user.id,
      bookingId ?? null,
      tripId ?? null
    );
  } catch {
    // ignore
  }

  // Broadcast read event over channel
  const channelName = bookingId
    ? `chat:booking-${bookingId}`
    : `chat:trip-${tripId}`;

  try {
    const channel = supabase.channel(channelName);
    await channel.send({
      type: 'broadcast',
      event: 'messages-read',
      payload: { readerId: user.id, bookingId, tripId },
    });
  } catch {
    // ignore
  }

  return NextResponse.json({ success: true });
});
