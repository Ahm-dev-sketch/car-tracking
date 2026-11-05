import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, DriverStatus, OfferStatus, VehicleStatus, TripStatus, DriverSessionStatus, MovementStatus } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth-guard';

const db = vi.hoisted(() => ({
  $transaction: vi.fn(),
  $queryRawUnsafe: vi.fn(),
  booking: {
    findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(),
    findMany: vi.fn(), count: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  },
  bookingOffer: {
    findFirst: vi.fn(), findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findMany: vi.fn(),
    count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
  },
  driver: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  driverSession: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  vehicle: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  vehicleAssignment: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  vehicleLocation: { findUnique: vi.fn(), updateMany: vi.fn() },
  trip: { findFirst: vi.fn() },
  user: { findUnique: vi.fn() },
}));

const mockEndTrip = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/server/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/notifications/service', () => ({ notify: vi.fn(), notifyAdmins: vi.fn() }));
vi.mock('@/server/realtime/hub', () => ({ publishEvent: vi.fn() }));
vi.mock('@/server/tracking/service', () => ({ haversineDistanceMeters: vi.fn(() => 100) }));
vi.mock('@/server/trips/service', () => ({ endTrip: mockEndTrip }));

import { listBookings, transitionBooking } from '@/server/bookings/service';
import {
  acceptOffer, createOffer, dispatchBooking, dispatchSweep,
  findEligibleCandidates, manualAssignBooking, rejectOffer, startDriverSession, endDriverSession,
} from '@/server/dispatch/service';
import { DISPATCH_CONFIG } from '@/server/dispatch/config';
import { logAuditEvent } from '@/server/audit';
import { endTrip } from '@/server/trips/service';

const actor: AuthenticatedUser = {
  id: 'user-1', name: 'User', email: 'user@example.test', role: 'USER',
};
const admin: AuthenticatedUser = { ...actor, id: 'admin', role: 'ADMIN' };

function booking(status: BookingStatus = BookingStatus.DRIVER_NOTIFIED) {
  return {
    id: 'booking-1', bookingNumber: 'BK-2026-0001', userId: actor.id,
    status, driverId: null, vehicleId: null, vehiclePreferenceId: null,
    operationalLocationId: 'location-1', pickupLocation: 'Station', destination: 'Office',
    pickupLat: 1, pickupLng: 1, passengerCount: 2,
    departureAt: new Date('2026-11-04T10:00:00Z'),
    expectedReturnAt: new Date('2026-11-04T12:00:00Z'),
    createdAt: new Date(), updatedAt: new Date(), offers: [],
  };
}

function linkedBooking(status: BookingStatus) {
  return {
    ...booking(status), driverId: 'driver-1', vehicleId: 'vehicle-1',
    driver: { id: 'driver-1', userId: 'driver-user' },
  };
}

function activeTrip() {
  return { id: 'trip-1', bookingId: 'booking-1', vehicleId: 'vehicle-1', driverId: 'driver-1', status: TripStatus.ACTIVE };
}

function offer() {
  return {
    id: 'offer-1', bookingId: 'booking-1', driverId: 'driver-1',
    status: OfferStatus.SENT, expiresAt: new Date(Date.now() + 60_000),
    booking: booking(), driver: { userId: 'driver-user' },
    attemptNo: 1, rank: 1, etaSeconds: 10, etaEstimated: true,
  };
}

const vehicle = {
  id: 'vehicle-1', status: VehicleStatus.RESERVED, currentDriverId: 'driver-1',
  plateNumber: 'TEST-1', brand: 'Toyota', model: 'Test', seatingCapacity: 4,
  homeLocationId: 'location-1', currentLocationId: 'location-1',
};
const candidate = {
  driverId: 'driver-1', userId: 'driver-user', name: 'Driver', phone: null,
  licenseNumber: 'license', vehicleId: vehicle.id, vehiclePlateNumber: vehicle.plateNumber,
  vehicleBrand: vehicle.brand, vehicleModel: vehicle.model,
  vehicleHomeLocationId: 'location-1', vehicleCurrentLocationId: 'location-1',
  lat: 1, lng: 1, receivedAt: new Date(), etaSeconds: 10, etaEstimated: true, rank: 1,
};

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation((run: (tx: typeof db) => unknown) => run(db));
  db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.DRIVER_NOTIFIED }]);
  db.booking.findFirst.mockResolvedValue(null);
  db.booking.findMany.mockResolvedValue([]);
  db.booking.count.mockResolvedValue(0);
  db.bookingOffer.findMany.mockResolvedValue([]);
  db.bookingOffer.findFirst.mockResolvedValue(null);
  db.bookingOffer.count.mockResolvedValue(0);
  db.driverSession.findMany.mockResolvedValue([]);
  db.driverSession.findFirst.mockResolvedValue(null);
  db.trip.findFirst.mockResolvedValue(null);
  db.bookingOffer.findUnique.mockResolvedValue(offer());
  db.bookingOffer.findUniqueOrThrow.mockResolvedValue(offer());
  db.bookingOffer.updateMany.mockResolvedValue({ count: 1 });
  db.booking.updateMany.mockResolvedValue({ count: 1 });
  db.booking.update.mockImplementation(({ data }) => Promise.resolve({ ...booking(), ...data }));
  db.vehicle.findUniqueOrThrow.mockResolvedValue(vehicle);
  db.vehicleAssignment.findFirst.mockResolvedValue(null);
  db.driver.findUniqueOrThrow.mockImplementation(() => db.driver.findUnique());
  db.driver.findUnique.mockResolvedValue({
    id: 'driver-1', userId: 'driver-user', status: DriverStatus.AVAILABLE,
    currentVehicleId: vehicle.id, user: { isActive: true }, sessions: [{ vehicleId: vehicle.id }],
  });
});

describe('Booking authorization and cancellation', () => {
  it('limits driver listing to owned or assigned bookings, even with a user filter', async () => {
    await listBookings({ ...actor, id: 'driver-user', role: 'DRIVER' }, { userId: 'someone-else' });
    const where = {
      OR: [{ userId: 'driver-user' }, { driver: { userId: 'driver-user' } }],
      userId: 'someone-else',
    };
    expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(db.booking.count).toHaveBeenCalledWith({ where });
  });

  it('filters the driver workflow before pagination and only includes assigned bookings', async () => {
    await listBookings({ ...actor, id: 'driver-user', role: 'DRIVER' }, { driverWorkflow: true });
    expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      driver: { userId: 'driver-user' },
      status: { in: [BookingStatus.APPROVED, BookingStatus.DRIVER_ASSIGNED, BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS] },
    }) }));
  });

  it('cancels outstanding offers atomically with owner cancellation', async () => {
    db.booking.findUnique.mockResolvedValue(booking());
    const result = await transitionBooking('booking-1', BookingStatus.CANCELLED, actor);
    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(db.bookingOffer.updateMany).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1', status: OfferStatus.SENT },
      data: { status: OfferStatus.CANCELLED, respondedAt: expect.any(Date) },
    });
    expect(db.booking.update.mock.calls[0][0].include.user.select).not.toHaveProperty('passwordHash');
    expect(db.booking.update.mock.calls[0][0].include.driver.include.user.select).not.toHaveProperty('passwordHash');
    expect(db.bookingOffer.updateMany.mock.invocationCallOrder[0])
      .toBeLessThan(db.booking.update.mock.invocationCallOrder[0]);
  });

  it('does not allow ordinary users to change dispatch state through the service', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.PENDING));
    await expect(transitionBooking('booking-1', BookingStatus.SEARCHING_DRIVER, actor))
      .rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('does not mark a legacy booking assigned without any usable vehicle', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.APPROVED));
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.APPROVED }]);
    db.driver.findUnique.mockResolvedValue({
      id: 'driver-1', status: DriverStatus.AVAILABLE, currentVehicleId: null, sessions: [], user: { isActive: true },
    });
    await expect(transitionBooking('booking-1', BookingStatus.DRIVER_ASSIGNED, admin, undefined, { driverId: 'driver-1' }))
      .rejects.toMatchObject({ code: 'NO_VEHICLE_ASSIGNED' });
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('checks vehicle capacity for the legacy assignment endpoint too', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.APPROVED));
    db.$queryRawUnsafe.mockImplementation((sql: string) => Promise.resolve([
      sql.includes('FROM vehicles') ? vehicle : { id: 'booking-1', status: BookingStatus.APPROVED },
    ]));
    db.vehicle.findUniqueOrThrow.mockResolvedValue({ ...vehicle, seatingCapacity: 1 });
    await expect(transitionBooking('booking-1', BookingStatus.DRIVER_ASSIGNED, admin, undefined, { driverId: 'driver-1' }))
      .rejects.toMatchObject({ code: 'INSUFFICIENT_CAPACITY' });
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('locks a driver before checking overlapping legacy assignments', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.APPROVED));
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.APPROVED }]);
    db.booking.findFirst.mockResolvedValue({ bookingNumber: 'OTHER' });
    await expect(transitionBooking('booking-1', BookingStatus.DRIVER_ASSIGNED, admin, undefined, { driverId: 'driver-1' }))
      .rejects.toMatchObject({ code: 'DRIVER_CONFLICT' });
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', 'driver-1');
    const driverLock = db.$queryRawUnsafe.mock.calls.findIndex(([sql]) => sql === 'SELECT id FROM drivers WHERE id = $1 FOR UPDATE');
    const vehicleLock = db.$queryRawUnsafe.mock.calls.findIndex(([sql]) => sql === 'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE');
    expect(vehicleLock).toBeLessThan(driverLock);
    expect(db.$queryRawUnsafe.mock.invocationCallOrder[driverLock])
      .toBeLessThan(db.booking.findFirst.mock.invocationCallOrder[0]);
  });
});

describe('Dispatch offer creation', () => {
  it.each([
    BookingStatus.CANCELLED, BookingStatus.DRIVER_ASSIGNED,
    BookingStatus.DRIVER_NOTIFIED, BookingStatus.COMPLETED,
  ])('cannot create an offer from a stale %s snapshot', async (status) => {
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status }]);
    await expect(createOffer('booking-1', candidate)).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATUS' });
    expect(db.bookingOffer.create).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('enforces the attempt limit inside the booking lock', async () => {
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.SEARCHING_DRIVER }]);
    db.bookingOffer.count.mockResolvedValue(DISPATCH_CONFIG.maxAttempts);
    await expect(createOffer('booking-1', candidate)).rejects.toMatchObject({ code: 'MAX_ATTEMPTS_EXCEEDED' });
    expect(db.bookingOffer.create).not.toHaveBeenCalled();
  });

  it('returns the persisted DRIVER_NOTIFIED booking instead of its pre-update snapshot', async () => {
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.SEARCHING_DRIVER }]);
    db.bookingOffer.create.mockResolvedValue({ ...offer(), booking: booking(BookingStatus.SEARCHING_DRIVER) });
    const result = await createOffer('booking-1', candidate);
    expect(result.booking.status).toBe(BookingStatus.DRIVER_NOTIFIED);
    expect(db.bookingOffer.create.mock.calls[0][0].include.driver.include.user.select)
      .not.toHaveProperty('passwordHash');
  });

  it('rechecks booking state after candidate discovery before marking no drivers available', async () => {
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.SEARCHING_DRIVER));
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.CANCELLED }]);
    await expect(dispatchBooking('booking-1')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATUS' });
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('includes assigned RESERVED vehicles when their booking window is free', async () => {
    db.booking.findUnique.mockResolvedValue({ ...booking(), vehiclePreferenceId: vehicle.id });
    db.vehicle.findUnique.mockResolvedValue(vehicle);
    db.driverSession.findMany.mockResolvedValue([{
      vehicle,
      driver: { id: 'driver-1', licenseNumber: 'license', user: { id: 'driver-user', name: 'Driver', phone: null } },
    }]);
    db.vehicleLocation.findUnique.mockResolvedValue({ lat: 1, lng: 1, receivedAt: new Date() });
    const result = await findEligibleCandidates('booking-1');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].vehicleId).toBe(vehicle.id);
  });
});

describe('Trip-backed booking progress', () => {
  const driverActor: AuthenticatedUser = { ...actor, id: 'driver-user', role: 'DRIVER' };

  it.each([BookingStatus.DRIVER_ASSIGNED, BookingStatus.DRIVER_EN_ROUTE])(
    'does not skip arrival when starting passenger progress from %s', async (status) => {
      db.booking.findUnique.mockResolvedValue(linkedBooking(status));
      await expect(transitionBooking('booking-1', BookingStatus.IN_PROGRESS, driverActor))
        .rejects.toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
      expect(db.$transaction).not.toHaveBeenCalled();
    }
  );

  it.each([
    [BookingStatus.DRIVER_ASSIGNED, BookingStatus.DRIVER_EN_ROUTE],
    [BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED],
    [BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS],
  ])('requires the matching active trip for %s -> %s', async (from, to) => {
    db.booking.findUnique.mockResolvedValue(linkedBooking(from));
    db.$queryRawUnsafe.mockImplementation((sql: string) => Promise.resolve(
      sql.includes('FROM trips') ? [] : [{ id: 'booking-1', status: from }]
    ));
    await expect(transitionBooking('booking-1', to, driverActor))
      .rejects.toMatchObject({ status: 409, code: 'ACTIVE_TRIP_REQUIRED' });
    expect(db.$queryRawUnsafe).toHaveBeenLastCalledWith(
      "SELECT id FROM trips WHERE booking_id = $1 AND vehicle_id = $2 AND driver_id = $3 AND status = 'ACTIVE' FOR UPDATE",
      'booking-1', 'vehicle-1', 'driver-1'
    );
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('allows ARRIVED -> IN_PROGRESS only under booking, vehicle, driver, then trip locks', async () => {
    db.booking.findUnique.mockResolvedValue(linkedBooking(BookingStatus.ARRIVED));
    db.$queryRawUnsafe.mockImplementation((sql: string) => Promise.resolve(
      sql.includes('FROM trips') ? [{ id: 'trip-1' }] : [{ id: 'booking-1', status: BookingStatus.ARRIVED }]
    ));
    const result = await transitionBooking('booking-1', BookingStatus.IN_PROGRESS, driverActor);
    expect(result.status).toBe(BookingStatus.IN_PROGRESS);
    const queries = db.$queryRawUnsafe.mock.calls.map(([sql]) => String(sql));
    expect(queries).toHaveLength(4);
    expect(queries[0]).toContain('FROM bookings');
    expect(queries[1]).toContain('FROM vehicles');
    expect(queries[2]).toContain('FROM drivers');
    expect(queries[3]).toContain('FROM trips');
  });

  it('rejects completion when there is no real matching active trip', async () => {
    db.booking.findUnique.mockResolvedValue(linkedBooking(BookingStatus.IN_PROGRESS));
    await expect(transitionBooking('booking-1', BookingStatus.COMPLETED, driverActor))
      .rejects.toMatchObject({ status: 409, code: 'ACTIVE_TRIP_REQUIRED' });
    expect(db.trip.findFirst).toHaveBeenCalledWith({
      where: { bookingId: 'booking-1', driverId: 'driver-1', vehicleId: 'vehicle-1', status: TripStatus.ACTIVE },
    });
    expect(endTrip).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('delegates completion to endTrip outside any booking transaction before reloading', async () => {
    db.booking.findUnique.mockResolvedValue(linkedBooking(BookingStatus.IN_PROGRESS));
    db.trip.findFirst.mockResolvedValue(activeTrip());
    const completed = linkedBooking(BookingStatus.COMPLETED);
    mockEndTrip.mockImplementation(async () => {
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.booking.findUniqueOrThrow).not.toHaveBeenCalled();
      db.booking.findUniqueOrThrow.mockResolvedValue(completed);
    });
    const result = await transitionBooking('booking-1', BookingStatus.COMPLETED, driverActor);
    expect(endTrip).toHaveBeenCalledWith('driver-1', 'trip-1', {}, { actorUserId: 'driver-user' });
    expect(result).toBe(completed);
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it('propagates a failed endTrip without writing a completed booking', async () => {
    db.booking.findUnique.mockResolvedValue(linkedBooking(BookingStatus.IN_PROGRESS));
    db.trip.findFirst.mockResolvedValue(activeTrip());
    mockEndTrip.mockRejectedValue(new Error('trip completion failed'));
    await expect(transitionBooking('booking-1', BookingStatus.COMPLETED, driverActor))
      .rejects.toThrow('trip completion failed');
    expect(db.booking.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });
});

describe('Cancellation reservation release', () => {
  beforeEach(() => {
    db.booking.findUnique.mockResolvedValue(linkedBooking(BookingStatus.ARRIVED));
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.ARRIVED }]);
  });

  it('requires abort/end before cancellation of a booking with an active trip', async () => {
    db.trip.findFirst.mockResolvedValue(activeTrip());
    await expect(transitionBooking('booking-1', BookingStatus.CANCELLED, actor))
      .rejects.toMatchObject({ status: 409, code: 'ACTIVE_TRIP_EXISTS', message: expect.stringContaining('Abort or end') });
    expect(db.booking.update).not.toHaveBeenCalled();
    expect(db.bookingOffer.updateMany).not.toHaveBeenCalled();
    expect(db.vehicle.updateMany).not.toHaveBeenCalled();
  });

  it('releases only RESERVED status when no other reservation, standing assignment, or active trip remains', async () => {
    await transitionBooking('booking-1', BookingStatus.CANCELLED, actor);
    expect(db.vehicle.updateMany).toHaveBeenCalledWith({
      where: { id: 'vehicle-1', status: VehicleStatus.RESERVED }, data: { status: VehicleStatus.AVAILABLE },
    });
    expect(db.driver.update).not.toHaveBeenCalled();
    expect(db.vehicle.update).not.toHaveBeenCalled();
  });

  it.each(['standing assignment', 'committed booking', 'vehicle trip', 'other owner', 'in-use vehicle'])(
    'does not release a vehicle protected by %s', async (guard) => {
      if (guard === 'standing assignment') db.vehicleAssignment.findFirst.mockResolvedValue({ id: 'standing' });
      if (guard === 'committed booking') db.booking.findFirst.mockResolvedValue({ id: 'other-booking' });
      if (guard === 'vehicle trip') db.trip.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(activeTrip());
      if (guard === 'other owner') db.vehicle.findUniqueOrThrow.mockResolvedValue({ ...vehicle, currentDriverId: 'other-driver' });
      if (guard === 'in-use vehicle') db.vehicle.findUniqueOrThrow.mockResolvedValue({ ...vehicle, status: VehicleStatus.IN_USE });
      await transitionBooking('booking-1', BookingStatus.CANCELLED, actor);
      expect(db.vehicle.updateMany).not.toHaveBeenCalled();
      expect(db.booking.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: BookingStatus.CANCELLED }) }));
    }
  );
});

describe('Driver session boundaries', () => {
  it('rejects a vehicle-less session instead of claiming GPS sharing is active', async () => {
    db.driver.findUnique.mockResolvedValue({ id: 'driver-1', status: DriverStatus.OFFLINE, currentVehicleId: null, sessions: [], user: { isActive: true } });
    await expect(startDriverSession('driver-1', {})).rejects.toMatchObject({ code: 'VEHICLE_REQUIRED_FOR_TRACKING' });
    expect(db.driverSession.create).not.toHaveBeenCalled();
  });

  it('cannot open a session on a unit already used by another online driver', async () => {
    db.driverSession.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other-session' });
    await expect(startDriverSession('driver-1', { vehicleId: vehicle.id })).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_ASSIGNED' });
    expect(db.driverSession.create).not.toHaveBeenCalled();
  });
  it.each(['ON_TRIP status', 'actual active trip'])('refuses an idle session for %s', async (condition) => {
    if (condition === 'ON_TRIP status') {
      db.driver.findUniqueOrThrow.mockResolvedValue({
        id: 'driver-1', status: DriverStatus.ON_TRIP, currentVehicleId: vehicle.id,
        sessions: [{ vehicleId: vehicle.id }], user: { isActive: true },
      });
    } else {
      db.trip.findFirst.mockResolvedValue(activeTrip());
    }
    await expect(startDriverSession('driver-1', {})).rejects.toMatchObject({ status: 409, code: 'DRIVER_BUSY' });
    expect(db.driverSession.create).not.toHaveBeenCalled();
    expect(db.driver.update).not.toHaveBeenCalled();
  });

  it('checks duplicate online sessions only after locking the driver', async () => {
    db.driverSession.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(startDriverSession('driver-1', {})).rejects.toMatchObject({ code: 'SESSION_ALREADY_ACTIVE' });
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', 'driver-1');
    expect(db.$queryRawUnsafe.mock.invocationCallOrder[0])
      .toBeLessThan(db.driverSession.findFirst.mock.invocationCallOrder[0]);
    expect(db.driverSession.create).not.toHaveBeenCalled();
  });

  it('does not let a driver open a session on another driver’s assigned vehicle', async () => {
    db.$queryRawUnsafe.mockResolvedValue([vehicle]);
    db.vehicle.findUniqueOrThrow.mockResolvedValue({ ...vehicle, currentDriverId: 'other-driver' });
    await expect(startDriverSession('driver-1', { vehicleId: vehicle.id }))
      .rejects.toMatchObject({ code: 'VEHICLE_ALREADY_ASSIGNED' });
    expect(db.driverSession.create).not.toHaveBeenCalled();
  });

  it('aborts if a fallback vehicle changes while acquiring the assignment locks', async () => {
    db.driver.findUniqueOrThrow.mockResolvedValue({
      id: 'driver-1', currentVehicleId: 'changed-vehicle',
      sessions: [{ vehicleId: 'changed-vehicle' }], user: { isActive: true },
    });
    await expect(startDriverSession('driver-1', {})).rejects.toMatchObject({ code: 'ASSIGNMENT_CHANGED' });
    expect(db.driverSession.create).not.toHaveBeenCalled();
  });

  it('rejects vehicles in maintenance before creating a session', async () => {
    db.$queryRawUnsafe.mockResolvedValue([{ ...vehicle, status: VehicleStatus.MAINTENANCE }]);
    await expect(startDriverSession('driver-1', { vehicleId: vehicle.id }))
      .rejects.toMatchObject({ code: 'VEHICLE_UNAVAILABLE' });
    expect(db.driverSession.create).not.toHaveBeenCalled();
  });

  it('brings an offline driver online and selects only public user fields in the session response', async () => {
    db.driver.findUnique.mockResolvedValue({
      id: 'driver-1', currentVehicleId: vehicle.id, status: DriverStatus.OFFLINE,
      sessions: [], user: { isActive: true },
    });
    db.$queryRawUnsafe.mockResolvedValue([vehicle]);
    db.driverSession.create.mockResolvedValue({
      id: 'session-1', driverId: 'driver-1', vehicleId: vehicle.id, driver: { userId: 'driver-user' },
    });
    await startDriverSession('driver-1', { vehicleId: vehicle.id });
    const selection = db.driverSession.create.mock.calls[0][0].include.driver.include.user.select;
    expect(selection).toEqual({ id: true, name: true, email: true, phone: true });
    expect(db.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { status: DriverStatus.AVAILABLE, currentVehicleId: vehicle.id } });
    expect(db.driver.update.mock.invocationCallOrder[0]).toBeLessThan(db.driverSession.create.mock.invocationCallOrder[0]);
  });
});

describe('Going offline', () => {
  beforeEach(() => {
    db.driverSession.findFirst.mockResolvedValue({
      id: 'session-1', driverId: 'driver-1', driver: { userId: 'driver-user' },
    });
    db.driverSession.update.mockResolvedValue({ id: 'session-1', status: DriverSessionStatus.ENDED, endedAt: new Date() });
  });

  it('rejects an actual active trip while holding the driver lock', async () => {
    db.trip.findFirst.mockResolvedValue(activeTrip());
    await expect(endDriverSession('driver-1')).rejects.toMatchObject({ status: 409, code: 'DRIVER_BUSY' });
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', 'driver-1');
    expect(db.$queryRawUnsafe.mock.invocationCallOrder[0]).toBeLessThan(db.trip.findFirst.mock.invocationCallOrder[0]);
    expect(db.driverSession.update).not.toHaveBeenCalled();
    expect(db.driver.update).not.toHaveBeenCalled();
    expect(db.vehicleLocation.updateMany).not.toHaveBeenCalled();
  });

  it('ends the session and marks only this driver and their locations offline atomically', async () => {
    const result = await endDriverSession('driver-1');
    expect(result.status).toBe(DriverSessionStatus.ENDED);
    expect(db.driver.update).toHaveBeenCalledWith({ where: { id: 'driver-1' }, data: { status: DriverStatus.OFFLINE, currentVehicleId: null } });
    expect(db.vehicleLocation.updateMany).toHaveBeenCalledWith({ where: { driverId: 'driver-1' }, data: { movement: MovementStatus.OFFLINE } });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.vehicle.update).not.toHaveBeenCalled();
  });

  it('cancels captured SENT offers only in postcommit booking-first transactions', async () => {
    db.bookingOffer.findMany.mockResolvedValue([{ id: 'offer-1', bookingId: 'booking-1' }]);
    const transactions: string[][] = [];
    db.$transaction.mockImplementation(async (run: (tx: typeof db) => unknown) => {
      const start = db.$queryRawUnsafe.mock.calls.length;
      const result = await run(db);
      transactions.push(db.$queryRawUnsafe.mock.calls.slice(start).map(([sql]) => String(sql)));
      return result;
    });
    await endDriverSession('driver-1');
    expect(transactions).toEqual([
      ['SELECT id FROM drivers WHERE id = $1 FOR UPDATE'],
      ['SELECT id FROM bookings WHERE id = $1 FOR UPDATE'],
    ]);
    expect(db.bookingOffer.findMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1', status: OfferStatus.SENT }, select: { id: true, bookingId: true },
    });
    expect(db.bookingOffer.updateMany).toHaveBeenCalledWith({
      where: { id: 'offer-1', driverId: 'driver-1', status: OfferStatus.SENT },
      data: { status: OfferStatus.CANCELLED, respondedAt: expect.any(Date) },
    });
    expect(db.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: BookingStatus.DRIVER_NOTIFIED }, data: { status: BookingStatus.SEARCHING_DRIVER },
    });
  });

  it('does not reset a booking if its captured offer was already accepted or cancelled', async () => {
    db.bookingOffer.findMany.mockResolvedValue([{ id: 'offer-1', bookingId: 'booking-1' }]);
    db.bookingOffer.updateMany.mockResolvedValue({ count: 0 });
    await endDriverSession('driver-1');
    expect(db.booking.updateMany).not.toHaveBeenCalled();
  });
});

describe('Offer responses and stale sweep snapshots', () => {
  it.each(['create', 'accept'] as const)('%s refuses a driver who went offline after candidate discovery', async (path) => {
    const offline = {
      id: 'driver-1', currentVehicleId: vehicle.id, status: DriverStatus.OFFLINE,
      sessions: [], user: { isActive: true },
    };
    db.driver.findUnique.mockResolvedValue(offline);
    db.driver.findUniqueOrThrow.mockResolvedValue(offline);
    if (path === 'create') {
      db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.SEARCHING_DRIVER }]);
    }
    await expect(path === 'create' ? createOffer('booking-1', candidate) : acceptOffer('driver-1', 'offer-1'))
      .rejects.toMatchObject({ status: 409, code: 'DRIVER_UNAVAILABLE' });
    expect(db.bookingOffer.create).not.toHaveBeenCalled();
    expect(db.bookingOffer.update).not.toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });

  it.each([BookingStatus.CANCELLED, BookingStatus.DRIVER_ASSIGNED, BookingStatus.COMPLETED])(
    'reject cannot resurrect a booking in %s', async (status) => {
      db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status }]);
      await expect(rejectOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATUS' });
      expect(db.bookingOffer.update).not.toHaveBeenCalled();
      expect(db.booking.update).not.toHaveBeenCalled();
    }
  );

  it.each([OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.EXPIRED, OfferStatus.CANCELLED])(
    'reject rechecks an offer changed to %s while waiting for the booking lock', async (status) => {
      db.bookingOffer.findUniqueOrThrow.mockResolvedValue({ ...offer(), status });
      await expect(rejectOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'OFFER_NOT_ACTIVE' });
      expect(db.booking.update).not.toHaveBeenCalled();
    }
  );

  it('reject refuses an expired offer', async () => {
    db.bookingOffer.findUniqueOrThrow.mockResolvedValue({ ...offer(), expiresAt: new Date(0) });
    await expect(rejectOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
    expect(db.bookingOffer.update).not.toHaveBeenCalled();
  });

  it('accept rechecks the offer after waiting for the booking lock', async () => {
    db.bookingOffer.findUniqueOrThrow.mockResolvedValue({ ...offer(), status: OfferStatus.REJECTED });
    await expect(acceptOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'OFFER_NOT_ACTIVE' });
    expect(db.driver.findUnique).not.toHaveBeenCalled();
  });

  it('accept checks expiry again after acquiring the booking lock', async () => {
    db.bookingOffer.findUniqueOrThrow.mockResolvedValue({ ...offer(), expiresAt: new Date(0) });
    await expect(acceptOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'OFFER_EXPIRED' });
    expect(db.driver.findUnique).not.toHaveBeenCalled();
  });

  it.each(['accept', 'manual'] as const)('%s locks the driver before reading assignment conflicts', async (path) => {
    db.booking.findFirst.mockResolvedValue({ id: 'conflict' });
    db.user.findUnique.mockResolvedValue({ role: { code: 'ADMIN' } });
    db.booking.findUniqueOrThrow.mockResolvedValue(booking(BookingStatus.SEARCHING_DRIVER));
    const action = path === 'accept'
      ? acceptOffer('driver-1', 'offer-1')
      : manualAssignBooking('admin', 'booking-1', 'driver-1');
    await expect(action).rejects.toMatchObject({ code: 'DRIVER_CONFLICT' });
    expect(db.$queryRawUnsafe).toHaveBeenCalledWith('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', 'driver-1');
    const driverLock = db.$queryRawUnsafe.mock.calls.findIndex(([sql]) => sql === 'SELECT id FROM drivers WHERE id = $1 FOR UPDATE');
    const vehicleLock = db.$queryRawUnsafe.mock.calls.findIndex(([sql]) => sql === 'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE');
    expect(vehicleLock).toBeLessThan(driverLock);
    expect(db.$queryRawUnsafe.mock.invocationCallOrder[driverLock])
      .toBeLessThan(db.driver.findUniqueOrThrow.mock.invocationCallOrder[0]);
  });

  it('accept cannot take a vehicle assigned to another driver', async () => {
    db.$queryRawUnsafe.mockImplementation((sql: string) => Promise.resolve([
      sql.includes('FROM vehicles') ? vehicle : { id: 'booking-1', status: BookingStatus.DRIVER_NOTIFIED },
    ]));
    db.vehicle.findUniqueOrThrow.mockResolvedValue({ ...vehicle, currentDriverId: 'other-driver' });
    await expect(acceptOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_ASSIGNED' });
    expect(db.bookingOffer.update).not.toHaveBeenCalled();
  });

  it('accept revalidates capacity before assigning a changed vehicle', async () => {
    db.$queryRawUnsafe.mockImplementation((sql: string) => Promise.resolve([
      sql.includes('FROM vehicles') ? vehicle : { id: 'booking-1', status: BookingStatus.DRIVER_NOTIFIED },
    ]));
    db.vehicle.findUniqueOrThrow.mockResolvedValue({ ...vehicle, seatingCapacity: 1 });
    await expect(acceptOffer('driver-1', 'offer-1')).rejects.toMatchObject({ code: 'INSUFFICIENT_CAPACITY' });
    expect(db.bookingOffer.update).not.toHaveBeenCalled();
  });

  it('a stale sweep does not expire an already accepted offer or reset its booking', async () => {
    db.bookingOffer.findMany.mockResolvedValue([{ ...offer(), expiresAt: new Date(0) }]);
    db.bookingOffer.updateMany.mockResolvedValue({ count: 0 });
    await dispatchSweep();
    expect(db.bookingOffer.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'offer-1', status: OfferStatus.SENT, expiresAt: { lte: expect.any(Date) } },
    }));
    expect(db.booking.updateMany).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('expiry only returns a DRIVER_NOTIFIED booking to searching, never a terminal booking', async () => {
    db.bookingOffer.findMany.mockResolvedValue([{ ...offer(), expiresAt: new Date(0) }]);
    await dispatchSweep();
    expect(db.booking.updateMany).toHaveBeenCalledWith({
      where: { id: 'booking-1', status: BookingStatus.DRIVER_NOTIFIED },
      data: { status: BookingStatus.SEARCHING_DRIVER },
    });
  });

  it('a stale timeout snapshot cannot escalate a cancelled booking', async () => {
    db.booking.findMany.mockResolvedValue([{
      ...booking(BookingStatus.SEARCHING_DRIVER), updatedAt: new Date(0),
    }]);
    db.$queryRawUnsafe.mockResolvedValue([{ id: 'booking-1', status: BookingStatus.CANCELLED }]);
    await dispatchSweep();
    expect(db.booking.update).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
  });

  it('times search from its first offer, not the age of a previously pending booking', async () => {
    db.booking.findMany.mockResolvedValue([{
      ...booking(BookingStatus.SEARCHING_DRIVER), createdAt: new Date(0),
      offers: [{ driverId: 'already-offered', sentAt: new Date() }],
    }]);
    db.booking.findUnique.mockResolvedValue(booking(BookingStatus.SEARCHING_DRIVER));
    await dispatchSweep();
    expect(db.driverSession.findMany).toHaveBeenCalled();
    expect(db.booking.update).not.toHaveBeenCalled();
  });
});
