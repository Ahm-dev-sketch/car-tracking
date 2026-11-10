import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { getClientContext } from '@/lib/request-context';
import { startTripSchema, tripQuerySchema } from '@/lib/validation';
import { startTrip, listTrips } from '@/server/trips/service';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  let queryLimit = 10;
  let queryPage = 1;
  try {
    const user = await getSessionUser();

    const { searchParams } = new URL(req.url);
    const query = tripQuerySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      vehicleId: searchParams.get('vehicle_id') ?? searchParams.get('vehicleId') ?? undefined,
      driverId: searchParams.get('driver_id') ?? searchParams.get('driverId') ?? undefined,
      startDate: searchParams.get('start_date') ?? searchParams.get('startDate') ?? undefined,
      endDate: searchParams.get('end_date') ?? searchParams.get('endDate') ?? undefined,
    });
    queryLimit = query.limit ?? 10;
    queryPage = query.page ?? 1;

    const result = await listTrips(user, query);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      throw error;
    }
    console.error('FATAL DB ERROR [GET /api/trips]:', error);
    return NextResponse.json({
      data: [],
      meta: {
        page: queryPage,
        limit: queryLimit,
        total: 0,
        totalPages: 0,
      },
    });
  }
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'DRIVER');

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });
  if (!driver) {
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
  }

  const body = await req.json();
  const validated = startTripSchema.parse(body);

  const ctx = getClientContext(req, user.id);
  try {
    const trip = await startTrip(driver.id, validated, ctx);
    return NextResponse.json({ data: trip }, { status: 201 });
  } catch (err: unknown) {
    console.error('[Start Trip Error]:', err);
    if (err instanceof ApiError) throw err;
    const message = err instanceof Error ? err.message : 'Failed to start trip';
    throw new ApiError(500, 'START_TRIP_FAILED', message);
  }
});
