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

  try {
    const result = await listNotifications(user.id, query);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/notifications GET:', err);
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
