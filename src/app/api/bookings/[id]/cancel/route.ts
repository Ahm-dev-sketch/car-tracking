import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { cancelBookingSchema } from '@/lib/validation';
import { transitionBooking } from '@/server/bookings/service';
import { BookingStatus } from '@prisma/client';

export const POST = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing booking id' } },
        { status: 400 }
      );
    }

    let reason: string | undefined;
    try {
      const body = await req.json();
      const validated = cancelBookingSchema.parse(body);
      reason = validated.reason;
    } catch {
      // Reason is optional
    }

    const ctx = getClientContext(req, user.id);
    const updated = await transitionBooking(
      id,
      BookingStatus.CANCELLED,
      user,
      ctx,
      { reason }
    );

    return NextResponse.json({ data: updated });
  }
);
