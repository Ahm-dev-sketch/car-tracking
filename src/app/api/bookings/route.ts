import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createBookingSchema, bookingQuerySchema } from '@/lib/validation';
import { createBooking, listBookings } from '@/server/bookings/service';
import { dispatchSweep } from '@/server/dispatch/service';
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
    console.error('[Driver Data Fetch Error] lazy dispatch sweep in bookings read:', err);
    logger.warn({
      msg: 'Lazy dispatch sweep failed in bookings read',
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const isDriverWorkflow = searchParams.get('workflow') === 'driver';
  try {
    const result = await listBookings(user, { ...query, driverWorkflow: isDriverWorkflow });
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/bookings listBookings:', err);
    return NextResponse.json({
      data: [],
      pagination: {
        page: query.page ?? 1,
        limit: query.limit ?? 10,
        total: 0,
        totalPages: 1,
      },
    });
  }
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
        status: BookingStatus.PENDING,
      },
      ctx
    );

    return NextResponse.json(
      {
        data: booking,
      },
      { status: 201 }
    );
  }),
  RATE_LIMIT_CONFIG.BOOKING_CREATE
);
