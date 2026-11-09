import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  await getSessionUser();

  try {
    const locations = await prisma.location.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ data: locations });
  } catch (err: unknown) {
    console.error('[Driver Data Fetch Error] /api/locations GET:', err);
    return NextResponse.json({ data: [] });
  }
});
