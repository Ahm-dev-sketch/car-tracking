process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import {
  createBooking,
  transitionBooking,
  getBookingById,
} from '@/server/bookings/service';
import {
  listNotifications,
  markAsRead,
} from '@/server/notifications/service';
import { createVehicle } from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import {
  rateLimit,
  resetRateLimitStore,
  withRateLimit,
  RATE_LIMIT_CONFIG,
} from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import {
  RoleCode,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '@/lib/auth-guard';

describe('Phase 3 PostgreSQL Integration Tests', () => {
  let adminActor: AuthenticatedUser;
  let user1Actor: AuthenticatedUser;
  let user2Actor: AuthenticatedUser;
  let driver1UserActor: AuthenticatedUser;

  let vehicle1Id: string;
  let vehicle2Id: string;
  let driver1Id: string;
  let driver2Id: string;
  let locationId: string;

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
    resetRateLimitStore();
    // Truncate tables between tests
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE notifications, bookings, audit_logs, vehicle_assignments, drivers, vehicles, users CASCADE;
    `);

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ADMIN },
    });
    const userRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.USER },
    });

    const admin = await createUser({
      email: 'admin@phase3.test',
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

    const user1 = await createUser({
      email: 'user1@phase3.test',
      name: 'User One',
      phone: '0901000002',
      password: 'password123',
      roleId: userRole.id,
    });
    user1Actor = {
      id: user1.id,
      email: user1.email,
      name: user1.name,
      role: 'USER',
    };

    const user2 = await createUser({
      email: 'user2@phase3.test',
      name: 'User Two',
      phone: '0901000003',
      password: 'password123',
      roleId: userRole.id,
    });
    user2Actor = {
      id: user2.id,
      email: user2.email,
      name: user2.name,
      role: 'USER',
    };

    const d1 = await createDriver({
      email: 'driver1@phase3.test',
      name: 'Driver One',
      phone: '0902000001',
      password: 'password123',
      licenseNumber: 'LIC-P3-001',
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
      email: 'driver2@phase3.test',
      name: 'Driver Two',
      phone: '0902000002',
      password: 'password123',
      licenseNumber: 'LIC-P3-002',
      status: DriverStatus.AVAILABLE,
    });
    driver2Id = d2.id;

    const v1 = await createVehicle({
      plateNumber: '30A-111.11',
      brand: 'Toyota',
      model: 'Innova',
      vehicleType: 'MPV',
      seatingCapacity: 7,
    });
    vehicle1Id = v1.id;

    const v2 = await createVehicle({
      plateNumber: '30A-222.22',
      brand: 'Ford',
      model: 'Everest',
      vehicleType: 'SUV',
      seatingCapacity: 7,
    });
    vehicle2Id = v2.id;

    const loc =
      (await prisma.location.findFirst()) ??
      (await prisma.location.create({ data: { name: 'Phase3 Loc', code: 'P3' } }));
    locationId = loc.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. create happy path: generates BK-{YYYY}-{0001} booking number', async () => {
    const departure = new Date('2026-12-01T08:00:00Z');
    const returnAt = new Date('2026-12-01T12:00:00Z');

    const booking = await createBooking(user1Actor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi Center',
      destination: 'Hai Phong Port',
      departureAt: departure,
      expectedReturnAt: returnAt,
      passengerCount: 4,
      purpose: 'Field visit',
      notes: 'Need child seat',
    });

    expect(booking.bookingNumber).toMatch(/^BK-2026-\d{4}$/);
    expect(booking.bookingNumber).toBe('BK-2026-0001');
    expect(booking.status).toBe(BookingStatus.PENDING);
    expect(booking.userId).toBe(user1Actor.id);
    expect(booking.vehicleId).toBe(vehicle1Id);
    expect(booking.passengerCount).toBe(4);
  });

  it('2. overlap create -> 409 (same vehicle, intersecting window)', async () => {
    await createBooking(user1Actor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Loc A',
      destination: 'Loc B',
      departureAt: new Date('2026-12-02T10:00:00Z'),
      expectedReturnAt: new Date('2026-12-02T14:00:00Z'),
      passengerCount: 2,
      purpose: 'First Trip',
    });

    // Overlapping booking: 12:00 - 16:00
    await expect(
      createBooking(user2Actor.id, {
        vehicleId: vehicle1Id,
        pickupLocation: 'Loc C',
        destination: 'Loc D',
        departureAt: new Date('2026-12-02T12:00:00Z'),
        expectedReturnAt: new Date('2026-12-02T16:00:00Z'),
        passengerCount: 2,
        purpose: 'Overlapping Trip',
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'BOOKING_CONFLICT',
      })
    );
  });

  it('3. concurrency: two parallel creates for same vehicle -> exactly one 200, one 409', async () => {
    const inputA = {
      vehicleId: vehicle1Id,
      pickupLocation: 'Point A',
      destination: 'Point B',
      departureAt: new Date('2026-12-05T09:00:00Z'),
      expectedReturnAt: new Date('2026-12-05T12:00:00Z'),
      passengerCount: 2,
      purpose: 'Parallel A',
    };

    const inputB = {
      vehicleId: vehicle1Id,
      pickupLocation: 'Point C',
      destination: 'Point D',
      departureAt: new Date('2026-12-05T10:00:00Z'),
      expectedReturnAt: new Date('2026-12-05T13:00:00Z'),
      passengerCount: 3,
      purpose: 'Parallel B',
    };

    const results = await Promise.allSettled([
      createBooking(user1Actor.id, inputA),
      createBooking(user2Actor.id, inputB),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
    expect(err.code).toBe('BOOKING_CONFLICT');
  });

  it('4. approve re-validation: second overlapping booking approved before first -> second approve 409', async () => {
    // Seed two pending bookings directly in DB to simulate overlapping submissions before approval
    const b1 = await prisma.booking.create({
      data: {
        bookingNumber: 'BK-2026-0010',
        userId: user1Actor.id,
        vehicleId: vehicle1Id,
        operationalLocationId: locationId,
        pickupLocation: 'Hanoi',
        destination: 'Ninh Binh',
        departureAt: new Date('2026-12-10T08:00:00Z'),
        expectedReturnAt: new Date('2026-12-10T12:00:00Z'),
        passengerCount: 2,
        purpose: 'Trip 1',
        status: BookingStatus.PENDING,
      },
    });

    const b2 = await prisma.booking.create({
      data: {
        bookingNumber: 'BK-2026-0011',
        userId: user2Actor.id,
        vehicleId: vehicle1Id,
        operationalLocationId: locationId,
        pickupLocation: 'Hanoi',
        destination: 'Ha Long',
        departureAt: new Date('2026-12-10T10:00:00Z'),
        expectedReturnAt: new Date('2026-12-10T14:00:00Z'),
        passengerCount: 3,
        purpose: 'Trip 2',
        status: BookingStatus.PENDING,
      },
    });

    // Admin approves b2 first
    const approvedB2 = await transitionBooking(
      b2.id,
      BookingStatus.APPROVED,
      adminActor
    );
    expect(approvedB2.status).toBe(BookingStatus.APPROVED);

    const vehicleState = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle1Id },
    });
    expect(vehicleState.status).toBe(VehicleStatus.RESERVED);

    // Admin attempts to approve b1 -> fails with 409 conflict
    await expect(
      transitionBooking(b1.id, BookingStatus.APPROVED, adminActor)
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'BOOKING_CONFLICT',
      })
    );
  });

  it('5. assign-driver: driver with overlapping booking -> 409; happy path sets DRIVER_ASSIGNED + driver_id', async () => {
    // Booking 1 on vehicle 1
    const b1 = await prisma.booking.create({
      data: {
        bookingNumber: 'BK-2026-0020',
        userId: user1Actor.id,
        vehicleId: vehicle1Id,
        operationalLocationId: locationId,
        pickupLocation: 'Loc A',
        destination: 'Loc B',
        departureAt: new Date('2026-12-15T08:00:00Z'),
        expectedReturnAt: new Date('2026-12-15T12:00:00Z'),
        passengerCount: 2,
        purpose: 'Trip A',
        status: BookingStatus.APPROVED,
      },
    });

    // Happy path: assign driver 1 to booking 1
    const assignedB1 = await transitionBooking(
      b1.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driver1Id }
    );
    expect(assignedB1.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(assignedB1.driverId).toBe(driver1Id);

    // Booking 2 on vehicle 2 with overlapping window (10:00 - 14:00)
    const b2 = await prisma.booking.create({
      data: {
        bookingNumber: 'BK-2026-0021',
        userId: user2Actor.id,
        vehicleId: vehicle2Id,
        operationalLocationId: locationId,
        pickupLocation: 'Loc C',
        destination: 'Loc D',
        departureAt: new Date('2026-12-15T10:00:00Z'),
        expectedReturnAt: new Date('2026-12-15T14:00:00Z'),
        passengerCount: 3,
        purpose: 'Trip B',
        status: BookingStatus.APPROVED,
      },
    });

    // Attempt to assign driver 1 to overlapping booking 2 -> 409 DRIVER_CONFLICT
    await expect(
      transitionBooking(
        b2.id,
        BookingStatus.DRIVER_ASSIGNED,
        adminActor,
        undefined,
        { driverId: driver1Id }
      )
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'DRIVER_CONFLICT',
      })
    );

    // Happy path: assign driver 2 to booking 2
    const assignedB2 = await transitionBooking(
      b2.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driver2Id }
    );
    expect(assignedB2.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(assignedB2.driverId).toBe(driver2Id);
  });

  it('6. transition guards: user cannot approve; owner cancels PENDING ok; cancel IN_PROGRESS -> 409', async () => {
    const booking = await createBooking(user1Actor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Loc A',
      destination: 'Loc B',
      departureAt: new Date('2026-12-20T08:00:00Z'),
      expectedReturnAt: new Date('2026-12-20T12:00:00Z'),
      passengerCount: 1,
      purpose: 'Testing guards',
    });

    // Regular user cannot approve
    await expect(
      transitionBooking(booking.id, BookingStatus.APPROVED, user1Actor)
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 403,
        code: 'FORBIDDEN',
      })
    );

    // Owner can cancel PENDING booking
    const cancelled = await transitionBooking(
      booking.id,
      BookingStatus.CANCELLED,
      user1Actor,
      undefined,
      { reason: 'Change of plans' }
    );
    expect(cancelled.status).toBe(BookingStatus.CANCELLED);
    expect(cancelled.cancelledReason).toBe('Change of plans');

    // Create a new booking and move it to IN_PROGRESS
    const b2 = await createBooking(user1Actor.id, {
      vehicleId: vehicle2Id,
      pickupLocation: 'Loc X',
      destination: 'Loc Y',
      departureAt: new Date('2026-12-22T08:00:00Z'),
      expectedReturnAt: new Date('2026-12-22T12:00:00Z'),
      passengerCount: 1,
      purpose: 'Active trip',
    });
    await transitionBooking(b2.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      b2.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driver1Id }
    );
    await transitionBooking(
      b2.id,
      BookingStatus.IN_PROGRESS,
      driver1UserActor
    );

    // Cannot cancel IN_PROGRESS booking
    await expect(
      transitionBooking(b2.id, BookingStatus.CANCELLED, user1Actor)
    ).rejects.toThrowError(
      expect.objectContaining({
        status: 409,
        code: 'INVALID_TRANSITION',
      })
    );
  });

  it('7. notification row created on approve -> owner has unread notification', async () => {
    const booking = await createBooking(user1Actor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Start',
      destination: 'End',
      departureAt: new Date('2026-12-25T08:00:00Z'),
      expectedReturnAt: new Date('2026-12-25T12:00:00Z'),
      passengerCount: 2,
      purpose: 'Notification check',
    });

    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);

    const notifications = await listNotifications(user1Actor.id, {
      page: 1,
      limit: 10,
    });
    expect(notifications.data.length).toBeGreaterThanOrEqual(1);

    const approvedNotif = notifications.data.find(
      (n) => n.type === 'BOOKING_APPROVED'
    );
    expect(approvedNotif).toBeDefined();
    expect(approvedNotif?.readAt).toBeNull();
    expect(approvedNotif?.title).toBe('Booking Approved');

    // Mark as read
    const readResult = await markAsRead(approvedNotif!.id, user1Actor.id);
    expect(readResult.readAt).not.toBeNull();
  });

  it('8. rate limit on POST /api/bookings -> 429 after 10 requests', async () => {
    const handler = withRateLimit(async (_req: NextRequest) => {
      return NextResponse.json({ success: true });
    }, RATE_LIMIT_CONFIG.BOOKING_CREATE);

    const fakeReq = (ip: string) =>
      new NextRequest('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
      });

    // 10 requests within window must pass
    for (let i = 0; i < 10; i++) {
      const res = await handler(fakeReq('192.168.1.100'), {});
      expect(res.status).toBe(200);
    }

    // 11th request must fail with 429
    const blockedRes = await handler(fakeReq('192.168.1.100'), {});
    expect(blockedRes.status).toBe(429);
    const body = await blockedRes.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');

    // Different IP still passes
    const otherIpRes = await handler(fakeReq('192.168.1.101'), {});
    expect(otherIpRes.status).toBe(200);
  });
});
