import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { updateBookingStatusSchema } from '@/lib/validation';
import { transitionBooking } from '@/server/bookings/service';
import { BookingStatus } from '@prisma/client';

export const PATCH = withErrorHandling(
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

    const body = await req.json();
    const validated = updateBookingStatusSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const targetStatus =
      validated.status === 'IN_PROGRESS'
        ? BookingStatus.IN_PROGRESS
        : BookingStatus.COMPLETED;

    const updated = await transitionBooking(id, targetStatus, user, ctx);

    return NextResponse.json({ data: updated });
  }
);
