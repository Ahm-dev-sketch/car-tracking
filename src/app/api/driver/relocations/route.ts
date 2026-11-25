import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { relocationQuerySchema } from '@/lib/validation';
import { listRelocations } from '@/server/relocations/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();
  requireRole(user, 'DRIVER');

  const { searchParams } = new URL(req.url);
  const query = relocationQuerySchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    status: searchParams.get('status') ?? undefined,
  });

  const result = await listRelocations(user, query);
  return NextResponse.json(result);
});
