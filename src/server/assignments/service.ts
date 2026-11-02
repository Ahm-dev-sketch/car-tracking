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

export async function assignVehicle(
  driverId: string,
  vehicleId: string,
  ctx?: AssignmentContext
): Promise<SerializedAssignment> {
  const [vehicle, driver] = await Promise.all([
    prisma.vehicle.findUnique({ where: { id: vehicleId } }),
    prisma.driver.findUnique({ where: { id: driverId } }),
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

  // Pre-check open assignments before transaction
  const [activeVehicleAssignment, activeDriverAssignment] = await Promise.all([
    prisma.vehicleAssignment.findFirst({
      where: { vehicleId, unassignedAt: null },
    }),
    prisma.vehicleAssignment.findFirst({
      where: { driverId, unassignedAt: null },
    }),
  ]);

  if (activeVehicleAssignment) {
    throw new ApiError(
      409,
      'VEHICLE_ALREADY_ASSIGNED',
      'Vehicle already has an active assignment'
    );
  }

  if (activeDriverAssignment) {
    throw new ApiError(
      409,
      'DRIVER_ALREADY_ASSIGNED',
      'Driver already has an active assignment'
    );
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
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

  if (!activeAssignment) {
    throw new ApiError(
      404,
      'NO_ACTIVE_ASSIGNMENT',
      'Driver has no active vehicle assignment'
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const closed = await tx.vehicleAssignment.update({
      where: { id: activeAssignment.id },
      data: {
        unassignedAt: new Date(),
        reason: reason ?? null,
      },
    });

    const vehicle = await tx.vehicle.findUnique({
      where: { id: activeAssignment.vehicleId },
    });

    const newVehicleStatus =
      vehicle?.status === VehicleStatus.IN_USE
        ? VehicleStatus.IN_USE
        : VehicleStatus.AVAILABLE;

    await tx.vehicle.update({
      where: { id: activeAssignment.vehicleId },
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
      vehicleId: activeAssignment.vehicleId,
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
