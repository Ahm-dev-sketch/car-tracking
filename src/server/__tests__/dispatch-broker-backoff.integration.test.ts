process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { AuthenticatedUser } from '@/lib/auth-guard';
import { createBooking } from '@/server/bookings/service';
import { ingestLocations } from '@/server/tracking/service';
import { createVehicle } from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import {
  dispatchBooking,
  createOffer,
  acceptOffer,
  rejectOffer,
  dispatchSweep,
  startDriverSession,
  findEligibleCandidates,
} from '@/server/dispatch/service';
import { computeDriverCooldown, DISPATCH_CONFIG } from '@/server/dispatch/config';
import {
  RoleCode,
  DriverStatus,
  BookingStatus,
  OfferStatus,
} from '@prisma/client';

describe('Dispatch Broker, Priority Queue & Backoff Integration Tests', () => {
  let userActor: AuthenticatedUser;
  let driver1Id: string;
  let driver2Id: string;
  let vehicle1Id: string;
  let vehicle2Id: string;
  let locationId: string;

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

    const loc = await prisma.location.create({
      data: { name: 'Halim Stasiun', code: '102' },
    });
    locationId = loc.id;

    const userRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.USER },
    });

    const user = await createUser({
      email: 'passenger@test.com',
      name: 'Passenger Test',
      phone: '08123456789',
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
      email: 'driver1@test.com',
      name: 'Driver Satu',
      phone: '08111111111',
      password: 'password123',
      licenseNumber: 'SIM-001',
      status: DriverStatus.AVAILABLE,
    });
    driver1Id = d1.id;

    const d2 = await createDriver({
      email: 'driver2@test.com',
      name: 'Driver Dua',
      phone: '08222222222',
      password: 'password123',
      licenseNumber: 'SIM-002',
      status: DriverStatus.AVAILABLE,
    });
    driver2Id = d2.id;

    const v1 = await createVehicle({
      plateNumber: 'B 1001 KC',
      brand: 'Toyota',
      model: 'Innova Zenix',
      vehicleType: 'MPV',
      seatingCapacity: 7,
    });
    vehicle1Id = v1.id;
    await prisma.vehicle.update({
      where: { id: vehicle1Id },
      data: { homeLocationId: locationId, currentLocationId: locationId },
    });

    const v2 = await createVehicle({
      plateNumber: 'B 1002 KC',
      brand: 'Toyota',
      model: 'Avanza',
      vehicleType: 'MPV',
      seatingCapacity: 7,
    });
    vehicle2Id = v2.id;
    await prisma.vehicle.update({
      where: { id: vehicle2Id },
      data: { homeLocationId: locationId, currentLocationId: locationId },
    });

    // Both drivers start active sessions
    await startDriverSession(driver1Id, { vehicleId: vehicle1Id });
    await ingestLocations(driver1Id, [
      { lat: -6.244, lng: 106.888, accuracyM: 5, recordedAt: new Date() },
    ]);

    await startDriverSession(driver2Id, { vehicleId: vehicle2Id });
    await ingestLocations(driver2Id, [
      { lat: -6.245, lng: 106.889, accuracyM: 5, recordedAt: new Date() },
    ]);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. exponential backoff cooldown formula calculation', () => {
    const fixedNow = new Date('2026-03-30T10:00:00Z');

    // Attempt 1: 30 * (1.5^0) = 30s
    const cd1 = computeDriverCooldown(1, fixedNow);
    expect((cd1.getTime() - fixedNow.getTime()) / 1000).toBe(30);

    // Attempt 2: 30 * (1.5^1) = 45s
    const cd2 = computeDriverCooldown(2, fixedNow);
    expect((cd2.getTime() - fixedNow.getTime()) / 1000).toBe(45);

    // Attempt 3: 30 * (1.5^2) = 67.5 -> 68s
    const cd3 = computeDriverCooldown(3, fixedNow);
    expect((cd3.getTime() - fixedNow.getTime()) / 1000).toBe(68);

    // Attempt 10: capped at maxCooldownSec (120s)
    const cd10 = computeDriverCooldown(10, fixedNow);
    expect((cd10.getTime() - fixedNow.getTime()) / 1000).toBe(120);
  });

  it('2. priority queue: fresh driver (Tier 1) prioritized over repeat driver with expired cooldown (Tier 2)', async () => {
    const booking = await createBooking(userActor.id, {
      operationalLocationId: locationId,
      pickupLocation: 'Halim Stasiun',
      pickupLat: -6.244,
      pickupLng: 106.888,
      destination: 'Tegalluar',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Meeting',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    // Dispatch -> Driver 1 gets offer (closest)
    const dispatch = await dispatchBooking(booking.id);
    expect(dispatch.offer?.driverId).toBe(driver1Id);
    expect(dispatch.offer?.roundNo).toBe(1);
    expect(dispatch.offer?.attemptNo).toBe(1);

    // Driver 1 rejects
    await rejectOffer(driver1Id, dispatch.offer!.id);

    // Next offer automatically goes to fresh Driver 2 (Tier 1)
    const offer2 = await prisma.bookingOffer.findFirstOrThrow({
      where: { bookingId: booking.id, driverId: driver2Id },
    });
    expect(offer2.status).toBe(OfferStatus.SENT);
    expect(offer2.attemptNo).toBe(2);
    expect(offer2.roundNo).toBe(1);
  });

  it('3. cyclic re-offering: when all drivers reject, Driver 1 receives order again after backoff cooldown', async () => {
    const booking = await createBooking(userActor.id, {
      operationalLocationId: locationId,
      pickupLocation: 'Halim Stasiun',
      pickupLat: -6.244,
      pickupLng: 106.888,
      destination: 'Tegalluar',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Meeting',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    // 1st offer -> Driver 1
    const d1 = await dispatchBooking(booking.id);
    await rejectOffer(driver1Id, d1.offer!.id);

    // 2nd offer -> Driver 2
    const offer2 = await prisma.bookingOffer.findFirstOrThrow({
      where: { bookingId: booking.id, driverId: driver2Id },
    });
    // Driver 2 also rejects
    await rejectOffer(driver2Id, offer2.id);

    // Now both drivers are in cooldown!
    // findEligibleCandidates should return 0 candidates right now
    const duringCooldown = await findEligibleCandidates(booking.id);
    expect(duringCooldown.candidates).toHaveLength(0);

    // Simulate cooldown expired for Driver 1 (fast-forward cooldownUntil)
    await prisma.bookingOffer.updateMany({
      where: { bookingId: booking.id, driverId: driver1Id },
      data: { cooldownUntil: new Date(Date.now() - 1000) },
    });

    // Now Driver 1 is eligible again!
    const afterCooldown = await findEligibleCandidates(booking.id);
    expect(afterCooldown.candidates).toHaveLength(1);
    expect(afterCooldown.candidates[0].driverId).toBe(driver1Id);

    // Run sweep: Driver 1 is offered again in Round 2 (attempt 3)!
    await dispatchSweep();

    const offer3 = await prisma.bookingOffer.findFirstOrThrow({
      where: { bookingId: booking.id, attemptNo: 3 },
    });
    expect(offer3.driverId).toBe(driver1Id);
    expect(offer3.roundNo).toBe(2);
    expect(offer3.status).toBe(OfferStatus.SENT);

    // Driver 1 accepts second-chance offer
    const acceptRes = await acceptOffer(driver1Id, offer3.id);
    expect(acceptRes.success).toBe(true);
    expect(acceptRes.booking.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(acceptRes.booking.driverId).toBe(driver1Id);
  });

  it('4. concurrency & race conditions: preventing duplicate SENT offers for same booking or driver', async () => {
    const booking = await createBooking(userActor.id, {
      operationalLocationId: locationId,
      pickupLocation: 'Halim Stasiun',
      pickupLat: -6.244,
      pickupLng: 106.888,
      destination: 'Tegalluar',
      departureAt: new Date(Date.now() + 3600000),
      expectedReturnAt: new Date(Date.now() + 7200000),
      passengerCount: 2,
      purpose: 'Race check',
      status: BookingStatus.SEARCHING_DRIVER,
    });

    const { candidates } = await findEligibleCandidates(booking.id);
    expect(candidates.length).toBeGreaterThan(0);

    // Attempt concurrent createOffer for the same booking
    const [res1, res2] = await Promise.allSettled([
      createOffer(booking.id, candidates[0]),
      createOffer(booking.id, candidates[1] ?? candidates[0]),
    ]);

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled');
    const rejected = [res1, res2].filter((r) => r.status === 'rejected');

    // Exactly 1 offer was created; the second is rejected
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const activeOffers = await prisma.bookingOffer.findMany({
      where: { bookingId: booking.id, status: OfferStatus.SENT },
    });
    expect(activeOffers).toHaveLength(1);
  });
});
