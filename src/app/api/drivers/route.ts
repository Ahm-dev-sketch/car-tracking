import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createDriverSchema, driverQuerySchema } from '@/lib/validation';
import { createDriver, listDrivers } from '@/server/drivers/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const { searchParams } = new URL(req.url);
  const query = driverQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    search: searchParams.get('search') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    locationId: searchParams.get('locationId') ?? searchParams.get('location_id') ?? undefined,
    assignment: searchParams.get('assignment') ?? undefined,
    sortBy: searchParams.get('sortBy') ?? undefined,
    sortOrder: searchParams.get('sortOrder') ?? undefined,
  });

  try {
    const result = await listDrivers(query);
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    console.error('FATAL DB ERROR [GET /api/drivers]:', error);
    return NextResponse.json({
      data: [],
      meta: {
        page: query.page ?? 1,
        limit: query.limit ?? 10,
        total: 0,
        totalPages: 0,
      },
    });
  }
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const body = await req.json();
    const validated = createDriverSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const driver = await createDriver(validated, ctx);
    return NextResponse.json({ data: driver }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
