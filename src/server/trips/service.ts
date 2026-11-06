import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { logAuditEvent } from '@/server/audit';
import { ensureVehicleAssignment } from '@/server/assignments/service';
import { notify, notifyAdmins } from '@/server/notifications/service';
import { AuthenticatedUser } from '@/lib/auth-guard';
import {
  TripStatus,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
  MovementStatus,
  DriverSessionStatus,
  Prisma,
} from '@prisma/client';

export interface TripMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface StartTripInput {
  bookingId?: string | null;
  vehicleId?: string | null;
  startLat: number;
  startLng: number;
}

export interface EndTripInput {
  endLat?: number | null;
  endLng?: number | null;
  distanceMeters?: number | null;
}

export interface AbortTripInput {
  reason?: string | null;
}

export interface TripQueryFilters {
  page?: number;
  limit?: number;
  status?: TripStatus;
  vehicleId?: string;
  driverId?: string;
  startDate?: Date;
  endDate?: Date;
}

const publicUserSelect = { id: true, name: true, email: true, phone: true } satisfies Prisma.UserSelect;
const bookingMutationInclude = {
  user: { select: publicUserSelect },
  vehicle: true,
  driver: { include: { user: { select: publicUserSelect } } },
  operationalLocation: true,
} satisfies Prisma.BookingInclude;
const tripMutationInclude = {
  vehicle: true,
  driver: { include: { user: { select: publicUserSelect } } },
  booking: { include: bookingMutationInclude },
} satisfies Prisma.TripInclude;
const committedBookingStatuses = [
  BookingStatus.APPROVED,
  BookingStatus.DRIVER_ASSIGNED,
  BookingStatus.DRIVER_EN_ROUTE,
  BookingStatus.ARRIVED,
  BookingStatus.IN_PROGRESS,
];

async function sendTripNotifications(tasks: Array<() => Promise<unknown>>) {
  await Promise.all(tasks.map(async (send) => {
    try {
      await send();
    } catch (error) {
      logger.warn({ msg: 'Trip committed but notification failed', error: error instanceof Error ? error.message : String(error) });
    }
  }));
}

// The snapshot routes locks only; all authorization and state checks use the locked row.
async function lockTrip(tx: Prisma.TransactionClient, snapshot: {
  id: string; bookingId: string | null; vehicleId: string; driverId: string;
}) {
  if (snapshot.bookingId) {
    await tx.$queryRawUnsafe('SELECT id FROM bookings WHERE id = $1 FOR UPDATE', snapshot.bookingId);
  }
  await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', snapshot.vehicleId);
  await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', snapshot.driverId);
  await tx.$queryRawUnsafe('SELECT id FROM trips WHERE id = $1 FOR UPDATE', snapshot.id);
  const trip = await tx.trip.findUnique({ where: { id: snapshot.id }, include: tripMutationInclude });
  if (!trip) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip not found');
  }
  if (trip.bookingId !== snapshot.bookingId || trip.vehicleId !== snapshot.vehicleId || trip.driverId !== snapshot.driverId) {
    throw new ApiError(409, 'TRIP_CHANGED', 'Trip assignment changed; please retry');
  }
  return trip;
}

async function getTripLockTarget(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { id: true, bookingId: true, vehicleId: true, driverId: true },
  });
  if (!trip) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip not found');
  }
  return trip;
}

export async function startTrip(
  driverId: string,
  input: StartTripInput,
  ctx?: TripMutationContext
) {
  if (!input.bookingId && !input.vehicleId) {
    throw new ApiError(400, 'BAD_REQUEST', 'Either bookingId or vehicleId must be provided');
  }

  if (!Number.isFinite(input.startLat) || !Number.isFinite(input.startLng) || input.startLat < -90 || input.startLat > 90 || input.startLng < -180 || input.startLng > 180) {
    throw new ApiError(400, 'INVALID_COORDINATES', 'Valid starting GPS coordinates are required');
  }

  const trip = await prisma.$transaction(async (tx) => {
    if (input.bookingId) {
      await tx.$queryRawUnsafe('SELECT id FROM bookings WHERE id = $1 FOR UPDATE', input.bookingId);
    }
    const booking = input.bookingId
      ? await tx.booking.findUnique({ where: { id: input.bookingId } })
      : null;
    if (input.bookingId && !booking) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }
    if (booking) {
      if (booking.driverId !== driverId) {
        throw new ApiError(409, 'BOOKING_NOT_ASSIGNED', 'Booking is not assigned to this driver');
      }
      if (booking.status !== BookingStatus.DRIVER_ASSIGNED && booking.status !== BookingStatus.APPROVED) {
        throw new ApiError(409, 'INVALID_BOOKING_STATUS', `Cannot start trip for booking in status ${booking.status}`);
      }
      if (!booking.vehicleId) {
        throw new ApiError(400, 'NO_VEHICLE_ASSIGNED', 'Booking has no assigned vehicle');
      }
      if (input.vehicleId && input.vehicleId !== booking.vehicleId) {
        throw new ApiError(409, 'BOOKING_VEHICLE_MISMATCH', 'Vehicle does not match the booking assignment');
      }
    }
    const vehicleId = booking?.vehicleId ?? input.vehicleId!;
    await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', vehicleId);
    await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driverId);
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    const driver = await tx.driver.findUnique({
      where: { id: driverId },
      include: { user: { select: { ...publicUserSelect, isActive: true } } },
    });
    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
    }
    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
    }
    if (!driver.user.isActive) {
      throw new ApiError(409, 'DRIVER_INACTIVE', 'Driver account is inactive');
    }
    if (driver.status === DriverStatus.ON_TRIP) {
      throw new ApiError(409, 'DRIVER_BUSY', 'Driver is already on an active trip');
    }
    const activeTrip = await tx.trip.findFirst({
      where: { status: TripStatus.ACTIVE, OR: [{ vehicleId }, { driverId }] },
    });
    if (activeTrip) {
      throw new ApiError(409, activeTrip.driverId === driverId ? 'DRIVER_BUSY' : 'VEHICLE_IN_USE', 'Driver or vehicle already has an active trip');
    }
    if (vehicle.status === VehicleStatus.IN_USE) {
      throw new ApiError(409, 'VEHICLE_IN_USE', 'Vehicle is currently in use');
    }
    if (vehicle.status !== VehicleStatus.AVAILABLE && vehicle.status !== VehicleStatus.RESERVED) {
      throw new ApiError(409, 'VEHICLE_UNAVAILABLE', `Vehicle unavailable in status ${vehicle.status}`);
    }
    // In a shared vehicle pool: check active online session conflict on this vehicle
    const otherSession = await tx.driverSession.findFirst({
      where: { vehicleId, driverId: { not: driverId }, status: DriverSessionStatus.ACTIVE },
    });
    if (otherSession) {
      throw new ApiError(409, 'VEHICLE_ALREADY_ASSIGNED', 'Another driver is online with this vehicle');
    }

    // An ad-hoc trip has no end window: it cannot consume any committed reservation.
    const reservation = await tx.booking.findFirst({
      where: {
        OR: [{ vehicleId }, { driverId }],
        ...(booking ? {
          id: { not: booking.id },
          departureAt: { lt: booking.expectedReturnAt },
          expectedReturnAt: { gt: booking.departureAt },
        } : {}),
        status: { in: committedBookingStatuses },
      },
      select: { id: true },
    });
    if (reservation) {
      throw new ApiError(409, 'BOOKING_CONFLICT', 'Driver or vehicle is reserved for another booking');
    }

    await ensureVehicleAssignment(tx, driverId, vehicleId);
    // Clear any stale mirrors on other vehicles/drivers
    await tx.vehicle.updateMany({ where: { currentDriverId: driverId, id: { not: vehicleId } }, data: { currentDriverId: null } });
    await tx.driver.updateMany({ where: { currentVehicleId: vehicleId, id: { not: driverId } }, data: { currentVehicleId: null } });
    await tx.vehicle.update({ where: { id: vehicleId }, data: { status: VehicleStatus.IN_USE, currentDriverId: driverId } });
    await tx.driver.update({ where: { id: driverId }, data: { status: DriverStatus.ON_TRIP, currentVehicleId: vehicleId } });
    const session = await tx.driverSession.findFirst({ where: { driverId, status: DriverSessionStatus.ACTIVE } });
    if (session) {
      await tx.driverSession.updateMany({
        where: { driverId, status: DriverSessionStatus.ACTIVE }, data: { vehicleId },
      });
    } else {
      await tx.driverSession.create({
        data: { driverId, vehicleId, status: DriverSessionStatus.ACTIVE, startLat: input.startLat, startLng: input.startLng },
      });
    }
    if (booking) {
      await tx.booking.update({ where: { id: booking.id }, data: { status: BookingStatus.DRIVER_EN_ROUTE } });
    }
    return tx.trip.create({
      data: { bookingId: booking?.id ?? null, vehicleId, driverId, startedAt: new Date(), startLat: input.startLat, startLng: input.startLng, status: TripStatus.ACTIVE },
      include: tripMutationInclude,
    });
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? trip.driver.userId,
    action: 'trip.start', entityType: 'Trip', entityId: trip.id,
    newValue: { tripId: trip.id, vehicleId: trip.vehicleId, driverId, bookingId: trip.bookingId, startLat: input.startLat, startLng: input.startLng },
    ip: ctx?.ip, userAgent: ctx?.userAgent,
  });
  if (trip.booking) {
    const booking = trip.booking;
    await sendTripNotifications([
      () => notify(booking.userId, {
        type: 'DRIVER_EN_ROUTE', title: 'Driver on the way',
        body: `Your driver is on the way to pickup for booking ${booking.bookingNumber}`,
        data: { tripId: trip.id, bookingId: booking.id },
      }),
      () => notifyAdmins({
        type: 'BOOKING_IN_PROGRESS', title: 'Trip Started',
        body: `Trip ${trip.id} started for booking ${booking.bookingNumber}`,
        data: { tripId: trip.id, bookingId: booking.id },
      }),
    ]);
  }
  return trip;
}

async function closeTrip(
  snapshot: Awaited<ReturnType<typeof getTripLockTarget>>,
  authorize: (trip: Prisma.TripGetPayload<{ include: typeof tripMutationInclude }>) => void,
  status: 'COMPLETED' | 'ABORTED',
  input: EndTripInput = {}
) {
  return prisma.$transaction(async (tx) => {
    const trip = await lockTrip(tx, snapshot);
    authorize(trip);
    if (trip.status !== TripStatus.ACTIVE) {
      throw new ApiError(409, 'TRIP_ALREADY_ENDED', `Trip is already in status ${trip.status}`);
    }
    if (trip.booking && (trip.booking.driverId !== trip.driverId || trip.booking.vehicleId !== trip.vehicleId)) {
      throw new ApiError(409, 'BOOKING_NOT_ASSIGNED', 'Booking assignment no longer matches the trip');
    }
    if (trip.booking && !committedBookingStatuses.includes(trip.booking.status as typeof committedBookingStatuses[number])) {
      throw new ApiError(409, 'INVALID_BOOKING_STATUS', 'Cannot close a trip linked to a terminal or unassigned booking');
    }
    if (status === TripStatus.COMPLETED && trip.booking && trip.booking.status !== BookingStatus.IN_PROGRESS) {
      throw new ApiError(409, 'PASSENGER_TRIP_NOT_STARTED', 'Mark arrival and passenger boarding before completing this booking. Stop the pickup trip instead if it cannot continue.');
    }
    const endedAt = new Date();
    if (trip.bookingId) {
      await tx.booking.update({
        where: { id: trip.bookingId },
        data: { status: status === TripStatus.COMPLETED ? BookingStatus.PENDING_COMPLETION : BookingStatus.DRIVER_ASSIGNED },
      });
    }
    const reservation = await tx.booking.findFirst({
      where: { vehicleId: trip.vehicleId, status: { in: committedBookingStatuses } }, select: { id: true },
    });
    const reserved = (status === TripStatus.ABORTED && trip.bookingId) || Boolean(reservation);

    const activeSession = await tx.driverSession.findFirst({
      where: { driverId: trip.driverId, status: DriverSessionStatus.ACTIVE },
    });

    if (activeSession) {
      // Driver stays AVAILABLE (online) on standby; shift session remains active until manually toggled from dashboard
      await tx.vehicle.update({
        where: { id: trip.vehicleId },
        data: { status: reserved ? VehicleStatus.RESERVED : VehicleStatus.AVAILABLE, currentDriverId: trip.driverId },
      });
      await tx.driver.update({
        where: { id: trip.driverId },
        data: { status: DriverStatus.AVAILABLE, currentVehicleId: trip.vehicleId },
      });
      await tx.vehicleLocation.updateMany({
        where: { OR: [{ vehicleId: trip.vehicleId }, { driverId: trip.driverId }] },
        data: { movement: MovementStatus.STOPPED },
      });
    } else {
      // No active session: release vehicle and driver back to pool
      // No active session: release vehicle and driver back to pool
      await tx.vehicleAssignment.updateMany({
        where: { unassignedAt: null, OR: [{ driverId: trip.driverId }, { vehicleId: trip.vehicleId }] },
        data: { unassignedAt: endedAt, reason: 'Trip closed; returned to pool' },
      });
      await tx.vehicle.update({ where: { id: trip.vehicleId }, data: { status: reserved ? VehicleStatus.RESERVED : VehicleStatus.AVAILABLE, currentDriverId: null } });
      await tx.driver.update({ where: { id: trip.driverId }, data: { status: DriverStatus.OFFLINE, currentVehicleId: null } });
      await tx.driverSession.updateMany({
        where: { driverId: trip.driverId, status: DriverSessionStatus.ACTIVE },
        data: { status: DriverSessionStatus.ENDED, endedAt },
      });
      await tx.vehicleLocation.updateMany({
        where: { OR: [{ vehicleId: trip.vehicleId }, { driverId: trip.driverId }] },
        data: { movement: MovementStatus.OFFLINE },
      });
    }
    return tx.trip.update({
      where: { id: trip.id },
      data: { status, endedAt, endLat: input.endLat ?? undefined, endLng: input.endLng ?? undefined, distanceMeters: input.distanceMeters ?? undefined },
      include: tripMutationInclude,
    });
  });
}

export async function endTrip(
  driverId: string,
  tripId: string,
  input: EndTripInput,
  ctx?: TripMutationContext
) {
  const snapshot = await getTripLockTarget(tripId);
  const updatedTrip = await closeTrip(snapshot, (trip) => {
    if (trip.driverId !== driverId) {
      throw new ApiError(403, 'FORBIDDEN', 'Only the assigned driver can end this trip');
    }
  }, TripStatus.COMPLETED, input);

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? updatedTrip.driver.userId,
    action: 'trip.end', entityType: 'Trip', entityId: tripId,
    newValue: { status: TripStatus.COMPLETED, endedAt: updatedTrip.endedAt?.toISOString(), distanceMeters: updatedTrip.distanceMeters },
    ip: ctx?.ip, userAgent: ctx?.userAgent,
  });
  if (updatedTrip.booking) {
    const booking = updatedTrip.booking;
    await sendTripNotifications([
      () => notify(booking.userId, {
        type: 'BOOKING_PENDING_COMPLETION', title: 'Perjalanan Selesai',
        body: `Perjalanan untuk booking ${booking.bookingNumber} telah selesai. Silakan lampirkan Nota Dinas untuk verifikasi admin.`,
        data: { tripId: updatedTrip.id, bookingId: booking.id },
      }),
      () => notifyAdmins({
        type: 'BOOKING_PENDING_COMPLETION', title: 'Trip Selesai - Butuh Approval',
        body: `Trip ${updatedTrip.id} selesai untuk booking ${booking.bookingNumber}. Menunggu lampiran nota dinas & persetujuan admin.`,
        data: { tripId: updatedTrip.id, bookingId: booking.id },
      }),
    ]);
  }
  return updatedTrip;
}

export async function abortTrip(
  actor: AuthenticatedUser,
  tripId: string,
  input?: AbortTripInput,
  ctx?: TripMutationContext
) {
  const snapshot = await getTripLockTarget(tripId);
  const updatedTrip = await closeTrip(snapshot, (trip) => {
    if (actor.role !== 'ADMIN' && trip.driver.userId !== actor.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Only assigned driver or admin can abort this trip');
    }
  }, TripStatus.ABORTED);
  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? actor.id,
    action: 'trip.abort', entityType: 'Trip', entityId: tripId,
    newValue: { status: TripStatus.ABORTED, reason: input?.reason ?? null },
    ip: ctx?.ip, userAgent: ctx?.userAgent,
  });
  return updatedTrip;
}

export async function arriveTrip(
  actor: AuthenticatedUser,
  tripId: string,
  ctx?: TripMutationContext
) {
  const snapshot = await getTripLockTarget(tripId);
  const result = await prisma.$transaction(async (tx) => {
    const trip = await lockTrip(tx, snapshot);
    if (actor.role !== 'ADMIN' && trip.driver.userId !== actor.id) {
      throw new ApiError(403, 'FORBIDDEN', 'Only assigned driver or admin can mark arrival');
    }
    if (trip.status !== TripStatus.ACTIVE) {
      throw new ApiError(409, 'TRIP_NOT_ACTIVE', `Cannot mark arrival for trip in status ${trip.status}`);
    }
    if (!trip.booking) {
      throw new ApiError(400, 'NO_BOOKING_LINKED', 'Trip has no linked booking');
    }
    if (trip.booking.driverId !== trip.driverId || trip.booking.vehicleId !== trip.vehicleId) {
      throw new ApiError(409, 'BOOKING_NOT_ASSIGNED', 'Booking assignment no longer matches the trip');
    }
    if (trip.booking.status === BookingStatus.ARRIVED) {
      return { trip, booking: trip.booking, changed: false };
    }
    if (trip.booking.status !== BookingStatus.DRIVER_EN_ROUTE) {
      throw new ApiError(409, 'INVALID_BOOKING_STATUS', `Cannot mark arrival for booking in status ${trip.booking.status}`);
    }
    const booking = await tx.booking.update({
      where: { id: trip.booking.id }, data: { status: BookingStatus.ARRIVED }, include: bookingMutationInclude,
    });
    return { trip: { ...trip, booking }, booking, changed: true };
  });
  if (result.changed) {
    await logAuditEvent({
      actorUserId: ctx?.actorUserId ?? actor.id,
      action: 'trip.arrived', entityType: 'Trip', entityId: tripId,
      newValue: { status: BookingStatus.ARRIVED, tripId, bookingId: result.booking.id },
      ip: ctx?.ip, userAgent: ctx?.userAgent,
    });
    await sendTripNotifications([() => notify(result.booking.userId, {
      type: 'DRIVER_ARRIVED', title: 'Driver Arrived',
      body: `Your driver has arrived at the pickup location for booking ${result.booking.bookingNumber}`,
      data: { tripId, bookingId: result.booking.id },
    })]);
  }
  return { trip: result.trip, booking: result.booking };
}

export async function listTrips(
  actor: AuthenticatedUser,
  filters: TripQueryFilters
) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.TripWhereInput = {};

  if (actor.role === 'DRIVER') {
    const driver = await prisma.driver.findUnique({
      where: { userId: actor.id },
    });
    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver profile not found');
    }
    where.driverId = driver.id;
  } else if (actor.role === 'ADMIN') {
    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.vehicleId) where.vehicleId = filters.vehicleId;
  } else {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to trip listings');
  }

  if (filters.status) where.status = filters.status;
  if (filters.startDate || filters.endDate) {
    where.startedAt = {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    };
  }

  const [total, rows] = await Promise.all([
    prisma.trip.count({ where }),
    prisma.trip.findMany({
      where,
      skip,
      take: limit,
      orderBy: { startedAt: 'desc' },
      include: {
        vehicle: true,
        driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
        booking: {
          select: {
            id: true,
            bookingNumber: true,
            purpose: true,
            userId: true,
            pickupLocation: true,
            destination: true,
            operationalLocationId: true,
          },
        },
      },
    }),
  ]);

  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTripById(tripId: string, actor: AuthenticatedUser) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    include: {
      vehicle: true,
      driver: { include: { user: { select: { id: true, name: true, phone: true } } } },
      booking: { select: { id: true, bookingNumber: true, purpose: true, userId: true } },
    },
  });

  if (!trip) {
    throw new ApiError(404, 'TRIP_NOT_FOUND', 'Trip not found');
  }

  const isAdmin = actor.role === 'ADMIN';
  const isDriver = actor.role === 'DRIVER' && trip.driver.userId === actor.id;
  const isBookingOwner = trip.booking?.userId === actor.id;

  if (!isAdmin && !isDriver && !isBookingOwner) {
    throw new ApiError(403, 'FORBIDDEN', 'Access denied to this trip');
  }

  return trip;
}
