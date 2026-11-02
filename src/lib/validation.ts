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
export const bookingStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DRIVER_ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

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

export const updateDriverSchema = z.object({
  license_number: z.string().trim().min(1).optional(),
  licenseNumber: z.string().trim().min(1).optional(),
  status: driverStatusEnum.optional(),
}).transform((data) => {
  const licenseNumber = data.license_number ?? data.licenseNumber;
  return {
    ...(licenseNumber ? { licenseNumber } : {}),
    ...(data.status ? { status: data.status } : {}),
  };
});

export const assignVehicleSchema = z.object({
  vehicle_id: z.string().trim().min(1).optional(),
  vehicleId: z.string().trim().min(1).optional(),
}).superRefine((data, ctx) => {
  if (!data.vehicle_id && !data.vehicleId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'vehicleId is required',
      path: ['vehicleId'],
    });
  }
}).transform((data) => ({
  vehicleId: (data.vehicle_id ?? data.vehicleId)!,
}));

export const unassignVehicleSchema = z.object({
  reason: z.string().trim().optional(),
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
  sortBy: z.enum(['created_at', 'plate_number', 'brand', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
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
  assignment: z.enum(['assigned', 'unassigned', 'all']).optional(),
  sortBy: z.enum(['name', 'license_number', 'created_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const createBookingSchema = z
  .object({
    vehicle_id: z.string().trim().min(1).optional().nullable(),
    vehicleId: z.string().trim().min(1).optional().nullable(),
    pickup_location: z.string().trim().min(1, 'Pickup location is required').optional(),
    pickupLocation: z.string().trim().min(1, 'Pickup location is required').optional(),
    destination: z.string().trim().min(1, 'Destination is required'),
    departure_at: z.coerce.date().optional(),
    departureAt: z.coerce.date().optional(),
    expected_return_at: z.coerce.date().optional(),
    expectedReturnAt: z.coerce.date().optional(),
    passenger_count: z.coerce.number().int().min(1, 'Passenger count must be at least 1').optional(),
    passengerCount: z.coerce.number().int().min(1, 'Passenger count must be at least 1').optional(),
    purpose: z.string().trim().min(1, 'Purpose is required'),
    notes: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const pickup = data.pickup_location ?? data.pickupLocation;
    if (!pickup) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pickup location is required',
        path: ['pickup_location'],
      });
    }

    const departure = data.departure_at ?? data.departureAt;
    if (!departure || isNaN(departure.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid departure time is required',
        path: ['departure_at'],
      });
    }

    const expectedReturn = data.expected_return_at ?? data.expectedReturnAt;
    if (!expectedReturn || isNaN(expectedReturn.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid expected return time is required',
        path: ['expected_return_at'],
      });
    }

    if (departure && expectedReturn && expectedReturn <= departure) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Expected return time must be after departure time',
        path: ['expected_return_at'],
      });
    }

    const passengers = data.passenger_count ?? data.passengerCount;
    if (passengers === undefined || passengers < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passenger count must be at least 1',
        path: ['passenger_count'],
      });
    }
  })
  .transform((data) => {
    const vehicleId = data.vehicle_id ?? data.vehicleId ?? null;
    const pickupLocation = (data.pickup_location ?? data.pickupLocation)!;
    const departureAt = (data.departure_at ?? data.departureAt)!;
    const expectedReturnAt = (data.expected_return_at ?? data.expectedReturnAt)!;
    const passengerCount = (data.passenger_count ?? data.passengerCount)!;

    return {
      vehicleId,
      pickupLocation,
      destination: data.destination,
      departureAt,
      expectedReturnAt,
      passengerCount,
      purpose: data.purpose,
      notes: data.notes ?? null,
    };
  });

export const bookingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: bookingStatusEnum.optional(),
  vehicle_id: z.string().optional(),
  vehicleId: z.string().optional(),
  start_date: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const rejectBookingSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required'),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().optional(),
});

export const assignBookingDriverSchema = z.object({
  driver_id: z.string().trim().min(1).optional(),
  driverId: z.string().trim().min(1).optional(),
}).superRefine((data, ctx) => {
  if (!data.driver_id && !data.driverId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'driverId is required',
      path: ['driverId'],
    });
  }
}).transform((data) => ({
  driverId: (data.driver_id ?? data.driverId)!,
}));

export const updateBookingStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'COMPLETED']),
});
