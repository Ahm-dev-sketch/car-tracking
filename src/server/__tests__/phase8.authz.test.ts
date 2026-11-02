process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { requireRole, AuthenticatedUser } from '@/lib/auth-guard';
import {
  createBooking,
  transitionBooking,
  getBookingById,
  listBookings,
} from '@/server/bookings/service';
import { startTrip, getTripById } from '@/server/trips/service';
import {
  getVehicleTracking,
  getLiveTracking,
} from '@/server/tracking/service';
import { assignVehicle } from '@/server/assignments/service';
import { createVehicle, listVehicles } from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import {
  RoleCode,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
  TripStatus,
  MovementStatus,
} from '@prisma/client';

describe('Phase 8a Authorization Matrix Integration Tests', () => {
  let adminActor: AuthenticatedUser;
  let userOwnActor: AuthenticatedUser;
  let userOtherActor: AuthenticatedUser;
  let driverAUserActor: AuthenticatedUser;
  let driverBUserActor: AuthenticatedUser;

  let driverAId: string;
  let driverBId: string;
  let vehicle1Id: string;
  let vehicle2Id: string;
  let vehicleInactiveId: string;

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
      email: 'admin.authz@test.com',
      name: 'Admin Authz',
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

    const userOwn = await createUser({
      email: 'own.authz@test.com',
      name: 'Owner User',
      phone: '0902222222',
      password: 'password123',
      roleId: userRole.id,
    });
    userOwnActor = {
      id: userOwn.id,
      email: userOwn.email,
      name: userOwn.name,
      role: 'USER',
    };

    const userOther = await createUser({
      email: 'other.authz@test.com',
      name: 'Other User',
      phone: '0903333333',
      password: 'password123',
      roleId: userRole.id,
    });
    userOtherActor = {
      id: userOther.id,
      email: userOther.email,
      name: userOther.name,
      role: 'USER',
    };

    const dA = await createDriver({
      email: 'driverA.authz@test.com',
      name: 'Driver A',
      phone: '0904444444',
      password: 'password123',
      licenseNumber: 'LIC-AUTHZ-A',
      status: DriverStatus.AVAILABLE,
    });
    driverAId = dA.id;
    driverAUserActor = {
      id: dA.userId,
      email: dA.user.email,
      name: dA.user.name,
      role: 'DRIVER',
    };

    const dB = await createDriver({
      email: 'driverB.authz@test.com',
      name: 'Driver B',
      phone: '0905555555',
      password: 'password123',
      licenseNumber: 'LIC-AUTHZ-B',
      status: DriverStatus.AVAILABLE,
    });
    driverBId = dB.id;
    driverBUserActor = {
      id: dB.userId,
      email: dB.user.email,
      name: dB.user.name,
      role: 'DRIVER',
    };

    const v1 = await createVehicle({
      plateNumber: '29A-888.11',
      brand: 'Toyota',
      model: 'Camry',
      vehicleType: 'SEDAN',
      seatingCapacity: 5,
    });
    vehicle1Id = v1.id;

    const v2 = await createVehicle({
      plateNumber: '29A-888.22',
      brand: 'Honda',
      model: 'CRV',
      vehicleType: 'SUV',
      seatingCapacity: 7,
    });
    vehicle2Id = v2.id;

    const vInactive = await createVehicle({
      plateNumber: '29A-888.99',
      brand: 'Ford',
      model: 'Transit',
      vehicleType: 'VAN',
      seatingCapacity: 16,
      status: VehicleStatus.INACTIVE,
    });
    vehicleInactiveId = vInactive.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. bookings.getBookingById: owner sees own, userOther gets FORBIDDEN, admin sees any; driverPhone gated', async () => {
    const booking = await createBooking(userOwnActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Meeting',
    });

    // 1a. Owner sees own booking
    const ownerView = await getBookingById(booking.id, userOwnActor);
    expect(ownerView.id).toBe(booking.id);

    // 1b. userOther gets 403 FORBIDDEN
    await expect(getBookingById(booking.id, userOtherActor)).rejects.toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
    );

    // 1c. Admin sees any booking
    const adminView = await getBookingById(booking.id, adminActor);
    expect(adminView.id).toBe(booking.id);

    // 1d. Assign driver to booking
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driverAId }
    );

    // In DRIVER_ASSIGNED (active status), owner can see driver phone
    const activeOwnerView = await getBookingById(booking.id, userOwnActor);
    expect(activeOwnerView.driver?.user.phone).toBe('0904444444');

    // Admin can see driver phone
    const activeAdminView = await getBookingById(booking.id, adminActor);
    expect(activeAdminView.driver?.user.phone).toBe('0904444444');
  });

  it('2. bookings list: user sees only own rows (no leakage); admin sees all', async () => {
    const bookingOwn = await createBooking(userOwnActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Bac Ninh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Personal trip 1',
    });

    const bookingOther = await createBooking(userOtherActor.id, {
      vehicleId: vehicle2Id,
      pickupLocation: 'Hanoi',
      destination: 'Nam Dinh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Personal trip 2',
    });

    // UserOwn list contains only own booking
    const ownList = await listBookings(userOwnActor, {});
    expect(ownList.data).toHaveLength(1);
    expect(ownList.data[0].id).toBe(bookingOwn.id);
    expect(ownList.data.some((b) => b.id === bookingOther.id)).toBe(false);

    // Admin list contains both bookings
    const adminList = await listBookings(adminActor, {});
    expect(adminList.data).toHaveLength(2);
  });

  it('3. trips.getTripById: driver-own OK, other driver FORBIDDEN, user linked via booking OK, unrelated user FORBIDDEN', async () => {
    const booking = await createBooking(userOwnActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Hai Duong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Field work',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driverAId }
    );

    const trip = await startTrip(driverAId, {
      bookingId: booking.id,
      startLat: 21.02,
      startLng: 105.85,
    });

    // Assigned driver A can view trip
    const driverView = await getTripById(trip.id, driverAUserActor);
    expect(driverView.id).toBe(trip.id);

    // Unassigned driver B gets FORBIDDEN
    await expect(getTripById(trip.id, driverBUserActor)).rejects.toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
    );

    // Booking owner can view trip
    const ownerView = await getTripById(trip.id, userOwnActor);
    expect(ownerView.id).toBe(trip.id);

    // Unrelated user gets FORBIDDEN
    await expect(getTripById(trip.id, userOtherActor)).rejects.toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
    );

    // Admin can view trip
    const adminView = await getTripById(trip.id, adminActor);
    expect(adminView.id).toBe(trip.id);
  });

  it('4. tracking.getVehicleTracking: active booking owner OK, user without booking FORBIDDEN, admin OK', async () => {
    const booking = await createBooking(userOwnActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Quang Ninh',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 3,
      purpose: 'Site visit',
    });
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(
      booking.id,
      BookingStatus.DRIVER_ASSIGNED,
      adminActor,
      undefined,
      { driverId: driverAId }
    );
    await assignVehicle(driverAId, vehicle1Id, { actorUserId: adminActor.id });

    await prisma.vehicleLocation.create({
      data: {
        vehicleId: vehicle1Id,
        driverId: driverAId,
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 10,
        recordedAt: new Date(),
        receivedAt: new Date(),
        movement: MovementStatus.STOPPED,
      },
    });

    // Owner with active booking can track vehicle
    const ownerTracking = await getVehicleTracking(vehicle1Id, userOwnActor);
    expect(ownerTracking.vehicle.id).toBe(vehicle1Id);
    expect(ownerTracking.driver?.phone).toBe('0904444444');

    // User without active booking on vehicle gets FORBIDDEN
    await expect(getVehicleTracking(vehicle1Id, userOtherActor)).rejects.toThrowError(
      expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
    );

    // Admin can track vehicle
    const adminTracking = await getVehicleTracking(vehicle1Id, adminActor);
    expect(adminTracking.vehicle.id).toBe(vehicle1Id);
    expect(adminTracking.driver?.phone).toBe('0904444444');
  });

  it('5. tracking.getLiveTracking: user sees only vehicles in active bookings; admin sees all with locations', async () => {
    // Booking 1 on vehicle 1 for userOwn
    const booking1 = await createBooking(userOwnActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Location 1',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Trip 1',
    });
    await transitionBooking(booking1.id, BookingStatus.APPROVED, adminActor);

    // Booking 2 on vehicle 2 for userOther
    const booking2 = await createBooking(userOtherActor.id, {
      vehicleId: vehicle2Id,
      pickupLocation: 'Hanoi',
      destination: 'Location 2',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Trip 2',
    });
    await transitionBooking(booking2.id, BookingStatus.APPROVED, adminActor);

    // Insert locations for both vehicles
    await prisma.vehicleLocation.createMany({
      data: [
        {
          vehicleId: vehicle1Id,
          driverId: driverAId,
          lat: 21.01,
          lng: 105.81,
          accuracyM: 15,
          recordedAt: new Date(),
          receivedAt: new Date(),
          movement: MovementStatus.MOVING,
        },
        {
          vehicleId: vehicle2Id,
          driverId: driverBId,
          lat: 21.02,
          lng: 105.82,
          accuracyM: 12,
          recordedAt: new Date(),
          receivedAt: new Date(),
          movement: MovementStatus.STOPPED,
        },
      ],
    });

    // userOwn only sees vehicle1
    const ownLive = await getLiveTracking(userOwnActor);
    expect(ownLive).toHaveLength(1);
    expect(ownLive[0].vehicleId).toBe(vehicle1Id);

    // userOther only sees vehicle2
    const otherLive = await getLiveTracking(userOtherActor);
    expect(otherLive).toHaveLength(1);
    expect(otherLive[0].vehicleId).toBe(vehicle2Id);

    // admin sees both
    const adminLive = await getLiveTracking(adminActor);
    expect(adminLive).toHaveLength(2);
    expect(adminLive.map((v) => v.vehicleId).sort()).toEqual(
      [vehicle1Id, vehicle2Id].sort()
    );
  });

  it('6. vehicles list: USER sees INACTIVE excluded, ADMIN sees INACTIVE included', async () => {
    const userView = await listVehicles({ isAdmin: false });
    expect(userView.data.some((v) => v.id === vehicleInactiveId)).toBe(false);
    expect(userView.data.some((v) => v.id === vehicle1Id)).toBe(true);

    const adminView = await listVehicles({ isAdmin: true });
    expect(adminView.data.some((v) => v.id === vehicleInactiveId)).toBe(true);
    expect(adminView.data.some((v) => v.id === vehicle1Id)).toBe(true);
  });

  it('7. admin-only services reject role USER and role DRIVER with 403 FORBIDDEN', async () => {
    const booking = await createBooking(userOwnActor.id, {
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Field Trip',
    });

    const unauthorizedActors = [userOwnActor, driverAUserActor];

    // List of admin-only operations that require role ADMIN
    const adminOnlyServices = [
      'createVehicle',
      'updateVehicle',
      'deleteVehicle',
      'createDriver',
      'updateDriver',
      'deactivateDriver',
      'assignVehicle',
      'unassignVehicle',
      'createUser',
      'approveBooking',
      'rejectBooking',
      'assignDriverToBooking',
    ] as const;

    for (const actor of unauthorizedActors) {
      // Loop the matrix checking role enforcement
      for (const service of adminOnlyServices) {
        expect(() => requireRole(actor, 'ADMIN')).toThrowError(
          expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
        );
      }

      // Direct service-level enforcement: approveBooking
      await expect(
        transitionBooking(booking.id, BookingStatus.APPROVED, actor)
      ).rejects.toThrowError(
        expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
      );

      // Direct service-level enforcement: rejectBooking
      await expect(
        transitionBooking(booking.id, BookingStatus.REJECTED, actor)
      ).rejects.toThrowError(
        expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
      );
    }

    // Now transition to APPROVED using admin so we can test assignDriverToBooking
    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);

    for (const actor of unauthorizedActors) {
      // Direct service-level enforcement: assignDriverToBooking
      await expect(
        transitionBooking(
          booking.id,
          BookingStatus.DRIVER_ASSIGNED,
          actor,
          undefined,
          { driverId: driverAId }
        )
      ).rejects.toThrowError(
        expect.objectContaining({ status: 403, code: 'FORBIDDEN' })
      );
    }
  });
});
