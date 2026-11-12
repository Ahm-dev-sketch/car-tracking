import { NextResponse } from 'next/server';
import { withErrorHandling, ApiError } from '@/lib/errors';
import { getSessionUser } from '@/lib/auth-guard';
import { encode } from 'next-auth/jwt';
import { TRACKING_CONFIG } from '@/server/tracking/config';
import { DISPATCH_CONFIG } from '@/server/dispatch/config';
import { prisma } from '@/lib/prisma';
import { TripStatus, DriverSessionStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  let user = null;
  try {
    user = await getSessionUser();
  } catch (authErr: unknown) {
    console.error('FATAL DB ERROR [GET /api/tracking/config auth]:', authErr);
    if (authErr instanceof ApiError && authErr.status === 401) {
      throw authErr;
    }
  }

  let activeTrip = null;
  let activeSession = null;
  let driverProfile = null;
  if (user && user.role === 'DRIVER') {
    try {
      const driver = await prisma.driver.findUnique({
        where: { userId: user.id },
      });
      driverProfile = driver;
      if (driver) {
        activeTrip = await prisma.trip.findFirst({
          where: { driverId: driver.id, status: TripStatus.ACTIVE },
          include: {
            vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
            booking: {
              select: {
                id: true,
                bookingNumber: true,
                pickupLocation: true,
                destination: true,
                status: true,
                passengerCount: true,
                pickupLat: true,
                pickupLng: true,
                user: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        });

        activeSession = await prisma.driverSession.findFirst({
          where: { driverId: driver.id, status: DriverSessionStatus.ACTIVE },
          include: {
            vehicle: { select: { id: true, plateNumber: true, brand: true, model: true } },
          },
        });
      }
    } catch (driverErr: unknown) {
      console.error('[Driver Data Fetch Error] /api/tracking/config driver session lookup:', driverErr);
      activeTrip = null;
      activeSession = null;
    }
  }

  let realtimeToken: string | null = null;
  const authSecret = process.env.AUTH_SECRET;
  if (authSecret && user) {
    try {
      realtimeToken = await encode({
        token: {
          userId: user.id,
          sub: user.id,
          role: user.role,
          driverId: driverProfile?.id,
          exp: Math.floor(Date.now() / 1000) + 3600 * 24,
        },
        secret: authSecret,
        salt: 'authjs.session-token',
      });
    } catch {
      // Non-fatal if encoding fails
    }
  }

  // NOTE: Do NOT add a global in-memory cache for this endpoint. The response is
  // per-user and token-bearing (realtimeToken) plus stateful (activeTrip/activeSession),
  // so caching it globally would leak one user's token/session into another's response.
  // The short private Cache-Control header below only affects browser/CDN caching, not a shared store.
  return NextResponse.json(
    {
      config: TRACKING_CONFIG,
      dispatchConfig: DISPATCH_CONFIG,
      realtimeToken,
      sessionState: {
        role: user?.role ?? 'DRIVER',
        activeTrip,
        activeSession,
      },
    },
    { headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' } },
  );
});
