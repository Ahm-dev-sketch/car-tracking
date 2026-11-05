process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { AuthenticatedUser } from '@/lib/auth-guard';
import {
  createBooking,
  transitionBooking,
  getBookingById,
} from '@/server/bookings/service';
import { startTrip, endTrip, arriveTrip } from '@/server/trips/service';
import { unassignVehicle } from '@/server/assignments/service';
import { createVehicle } from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import {
  RoleCode,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
  TripStatus,
} from '@prisma/client';

describe('Phase 8a State Machine Guards Integration Tests', () => {
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
      email: 'admin.state@test.com',
      name: 'Admin State',
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
      email: 'user.state@test.com',
      name: 'User State',
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
      email: 'driver.state@test.com',
      name: 'Driver State',
      phone: '0903333333',
      password: 'password123',
      licenseNumber: 'LIC-STATE-1',
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
      plateNumber: '29A-777.88',
      brand: 'Toyota',
      model: 'Corolla',
      vehicleType: 'SEDAN',
      seatingCapacity: 5,
    });
    vehicleId = vehicle.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. approve already-approved booking -> 409 INVALID_TRANSITION', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Meeting',
    });

    // First approval succeeds
    const approved = await transitionBooking(
      booking.id,
      BookingStatus.APPROVED,
      adminActor
    );
    expect(approved.status).toBe(BookingStatus.APPROVED);

    // Second approval fails with 409
    await expect(
      transitionBooking(booking.id, BookingStatus.APPROVED, adminActor)
    ).rejects.toThrowError(
      expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' })
    );
  });

  it('2. cancel COMPLETED -> 409; reject IN_PROGRESS -> 409', async () => {
    // 2a. cancel COMPLETED -> 409
    const booking1 = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Trip 1',
    });
    await transitionBooking(booking1.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking1.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId }
    );
    const firstTrip = await startTrip(driverId, { bookingId: booking1.id, startLat: 21, startLng: 105 });
    await arriveTrip(driverActor, firstTrip.id);
    await transitionBooking(booking1.id, BookingStatus.IN_PROGRESS, driverActor);
    await transitionBooking(booking1.id, BookingStatus.COMPLETED, driverActor);

    await expect(
      transitionBooking(booking1.id, BookingStatus.CANCELLED, userActor)
    ).rejects.toThrowError(
      expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' })
    );

    // Explicitly release the standing mirror before assigning another unit.
    await unassignVehicle(driverId);
    await prisma.driver.update({ where: { id: driverId }, data: { status: DriverStatus.AVAILABLE } });

    // 2b. reject IN_PROGRESS -> 409
    const vehicle2 = await createVehicle({
      plateNumber: '29A-999.00',
      brand: 'Honda',
      model: 'Civic',
      vehicleType: 'SEDAN',
      seatingCapacity: 5,
    });
    const booking2 = await createBooking(userActor.id, {
      vehicleId: vehicle2.id,
      pickupLocation: 'Hanoi',
      destination: 'Bac Ninh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Trip 2',
    });
    await transitionBooking(booking2.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking2.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId }
    );
    const secondTrip = await startTrip(driverId, { bookingId: booking2.id, startLat: 21, startLng: 105 });
    await arriveTrip(driverActor, secondTrip.id);
    await transitionBooking(booking2.id, BookingStatus.IN_PROGRESS, driverActor);

    await expect(
      transitionBooking(booking2.id, BookingStatus.REJECTED, adminActor)
    ).rejects.toThrowError(
      expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' })
    );
  });

  it('3. assign-driver to booking not APPROVED -> 409', async () => {
    // Booking in PENDING state
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Quang Ninh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 3,
      purpose: 'Vacation',
    });

    await expect(
      transitionBooking(
        booking.id,
        BookingStatus.DRIVER_ASSIGNED,
        adminActor,
        undefined,
        { driverId }
      )
    ).rejects.toThrowError(
      expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' })
    );
  });

  it('4. driver status transition on trip already ended -> 409', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Nam Dinh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Delivery',
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
      startLat: 21.0,
      startLng: 105.8,
    });
    await arriveTrip(driverActor, trip.id);
    await transitionBooking(booking.id, BookingStatus.IN_PROGRESS, driverActor);
    // End trip first time -> succeeds
    const ended = await endTrip(driverId, trip.id, {
      endLat: 21.05,
      endLng: 105.85,
      distanceMeters: 5500,
    });
    expect(ended.status).toBe(TripStatus.COMPLETED);

    // End trip second time on already ended trip -> 409 TRIP_ALREADY_ENDED
    await expect(
      endTrip(driverId, trip.id, {
        endLat: 21.05,
        endLng: 105.85,
      })
    ).rejects.toThrowError(
      expect.objectContaining({ status: 409, code: 'TRIP_ALREADY_ENDED' })
    );
  });

  it('5. two concurrent approves on same booking (Promise.all) -> exactly one succeeds, one 409', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Concurrency test',
    });

    const results = await Promise.allSettled([
      transitionBooking(booking.id, BookingStatus.APPROVED, adminActor),
      transitionBooking(booking.id, BookingStatus.APPROVED, adminActor),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const error = (rejected[0] as PromiseRejectedResult).reason as ApiError;
    expect(error.status).toBe(409);
    expect(error.code).toBe('INVALID_TRANSITION');
  });
});
