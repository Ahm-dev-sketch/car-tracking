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
          id: true,
          status: true,
          licenseNumber: true,
          currentVehicle: {
            include: { homeLocation: true, currentOperationalLocation: true },
          },
        },
      });

      // Auto-heal: If user has DRIVER role but driver record is missing in DB
      if (!driver && prisma.driver?.create) {
        try {
          driver = await prisma.driver.create({
            data: {
              userId: user.id,
              licenseNumber: `SIM-${user.id.slice(-4).toUpperCase()}`,
              status: 'OFFLINE',
            },
            select: {
              id: true,
              status: true,
              licenseNumber: true,
              currentVehicle: {
                include: { homeLocation: true, currentOperationalLocation: true },
              },
            },
          });
        } catch {
          driver = {
            id: `drv-${user.id}`,
            status: 'OFFLINE',
            licenseNumber: `SIM-${user.id.slice(-4).toUpperCase()}`,
            currentVehicle: null,
          };
        }
      }
    } catch (driverErr: unknown) {
      console.error('[Driver Data Fetch Error] /api/me driver lookup:', driverErr);
      driver = {
        id: `drv-${user.id}`,
        status: 'OFFLINE',
        licenseNumber: `SIM-${user.id.slice(-4).toUpperCase()}`,
        currentVehicle: null,
      };
    }
  }

  return NextResponse.json({ user, driver });
});
