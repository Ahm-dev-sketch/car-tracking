import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { paginationSchema } from '@/lib/validation';
import { listNotifications } from '@/server/notifications/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getSessionUser();

  const { searchParams } = new URL(req.url);
  const query = paginationSchema.parse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  const result = await listNotifications(user.id, query);
  return NextResponse.json(result);
});
