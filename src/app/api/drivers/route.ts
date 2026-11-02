import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
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
  });

  const result = await listDrivers(query);
  return NextResponse.json(result);
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const body = await req.json();
  const validated = createDriverSchema.parse(body);

  const driver = await createDriver(validated, user.id);
  return NextResponse.json({ data: driver }, { status: 201 });
});
