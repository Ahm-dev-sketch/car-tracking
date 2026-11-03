import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser, requireRole } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { getDriverOffers } from '@/server/dispatch/service';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  requireRole(user, 'DRIVER');

  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  if (!driver) {
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
  }

  const offers = await getDriverOffers(driver.id);
  return NextResponse.json({ data: offers });
});
