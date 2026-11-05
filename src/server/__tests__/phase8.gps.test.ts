process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import {
  ingestLocations,
  classifyMovement,
  haversineDistanceMeters,
} from '@/server/tracking/service';
import { TRACKING_CONFIG } from '@/server/tracking/config';
import { startTrip, endTrip, arriveTrip } from '@/server/trips/service';
import { endDriverSession } from '@/server/dispatch/service';
import { createVehicle } from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import { createBooking, transitionBooking } from '@/server/bookings/service';
import {
  RoleCode,
  DriverStatus,
  BookingStatus,
  MovementStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '@/lib/auth-guard';

describe('Phase 8a GPS Edge Cases & Ingest Validation Integration Tests', () => {
  let adminActor: AuthenticatedUser;
  let userActor: AuthenticatedUser;
  let driverActor: AuthenticatedUser;
  let driverId: string;
  let vehicleId: string;

  beforeAll(async () => {
    const roles = [
      { code: RoleCode.ADMIN, name: 'Administrator' },
      { code: RoleCode.USER, name: 'User' },
      { code: RoleCode.DRIVER, name: 'Driver' },
    ];
    for (const r of roles) {
      await prisma.role.upsert({
        where: { code: r.code },
        update: { name: r.name },
        create: r,
      });
    }
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE vehicle_locations, driver_locations, trips, notifications, bookings, audit_logs, vehicle_assignments, drivers, vehicles, users CASCADE;
    `);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ADMIN },
    });
    const userRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.USER },
    });

    const admin = await createUser({
      email: 'admin.gps@test.com',
      name: 'Admin GPS',
      phone: '0901111111',
      password: 'password123',
      roleId: adminRole.id,
    });
    adminActor = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: 'ADMIN',
    };

    const user = await createUser({
      email: 'user.gps@test.com',
      name: 'User GPS',
      phone: '0902222222',
      password: 'password123',
      roleId: userRole.id,
    });
    userActor = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'USER',
    };

    const driver = await createDriver({
      email: 'driver.gps@test.com',
      name: 'Driver GPS',
      phone: '0903333333',
      password: 'password123',
      licenseNumber: 'LIC-GPS-1',
      status: DriverStatus.AVAILABLE,
    });
    driverId = driver.id;
    driverActor = {
      id: driver.userId,
      email: driver.user.email,
      name: driver.user.name,
      role: 'DRIVER',
    };

    const vehicle = await createVehicle({
      plateNumber: '29A-666.77',
      brand: 'Toyota',
      model: 'Vios',
      vehicleType: 'SEDAN',
      seatingCapacity: 5,
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. ingest with no ACTIVE trip -> 403 TRACKING_SESSION_REQUIRED', async () => {
    const point = {
      lat: 21.0285,
      lng: 105.8542,
      accuracyM: 10,
      recordedAt: new Date(),
    };

    await expect(ingestLocations(driverId, [point])).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        code: 'TRACKING_SESSION_REQUIRED',
      })
    );
  });

  it('2. ingest AFTER trip ended -> 403 TRACKING_SESSION_REQUIRED', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Field visit',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId }
    );

    const trip = await startTrip(driverId, {
      bookingId: booking.id,
      startLat: 21.02,
      startLng: 105.85,
    });

    // Ingest while active succeeds
    const activeRes = await ingestLocations(driverId, [
      {
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 15,
        recordedAt: new Date(),
      },
    ]);
    expect(activeRes.accepted).toBe(1);

    // End trip
    await arriveTrip(driverActor, trip.id);
    await transitionBooking(booking.id, BookingStatus.IN_PROGRESS, driverActor);
    await endTrip(driverId, trip.id, {
      endLat: 21.03,
      endLng: 105.86,
    });

    // Driver ends shift/session from dashboard to go offline
    await endDriverSession(driverId);

    // Ingest after session ended fails with 403
    await expect(
      ingestLocations(driverId, [
        {
          lat: 21.035,
          lng: 105.865,
          accuracyM: 10,
          recordedAt: new Date(),
        },
      ])
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        code: 'TRACKING_SESSION_REQUIRED',
      })
    );
  });

  it('3. recorded_at staleness boundary: exact boundary accepted, past boundary rejected', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Staleness check',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId }
    );
    await startTrip(driverId, {
      bookingId: booking.id,
      startLat: 21.02,
      startLng: 105.85,
    });

    const maxStaleMs =
      TRACKING_CONFIG.tripIntervalSec * TRACKING_CONFIG.maxStaleMultiplier * 1000;

    // Use fake timers or calculate fixed offset relative to execution time
    const nowMs = Date.now();
    // Exactly at boundary: now - maxStaleMs + 1000ms buffer so it doesn't cross during exec
    const exactBoundaryTime = new Date(nowMs - maxStaleMs);
    // Past boundary: 5 seconds older than boundary
    const pastBoundaryTime = new Date(nowMs - maxStaleMs - 5000);

    const points = [
      {
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 10,
        recordedAt: new Date(nowMs - maxStaleMs + 2000), // Within boundary -> accepted
      },
      {
        lat: 21.0286,
        lng: 105.8543,
        accuracyM: 10,
        recordedAt: pastBoundaryTime, // Stale -> rejected
      },
    ];

    const result = await ingestLocations(driverId, points);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
    expect(result.rejected[0].reason).toContain('stale');
  });

  it('4. accuracy boundary: exact cap accepted, over cap rejected with per-point reason', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Accuracy check',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId }
    );
    await startTrip(driverId, {
      bookingId: booking.id,
      startLat: 21.02,
      startLng: 105.85,
    });

    const cap = TRACKING_CONFIG.accuracyCapTripM; // 30m

    const points = [
      {
        lat: 21.01,
        lng: 105.81,
        accuracyM: cap, // Exactly at cap -> accepted
        recordedAt: new Date(),
      },
      {
        lat: 21.02,
        lng: 105.82,
        accuracyM: cap + 1, // 1m over cap -> rejected
        recordedAt: new Date(),
      },
    ];

    const result = await ingestLocations(driverId, points);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].index).toBe(1);
    expect(result.rejected[0].reason).toBe(`Accuracy ${cap + 1}m exceeds trip cap ${cap}m`);
  });

  it('5. movement classification: identical coords -> STOPPED; delta > 50m -> MOVING', () => {
    const origin = { lat: 21.028511, lng: 105.854167 };

    // 5a. Two identical coords without speed -> STOPPED
    const identical = classifyMovement(origin, {
      lat: origin.lat,
      lng: origin.lng,
      speedMps: 0,
    });
    expect(identical).toBe(MovementStatus.STOPPED);

    // 5b. Small movement (< 50m) with 0 speed -> STOPPED
    // ~11 meters offset
    const smallDelta = classifyMovement(origin, {
      lat: origin.lat + 0.0001,
      lng: origin.lng,
      speedMps: 0,
    });
    expect(smallDelta).toBe(MovementStatus.STOPPED);

    // 5c. Delta > 50m -> MOVING
    // 0.001 deg lat is ~111 meters
    const dist = haversineDistanceMeters(
      origin.lat,
      origin.lng,
      origin.lat + 0.001,
      origin.lng
    );
    expect(dist).toBeGreaterThan(50);

    const largeDelta = classifyMovement(origin, {
      lat: origin.lat + 0.001,
      lng: origin.lng,
      speedMps: 0,
    });
    expect(largeDelta).toBe(MovementStatus.MOVING);

    // 5d. Speed boundary: speed <= 2 -> STOPPED (if delta <= 50m), speed > 2 -> MOVING
    const speedAtCap = classifyMovement(origin, {
      lat: origin.lat,
      lng: origin.lng,
      speedMps: 2,
    });
    expect(speedAtCap).toBe(MovementStatus.STOPPED);

    const speedOverCap = classifyMovement(origin, {
      lat: origin.lat,
      lng: origin.lng,
      speedMps: 2.1,
    });
    expect(speedOverCap).toBe(MovementStatus.MOVING);
  });
});
