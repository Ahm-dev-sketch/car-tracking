import { Prisma, VehicleStatus, VehicleType, Transmission } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';

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

  const [total, data] = await Promise.all([
    prisma.vehicle.count({ where }),
    prisma.vehicle.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        currentDriver: {
          select: {
            id: true,
            status: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    }),
  ]);

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
          status: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      },
    },
  });

  if (!vehicle) {
    throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
  }

  return vehicle;
}

export async function createVehicle(input: CreateVehicleInput, actorUserId?: string) {
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

  logAuditEvent({
    actorUserId,
    action: 'CREATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    details: { plateNumber: vehicle.plateNumber, status: vehicle.status },
  });

  return vehicle;
}

export async function updateVehicle(id: string, input: UpdateVehicleInput, actorUserId?: string) {
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
  if (input.status) data.status = input.status;

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data,
  });

  logAuditEvent({
    actorUserId,
    action: 'UPDATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
    details: { status: vehicle.status },
  });

  return vehicle;
}

export async function deleteVehicle(id: string, actorUserId?: string) {
  const existing = await prisma.vehicle.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, 'NOT_FOUND', 'Vehicle not found');
  }

  if (existing.status === VehicleStatus.IN_USE) {
    throw new ApiError(400, 'VEHICLE_IN_USE', 'Cannot deactivate a vehicle currently in use');
  }

  const vehicle = await prisma.vehicle.update({
    where: { id },
    data: {
      status: VehicleStatus.INACTIVE,
      currentDriver: { disconnect: true },
    },
  });

  logAuditEvent({
    actorUserId,
    action: 'DEACTIVATE_VEHICLE',
    entityType: 'Vehicle',
    entityId: vehicle.id,
  });

  return vehicle;
}
