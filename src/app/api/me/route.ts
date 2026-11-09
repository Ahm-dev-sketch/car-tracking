import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  let driver = null;
  if (user.role === 'DRIVER') {
    try {
      driver = await prisma.driver.findUnique({
        where: { userId: user.id },
        select: {
          id: true, status: true, licenseNumber: true,
          currentVehicle: {
            include: { homeLocation: true, currentOperationalLocation: true },
          },
        },
      });
    } catch (driverErr: unknown) {
      console.error('[Driver Data Fetch Error] /api/me driver lookup:', driverErr);
      driver = null;
    }
  }
  return NextResponse.json({ user, driver });
});
