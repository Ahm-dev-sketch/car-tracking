import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createBookingSchema, bookingQuerySchema } from '@/lib/validation';
import { createBooking, listBookings } from '@/server/bookings/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();

  const { searchParams } = new URL(req.url);
  const query = bookingQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    vehicleId: searchParams.get('vehicle_id') ?? searchParams.get('vehicleId') ?? undefined,
    startDate: searchParams.get('start_date') ?? searchParams.get('startDate') ?? undefined,
    endDate: searchParams.get('end_date') ?? searchParams.get('endDate') ?? undefined,
  });

  const result = await listBookings(user, query);
  return NextResponse.json(result);
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();

    const body = await req.json();
    const validated = createBookingSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const booking = await createBooking(user.id, validated, ctx);

    return NextResponse.json({ data: booking }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.BOOKING_CREATE
);
