import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
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
  });

  const result = await listVehicles({ ...query, isAdmin });
  return NextResponse.json(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const body = await req.json();
  const validated = createVehicleSchema.parse(body);

  const vehicle = await createVehicle(validated, user.id);
  return NextResponse.json({ data: vehicle }, { status: 201 });
});
