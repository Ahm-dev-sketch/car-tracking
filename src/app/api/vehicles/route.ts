import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createVehicleSchema, vehicleQuerySchema } from '@/lib/validation';
import { listVehicles, createVehicle } from '@/server/vehicles/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  const isAdmin = user.role === 'ADMIN';

  const { searchParams } = new URL(req.url);
  const query = vehicleQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    seats: searchParams.get('seats') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    locationId: searchParams.get('locationId') ?? searchParams.get('location_id') ?? undefined,
    sortBy: searchParams.get('sortBy') ?? undefined,
    sortOrder: searchParams.get('sortOrder') ?? undefined,
  });

  const result = await listVehicles({ ...query, isAdmin });
  return NextResponse.json(result);
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const body = await req.json();
    const validated = createVehicleSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const vehicle = await createVehicle(validated, ctx);
    return NextResponse.json({ data: vehicle }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
