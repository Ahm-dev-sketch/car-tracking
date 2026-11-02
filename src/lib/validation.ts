import { z } from 'zod';

export const vehicleTypeEnum = z.enum(['SEDAN', 'SUV', 'MPV', 'VAN', 'TRUCK']);
export const vehicleStatusEnum = z.enum([
  'AVAILABLE',
  'RESERVED',
  'IN_USE',
  'MAINTENANCE',
  'INACTIVE',
]);
export const transmissionEnum = z.enum(['MANUAL', 'AUTOMATIC']);
export const driverStatusEnum = z.enum(['OFFLINE', 'AVAILABLE', 'ON_TRIP']);
export const roleCodeEnum = z.enum(['ADMIN', 'USER', 'DRIVER']);

export const createUserSchema = z
  .object({
    email: z.string().trim().email('Invalid email address'),
    name: z.string().trim().min(1, 'Name is required'),
    phone: z.string().trim().min(1, 'Phone is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role_id: z.string().min(1, 'role_id is required').optional(),
    roleId: z.string().min(1, 'roleId is required').optional(),
  })
  .refine((data) => Boolean(data.role_id || data.roleId), {
    message: 'role_id is required',
    path: ['role_id'],
  });

export const updateUserSchema = z.object({
  is_active: z.boolean().optional(),
  isActive: z.boolean().optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .optional(),
});

export const createVehicleSchema = z
  .object({
    plate_number: z.string().trim().min(1).optional(),
    plateNumber: z.string().trim().min(1).optional(),
    brand: z.string().trim().min(1, 'Brand is required'),
    model: z.string().trim().min(1, 'Model is required'),
    vehicle_type: vehicleTypeEnum.optional(),
    vehicleType: vehicleTypeEnum.optional(),
    seating_capacity: z.coerce.number().int().positive('Seating capacity must be greater than 0').optional(),
    seatingCapacity: z.coerce.number().int().positive('Seating capacity must be greater than 0').optional(),
    transmission: transmissionEnum.optional().nullable(),
    image_url: z.string().url('Invalid image URL').optional().nullable(),
    imageUrl: z.string().url('Invalid image URL').optional().nullable(),
    status: vehicleStatusEnum.optional().default('AVAILABLE'),
  })
  .superRefine((data, ctx) => {
    if (!data.plate_number && !data.plateNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Plate number is required',
        path: ['plate_number'],
      });
    }
    if (!data.vehicle_type && !data.vehicleType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Vehicle type is required',
        path: ['vehicle_type'],
      });
    }
    if (data.seating_capacity === undefined && data.seatingCapacity === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Seating capacity is required',
        path: ['seating_capacity'],
      });
    }
  })
  .transform((data) => {
    const rawPlate = data.plate_number ?? data.plateNumber ?? '';
    const plateNumber = rawPlate.trim().toUpperCase();
    const vehicleType = (data.vehicle_type ?? data.vehicleType)!;
    const seatingCapacity = (data.seating_capacity ?? data.seatingCapacity)!;
    const imageUrl = data.image_url ?? data.imageUrl ?? null;

    return {
      plateNumber,
      brand: data.brand,
      model: data.model,
      vehicleType,
      seatingCapacity,
      transmission: data.transmission ?? null,
      imageUrl,
      status: data.status,
    };
  });

export const updateVehicleSchema = z.object({
  plate_number: z.string().trim().min(1).transform((v) => v.toUpperCase()).optional(),
  plateNumber: z.string().trim().min(1).transform((v) => v.toUpperCase()).optional(),
  brand: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).optional(),
  vehicle_type: vehicleTypeEnum.optional(),
  vehicleType: vehicleTypeEnum.optional(),
  seating_capacity: z.coerce.number().int().positive('Seating capacity must be greater than 0').optional(),
  seatingCapacity: z.coerce.number().int().positive('Seating capacity must be greater than 0').optional(),
  transmission: transmissionEnum.optional().nullable(),
  image_url: z.string().url().optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  status: vehicleStatusEnum.optional(),
}).transform((data) => {
  const plateNumber = data.plate_number ?? data.plateNumber;
  const vehicleType = data.vehicle_type ?? data.vehicleType;
  const seatingCapacity = data.seating_capacity ?? data.seatingCapacity;
  const imageUrl = data.image_url !== undefined ? data.image_url : data.imageUrl;

  return {
    ...(plateNumber ? { plateNumber } : {}),
    ...(data.brand ? { brand: data.brand } : {}),
    ...(data.model ? { model: data.model } : {}),
    ...(vehicleType ? { vehicleType } : {}),
    ...(seatingCapacity !== undefined ? { seatingCapacity } : {}),
    ...(data.transmission !== undefined ? { transmission: data.transmission } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    ...(data.status ? { status: data.status } : {}),
  };
});

export const createDriverSchema = z
  .object({
    email: z.string().trim().email('Invalid email address'),
    name: z.string().trim().min(1, 'Name is required'),
    phone: z.string().trim().min(1, 'Phone is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    license_number: z.string().trim().min(1, 'License number is required').optional(),
    licenseNumber: z.string().trim().min(1, 'License number is required').optional(),
    status: driverStatusEnum.optional().default('OFFLINE'),
  })
  .superRefine((data, ctx) => {
    if (!data.license_number && !data.licenseNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'License number is required',
        path: ['license_number'],
      });
    }
  })
  .transform((data) => {
    const licenseNumber = (data.license_number ?? data.licenseNumber)!.trim();
    return {
      email: data.email,
      name: data.name,
      phone: data.phone,
      password: data.password,
      licenseNumber,
      status: data.status,
    };
  });

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const vehicleQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  seats: z.coerce.number().int().positive().optional(),
  status: vehicleStatusEnum.optional(),
});

export const userQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
});

export const driverQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().trim().optional(),
  status: driverStatusEnum.optional(),
});
