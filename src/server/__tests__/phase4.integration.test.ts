process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import {
  startTrip,
  endTrip,
  abortTrip,
  arriveTrip,
} from '@/server/trips/service';
import {
  ingestLocations,
  markStale,
  classifyMovement,
} from '@/server/tracking/service';
import { purgeOldLocationPartitions } from '@/server/tracking/retention';
import { createVehicle } from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import { createBooking, transitionBooking } from '@/server/bookings/service';
import {
  RoleCode,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
  TripStatus,
  MovementStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '@/lib/auth-guard';

describe('Phase 4 PostgreSQL Integration Tests: GPS Tracking Backend', () => {
  let adminActor: AuthenticatedUser;
  let userActor: AuthenticatedUser;
  let driver1UserActor: AuthenticatedUser;

  let driver1Id: string;
  let driver2Id: string;
  let vehicle1Id: string;
  let vehicle2Id: string;

  beforeAll(async () => {
    // Seed standard roles
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
    // Truncate all tables between tests
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
      email: 'admin@phase4.test',
      name: 'Admin Tester',
      phone: '0901000001',
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
      email: 'user@phase4.test',
      name: 'User Tester',
      phone: '0901000002',
      password: 'password123',
      roleId: userRole.id,
    });
    userActor = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: 'USER',
    };

    const d1 = await createDriver({
      email: 'driver1@phase4.test',
      name: 'Driver One',
      phone: '0902000001',
      password: 'password123',
      licenseNumber: 'LIC-P4-001',
      status: DriverStatus.AVAILABLE,
    });
    driver1Id = d1.id;
    driver1UserActor = {
      id: d1.userId,
      email: d1.user.email,
      name: d1.user.name,
      role: 'DRIVER',
    };

    const d2 = await createDriver({
      email: 'driver2@phase4.test',
      name: 'Driver Two',
      phone: '0902000002',
      password: 'password123',
      licenseNumber: 'LIC-P4-002',
      status: DriverStatus.AVAILABLE,
    });
    driver2Id = d2.id;

    const v1 = await createVehicle({
      plateNumber: '30A-444.11',
      brand: 'Toyota',
      model: 'Innova',
      vehicleType: 'MPV',
      seatingCapacity: 7,
    });
    vehicle1Id = v1.id;

    const v2 = await createVehicle({
      plateNumber: '30A-444.22',
      brand: 'Ford',
      model: 'Everest',
      vehicleType: 'SUV',
      seatingCapacity: 7,
    });
    vehicle2Id = v2.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. startTrip transitions: booking DRIVER_EN_ROUTE, vehicle IN_USE, driver ON_TRIP', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Field Trip',
    });

    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driver1Id }
    );

    const trip = await startTrip(driver1Id, {
      bookingId: booking.id,
      startLat: 21.0285,
      startLng: 105.8542,
    });

    expect(trip.status).toBe(TripStatus.ACTIVE);
    expect(trip.bookingId).toBe(booking.id);
    expect(trip.vehicleId).toBe(vehicle1Id);
    expect(trip.driverId).toBe(driver1Id);

    const updatedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    // Phase 9 flow: trip start sets booking to DRIVER_EN_ROUTE
    expect(updatedBooking.status).toBe(BookingStatus.DRIVER_EN_ROUTE);

    const updatedVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle1Id },
    });
    expect(updatedVehicle.status).toBe(VehicleStatus.IN_USE);
    expect(updatedVehicle.currentDriverId).toBe(driver1Id);

    const updatedDriver = await prisma.driver.findUniqueOrThrow({
      where: { id: driver1Id },
    });
    expect(updatedDriver.status).toBe(DriverStatus.ON_TRIP);
    expect(updatedDriver.currentVehicleId).toBe(vehicle1Id);
  });

  it('2. startTrip conflicts: vehicle IN_USE -> 409, driver ON_TRIP -> 409, booking not assigned -> 409', async () => {
    const d3 = await createDriver({
      email: 'driver3@phase4.test',
      name: 'Driver Three',
      phone: '0902000003',
      password: 'password123',
      licenseNumber: 'LIC-P4-003',
      status: DriverStatus.AVAILABLE,
    });

    // 1. Create a booking assigned to Driver 2
    const booking = await createBooking(userActor.id, {
      vehicleId: vehicle2Id,
      pickupLocation: 'Hanoi',
      destination: 'Ninh Binh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Trip 2',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driver2Id }
    );

    // 2. Driver 1 starts trip with Vehicle 1
    await startTrip(driver1Id, {
      vehicleId: vehicle1Id,
      startLat: 21.0,
      startLng: 105.8,
    });

    // Conflict A: Driver 1 already ON_TRIP
    await expect(
      startTrip(driver1Id, {
        vehicleId: vehicle2Id,
        startLat: 21.0,
        startLng: 105.8,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'DRIVER_BUSY',
      })
    );

    // Conflict B: Vehicle 1 is IN_USE by Driver 1 -> Driver 2 cannot start trip on it
    await expect(
      startTrip(driver2Id, {
        vehicleId: vehicle1Id,
        startLat: 21.0,
        startLng: 105.8,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'VEHICLE_IN_USE',
      })
    );

    // Conflict C: Booking is assigned to Driver 2 -> Driver 3 cannot start it
    await expect(
      startTrip(d3.id, {
        bookingId: booking.id,
        startLat: 21.0,
        startLng: 105.8,
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'BOOKING_NOT_ASSIGNED',
      })
    );
  });

  it('3. endTrip completes booking, ends session, preserves reserved assignment mirrors', async () => {
    const booking = await createBooking(userActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Field Trip',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driver1Id }
    );

    const trip = await startTrip(driver1Id, {
      bookingId: booking.id,
      startLat: 21.0285,
      startLng: 105.8542,
    });

    await arriveTrip(driver1UserActor, trip.id);
    await transitionBooking(booking.id, BookingStatus.IN_PROGRESS, driver1UserActor);
    const ended = await endTrip(driver1Id, trip.id, {
      endLat: 20.8449,
      endLng: 106.6881,
      distanceMeters: 102500,
    });

    expect(ended.status).toBe(TripStatus.COMPLETED);
    expect(ended.endedAt).not.toBeNull();
    expect(ended.distanceMeters).toBe(102500);

    const updatedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(updatedBooking.status).toBe(BookingStatus.PENDING_COMPLETION);

    // Admin approves completion with nota dinas
    await transitionBooking(booking.id, BookingStatus.COMPLETED, adminActor);
    const approvedBooking = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(approvedBooking.status).toBe(BookingStatus.COMPLETED);

    const updatedVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle1Id },
    });
    expect(updatedVehicle.status).toBe(VehicleStatus.AVAILABLE);
    // Denormalized mirror kept until explicit unassign or shift end
    expect(updatedVehicle.currentDriverId).toBe(driver1Id);

    const updatedDriver = await prisma.driver.findUniqueOrThrow({
      where: { id: driver1Id },
    });
    // Driver stays AVAILABLE (online) on standby after completing trip; shift session remains active
    expect(updatedDriver.status).toBe(DriverStatus.AVAILABLE);
    expect(updatedDriver.currentVehicleId).toBe(vehicle1Id);
    expect(await prisma.driverSession.count({ where: { driverId: driver1Id, status: 'ACTIVE' } })).toBe(1);
  });

  it('4. ingest happy path: current location upserted, history row inserted, movement MOVING when speed > 2', async () => {
    await startTrip(driver1Id, {
      vehicleId: vehicle1Id,
      startLat: 21.0285,
      startLng: 105.8542,
    });

    const result = await ingestLocations(driver1Id, [
      {
        lat: 21.029,
        lng: 105.855,
        accuracyM: 15,
        speedMps: 8.5,
        headingDeg: 90,
        recordedAt: new Date(),
      },
    ]);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(0);

    const currentLocation = await prisma.vehicleLocation.findUniqueOrThrow({
      where: { vehicleId: vehicle1Id },
    });
    expect(currentLocation.lat).toBe(21.029);
    expect(currentLocation.lng).toBe(105.855);
    expect(currentLocation.accuracyM).toBe(15);
    expect(currentLocation.movement).toBe(MovementStatus.MOVING);

    const historyCount = await prisma.driverLocation.count({
      where: { driverId: driver1Id, vehicleId: vehicle1Id },
    });
    expect(historyCount).toBe(1);
  });

  it('5. ingest validation: bad lat/lng, future timestamp, stale timestamp, accuracy over cap rejected with reasons', async () => {
    await startTrip(driver1Id, {
      vehicleId: vehicle1Id,
      startLat: 21.0285,
      startLng: 105.8542,
    });

    const now = Date.now();
    const batch = [
      {
        lat: 95.0, // invalid lat
        lng: 105.8,
        accuracyM: 20,
        recordedAt: new Date(now),
      },
      {
        lat: 21.0,
        lng: 105.8,
        accuracyM: 300, // exceeds trip cap 250m
        recordedAt: new Date(now),
      },
      {
        lat: 21.0,
        lng: 105.8,
        accuracyM: 20,
        recordedAt: new Date(now + 120000), // future > 60s
      },
      {
        lat: 21.0,
        lng: 105.8,
        accuracyM: 20,
        recordedAt: new Date(now - 30000), // stale > 10s
      },
      {
        lat: 21.03,
        lng: 105.86,
        accuracyM: 25,
        speedMps: 0,
        recordedAt: new Date(now), // valid!
      },
    ];

    const result = await ingestLocations(driver1Id, batch);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(4);
    expect(result.rejected.map((r) => r.index)).toEqual([0, 1, 2, 3]);
  });

  // Phase 9: ingest requires ACTIVE driver_session (trip OR online idle)
  it('6. ingest without active driver_session / trip -> 403 TRACKING_SESSION_REQUIRED', async () => {
    await expect(
      ingestLocations(driver2Id, [
        {
          lat: 21.0,
          lng: 105.8,
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

  it('7. classification delta > 50m -> MOVING, <= 50m -> STOPPED', () => {
    const prev = { lat: 21.0, lng: 105.8 };
    // Delta ~150 meters with speed 0
    const curFar = { lat: 21.001, lng: 105.801, speedMps: 0 };
    expect(classifyMovement(prev, curFar)).toBe(MovementStatus.MOVING);

    // Delta ~1.5 meters with speed 0
    const curNear = { lat: 21.00001, lng: 105.80001, speedMps: 0 };
    expect(classifyMovement(prev, curNear)).toBe(MovementStatus.STOPPED);
  });

  it('8. retention drops an artificially created old partition', async () => {
    // Create an old partition for year 2020 via PostgreSQL partition creation function
    await prisma.$executeRawUnsafe(
      "SELECT create_driver_location_partition('2020-01-01'::date);"
    );

    // Verify partition exists in PostgreSQL catalog
    const partitionsBefore = await prisma.$queryRawUnsafe<Array<{ relname: string }>>(`
      SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'driver_locations' AND c.relname = 'driver_locations_202001';
    `);
    expect(partitionsBefore).toHaveLength(1);

    // Run purge for partitions older than 90 days
    const purgeResult = await purgeOldLocationPartitions(90);
    expect(purgeResult.droppedPartitions).toContain('driver_locations_202001');

    // Verify partition dropped
    const partitionsAfter = await prisma.$queryRawUnsafe<Array<{ relname: string }>>(`
      SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
      WHERE p.relname = 'driver_locations' AND c.relname = 'driver_locations_202001';
    `);
    expect(partitionsAfter).toHaveLength(0);
  });

  it('9. markStale sets GPS_LOST for old received_at', async () => {
    await prisma.vehicleLocation.create({
      data: {
        vehicleId: vehicle1Id,
        driverId: driver1Id,
        lat: 21.0,
        lng: 105.8,
        accuracyM: 10,
        recordedAt: new Date(Date.now() - 30000),
        receivedAt: new Date(Date.now() - 30000), // 30s ago (> 10s threshold)
        movement: MovementStatus.MOVING,
      },
    });

    const staleCount = await markStale(10);
    expect(staleCount).toBe(1);

    const loc = await prisma.vehicleLocation.findUniqueOrThrow({
      where: { vehicleId: vehicle1Id },
    });
    expect(loc.movement).toBe(MovementStatus.GPS_LOST);
  });
});
