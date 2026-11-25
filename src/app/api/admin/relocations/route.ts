import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { withRateLimit, RATE_LIMIT_CONFIG } from '@/lib/rate-limit';
import { getClientContext } from '@/lib/request-context';
import { createRelocationSchema, relocationQuerySchema } from '@/lib/validation';
import { createRelocation, listRelocations } from '@/server/relocations/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const { searchParams } = new URL(req.url);
  const query = relocationQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    vehicleId: searchParams.get('vehicle_id') ?? searchParams.get('vehicleId') ?? undefined,
    driverId: searchParams.get('driver_id') ?? searchParams.get('driverId') ?? undefined,
    locationId: searchParams.get('location_id') ?? searchParams.get('locationId') ?? undefined,
  });

  const result = await listRelocations(user, query);
  return NextResponse.json(result);
});

export const POST = withRateLimit(
  withErrorHandling(async (req: NextRequest) => {
    const user = await getSessionUser();
    requireRole(user, 'ADMIN');

    const body = await req.json();
    const validated = createRelocationSchema.parse(body);

    const ctx = getClientContext(req, user.id);
    const created = await createRelocation(user, validated, ctx);

    return NextResponse.json({ data: created }, { status: 201 });
  }),
  RATE_LIMIT_CONFIG.ADMIN_MUTATION
);
