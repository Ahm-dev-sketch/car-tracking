import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const callLogSchema = z.object({
  bookingId: z.string().trim().optional().nullable(),
  tripId: z.string().trim().optional().nullable(),
  receiverId: z.string().trim().optional().nullable(),
  status: z.enum(['COMPLETED', 'MISSED', 'REJECTED']),
  durationSeconds: z.number().int().min(0).default(0),
  message: z.string().trim().optional().nullable(),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  const body = await req.json();
  const validated = callLogSchema.parse(body);

  const callerId = user.id;

  // Auto-link bookingId and tripId if one is omitted
  if (validated.bookingId && !validated.tripId) {
    try {
      const activeTrip = await prisma.trip.findFirst({
        where: { bookingId: validated.bookingId },
        select: { id: true },
      });
      if (activeTrip) {
        validated.tripId = activeTrip.id;
      }
    } catch {
      // non-fatal
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
      // non-fatal
    }
  }

  // 1. Log call to fleet_call_logs table if the table exists
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO fleet_call_logs (
        booking_id, trip_id, caller_id, receiver_id, status, duration_seconds, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      validated.bookingId ?? null,
      validated.tripId ?? null,
      callerId,
      validated.receiverId ?? null,
      validated.status,
      validated.durationSeconds
    );
  } catch (err: unknown) {
    // Non-fatal if table not migrated yet
    console.warn('[Call Log API] fleet_call_logs table insert skipped or unavailable:', err);
  }

  // 2. Format system message for chat history
  let chatText = validated.message;
  if (!chatText) {
    if (validated.status === 'MISSED') {
      chatText = '📞 Panggilan suara tak terjawab (30 detik)';
    } else if (validated.status === 'COMPLETED') {
      const mins = Math.floor(validated.durationSeconds / 60);
      const secs = validated.durationSeconds % 60;
      const durStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      chatText = `📞 Panggilan Suara Berakhir (${durStr})`;
    } else {
      chatText = '📞 Panggilan Ditolak';
    }
  }

  // 3. Persist system notification into fleet_chat_messages
  let savedMessage: any = null;
  const createdAt = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('fleet_chat_messages')
        .insert({
          booking_id: validated.bookingId || null,
          trip_id: validated.tripId || null,
          sender_id: callerId,
          sender_name: 'Sistem',
          sender_role: 'SYSTEM',
          receiver_id: validated.receiverId || null,
          message: chatText,
          is_read: false,
        })
        .select()
        .single();

      if (!error && data) {
        savedMessage = data;
      }
    } catch {
      // non-fatal fallback
    }
  }

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
        callerId,
        'Sistem',
        'SYSTEM',
        validated.receiverId ?? null,
        chatText
      );
      savedMessage = rows[0];
    } catch {
      savedMessage = {
        id: `local-${Date.now()}`,
        booking_id: validated.bookingId,
        trip_id: validated.tripId,
        sender_id: callerId,
        sender_name: 'Sistem',
        sender_role: 'SYSTEM',
        receiver_id: validated.receiverId,
        message: chatText,
        is_read: false,
        created_at: createdAt,
      };
    }
  }

  // 4. Real-time broadcast notification so in-app chat displays immediately
  const channelKey = validated.bookingId
    ? `booking-${validated.bookingId}`
    : validated.tripId
      ? `trip-${validated.tripId}`
      : null;

  if (channelKey) {
    try {
      const channel = supabase.channel(`chat:${channelKey}`);
      await channel.send({
        type: 'broadcast',
        event: 'new-message',
        payload: savedMessage,
      });
    } catch {
      // ignore broadcast error
    }
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        status: validated.status,
        durationSeconds: validated.durationSeconds,
        message: chatText,
        chatMessage: savedMessage,
      },
    },
    { status: 201 }
  );
});

