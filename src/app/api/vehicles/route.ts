import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createVehicleSchema, vehicleQuerySchema } from '@/lib/validation';
import { listVehicles, createVehicle } from '@/server/vehicles/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
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

  let user = null;
  let isAdmin = false;
  try {
    user = await getSessionUser();
    isAdmin = user.role === 'ADMIN';
  } catch (authErr: unknown) {
    if (authErr instanceof ApiError && authErr.status === 401) throw authErr;
    console.error('[Driver Data Fetch Error] /api/vehicles auth lookup:', authErr);
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

  try {
    const result = user ? await listVehicles({ ...query, isAdmin, actor: user }) : { data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } };
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/vehicles GET:', err);
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
    requireRole(user, 'ADMIN');

    const body = await req.json();
    const validated = createVehicleSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const vehicle = await createVehicle(validated, ctx);
    return NextResponse.json({ data: vehicle }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
