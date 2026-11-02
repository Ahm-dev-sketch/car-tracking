import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { TRACKING_CONFIG } from './config';
import { MovementStatus, TripStatus, BookingStatus } from '@prisma/client';
import { AuthenticatedUser } from '@/lib/auth-guard';

export interface LocationPointInput {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps?: number | null;
  headingDeg?: number | null;
  recordedAt: Date;
}

export interface IngestResult {
  accepted: number;
  rejected: Array<{ index: number; reason: string }>;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function classifyMovement(
  prev: { lat: number; lng: number } | null,
  cur: { lat: number; lng: number; speedMps?: number | null }
): MovementStatus {
  if (cur.speedMps !== null && cur.speedMps !== undefined && cur.speedMps > 2) {
    return MovementStatus.MOVING;
  }
  if (prev) {
    const delta = haversineDistanceMeters(prev.lat, prev.lng, cur.lat, cur.lng);
    if (delta > 50) {
      return MovementStatus.MOVING;
    }
  }
  return MovementStatus.STOPPED;
}

export async function markStale(
  staleThresholdSec: number = TRACKING_CONFIG.tripIntervalSec * TRACKING_CONFIG.maxStaleMultiplier
): Promise<number> {
  const cutoff = new Date(Date.now() - staleThresholdSec * 1000);
  const updated = await prisma.vehicleLocation.updateMany({
    where: {
      movement: { notIn: [MovementStatus.OFFLINE, MovementStatus.GPS_LOST] },
      receivedAt: { lt: cutoff },
    },
    data: {
      movement: MovementStatus.GPS_LOST,
    },
  });
  return updated.count;
}

export async function ingestLocations(
  driverId: string,
  rawPoints: LocationPointInput[]
): Promise<IngestResult> {
  const activeTrip = await prisma.trip.findFirst({
    where: { driverId, status: TripStatus.ACTIVE },
    include: { driver: true },
  });

  if (!activeTrip) {
    throw new ApiError(
      403,
      'TRACKING_SESSION_REQUIRED',
      'No active tracking session / trip found for driver'
    );
  }

  const now = Date.now();
  const maxFutureSkewMs = TRACKING_CONFIG.maxFutureSkewSec * 1000;
  const maxStaleMs =
    TRACKING_CONFIG.tripIntervalSec * TRACKING_CONFIG.maxStaleMultiplier * 1000;
  const accuracyCap = TRACKING_CONFIG.accuracyCapTripM;

  const accepted: LocationPointInput[] = [];
  const rejected: Array<{ index: number; reason: string }> = [];

  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];

    if (p.lat < -90 || p.lat > 90 || p.lng < -180 || p.lng > 180) {
      rejected.push({ index: i, reason: 'Invalid latitude or longitude coordinate' });
      continue;
    }

    if (p.accuracyM < 0 || p.accuracyM > 5000) {
      rejected.push({ index: i, reason: 'Accuracy out of range (0-5000m)' });
      continue;
    }

    if (p.accuracyM > accuracyCap) {
      rejected.push({
        index: i,
        reason: `Accuracy ${p.accuracyM}m exceeds trip cap ${accuracyCap}m`,
      });
      continue;
    }

    if (
      p.speedMps !== null &&
      p.speedMps !== undefined &&
      (p.speedMps < 0 || p.speedMps > TRACKING_CONFIG.maxSpeedMps)
    ) {
      rejected.push({ index: i, reason: `Speed out of bounds (0-${TRACKING_CONFIG.maxSpeedMps} m/s)` });
      continue;
    }

    if (
      p.headingDeg !== null &&
      p.headingDeg !== undefined &&
      (p.headingDeg < 0 || p.headingDeg > 360)
    ) {
      rejected.push({ index: i, reason: 'Heading out of bounds (0-360 degrees)' });
      continue;
    }

    const recordedMs = p.recordedAt.getTime();
    if (recordedMs > now + maxFutureSkewMs) {
      rejected.push({ index: i, reason: 'Recorded timestamp is in the future' });
      continue;
    }

    if (recordedMs < now - maxStaleMs) {
      rejected.push({ index: i, reason: 'Recorded timestamp is stale' });
      continue;
    }

    accepted.push(p);
  }

  if (accepted.length > 0) {
    // Sort accepted points ascending by recordedAt
    accepted.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    // Insert history rows into driver_locations
    for (const p of accepted) {
      // Ensure partition for target month exists
      await prisma.$executeRawUnsafe(
        'SELECT create_driver_location_partition($1::date)',
        p.recordedAt
      );

      await prisma.driverLocation.create({
        data: {
          driverId,
          vehicleId: activeTrip.vehicleId,
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM,
          speedMps: p.speedMps ?? null,
          headingDeg: p.headingDeg ?? null,
          recordedAt: p.recordedAt,
          receivedAt: new Date(),
        },
      });
    }

    // Upsert current vehicle location
    const latestPoint = accepted[accepted.length - 1];
    const prevLocation = await prisma.vehicleLocation.findUnique({
      where: { vehicleId: activeTrip.vehicleId },
    });

    const movement = classifyMovement(
      prevLocation ? { lat: prevLocation.lat, lng: prevLocation.lng } : null,
      latestPoint
    );

    await prisma.vehicleLocation.upsert({
      where: { vehicleId: activeTrip.vehicleId },
      create: {
        vehicleId: activeTrip.vehicleId,
        driverId,
        lat: latestPoint.lat,
        lng: latestPoint.lng,
        accuracyM: latestPoint.accuracyM,
        speedMps: latestPoint.speedMps ?? null,
        headingDeg: latestPoint.headingDeg ?? null,
        recordedAt: latestPoint.recordedAt,
        receivedAt: new Date(),
        movement,
      },
      update: {
        driverId,
        lat: latestPoint.lat,
        lng: latestPoint.lng,
        accuracyM: latestPoint.accuracyM,
        speedMps: latestPoint.speedMps ?? null,
        headingDeg: latestPoint.headingDeg ?? null,
        recordedAt: latestPoint.recordedAt,
        receivedAt: new Date(),
        movement,
      },
    });
  }

  return {
    accepted: accepted.length,
    rejected,
  };
}

export async function getVehicleTracking(
  vehicleId: string,
  actor: AuthenticatedUser
) {
  await markStale();

  const vehicle = await prisma.vehicle.findUnique({
    where: { id: vehicleId },
    include: {
      currentLocation: true,
      currentDriver: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
    },
  });

  if (!vehicle) {
    throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
  }

  const isAdmin = actor.role === 'ADMIN';

  // Check if user has an active booking on this vehicle
  let isOwnerActive = false;
  if (!isAdmin) {
    const activeBooking = await prisma.booking.findFirst({
      where: {
        userId: actor.id,
        vehicleId,
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
    });
    if (activeBooking) {
      isOwnerActive = true;
    }
  }

  if (!isAdmin && !isOwnerActive) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to vehicle tracking');
  }

  // Active trip origin/destination
  const activeTrip = await prisma.trip.findFirst({
    where: { vehicleId, status: TripStatus.ACTIVE },
    include: {
      booking: {
        select: {
          pickupLocation: true,
          destination: true,
          bookingNumber: true,
        },
      },
    },
  });

  const canSeePhone = isAdmin || isOwnerActive;

  return {
    vehicle: {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      status: vehicle.status,
    },
    location: vehicle.currentLocation,
    driver: vehicle.currentDriver?.user
      ? {
          id: vehicle.currentDriver.id,
          name: vehicle.currentDriver.user.name,
          phone: canSeePhone ? vehicle.currentDriver.user.phone : 'REDACTED',
        }
      : null,
    activeTrip: activeTrip
      ? {
          id: activeTrip.id,
          startedAt: activeTrip.startedAt,
          startLat: activeTrip.startLat,
          startLng: activeTrip.startLng,
          origin: activeTrip.booking?.pickupLocation ?? null,
          destination: activeTrip.booking?.destination ?? null,
          bookingNumber: activeTrip.booking?.bookingNumber ?? null,
        }
      : null,
  };
}

export async function getLiveTracking(actor: AuthenticatedUser) {
  await markStale();

  const isAdmin = actor.role === 'ADMIN';

  let vehicleIds: string[] | null = null;

  if (!isAdmin) {
    const userBookings = await prisma.booking.findMany({
      where: {
        userId: actor.id,
        vehicleId: { not: null },
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.IN_PROGRESS,
          ],
        },
      },
      select: { vehicleId: true },
    });
    vehicleIds = userBookings
      .map((b) => b.vehicleId)
      .filter((id): id is string => Boolean(id));
  }

  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(vehicleIds !== null ? { id: { in: vehicleIds } } : {}),
      currentLocation: { isNot: null },
    },
    include: {
      currentLocation: true,
      currentDriver: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
    },
  });

  return vehicles.map((v) => {
    const isOwner = Boolean(vehicleIds && vehicleIds.includes(v.id));
    const canSeePhone = isAdmin || isOwner;

    return {
      vehicleId: v.id,
      plateNumber: v.plateNumber,
      brand: v.brand,
      model: v.model,
      status: v.status,
      location: v.currentLocation,
      driver: v.currentDriver?.user
        ? {
            id: v.currentDriver.id,
            name: v.currentDriver.user.name,
            phone: canSeePhone ? v.currentDriver.user.phone : 'REDACTED',
          }
        : null,
    };
  });
}
