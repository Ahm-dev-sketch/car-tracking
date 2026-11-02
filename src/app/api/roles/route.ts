import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'ADMIN');

  const roles = await prisma.role.findMany({
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ data: roles });
});
