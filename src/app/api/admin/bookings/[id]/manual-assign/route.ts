import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { manualAssignBookingSchema } from '@/lib/validation';
import { manualAssignBooking } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const { id: bookingId } = await params;
    const body = await req.json();
    const validated = manualAssignBookingSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const booking = await manualAssignBooking(user.id, bookingId, validated.driverId, {
      actorUserId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return NextResponse.json({ data: booking });
  }
);
