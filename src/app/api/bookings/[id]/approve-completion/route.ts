import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { transitionBooking } from '@/server/bookings/service';
import { BookingStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(
  async (req: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const params = await context?.params;
    const id = params?.id;
    if (!id) {
      return NextResponse.json(
        { error: { code: 'INVALID_ID', message: 'Missing booking id' } },
        { status: 400 }
      );
    }

    const ctx = getClientContext(req, user.id);
    const updated = await transitionBooking(
      id,
      BookingStatus.COMPLETED,
      user,
      ctx
    );

    return NextResponse.json({ data: updated });
  }
);
