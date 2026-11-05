import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookingStatus, DriverSessionStatus, DriverStatus, MovementStatus, TripStatus, VehicleStatus } from '@prisma/client';
import type { AuthenticatedUser } from '@/lib/auth-guard';

const { db, tx } = vi.hoisted(() => ({
  db: { $transaction: vi.fn(), trip: { findUnique: vi.fn() } },
  tx: {
    $queryRawUnsafe: vi.fn(),
    booking: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    vehicle: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    driver: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    trip: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    vehicleAssignment: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    driverSession: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    vehicleLocation: { updateMany: vi.fn() },
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/server/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/server/notifications/service', () => ({ notify: vi.fn(), notifyAdmins: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

import { abortTrip, arriveTrip, endTrip, startTrip } from '@/server/trips/service';
import { logAuditEvent } from '@/server/audit';
import { notify, notifyAdmins } from '@/server/notifications/service';
import { logger } from '@/lib/logger';

const actor: AuthenticatedUser = { id: 'driver-user', name: 'Driver', email: 'driver@example.test', role: 'DRIVER' };
const admin: AuthenticatedUser = { ...actor, id: 'admin-user', role: 'ADMIN' };
const startInput = { bookingId: 'booking-1', startLat: 1, startLng: 2 };
const adhocInput = { vehicleId: 'vehicle-1', startLat: 1, startLng: 2 };

function fixture() {
  return {
    booking: {
      id: 'booking-1', bookingNumber: 'BK-1', userId: 'passenger-user',
      driverId: 'driver-1' as string | null, vehicleId: 'vehicle-1' as string | null,
      status: BookingStatus.DRIVER_ASSIGNED as BookingStatus,
      departureAt: new Date('2026-11-04T10:00:00Z'),
      expectedReturnAt: new Date('2026-11-04T12:00:00Z'),
      user: { id: 'passenger-user', name: 'Passenger', email: 'passenger@example.test', phone: '123' },
    },
    driver: {
      id: 'driver-1', userId: actor.id, status: DriverStatus.AVAILABLE as DriverStatus,
      currentVehicleId: 'vehicle-1' as string | null,
      user: { id: actor.id, name: actor.name, email: actor.email, phone: '456', isActive: true },
    },
    vehicle: {
      id: 'vehicle-1', status: VehicleStatus.RESERVED as VehicleStatus,
      currentDriverId: 'driver-1' as string | null,
    },
    trip: {
      id: 'trip-1', bookingId: 'booking-1' as string | null, vehicleId: 'vehicle-1', driverId: 'driver-1',
      status: TripStatus.ACTIVE as TripStatus, endedAt: null as Date | null, distanceMeters: null as number | null,
    },
  };
}

let state = fixture();
let onLock: (query: string) => void;
let inTransaction = false;
let committed = false;

function tripResponse() {
  return {
    ...state.trip,
    driver: { ...state.driver, user: { id: actor.id, name: actor.name, email: actor.email, phone: '456' } },
    vehicle: { ...state.vehicle },
    booking: state.trip.bookingId ? { ...state.booking } : null,
  };
}

function locks() {
  return tx.$queryRawUnsafe.mock.calls.map(([query]) => query as string);
}

function expectNoWrites() {
  for (const write of [
    tx.trip.create, tx.trip.update, tx.booking.update, tx.vehicle.update, tx.vehicle.updateMany,
    tx.driver.update, tx.driver.updateMany, tx.driverSession.create, tx.driverSession.updateMany,
    tx.vehicleAssignment.create, tx.vehicleAssignment.updateMany, tx.vehicleLocation.updateMany
  ]) {
    expect(write).not.toHaveBeenCalled();
  }
  expect(notify).not.toHaveBeenCalled();
  expect(logAuditEvent).not.toHaveBeenCalled();
}

function expectSafeUserSelections(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'user') {
      expect(nested).toEqual(expect.objectContaining({ select: expect.objectContaining({ id: true, name: true, phone: true }) }));
      expect((nested as { select: Record<string, unknown> }).select).not.toHaveProperty('passwordHash');
    } else {
      expectSafeUserSelections(nested);
    }
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  state = fixture();
  onLock = () => {};
  inTransaction = false;
  committed = false;
  db.$transaction.mockImplementation(async (run: (client: typeof tx) => Promise<unknown>) => {
    inTransaction = true;
    try {
      const result = await run(tx);
      committed = true;
      return result;
    } finally {
      inTransaction = false;
    }
  });
  db.trip.findUnique.mockImplementation(async () => ({ ...state.trip }));
  tx.$queryRawUnsafe.mockImplementation(async (query: string) => {
    expect(inTransaction).toBe(true);
    onLock(query);
    return [{ id: 'locked' }];
  });
  tx.booking.findUnique.mockImplementation(async () => ({ ...state.booking }));
  tx.vehicle.findUnique.mockImplementation(async () => ({ ...state.vehicle }));
  tx.driver.findUnique.mockImplementation(async () => ({ ...state.driver }));
  tx.trip.findUnique.mockImplementation(async () => tripResponse());
  tx.trip.findFirst.mockResolvedValue(null);
  tx.booking.findFirst.mockResolvedValue(null);
  tx.vehicleAssignment.findFirst.mockResolvedValue(null);
  tx.driver.findFirst.mockResolvedValue(null);
  tx.vehicle.findFirst.mockResolvedValue(null);
  tx.driverSession.findFirst.mockResolvedValue(null);
  tx.booking.update.mockImplementation(async ({ data }) => {
    Object.assign(state.booking, data);
    return { ...state.booking };
  });
  tx.vehicle.update.mockImplementation(async ({ data }) => {
    Object.assign(state.vehicle, data);
    return { ...state.vehicle };
  });
  tx.driver.update.mockImplementation(async ({ data }) => {
    Object.assign(state.driver, data);
    return { ...state.driver };
  });
  tx.trip.create.mockImplementation(async ({ data }) => {
    Object.assign(state.trip, data);
    return tripResponse();
  });
  tx.trip.update.mockImplementation(async ({ data }) => {
    Object.assign(state.trip, data);
    return tripResponse();
  });
  tx.vehicleAssignment.updateMany.mockResolvedValue({ count: 1 });
  tx.vehicle.updateMany.mockResolvedValue({ count: 1 });
  tx.driver.updateMany.mockResolvedValue({ count: 1 });
  tx.driverSession.updateMany.mockResolvedValue({ count: 1 });
  tx.vehicleLocation.updateMany.mockResolvedValue({ count: 1 });
});

describe('Trip start guards under booking, vehicle, then driver locks', () => {
  it('creates assignment history for a newly selected vehicle, not just sticky mirrors', async () => {
    await startTrip('driver-1', adhocInput);
    expect(tx.vehicleAssignment.create).toHaveBeenCalledWith({ data: { driverId: 'driver-1', vehicleId: 'vehicle-1', assignedAt: expect.any(Date) } });
  });

  it('rejects a vehicle already used by another online driver before writing', async () => {
    tx.driverSession.findFirst.mockResolvedValueOnce({ id: 'other-session' });
    await expect(startTrip('driver-1', adhocInput)).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_ASSIGNED' });
    expectNoWrites();
  });

  it('rejects invalid starting coordinates without entering a transaction', async () => {
    await expect(startTrip('driver-1', { ...adhocInput, startLat: Number.NaN })).rejects.toMatchObject({ code: 'INVALID_COORDINATES' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it('returns persisted booking, vehicle and driver states and opens a session', async () => {
    const result = await startTrip('driver-1', startInput);
    expect(locks()).toEqual([
      'SELECT id FROM bookings WHERE id = $1 FOR UPDATE',
      'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE',
      'SELECT id FROM drivers WHERE id = $1 FOR UPDATE',
    ]);
    expect(tx.driver.findUnique.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$queryRawUnsafe.mock.invocationCallOrder[2]);
    expect(tx.trip.findFirst.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$queryRawUnsafe.mock.invocationCallOrder[2]);
    expect(result.booking?.status).toBe(BookingStatus.DRIVER_EN_ROUTE);
    expect(result.vehicle.status).toBe(VehicleStatus.IN_USE);
    expect(result.driver.status).toBe(DriverStatus.ON_TRIP);
    expect(tx.driverSession.create).toHaveBeenCalledWith({ data: {
      driverId: 'driver-1', vehicleId: 'vehicle-1', status: DriverSessionStatus.ACTIVE, startLat: 1, startLng: 2,
    } });
    expect(tx.trip.create.mock.invocationCallOrder[0]).toBeGreaterThan(tx.booking.update.mock.invocationCallOrder[0]);
  });

  it('accepts legacy APPROVED bookings only with a driver and vehicle assignment', async () => {
    state.booking.status = BookingStatus.APPROVED;
    await expect(startTrip('driver-1', startInput)).resolves.toMatchObject({ booking: { status: BookingStatus.DRIVER_EN_ROUTE } });
  });

  it('rechecks the account after waiting for the driver lock', async () => {
    onLock = (query) => { if (query.includes('FROM drivers')) state.driver.user.isActive = false; };
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'DRIVER_INACTIVE' });
    expectNoWrites();
  });

  it('rejects a missing driver after acquiring the locks', async () => {
    tx.driver.findUnique.mockResolvedValue(null);
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'DRIVER_NOT_FOUND' });
    expectNoWrites();
  });

  it('rejects ON_TRIP even without an active trip row', async () => {
    state.driver.status = DriverStatus.ON_TRIP;
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'DRIVER_BUSY' });
    expectNoWrites();
  });

  it.each([
    ['driver-1', 'other-vehicle', 'DRIVER_BUSY'],
    ['other-driver', 'vehicle-1', 'VEHICLE_IN_USE'],
  ])('checks actual active trips for driver %s and vehicle %s', async (driverId, vehicleId, code) => {
    onLock = (query) => {
      if (query.includes('FROM drivers')) tx.trip.findFirst.mockResolvedValue({ id: 'other-trip', driverId, vehicleId });
    };
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code });
    expect(tx.trip.findFirst).toHaveBeenCalledWith({ where: { status: TripStatus.ACTIVE, OR: [{ vehicleId: 'vehicle-1' }, { driverId: 'driver-1' }] } });
    expectNoWrites();
  });

  it.each([VehicleStatus.MAINTENANCE, VehicleStatus.INACTIVE, VehicleStatus.IN_USE])('rejects a locked %s vehicle for booking-backed starts too', async (status) => {
    onLock = (query) => { if (query.includes('FROM vehicles')) state.vehicle.status = status; };
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: status === VehicleStatus.IN_USE ? 'VEHICLE_IN_USE' : 'VEHICLE_UNAVAILABLE' });
    expectNoWrites();
  });

  it('rejects a missing vehicle', async () => {
    tx.vehicle.findUnique.mockResolvedValue(null);
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'VEHICLE_NOT_FOUND' });
    expectNoWrites();
  });

  it.each([BookingStatus.CANCELLED, BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED])('cannot start from booking %s after waiting for its lock', async (status) => {
    onLock = (query) => { if (query.includes('FROM bookings')) state.booking.status = status; };
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATUS' });
    expectNoWrites();
  });

  it('requires the locked booking to exist', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'BOOKING_NOT_FOUND' });
    expectNoWrites();
  });

  it.each([null, 'another-driver'])('requires this driver, not %s, on the booking', async (driverId) => {
    state.booking.driverId = driverId;
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'BOOKING_NOT_ASSIGNED' });
    expectNoWrites();
  });

  it('does not use an input vehicle to bypass an unassigned booking vehicle', async () => {
    state.booking.vehicleId = null;
    await expect(startTrip('driver-1', { ...startInput, vehicleId: 'vehicle-1' })).rejects.toMatchObject({ code: 'NO_VEHICLE_ASSIGNED' });
    expectNoWrites();
  });

  it('does not silently ignore a conflicting explicit vehicle', async () => {
    await expect(startTrip('driver-1', { ...startInput, vehicleId: 'another-vehicle' })).rejects.toMatchObject({ code: 'BOOKING_VEHICLE_MISMATCH' });
    expectNoWrites();
  });

  it('rejects a vehicle if another driver is online with it in an active session', async () => {
    tx.driverSession.findFirst.mockResolvedValueOnce({ id: 'other-session' });
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_ASSIGNED' });
    expectNoWrites();
  });

  it('allows choosing a vehicle even if driver or vehicle had past mirrors in the pool', async () => {
    state.vehicle.currentDriverId = 'other-driver';
    state.driver.currentVehicleId = 'other-vehicle';
    await expect(startTrip('driver-1', startInput)).resolves.toBeDefined();
  });

  it('rejects overlapping committed vehicle or driver reservations except its own booking', async () => {
    tx.booking.findFirst.mockResolvedValue({ id: 'other-booking' });
    await expect(startTrip('driver-1', startInput)).rejects.toMatchObject({ code: 'BOOKING_CONFLICT' });
    expect(tx.booking.findFirst).toHaveBeenCalledWith({ where: {
      OR: [{ vehicleId: 'vehicle-1' }, { driverId: 'driver-1' }], id: { not: 'booking-1' },
      departureAt: { lt: state.booking.expectedReturnAt }, expectedReturnAt: { gt: state.booking.departureAt },
      status: { in: [BookingStatus.APPROVED, BookingStatus.DRIVER_ASSIGNED, BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED, BookingStatus.IN_PROGRESS] },
    }, select: { id: true } });
    expectNoWrites();
  });

  it('does not allow ad-hoc starts to consume even a future committed booking', async () => {
    tx.booking.findFirst.mockResolvedValue({ id: 'future-booking' });
    await expect(startTrip('driver-1', adhocInput)).rejects.toMatchObject({ code: 'BOOKING_CONFLICT' });
    const where = tx.booking.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('departureAt');
    expect(where).not.toHaveProperty('expectedReturnAt');
    expect(where).not.toHaveProperty('id');
    expectNoWrites();
  });

  it('allows a standing RESERVED vehicle without another committed reservation', async () => {
    await expect(startTrip('driver-1', adhocInput)).resolves.toMatchObject({ booking: null, vehicle: { status: VehicleStatus.IN_USE } });
    expect(locks()).toHaveLength(2);
  });

  it('synchronizes all active sessions to the chosen vehicle instead of creating another', async () => {
    tx.driverSession.findFirst.mockResolvedValueOnce(null).mockResolvedValue({ id: 'session-1', vehicleId: null });
    await startTrip('driver-1', startInput);
    expect(tx.driverSession.updateMany).toHaveBeenCalledWith({ where: { driverId: 'driver-1', status: DriverSessionStatus.ACTIVE }, data: { vehicleId: 'vehicle-1' } });
    expect(tx.driverSession.create).not.toHaveBeenCalled();
  });

  it('allows an offline driver to retry and opens the required session', async () => {
    state.driver.status = DriverStatus.OFFLINE;
    await expect(startTrip('driver-1', startInput)).resolves.toMatchObject({ driver: { status: DriverStatus.ON_TRIP } });
    expect(tx.driverSession.create).toHaveBeenCalledOnce();
  });

  it('requires a booking or vehicle', async () => {
    await expect(startTrip('driver-1', { startLat: 1, startLng: 2 })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

const closures = [
  { name: 'finish', run: () => endTrip('driver-1', 'trip-1', { endLat: 3, endLng: 4, distanceMeters: 100 }), tripStatus: TripStatus.COMPLETED, bookingStatus: BookingStatus.COMPLETED },
  { name: 'abort', run: () => abortTrip(actor, 'trip-1', { reason: 'Retry' }), tripStatus: TripStatus.ABORTED, bookingStatus: BookingStatus.DRIVER_ASSIGNED },
];

describe.each(closures)('Trip $name lifecycle', ({ name, run, tripStatus, bookingStatus }) => {
  beforeEach(() => { state.booking.status = BookingStatus.IN_PROGRESS; });
  it('uses booking, vehicle, driver, then trip locks and returns the final related states', async () => {
    state.booking.status = BookingStatus.IN_PROGRESS;
    const result = await run();
    expect(locks()).toEqual([
      'SELECT id FROM bookings WHERE id = $1 FOR UPDATE',
      'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE',
      'SELECT id FROM drivers WHERE id = $1 FOR UPDATE',
      'SELECT id FROM trips WHERE id = $1 FOR UPDATE',
    ]);
    expect(tx.trip.findUnique.mock.invocationCallOrder[0]).toBeGreaterThan(tx.$queryRawUnsafe.mock.invocationCallOrder[3]);
    expect(result.status).toBe(tripStatus);
    expect(result.booking?.status).toBe(bookingStatus);
    expect(result.vehicle.status).toBe(name === 'abort' ? VehicleStatus.RESERVED : VehicleStatus.AVAILABLE);
    expect(result.driver.status).toBe(DriverStatus.OFFLINE);
    expect(result.driver.currentVehicleId).toBeNull();
    expect(result.vehicle.currentDriverId).toBeNull();
    expect(tx.driverSession.updateMany).toHaveBeenCalledWith({
      where: { driverId: 'driver-1', status: DriverSessionStatus.ACTIVE },
      data: { status: DriverSessionStatus.ENDED, endedAt: result.endedAt },
    });
    expect(tx.vehicleLocation.updateMany).toHaveBeenCalledWith({
      where: { OR: [{ vehicleId: 'vehicle-1' }, { driverId: 'driver-1' }] }, data: { movement: MovementStatus.OFFLINE },
    });
    expect(tx.trip.update.mock.invocationCallOrder[0]).toBeGreaterThan(tx.driver.update.mock.invocationCallOrder[0]);
    if (name === 'finish') expect(result.distanceMeters).toBe(100);
  });

  it.each([TripStatus.COMPLETED, TripStatus.ABORTED])('cannot overwrite %s after waiting for the trip lock', async (status) => {
    onLock = (query) => { if (query.includes('FROM trips')) state.trip.status = status; };
    await expect(run()).rejects.toMatchObject({ code: 'TRIP_ALREADY_ENDED' });
    expectNoWrites();
  });

  it('rejects a trip removed while acquiring locks', async () => {
    tx.trip.findUnique.mockResolvedValue(null);
    await expect(run()).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
    expectNoWrites();
  });

  it.each(['bookingId', 'vehicleId', 'driverId'] as const)('rejects a changed %s instead of writing without its lock', async (key) => {
    onLock = (query) => { if (query.includes('FROM trips')) state.trip[key] = 'changed'; };
    await expect(run()).rejects.toMatchObject({ code: 'TRIP_CHANGED' });
    expectNoWrites();
  });

  it('rejects a booking assignment that no longer matches the trip', async () => {
    state.booking.driverId = 'other-driver';
    await expect(run()).rejects.toMatchObject({ code: 'BOOKING_NOT_ASSIGNED' });
    expectNoWrites();
  });

  it('retains RESERVED when a committed future reservation exists for the vehicle', async () => {
    state.vehicle.currentDriverId = null;
    state.driver.currentVehicleId = null;
    tx.booking.findFirst.mockResolvedValue({ id: 'future-booking' });
    const result = await run();
    expect(result.vehicle.status).toBe(VehicleStatus.RESERVED);
  });

  it('releases an unassigned ad-hoc vehicle but still takes it offline', async () => {
    state.trip.bookingId = null;
    state.vehicle.currentDriverId = null;
    state.driver.currentVehicleId = null;
    const result = await run();
    expect(result.vehicle.status).toBe(VehicleStatus.AVAILABLE);
    expect(result.driver.status).toBe(DriverStatus.OFFLINE);
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(locks()[0]).toContain('FROM vehicles');
  });

  it('reports missing trips before opening a transaction', async () => {
    db.trip.findUnique.mockResolvedValue(null);
    await expect(run()).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND' });
    expect(db.$transaction).not.toHaveBeenCalled();
    expectNoWrites();
  });
});

describe('Shutdown authorization and retries', () => {
  it.each([BookingStatus.DRIVER_EN_ROUTE, BookingStatus.ARRIVED])('does not count an unboarded pickup as a completed booking (%s)', async (status) => {
    state.booking.status = status;
    await expect(endTrip('driver-1', 'trip-1', {})).rejects.toMatchObject({ code: 'PASSENGER_TRIP_NOT_STARTED' });
    expectNoWrites();
  });

  it.each([BookingStatus.CANCELLED, BookingStatus.COMPLETED, BookingStatus.REJECTED])('cannot resurrect a terminal %s booking by aborting its stale trip', async (status) => {
    state.booking.status = status;
    await expect(abortTrip(actor, 'trip-1')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATUS' });
    expectNoWrites();
  });
  it('authorizes finish against the locked trip', async () => {
    await expect(endTrip('other-driver', 'trip-1', {})).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(locks()).toHaveLength(4);
    expectNoWrites();
  });

  it.each(['abort', 'arrive'])('does not treat a matching driver profile ID as an authenticated user ID for %s', async (action) => {
    const impostor = { ...actor, id: 'driver-1' };
    await expect(action === 'abort' ? abortTrip(impostor, 'trip-1') : arriveTrip(impostor, 'trip-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expectNoWrites();
  });

  it('allows an admin to abort', async () => {
    await expect(abortTrip(admin, 'trip-1')).resolves.toMatchObject({ status: TripStatus.ABORTED });
  });

  it('retains the retry reservation even without ownership mirrors or standing assignment', async () => {
    state.vehicle.currentDriverId = null;
    state.driver.currentVehicleId = null;
    const result = await abortTrip(actor, 'trip-1');
    expect(result.booking?.status).toBe(BookingStatus.DRIVER_ASSIGNED);
    expect(result.vehicle.status).toBe(VehicleStatus.RESERVED);
  });

  it('can restart an aborted booking with a new trip and session', async () => {
    await abortTrip(actor, 'trip-1');
    const result = await startTrip('driver-1', startInput);
    expect(result.status).toBe(TripStatus.ACTIVE);
    expect(result.booking?.status).toBe(BookingStatus.DRIVER_EN_ROUTE);
    expect(result.driver.status).toBe(DriverStatus.ON_TRIP);
    expect(tx.driverSession.create).toHaveBeenCalledOnce();
  });
});

describe('Arrival progression', () => {
  it('only advances DRIVER_EN_ROUTE and synchronizes both response booking copies', async () => {
    state.booking.status = BookingStatus.DRIVER_EN_ROUTE;
    const result = await arriveTrip(actor, 'trip-1');
    expect(locks().map((query) => query.split('FROM ')[1].split(' ')[0])).toEqual(['bookings', 'vehicles', 'drivers', 'trips']);
    expect(result.booking.status).toBe(BookingStatus.ARRIVED);
    expect(result.trip.booking?.status).toBe(BookingStatus.ARRIVED);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('is idempotent for ARRIVED without repeating writes, audits or notifications', async () => {
    state.booking.status = BookingStatus.ARRIVED;
    await expect(arriveTrip(actor, 'trip-1')).resolves.toMatchObject({ booking: { status: BookingStatus.ARRIVED } });
    expectNoWrites();
  });

  it.each([BookingStatus.IN_PROGRESS, BookingStatus.DRIVER_ASSIGNED, BookingStatus.APPROVED, BookingStatus.CANCELLED, BookingStatus.COMPLETED])('never changes %s to ARRIVED', async (status) => {
    onLock = (query) => { if (query.includes('FROM bookings')) state.booking.status = status; };
    await expect(arriveTrip(actor, 'trip-1')).rejects.toMatchObject({ code: 'INVALID_BOOKING_STATUS' });
    expectNoWrites();
  });

  it('revalidates ACTIVE under the trip lock', async () => {
    onLock = (query) => { if (query.includes('FROM trips')) state.trip.status = TripStatus.COMPLETED; };
    await expect(arriveTrip(actor, 'trip-1')).rejects.toMatchObject({ code: 'TRIP_NOT_ACTIVE' });
    expectNoWrites();
  });

  it('requires a linked booking', async () => {
    state.trip.bookingId = null;
    await expect(arriveTrip(actor, 'trip-1')).rejects.toMatchObject({ code: 'NO_BOOKING_LINKED' });
    expectNoWrites();
  });

  it('requires the booking assignment to match the trip', async () => {
    state.booking.status = BookingStatus.DRIVER_EN_ROUTE;
    state.booking.vehicleId = 'other-vehicle';
    await expect(arriveTrip(actor, 'trip-1')).rejects.toMatchObject({ code: 'BOOKING_NOT_ASSIGNED' });
    expectNoWrites();
  });

  it('allows admin arrival', async () => {
    state.booking.status = BookingStatus.DRIVER_EN_ROUTE;
    await expect(arriveTrip(admin, 'trip-1')).resolves.toMatchObject({ booking: { status: BookingStatus.ARRIVED } });
  });
});

const mutations = [
  { name: 'start', run: () => startTrip('driver-1', startInput) },
  { name: 'finish', run: () => endTrip('driver-1', 'trip-1', {}) },
  { name: 'abort', run: () => abortTrip(actor, 'trip-1') },
  { name: 'arrive', run: () => arriveTrip(actor, 'trip-1') },
];

describe.each(mutations)('$name response safety and postcommit effects', ({ name, run }) => {
  beforeEach(() => { if (name === 'finish') state.booking.status = BookingStatus.IN_PROGRESS; });
  it('uses explicit safe selections for every related user', async () => {
    if (name === 'arrive') state.booking.status = BookingStatus.DRIVER_EN_ROUTE;
    await run();
    for (const mock of [tx.driver.findUnique, tx.trip.findUnique, tx.trip.create, tx.trip.update, tx.booking.update]) {
      for (const [args] of mock.mock.calls) expectSafeUserSelections(args);
    }
    expect(db.trip.findUnique.mock.calls.every(([args]) => !args.include)).toBe(true);
  });

  it('audits only after commit', async () => {
    if (name === 'arrive') state.booking.status = BookingStatus.DRIVER_EN_ROUTE;
    vi.mocked(logAuditEvent).mockImplementation(async () => {
      expect(committed).toBe(true);
      expect(inTransaction).toBe(false);
    });
    await run();
    expect(logAuditEvent).toHaveBeenCalledOnce();
  });
});

describe.each(mutations.filter(({ name }) => name !== 'abort'))('$name notifications', ({ name, run }) => {
  beforeEach(() => { if (name === 'finish') state.booking.status = BookingStatus.IN_PROGRESS; });
  it('runs outside the committed transaction and treats recipient failures independently as nonfatal', async () => {
    if (name === 'arrive') state.booking.status = BookingStatus.DRIVER_EN_ROUTE;
    vi.mocked(notify).mockImplementation(async () => {
      expect(committed).toBe(true);
      expect(inTransaction).toBe(false);
      throw new Error('Recipient unavailable');
    });
    vi.mocked(notifyAdmins).mockImplementation(async () => {
      expect(committed).toBe(true);
      expect(inTransaction).toBe(false);
      throw new Error('Admins unavailable');
    });
    await expect(run()).resolves.toBeDefined();
    expect(notify).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalled();
    if (name !== 'arrive') expect(notifyAdmins).toHaveBeenCalledOnce();
  });
});
