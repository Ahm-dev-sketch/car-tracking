process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { AuthenticatedUser } from '@/lib/auth-guard';
import { createBooking, transitionBooking, listBookings } from '@/server/bookings/service';
import { startTrip, arriveTrip } from '@/server/trips/service';
import { ingestLocations, getLiveTracking } from '@/server/tracking/service';
import { createVehicle, listVehicles } from '@/server/vehicles/service';
import { createDriver, listDrivers } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import {
  dispatchBooking,
  acceptOffer,
  rejectOffer,
  dispatchSweep,
  manualAssignBooking,
  listCandidates,
  startDriverSession,
  endDriverSession,
  getAdminStats,
} from '@/server/dispatch/service';
import {
  RoleCode,
  VehicleStatus,
  DriverStatus,
  BookingStatus,
  OfferStatus,
  DriverSessionStatus,
  MovementStatus,
} from '@prisma/client';

describe('Phase 9 PostgreSQL Integration Tests: Auto-Dispatch and Locations', () => {
  let adminActor: AuthenticatedUser;
  let userActor: AuthenticatedUser;
  let driver1Actor: AuthenticatedUser;

  let driver1Id: string;
  let driver2Id: string;
  let vehicle1Id: string;
  let vehicle2Id: string;
  let location1Id: string;
  let location2Id: string;

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
      TRUNCATE TABLE booking_offers, driver_sessions, vehicle_locations, driver_locations, trips, notifications, bookings, audit_logs, vehicle_assignments, drivers, vehicles, locations, users CASCADE;
    `);

    // Create 2 test locations
    const loc1 = await prisma.location.create({
      data: { name: 'Halim', code: '102' },
    });
    location1Id = loc1.id;

    const loc2 = await prisma.location.create({
      data: { name: 'Karawang', code: '202' },
    });
    location2Id = loc2.id;

    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ADMIN },
    });
    const userRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.USER },
    });

    const admin = await createUser({
      email: 'admin.p9@test.com',
      name: 'Admin P9',
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
      email: 'user.p9@test.com',
      name: 'User P9',
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

    const d1 = await createDriver({
      email: 'driver1.p9@test.com',
      name: 'Driver One',
      phone: '0903333331',
      password: 'password123',
      licenseNumber: 'LIC-P9-001',
      status: DriverStatus.AVAILABLE,
    });
    driver1Id = d1.id;
    driver1Actor = {
      id: d1.userId,
      email: d1.user.email,
      name: d1.user.name,
      role: 'DRIVER',
    };

    const d2 = await createDriver({
      email: 'driver2.p9@test.com',
      name: 'Driver Two',
      phone: '0903333332',
      password: 'password123',
      licenseNumber: 'LIC-P9-002',
      status: DriverStatus.AVAILABLE,
    });
    driver2Id = d2.id;

    const v1 = await createVehicle({
      plateNumber: '29A-999.01',
      brand: 'Toyota',
      model: 'Innova',
      vehicleType: 'MPV',
      seatingCapacity: 7,
    });
    vehicle1Id = v1.id;
    await prisma.vehicle.update({
      where: { id: vehicle1Id },
      data: { homeLocationId: location1Id, currentLocationId: location1Id },
    });

    const v2 = await createVehicle({
      plateNumber: '29A-999.02',
      brand: 'Hyundai',
      model: 'Santa Fe',
      vehicleType: 'SUV',
      seatingCapacity: 5,
    });
    vehicle2Id = v2.id;
    await prisma.vehicle.update({
      where: { id: vehicle2Id },
      data: { homeLocationId: location2Id, currentLocationId: location2Id },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. driver session lifecycle: start session -> ACTIVE; duplicate ACTIVE -> 409; end session -> ENDED', async () => {
    const session = await startDriverSession(driver1Id, {
      vehicleId: vehicle1Id,
      startLat: 21.0285,
      startLng: 105.8542,
    });

    expect(session.status).toBe(DriverSessionStatus.ACTIVE);
    expect(session.driverId).toBe(driver1Id);
    expect(session.vehicleId).toBe(vehicle1Id);

    // Duplicate session for same driver -> 409
    await expect(
      startDriverSession(driver1Id, { vehicleId: vehicle1Id })
    ).rejects.toThrowError(
      expect.objectContaining({ status: 409, code: 'SESSION_ALREADY_ACTIVE' })
    );

    // End session
    const ended = await endDriverSession(driver1Id);
    expect(ended.status).toBe(DriverSessionStatus.ENDED);
    expect(ended.endedAt).not.toBeNull();
  });

  it('2. location ingest requires active session (trip or online idle); no session -> 403', async () => {
    // Ingest without session or trip -> 403
    await expect(
      ingestLocations(driver1Id, [
        {
          lat: 21.0285,
          lng: 105.8542,
          accuracyM: 10,
          recordedAt: new Date(),
        },
      ])
    ).rejects.toThrowError(
      expect.objectContaining({ status: 403, code: 'TRACKING_SESSION_REQUIRED' })
    );

    // Start online idle session
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });

    // Ingest with online idle session -> accepted
    const result = await ingestLocations(driver1Id, [
      {
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 15,
        speedMps: 0,
        recordedAt: new Date(),
      },
    ]);

    expect(result.accepted).toBe(1);
    expect(result.rejected).toHaveLength(0);

    const loc = await prisma.vehicleLocation.findUniqueOrThrow({
      where: { vehicleId: vehicle1Id },
    });
    expect(loc.lat).toBe(21.0285);
    expect(loc.movement).toBe(MovementStatus.STOPPED);
  });

  it('3. booking dispatch: eligible candidate receives offer with ETA; booking becomes DRIVER_NOTIFIED', async () => {
    // Setup driver 1 session with fresh vehicle location at location 1
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      {
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 10,
        recordedAt: new Date(),
      },
    ]);

    // Create booking at location 1 with pickup coordinates
    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Halim Pickup',
      pickupLat: 21.0385,
      pickupLng: 105.8642,
      destination: 'Hotel City Center',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Business',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatchResult = await dispatchBooking(booking.id);
    expect(dispatchResult.dispatchState).toBe(BookingStatus.DRIVER_NOTIFIED);
    expect(dispatchResult.offer).toBeDefined();
    expect(dispatchResult.offer!.driverId).toBe(driver1Id);
    expect(dispatchResult.offer!.status).toBe(OfferStatus.SENT);
    expect(dispatchResult.offer!.etaSeconds).toBeGreaterThan(0);
    expect(dispatchResult.offer!.etaEstimated).toBe(true);
  });

  it('4. acceptOffer atomicity: booking DRIVER_ASSIGNED, vehicle RESERVED, offer ACCEPTED, other offers CANCELLED', async () => {
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      {
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 10,
        recordedAt: new Date(),
      },
    ]);

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Station A',
      destination: 'Station B',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Meeting',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatch = await dispatchBooking(booking.id);
    const offerId = dispatch.offer!.id;

    // Driver 1 accepts
    const acceptRes = await acceptOffer(driver1Id, offerId);
    expect(acceptRes.success).toBe(true);
    expect(acceptRes.booking.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(acceptRes.booking.driverId).toBe(driver1Id);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle1Id },
    });
    expect(vehicle.status).toBe(VehicleStatus.RESERVED);

    const offer = await prisma.bookingOffer.findUniqueOrThrow({
      where: { id: offerId },
    });
    expect(offer.status).toBe(OfferStatus.ACCEPTED);
  });

  it('5. race condition: concurrent accept on same offer -> exactly one succeeds, other fails with 409', async () => {
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      {
        lat: 21.0285,
        lng: 105.8542,
        accuracyM: 10,
        recordedAt: new Date(),
      },
    ]);

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Station A',
      destination: 'Station B',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Field Work',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatch = await dispatchBooking(booking.id);
    const offerId = dispatch.offer!.id;

    // Two concurrent accept attempts on the same offer
    const [res1, res2] = await Promise.allSettled([
      acceptOffer(driver1Id, offerId),
      acceptOffer(driver1Id, offerId),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(409);
  });

  it('6. rejectOffer: moves booking to SEARCHING_DRIVER and advances to next eligible candidate with attemptNo 2', async () => {
    // Both drivers have active sessions with vehicles at location 1
    await prisma.vehicle.update({
      where: { id: vehicle2Id },
      data: { homeLocationId: location1Id, currentLocationId: location1Id },
    });

    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      { lat: 21.0285, lng: 105.8542, accuracyM: 10, recordedAt: new Date() },
    ]);

    await startDriverSession(driver2Id, { vehicleId: vehicle2Id });
    await ingestLocations(driver2Id, [
      { lat: 21.035, lng: 105.86, accuracyM: 10, recordedAt: new Date() },
    ]);

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Pickup',
      pickupLat: 21.0285,
      pickupLng: 105.8542,
      destination: 'Dropoff',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Conference',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatch = await dispatchBooking(booking.id);
    const offer1 = dispatch.offer!;
    expect(offer1.driverId).toBe(driver1Id);
    expect(offer1.attemptNo).toBe(1);

    // Driver 1 rejects
    await rejectOffer(driver1Id, offer1.id);

    // Candidate 2 should now have an offer with attemptNo 2
    const offer2 = await prisma.bookingOffer.findFirstOrThrow({
      where: { bookingId: booking.id, driverId: driver2Id },
    });
    expect(offer2.status).toBe(OfferStatus.SENT);
    expect(offer2.attemptNo).toBe(2);

    const b = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(b.status).toBe(BookingStatus.DRIVER_NOTIFIED);
  });

  it('7. dispatchSweep: expired offer past expiresAt is marked EXPIRED and booking advances', async () => {
    await prisma.vehicle.update({
      where: { id: vehicle2Id },
      data: { homeLocationId: location1Id, currentLocationId: location1Id },
    });

    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      { lat: 21.0285, lng: 105.8542, accuracyM: 10, recordedAt: new Date() },
    ]);

    await startDriverSession(driver2Id, { vehicleId: vehicle2Id });
    await ingestLocations(driver2Id, [
      { lat: 21.035, lng: 105.86, accuracyM: 10, recordedAt: new Date() },
    ]);

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Pickup',
      pickupLat: 21.0285,
      pickupLng: 105.8542,
      destination: 'Dropoff',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Sweep test',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatch = await dispatchBooking(booking.id);
    const offer1 = dispatch.offer!;

    // Artificially expire offer 1
    await prisma.bookingOffer.update({
      where: { id: offer1.id },
      data: { expiresAt: new Date(Date.now() - 5000) },
    });

    // Run sweep
    await dispatchSweep();

    const expiredOffer = await prisma.bookingOffer.findUniqueOrThrow({
      where: { id: offer1.id },
    });
    expect(expiredOffer.status).toBe(OfferStatus.EXPIRED);

    // Driver 2 should now receive offer
    const nextOffer = await prisma.bookingOffer.findFirst({
      where: { bookingId: booking.id, driverId: driver2Id },
    });
    expect(nextOffer).not.toBeNull();
    expect(nextOffer!.status).toBe(OfferStatus.SENT);
  });

  it('8. dispatch exhaustion: max attempts or timeout transitions booking to ADMIN_INTERVENTION with notification', async () => {
    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Remote',
      destination: 'Remote 2',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Intervention test',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    // Artificially create 8 prior offers to reach maxAttempts
    for (let i = 1; i <= 8; i++) {
      await prisma.bookingOffer.create({
        data: {
          bookingId: booking.id,
          driverId: driver1Id,
          attemptNo: i,
          status: OfferStatus.EXPIRED,
          sentAt: new Date(Date.now() - 60000 * (9 - i)),
          expiresAt: new Date(Date.now() - 30000 * (9 - i)),
          rank: i,
        },
      });
    }

    await dispatchSweep();

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(updated.status).toBe(BookingStatus.ADMIN_INTERVENTION);

    const adminNotification = await prisma.notification.findFirst({
      where: {
        userId: adminActor.id,
        type: 'ADMIN_INTERVENTION',
      },
    });
    expect(adminNotification).not.toBeNull();
  });

  it('9. manualAssignBooking: admin assigns driver -> DRIVER_ASSIGNED, vehicle RESERVED, audit logged', async () => {
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      { lat: 21.0285, lng: 105.8542, accuracyM: 10, recordedAt: new Date() },
    ]);

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Manual pickup',
      destination: 'Manual dest',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'VIP',
      status: BookingStatus.ADMIN_INTERVENTION,
    });

    const candidates = await listCandidates(adminActor.id, booking.id);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].driverId).toBe(driver1Id);

    const assigned = await manualAssignBooking(adminActor.id, booking.id, driver1Id);
    expect(assigned.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(assigned.driverId).toBe(driver1Id);
    expect(assigned.vehicleId).toBe(vehicle1Id);

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle1Id },
    });
    expect(vehicle.status).toBe(VehicleStatus.RESERVED);

    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'booking.manual_assign',
        entityId: booking.id,
      },
    });
    expect(audit).not.toBeNull();
    expect(audit!.actorUserId).toBe(adminActor.id);
  });

  it('10. Option B: preferred vehicle busy -> NO_DRIVER_AVAILABLE + alternatives listed, no silent substitution', async () => {
    // Make vehicle 1 busy with an existing booking
    await prisma.vehicle.update({
      where: { id: vehicle1Id },
      data: { status: VehicleStatus.IN_USE },
    });

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      vehiclePreferenceId: vehicle1Id,
      pickupLocation: 'Option B pickup',
      destination: 'Option B dest',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Exec car',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatch = await dispatchBooking(booking.id);
    expect(dispatch.dispatchState).toBe(BookingStatus.NO_DRIVER_AVAILABLE);
    expect(dispatch.reason).toContain('currently unavailable');

    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(updated.status).toBe(BookingStatus.NO_DRIVER_AVAILABLE);
  });

  it('11. cross-location dispatch disabled: driver with vehicle at location 2 is excluded for booking at location 1', async () => {
    // Driver 2 is active at location 2
    await startDriverSession(driver2Id, { vehicleId: vehicle2Id });
    await ingestLocations(driver2Id, [
      { lat: 21.0, lng: 105.8, accuracyM: 10, recordedAt: new Date() },
    ]);

    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Location 1 only',
      destination: 'Dest 1',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Local test',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const dispatch = await dispatchBooking(booking.id);
    // Cross-location disabled by default: Driver 2 is excluded, no drivers at location 1
    expect(dispatch.dispatchState).toBe(BookingStatus.NO_DRIVER_AVAILABLE);
  });

  it('12. locationId filter on vehicles, bookings, drivers, and live tracking', async () => {
    // 12a. listVehicles with locationId
    const loc1Vehicles = await listVehicles({ locationId: location1Id });
    expect(loc1Vehicles.data).toHaveLength(1);
    expect(loc1Vehicles.data[0].id).toBe(vehicle1Id);

    const loc2Vehicles = await listVehicles({ locationId: location2Id });
    expect(loc2Vehicles.data).toHaveLength(1);
    expect(loc2Vehicles.data[0].id).toBe(vehicle2Id);

    // 12b. listBookings with locationId
    await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'Loc1 Book',
      destination: 'Dest',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 1,
      purpose: 'Filter',
    });

    const loc1Bookings = await listBookings(adminActor, { locationId: location1Id });
    expect(loc1Bookings.data).toHaveLength(1);
    expect(loc1Bookings.data[0].operationalLocation.id).toBe(location1Id);

    const loc2Bookings = await listBookings(adminActor, { locationId: location2Id });
    expect(loc2Bookings.data).toHaveLength(0);

    // 12c. listDrivers with locationId
    await prisma.driver.update({
      where: { id: driver1Id },
      data: { currentVehicleId: vehicle1Id },
    });
    const loc1Drivers = await listDrivers({ locationId: location1Id });
    expect(loc1Drivers.data).toHaveLength(1);
    expect(loc1Drivers.data[0].id).toBe(driver1Id);

    // 12d. getLiveTracking with locationId
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      { lat: 21.0285, lng: 105.8542, accuracyM: 10, recordedAt: new Date() },
    ]);

    const liveLoc1 = await getLiveTracking(adminActor, location1Id);
    expect(liveLoc1).toHaveLength(1);
    expect(liveLoc1[0].vehicleId).toBe(vehicle1Id);
    expect(liveLoc1[0].homeLocation?.id).toBe(location1Id);

    const liveLoc2 = await getLiveTracking(adminActor, location2Id);
    expect(liveLoc2).toHaveLength(0);
  });

  it('13. trip lifecycle: startTrip transitions booking to DRIVER_EN_ROUTE; arriveTrip transitions to ARRIVED', async () => {
    const booking = await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      vehicleId: vehicle1Id,
      pickupLocation: 'Hanoi',
      destination: 'Hai Phong',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Trip test',
    });

    await transitionBooking(booking.id, BookingStatus.APPROVED, adminActor);
    await transitionBooking(booking.id, BookingStatus.DRIVER_ASSIGNED, adminActor, undefined, {
      driverId: driver1Id,
    });

    const trip = await startTrip(driver1Id, {
      bookingId: booking.id,
      startLat: 21.0285,
      startLng: 105.8542,
    });

    const bEnRoute = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(bEnRoute.status).toBe(BookingStatus.DRIVER_EN_ROUTE);

    // Driver marks arrival
    const arrival = await arriveTrip(driver1Actor, trip.id);
    expect(arrival.booking.status).toBe(BookingStatus.ARRIVED);

    const bArrived = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(bArrived.status).toBe(BookingStatus.ARRIVED);
  });

  it('14. getAdminStats: returns aggregate metrics across vehicles, drivers, bookings, byLocation', async () => {
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });

    await createBooking(userActor.id, {
      operationalLocationId: location1Id,
      pickupLocation: 'P1',
      destination: 'D1',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Stats 1',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const stats = await getAdminStats();

    expect(stats.vehicles.total).toBe(2);
    expect(stats.vehicles.available).toBe(2);
    expect(stats.drivers.online).toBe(1);
    expect(stats.bookings.searching).toBe(1);
    expect(stats.byLocation).toHaveLength(2);

    const loc1Stat = stats.byLocation.find((l) => l.locationId === location1Id);
    expect(loc1Stat).toBeDefined();
    expect(loc1Stat!.vehicles).toBe(1);
    expect(loc1Stat!.drivers).toBe(1);
    expect(loc1Stat!.bookings).toBe(1);
  });
});
