import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createBookingSchema, bookingQuerySchema } from '@/lib/validation';
import { createBooking, listBookings } from '@/server/bookings/service';
import { dispatchBooking, dispatchSweep } from '@/server/dispatch/service';
import { logger } from '@/lib/logger';
import { BookingStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();

  const { searchParams } = new URL(req.url);
  const query = bookingQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    vehicleId: searchParams.get('vehicle_id') ?? searchParams.get('vehicleId') ?? undefined,
    locationId: searchParams.get('location_id') ?? searchParams.get('locationId') ?? undefined,
    startDate: searchParams.get('start_date') ?? searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('end_date') ?? searchParams.get('endDate') ?? undefined,
  });

  // Lazy sweep on read: advance expired offers before listing
  try {
    await dispatchSweep();
  } catch (err: unknown) {
    logger.warn({
      msg: 'Lazy dispatch sweep failed in bookings read',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const result = await listBookings(user, { ...query, driverWorkflow: searchParams.get('workflow') === 'driver' });
  return NextResponse.json(result);
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();

    const body = await req.json();
    const validated = createBookingSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const booking = await createBooking(
      user.id,
      {
        ...validated,
        status: BookingStatus.SEARCHING_DRIVER,
      },
      ctx
    );

    const dispatchResult = await dispatchBooking(booking.id, {
      actorUserId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return NextResponse.json(
      {
        data: {
          ...booking,
          status: dispatchResult.booking.status,
          dispatchState: dispatchResult.dispatchState,
          alternatives: dispatchResult.alternatives ?? [],
        },
      },
      { status: 201 }
    );
  }),
  RATE_LIMIT_CONFIG.BOOKING_CREATE
);
