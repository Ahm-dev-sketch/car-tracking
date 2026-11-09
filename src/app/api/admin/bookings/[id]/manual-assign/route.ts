import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
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
    try {
      const booking = await manualAssignBooking(
        user.id,
        bookingId,
        validated.driverId,
        {
          actorUserId: user.id,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        },
        validated.vehicleId
      );

      return NextResponse.json({ success: true, data: booking });
    } catch (err: unknown) {
      console.error('[Manual Assign Error]:', err);
      if (err instanceof ApiError) {
        throw err;
      }
      const message =
        err instanceof Error ? err.message : 'Gagal menugaskan driver secara manual karena kendala database';
      throw new ApiError(500, 'MANUAL_ASSIGN_FAILED', message);
    }
  }
);
