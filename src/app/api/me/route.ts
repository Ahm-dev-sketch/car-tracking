import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (_req: NextRequest) => {
  const user = await getSessionUser();
  return NextResponse.json({ user });
});
