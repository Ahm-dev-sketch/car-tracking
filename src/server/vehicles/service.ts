import { Prisma, VehicleStatus, VehicleType, Transmission } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

export interface VehicleMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateVehicleInput {
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: VehicleType;
  seatingCapacity: number;
  transmission?: Transmission | null;
  imageUrl?: string | null;
  status?: VehicleStatus;
}

export interface UpdateVehicleInput {
  plateNumber?: string;
  brand?: string;
  model?: string;
  vehicleType?: VehicleType;
  seatingCapacity?: number;
  transmission?: Transmission | null;
  imageUrl?: string | null;
  status?: VehicleStatus;
}

export interface VehicleQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  seats?: number;
  status?: VehicleStatus;
  isAdmin?: boolean;
  sortBy?: 'created_at' | 'plate_number' | 'brand' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export async function listVehicles(filters: VehicleQueryFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.max(1, Math.min(100, filters.limit ?? 10));
  const skip = (page - 1) * limit;

  const where: Prisma.VehicleWhereInput = {};

  if (!filters.isAdmin) {
    if (filters.status && filters.status === VehicleStatus.INACTIVE) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    where.status = filters.status ?? { not: VehicleStatus.INACTIVE };
  } else if (filters.status) {
    where.status = filters.status;
  }

  if (filters.seats) {
    where.seatingCapacity = filters.seats;
  }

  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [
      { plateNumber: { contains: s, mode: 'insensitive' } },
      { brand: { contains: s, mode: 'insensitive' } },
      { model: { contains: s, mode: 'insensitive' } },
    ];
  }

  let orderBy: Prisma.VehicleOrderByWithRelationInput = { createdAt: 'desc' };
  const sortDir = filters.sortOrder ?? 'desc';
  if (filters.sortBy === 'plate_number') {
    orderBy = { plateNumber: sortDir };
  } else if (filters.sortBy === 'brand') {
    orderBy = { brand: sortDir };
  } else if (filters.sortBy === 'status') {
    orderBy = { status: sortDir };
  } else if (filters.sortBy === 'created_at') {
    orderBy = { createdAt: sortDir };
  }

  const [total, vehicles] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      skip,
      take: limit,
      orderBy,
      include: {
        currentDriver: {
          select: {
            id: true,
            licenseNumber: true,
            status: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        assignments: {
          where: { unassignedAt: null },
          take: 1,
          include: {
            driver: {
              include: {
                user: { select: { id: true, name: true, phone: true } },
              },
            },
          },
        },
      },
    }),
  ]);

  const data = vehicles.map((v) => {
    let currentAssignment = null;
    if (filters.isAdmin && v.assignments && v.assignments.length > 0) {
      const a = v.assignments[0];
      currentAssignment = {
        id: a.id.toString(),
        assignedAt: a.assignedAt,
        driverId: a.driverId,
        driverName: a.driver.user.name,
        driverPhone: a.driver.user.phone,
        licenseNumber: a.driver.licenseNumber,
      };
    }

    const { assignments: _omittedAssignments, ...vehicleFields } = v;
    return {
      ...vehicleFields,
      ...(filters.isAdmin ? { currentAssignment } : {}),
    };
  });

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getVehicleById(id: string) {
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      currentDriver: {
        select: {
          id: true,
          licenseNumber: true,
          status: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      },
      assignments: {
        where: { unassignedAt: null },
        take: 1,
        include: {
          driver: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      },
    },
  });

  if (!vehicle) {
    throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
  }

  const activeAssignment = vehicle.assignments?.[0];
  const { assignments: _omitted, ...cleanVehicle } = vehicle;

  return {
    ...cleanVehicle,
    currentAssignment: activeAssignment
      ? {
          id: activeAssignment.id.toString(),
          assignedAt: activeAssignment.assignedAt,
          driverId: activeAssignment.driverId,
          driverName: activeAssignment.driver.user.name,
          driverPhone: activeAssignment.driver.user.phone,
          licenseNumber: activeAssignment.driver.licenseNumber,
        }
      : null,
  };
}

export async function createVehicle(
  input: CreateVehicleInput,
  ctx?: VehicleMutationContext
) {
  const plateNumber = input.plateNumber.trim().toUpperCase();

  const existing = await prisma.vehicle.findUnique({ where: { plateNumber } });
  if (existing) {
    throw new ApiError(409, 'PLATE_EXISTS', 'A vehicle with this plate number already exists');
  }

  const vehicle = await prisma.vehicle.create({
    data: {
      plateNumber,
      brand: input.brand,
      model: input.model,
      vehicleType: input.vehicleType,
      seatingCapacity: input.seatingCapacity,
      transmission: input.transmission ?? null,
      imageUrl: input.imageUrl ?? null,
      status: input.status ?? VehicleStatus.AVAILABLE,
    },
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'CREATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    newValue: {
      plateNumber: vehicle.plateNumber,
      brand: vehicle.brand,
      model: vehicle.model,
      status: vehicle.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return vehicle;
}

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput,
  ctx?: VehicleMutationContext
) {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
  }

  const data: Prisma.VehicleUpdateInput = {};

  if (input.plateNumber) {
    const plateNumber = input.plateNumber.trim().toUpperCase();
    if (plateNumber !== existing.plateNumber) {
      const duplicate = await prisma.vehicle.findUnique({ where: { plateNumber } });
      if (duplicate) {
        throw new ApiError(409, 'PLATE_EXISTS', 'A vehicle with this plate number already exists');
      }
      data.plateNumber = plateNumber;
    }
  }

  if (input.brand) data.brand = input.brand;
  if (input.model) data.model = input.model;
  if (input.vehicleType) data.vehicleType = input.vehicleType;
  if (input.seatingCapacity !== undefined) data.seatingCapacity = input.seatingCapacity;
  if (input.transmission !== undefined) data.transmission = input.transmission;
  if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;

  if (input.status && input.status !== existing.status) {
    // Guard status transitions
    if (input.status === VehicleStatus.MAINTENANCE) {
      const activeAssignment = await prisma.vehicleAssignment.findFirst({
        where: { vehicleId: id, unassignedAt: null },
      });
      if (activeAssignment) {
        throw new ApiError(
          409,
          'VEHICLE_ASSIGNED',
          'Cannot set MAINTENANCE status while vehicle has an active assignment; unassign first'
        );
      }
    }

    if (input.status === VehicleStatus.INACTIVE) {
      if (existing.status === VehicleStatus.IN_USE) {
        throw new ApiError(
          409,
          'VEHICLE_IN_USE',
          'Cannot deactivate a vehicle currently in use'
        );
      }
      const activeAssignment = await prisma.vehicleAssignment.findFirst({
        where: { vehicleId: id, unassignedAt: null },
      });
      if (activeAssignment) {
        throw new ApiError(
          409,
          'VEHICLE_ASSIGNED',
          'Cannot deactivate vehicle while actively assigned; unassign first'
        );
      }
    }

    data.status = input.status;
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data,
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'UPDATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    oldValue: {
      plateNumber: existing.plateNumber,
      status: existing.status,
    },
    newValue: {
      plateNumber: vehicle.plateNumber,
      status: vehicle.status,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return vehicle;
}

export async function deleteVehicle(
  id: string,
  ctx?: VehicleMutationContext
) {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
  }

  if (existing.status === VehicleStatus.IN_USE) {
    throw new ApiError(409, 'VEHICLE_IN_USE', 'Cannot deactivate a vehicle currently in use');
  }

  const activeAssignment = await prisma.vehicleAssignment.findFirst({
    where: { vehicleId: id, unassignedAt: null },
  });
  if (activeAssignment) {
    throw new ApiError(
      409,
      'VEHICLE_ASSIGNED',
      'Cannot deactivate vehicle while actively assigned; unassign first'
    );
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: {
      status: VehicleStatus.INACTIVE,
      currentDriver: { disconnect: true },
    },
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId,
    action: 'DEACTIVATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    oldValue: { status: existing.status },
    newValue: { status: VehicleStatus.INACTIVE },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return vehicle;
}
