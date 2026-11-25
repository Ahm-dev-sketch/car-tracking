import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import {
  acknowledgeRejectedBookings,
  getUserActionRequiredCount,
} from '@/server/bookings/user-badge';

export const dynamic = 'force-dynamic';

const acknowledgeSchema = z
  .object({
    bookingId: z.string().trim().min(1).optional(),
    bookingIds: z.array(z.string().trim().min(1)).max(100).optional(),
  })
  .refine((data) => Boolean(data.bookingId) || (data.bookingIds && data.bookingIds.length > 0), {
    message: 'At least one bookingId is required',
  });

export const GET = withErrorHandling(async () => {
  let user;
  try {
    user = await getSessionUser();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) throw err;
    console.error('DB ERROR [GET /api/user/bookings/action-required auth]:', err);
    return NextResponse.json({ data: { count: 0 }, warning: 'Database busy' }, { status: 200 });
  }

  requireRole(user, 'USER');

  try {
    const count = await getUserActionRequiredCount(user.id);
    return NextResponse.json({ data: { count } });
  } catch (err) {
    console.error('DB ERROR [GET /api/user/bookings/action-required count]:', err);
    return NextResponse.json({ data: { count: 0 }, warning: 'Database busy' }, { status: 200 });
  }
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'USER');

  const body = await req.json();
  const parsed = acknowledgeSchema.parse(body);
  const ids = [
    ...(parsed.bookingId ? [parsed.bookingId] : []),
    ...(parsed.bookingIds ?? []),
  ];

  const result = await acknowledgeRejectedBookings(user.id, ids);
  return NextResponse.json({ data: result });
});
