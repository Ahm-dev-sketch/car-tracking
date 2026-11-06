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
export const imageSourceSchema = z
  .string()
  .trim()
  .refine(
    (val) => !val || val.startsWith('/') || /^https?:\/\//i.test(val) || /^data:image\//i.test(val),
    { message: 'Invalid image URL or path' }
  )
  .optional()
  .nullable();
export const driverStatusEnum = z.enum(['OFFLINE', 'AVAILABLE', 'ON_TRIP']);
export const roleCodeEnum = z.enum(['ADMIN', 'USER', 'DRIVER']);
export const bookingStatusEnum = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SEARCHING_DRIVER',
  'DRIVER_NOTIFIED',
  'DRIVER_ASSIGNED',
  'DRIVER_EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'PENDING_COMPLETION',
  'COMPLETED',
  'CANCELLED',
  'NO_DRIVER_AVAILABLE',
  'ADMIN_INTERVENTION',
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
    image_url: imageSourceSchema,
    imageUrl: imageSourceSchema,
    status: vehicleStatusEnum.optional().default('AVAILABLE'),
    location_id: z.string().trim().min(1).optional().nullable(),
    locationId: z.string().trim().min(1).optional().nullable(),
    home_location_id: z.string().trim().min(1).optional().nullable(),
    homeLocationId: z.string().trim().min(1).optional().nullable(),
    current_location_id: z.string().trim().min(1).optional().nullable(),
    currentLocationId: z.string().trim().min(1).optional().nullable(),
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
    const homeLocationId = data.home_location_id ?? data.homeLocationId ?? data.location_id ?? data.locationId ?? null;
    const currentLocationId = data.current_location_id ?? data.currentLocationId ?? homeLocationId;

    return {
      plateNumber,
      brand: data.brand,
      model: data.model,
      vehicleType,
      seatingCapacity,
      transmission: data.transmission ?? null,
      imageUrl,
      status: data.status,
      homeLocationId,
      currentLocationId,
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
  image_url: imageSourceSchema,
  imageUrl: imageSourceSchema,
  status: vehicleStatusEnum.optional(),
  location_id: z.string().trim().min(1).optional().nullable(),
  locationId: z.string().trim().min(1).optional().nullable(),
  home_location_id: z.string().trim().min(1).optional().nullable(),
  homeLocationId: z.string().trim().min(1).optional().nullable(),
  current_location_id: z.string().trim().min(1).optional().nullable(),
  currentLocationId: z.string().trim().min(1).optional().nullable(),
}).transform((data) => {
  const plateNumber = data.plate_number ?? data.plateNumber;
  const vehicleType = data.vehicle_type ?? data.vehicleType;
  const seatingCapacity = data.seating_capacity ?? data.seatingCapacity;
  const imageUrl = data.image_url !== undefined ? data.image_url : data.imageUrl;
  const homeLocationId = data.home_location_id !== undefined
    ? data.home_location_id
    : data.homeLocationId !== undefined
      ? data.homeLocationId
      : data.location_id !== undefined
        ? data.location_id
        : data.locationId;
  const currentLocationId = data.current_location_id !== undefined ? data.current_location_id : data.currentLocationId;

  return {
    ...(plateNumber ? { plateNumber } : {}),
    ...(data.brand ? { brand: data.brand } : {}),
    ...(data.model ? { model: data.model } : {}),
    ...(vehicleType ? { vehicleType } : {}),
    ...(seatingCapacity !== undefined ? { seatingCapacity } : {}),
    ...(data.transmission !== undefined ? { transmission: data.transmission } : {}),
    ...(imageUrl !== undefined ? { imageUrl } : {}),
    ...(data.status ? { status: data.status } : {}),
    ...(homeLocationId !== undefined ? { homeLocationId } : {}),
    ...(currentLocationId !== undefined ? { currentLocationId } : {}),
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
  location_id: z.string().optional(),
  locationId: z.string().optional(),
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
  location_id: z.string().optional(),
  locationId: z.string().optional(),
  assignment: z.enum(['assigned', 'unassigned', 'all']).optional(),
  sortBy: z.enum(['name', 'license_number', 'created_at']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const createBookingSchema = z
  .object({
    vehicle_id: z.string().trim().min(1).optional().nullable(),
    vehicleId: z.string().trim().min(1).optional().nullable(),
    operational_location_id: z.string().trim().min(1, 'Operational location is required').optional(),
    operationalLocationId: z.string().trim().min(1, 'Operational location is required').optional(),
    vehicle_preference_id: z.string().trim().min(1).optional().nullable(),
    vehiclePreferenceId: z.string().trim().min(1).optional().nullable(),
    pickup_lat: z.coerce.number().optional().nullable(),
    pickupLat: z.coerce.number().optional().nullable(),
    pickup_lng: z.coerce.number().optional().nullable(),
    pickupLng: z.coerce.number().optional().nullable(),
    destination_lat: z.coerce.number().optional().nullable(),
    destinationLat: z.coerce.number().optional().nullable(),
    destination_lng: z.coerce.number().optional().nullable(),
    destinationLng: z.coerce.number().optional().nullable(),
    pickup_location: z.string().trim().min(1, 'Pickup location is required').optional(),
    pickupLocation: z.string().trim().min(1, 'Pickup location is required').optional(),
    destination: z.string().trim().min(1, 'Destination is required'),
    departure_at: z.coerce.date().optional(),
    departureAt: z.coerce.date().optional(),
    expected_return_at: z.coerce.date().optional(),
    expectedReturnAt: z.coerce.date().optional(),
    passenger_count: z.coerce.number().int().min(1, 'Passenger count must be at least 1').optional(),
    passengerCount: z.coerce.number().int().min(1, 'Passenger count must be at least 1').optional(),
    purpose: z.string().trim().optional().nullable(),
    notes: z.string().trim().optional().nullable(),
    service_type: z.enum(['DROP_OFF', 'STANDBY']).optional(),
    serviceType: z.enum(['DROP_OFF', 'STANDBY']).optional(),
    nota_dinas_url: z.string().trim().optional().nullable(),
    notaDinasUrl: z.string().trim().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const operationalLoc = data.operational_location_id ?? data.operationalLocationId;
    if (!operationalLoc) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Operational location is required',
        path: ['operationalLocationId'],
      });
    }

    const sType = data.service_type ?? data.serviceType ?? 'DROP_OFF';
    const trimmedPurpose = data.purpose?.trim() || '';
    if (sType === 'STANDBY' && !trimmedPurpose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Keterangan atau keperluan wajib diisi untuk layanan Standby',
        path: ['purpose'],
      });
    }

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
    const operationalLocationId = (data.operational_location_id ?? data.operationalLocationId)!;
    const vehiclePreferenceId = data.vehicle_preference_id ?? data.vehiclePreferenceId ?? null;
    const pickupLat = data.pickup_lat ?? data.pickupLat ?? null;
    const pickupLng = data.pickup_lng ?? data.pickupLng ?? null;
    const destinationLat = data.destination_lat ?? data.destinationLat ?? null;
    const destinationLng = data.destination_lng ?? data.destinationLng ?? null;
    const pickupLocation = (data.pickup_location ?? data.pickupLocation)!;
    const departureAt = (data.departure_at ?? data.departureAt)!;
    const expectedReturnAt = (data.expected_return_at ?? data.expectedReturnAt)!;
    const passengerCount = (data.passenger_count ?? data.passengerCount)!;
    const serviceType = (data.service_type ?? data.serviceType ?? 'DROP_OFF') as 'DROP_OFF' | 'STANDBY';
    const purpose = (data.purpose?.trim()) || (serviceType === 'STANDBY' ? 'Layanan Standby' : 'Layanan Drop Off');
    const notaDinasUrl = data.nota_dinas_url ?? data.notaDinasUrl ?? null;

    return {
      vehicleId,
      operationalLocationId,
      vehiclePreferenceId,
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      pickupLocation,
      destination: data.destination,
      departureAt,
      expectedReturnAt,
      passengerCount,
      purpose,
      notes: data.notes ?? null,
      serviceType,
      notaDinasUrl,
    };
  });

export const bookingQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: bookingStatusEnum.optional(),
  vehicle_id: z.string().optional(),
  vehicleId: z.string().optional(),
  location_id: z.string().optional(),
  locationId: z.string().optional(),
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

export const manualAssignBookingSchema = z.object({
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

export const startDriverSessionSchema = z.object({
  vehicle_id: z.string().trim().optional().nullable(),
  vehicleId: z.string().trim().optional().nullable(),
  start_lat: z.coerce.number().optional().nullable(),
  startLat: z.coerce.number().optional().nullable(),
  start_lng: z.coerce.number().optional().nullable(),
  startLng: z.coerce.number().optional().nullable(),
}).transform((data) => ({
  vehicleId: data.vehicle_id ?? data.vehicleId ?? null,
  startLat: data.start_lat ?? data.startLat ?? null,
  startLng: data.start_lng ?? data.startLng ?? null,
}));

export const updateBookingStatusSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'PENDING_COMPLETION', 'COMPLETED']),
});

export const tripStatusEnum = z.enum(['ACTIVE', 'COMPLETED', 'ABORTED']);
export const movementStatusEnum = z.enum([
  'MOVING',
  'STOPPED',
  'GPS_LOST',
  'OFFLINE',
]);

export const startTripSchema = z
  .object({
    booking_id: z.string().trim().min(1).optional(),
    bookingId: z.string().trim().min(1).optional(),
    vehicle_id: z.string().trim().min(1).optional(),
    vehicleId: z.string().trim().min(1).optional(),
    start_lat: z.coerce.number().min(-90).max(90).optional(),
    startLat: z.coerce.number().min(-90).max(90).optional(),
    start_lng: z.coerce.number().min(-180).max(180).optional(),
    startLng: z.coerce.number().min(-180).max(180).optional(),
  })
  .superRefine((data, ctx) => {
    const booking = data.booking_id ?? data.bookingId;
    const vehicle = data.vehicle_id ?? data.vehicleId;
    if (!booking && !vehicle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either bookingId or vehicleId is required',
        path: ['bookingId'],
      });
    }
    const lat = data.start_lat ?? data.startLat;
    if (lat === undefined || isNaN(lat) || lat < -90 || lat > 90) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid start_lat between -90 and 90 is required',
        path: ['start_lat'],
      });
    }
    const lng = data.start_lng ?? data.startLng;
    if (lng === undefined || isNaN(lng) || lng < -180 || lng > 180) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Valid start_lng between -180 and 180 is required',
        path: ['start_lng'],
      });
    }
  })
  .transform((data) => ({
    bookingId: data.booking_id ?? data.bookingId ?? null,
    vehicleId: data.vehicle_id ?? data.vehicleId ?? null,
    startLat: (data.start_lat ?? data.startLat)!,
    startLng: (data.start_lng ?? data.startLng)!,
  }));

export const endTripSchema = z
  .object({
    end_lat: z.coerce.number().min(-90).max(90).optional(),
    endLat: z.coerce.number().min(-90).max(90).optional(),
    end_lng: z.coerce.number().min(-180).max(180).optional(),
    endLng: z.coerce.number().min(-180).max(180).optional(),
    distance_meters: z.coerce.number().nonnegative().optional(),
    distanceMeters: z.coerce.number().nonnegative().optional(),
  })
  .transform((data) => ({
    endLat: data.end_lat ?? data.endLat ?? null,
    endLng: data.end_lng ?? data.endLng ?? null,
    distanceMeters: data.distance_meters ?? data.distanceMeters ?? null,
  }));

export const abortTripSchema = z.object({
  reason: z.string().trim().optional(),
});

export const tripQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
  status: tripStatusEnum.optional(),
  vehicle_id: z.string().optional(),
  vehicleId: z.string().optional(),
  driver_id: z.string().optional(),
  driverId: z.string().optional(),
  start_date: z.coerce.date().optional(),
  startDate: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export const locationPointSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    accuracy_m: z.coerce.number().min(0).max(5000).optional(),
    accuracyM: z.coerce.number().min(0).max(5000).optional(),
    speed_mps: z.coerce.number().min(0).max(150).optional().nullable(),
    speedMps: z.coerce.number().min(0).max(150).optional().nullable(),
    heading_deg: z.coerce.number().min(0).max(360).optional().nullable(),
    headingDeg: z.coerce.number().min(0).max(360).optional().nullable(),
    recorded_at: z.coerce.date().optional(),
    recordedAt: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    const accuracy = data.accuracy_m ?? data.accuracyM;
    if (accuracy === undefined || isNaN(accuracy)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'accuracy_m is required',
        path: ['accuracy_m'],
      });
    }
    const recordedAt = data.recorded_at ?? data.recordedAt;
    if (!recordedAt || isNaN(recordedAt.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'recorded_at is required',
        path: ['recorded_at'],
      });
    }
  })
  .transform((data) => ({
    lat: data.lat,
    lng: data.lng,
    accuracyM: (data.accuracy_m ?? data.accuracyM)!,
    speedMps: data.speed_mps ?? data.speedMps ?? null,
    headingDeg: data.heading_deg ?? data.headingDeg ?? null,
    recordedAt: (data.recorded_at ?? data.recordedAt)!,
  }));

export const locationIngestSchema = z
  .object({
    points: z.array(z.any()).min(1, 'Points array must contain at least 1 point').max(5, 'Maximum batch size is 5 points'),
  });

import type {
  ClientRealtimeMessage,
  ServerRealtimeMessage,
} from '@/types/realtime';

export const clientAuthMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1, 'Token is required'),
});

export const clientSubscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  vehicles: z.array(z.string()).optional(),
  all: z.boolean().optional(),
});

export const clientRealtimeMessageSchema = z.discriminatedUnion('type', [
  clientAuthMessageSchema,
  clientSubscribeMessageSchema,
]);

export function parseClientMessage(raw: unknown): ClientRealtimeMessage {
  let parsedJson = raw;
  if (typeof raw === 'string') {
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      throw new Error('Invalid JSON string');
    }
  }
  return clientRealtimeMessageSchema.parse(parsedJson);
}

export function serializeEvent(event: ServerRealtimeMessage): string {
  return JSON.stringify(event);
}


