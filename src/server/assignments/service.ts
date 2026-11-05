import { Prisma, VehicleStatus, DriverStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

export interface AssignmentContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface SerializedAssignment {
  id: string;
  vehicleId: string;
  driverId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  reason: string | null;
}

function serializeAssignment(row: {
  id: bigint;
  vehicleId: string;
  driverId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  reason: string | null;
}): SerializedAssignment {
  return {
    id: row.id.toString(),
    vehicleId: row.vehicleId,
    driverId: row.driverId,
    assignedAt: row.assignedAt,
    unassignedAt: row.unassignedAt,
    reason: row.reason,
  };
}

// Call only while holding the vehicle and driver locks, in that order.
export async function ensureVehicleAssignment(tx: Prisma.TransactionClient, driverId: string, vehicleId: string) {
  const exact = await tx.vehicleAssignment.findFirst({
    where: { driverId, vehicleId, unassignedAt: null },
  });
  if (exact) return exact;

  // In a shared vehicle pool: close any prior active assignment for this driver or vehicle
  await tx.vehicleAssignment.updateMany({
    where: {
      unassignedAt: null,
      OR: [{ driverId }, { vehicleId }],
    },
    data: { unassignedAt: new Date(), reason: 'Reassigned from vehicle pool' },
  });

  return tx.vehicleAssignment.create({ data: { driverId, vehicleId, assignedAt: new Date() } });
}

export async function assignVehicle(
  driverId: string,
  vehicleId: string,
  ctx?: AssignmentContext
): Promise<SerializedAssignment> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Use the same vehicle-first lock order as the trip lifecycle.
      await tx.$queryRawUnsafe('SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', vehicleId);
      await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driverId);
      const [vehicle, driver] = await Promise.all([
        tx.vehicle.findUnique({ where: { id: vehicleId } }),
        tx.driver.findUnique({ where: { id: driverId }, include: { user: true } }),
      ]);

      if (!vehicle) {
        throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
      }

      if (!driver) {
        throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
      }

      if (
        vehicle.status === VehicleStatus.MAINTENANCE ||
        vehicle.status === VehicleStatus.INACTIVE ||
        vehicle.status === VehicleStatus.IN_USE
      ) {
        throw new ApiError(
          409,
          'VEHICLE_UNAVAILABLE',
          `Vehicle cannot be assigned in status ${vehicle.status}`
        );
      }

      if (!driver.user.isActive) {
        throw new ApiError(409, 'DRIVER_INACTIVE', 'Cannot assign a vehicle to an inactive driver');
      }
      if (driver.status === DriverStatus.ON_TRIP) {
        throw new ApiError(409, 'DRIVER_BUSY', 'Cannot change assignment during an active trip');
      }

      const [activeVehicleAssignment, activeDriverAssignment] = await Promise.all([
        tx.vehicleAssignment.findFirst({ where: { vehicleId, unassignedAt: null } }),
        tx.vehicleAssignment.findFirst({ where: { driverId, unassignedAt: null } }),
      ]);

      if (activeVehicleAssignment || vehicle.currentDriverId) {
        throw new ApiError(409, 'VEHICLE_ALREADY_ASSIGNED', 'Vehicle already has an active assignment');
      }

      if (activeDriverAssignment || driver.currentVehicleId) {
        throw new ApiError(409, 'DRIVER_ALREADY_ASSIGNED', 'Driver already has an active assignment');
      }

      const activeTrip = await tx.trip.findFirst({
        where: { status: 'ACTIVE', OR: [{ driverId }, { vehicleId }] },
      });
      if (activeTrip) {
        throw new ApiError(409, 'ACTIVE_TRIP', 'Cannot change assignment during an active trip');
      }
      const activeSession = await tx.driverSession.findFirst({
        where: { status: 'ACTIVE', OR: [{ driverId }, { vehicleId }] },
      });
      if (activeSession) {
        throw new ApiError(409, 'ACTIVE_SESSION', 'End the online session before changing assignment');
      }
      const booking = await tx.booking.findFirst({
        where: {
          OR: [{ driverId }, { vehicleId }],
          status: { in: ['APPROVED', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ADMIN_INTERVENTION'] },
        },
      });
      if (booking) {
        throw new ApiError(409, 'ACTIVE_BOOKING', 'Resolve assigned bookings before changing assignment');
      }
      const assignment = await tx.vehicleAssignment.create({
        data: {
          vehicleId,
          driverId,
          assignedAt: new Date(),
        },
      });

      await tx.vehicle.update({
        where: { id: vehicleId },
        data: {
          status: VehicleStatus.RESERVED,
          currentDriverId: driverId,
        },
      });

      await tx.driver.update({
        where: { id: driverId },
        data: {
          status: DriverStatus.AVAILABLE,
          currentVehicleId: vehicleId,
        },
      });

      return assignment;
    });

    await logAuditEvent({
      actorUserId: ctx?.actorUserId,
      action: 'ASSIGN_VEHICLE',
      entityType: 'VehicleAssignment',
      entityId: result.id.toString(),
      newValue: {
        vehicleId,
        driverId,
        assignedAt: result.assignedAt.toISOString(),
      },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return serializeAssignment(result);
  } catch (err: unknown) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ApiError(
        409,
        'ASSIGNMENT_CONFLICT',
        'Assignment conflict: vehicle or driver is already actively assigned'
      );
    }
    throw err;
  }
}

export async function unassignVehicle(
  driverId: string,
  reason?: string,
  ctx?: AssignmentContext
): Promise<SerializedAssignment> {
  const driver = await prisma.driver.findUnique({
    where: { id: driverId },
  });

  if (!driver) {
    throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
  }

  const activeAssignment = await prisma.vehicleAssignment.findFirst({
    where: {
      driverId,
      unassignedAt: null,
    },
  });

  const vehicleId = activeAssignment?.vehicleId ?? driver.currentVehicleId;
  if (!vehicleId) {
    throw new ApiError(404, 'NO_ACTIVE_ASSIGNMENT', 'Driver has no active vehicle assignment');
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(
      'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', vehicleId
    );
    await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driverId);
    const currentAssignment = activeAssignment
      ? await tx.vehicleAssignment.findUnique({ where: { id: activeAssignment.id } })
      : await tx.vehicleAssignment.findFirst({ where: { unassignedAt: null, OR: [{ driverId }, { vehicleId }] } });
    if ((activeAssignment && (!currentAssignment || currentAssignment.unassignedAt)) || (currentAssignment && (currentAssignment.driverId !== driverId || currentAssignment.vehicleId !== vehicleId))) {
      throw new ApiError(409, 'ASSIGNMENT_CONFLICT', 'Assignment has already been closed');
    }
    const activeTrip = await tx.trip.findFirst({
      where: { status: 'ACTIVE', OR: [{ driverId }, { vehicleId }] },
    });
    if (activeTrip) {
      throw new ApiError(409, 'ACTIVE_TRIP', 'Cannot unassign a vehicle during an active trip');
    }
    const booking = await tx.booking.findFirst({
      where: {
        OR: [{ driverId }, { vehicleId }],
        status: { in: ['APPROVED', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'ADMIN_INTERVENTION'] },
      },
    });
    if (booking) {
      throw new ApiError(409, 'ACTIVE_BOOKING', 'Resolve assigned bookings before unassigning the vehicle');
    }
    const currentDriver = await tx.driver.findUnique({ where: { id: driverId } });
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId } });
    if (currentDriver?.status === DriverStatus.ON_TRIP || vehicle?.status === VehicleStatus.IN_USE) {
      throw new ApiError(409, 'ACTIVE_TRIP', 'Cannot unassign a vehicle currently in use');
    }
    if (currentDriver?.currentVehicleId !== vehicleId || vehicle?.currentDriverId !== driverId) {
      throw new ApiError(409, 'ASSIGNMENT_CONFLICT', 'Assignment no longer matches the current driver and vehicle');
    }
    const releasedAt = new Date();
    const closed = currentAssignment
      ? await tx.vehicleAssignment.update({
          where: { id: currentAssignment.id },
          data: { unassignedAt: releasedAt, reason: reason ?? null },
        })
      : await tx.vehicleAssignment.create({
          // The old start time is unknown; this zero-duration row records reconciliation,
          // not a fabricated historical assignment interval.
          data: { driverId, vehicleId, assignedAt: releasedAt, unassignedAt: releasedAt, reason: reason ?? 'Reconciled legacy assignment mirrors' },
        });

    const newVehicleStatus =
      vehicle.status === VehicleStatus.RESERVED
        ? VehicleStatus.AVAILABLE
        : vehicle.status;

    await tx.driverSession.updateMany({
      where: { driverId, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    await tx.vehicleLocation.updateMany({
      where: { OR: [{ driverId }, { vehicleId }] }, data: { movement: 'OFFLINE' },
    });

    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        currentDriverId: null,
        status: newVehicleStatus,
      },
    });

    await tx.driver.update({
      where: { id: driverId },
      data: {
        currentVehicleId: null,
        status: DriverStatus.OFFLINE,
      },
    });

    return closed;
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'UNASSIGN_VEHICLE',
    entityType: 'VehicleAssignment',
    entityId: result.id.toString(),
    oldValue: {
      vehicleId: result.vehicleId,
      driverId,
    },
    newValue: {
      unassignedAt: result.unassignedAt?.toISOString(),
      reason: result.reason,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return serializeAssignment(result);
}
