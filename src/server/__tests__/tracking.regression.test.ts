import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  trip: { findFirst: vi.fn() },
  driverSession: { findFirst: vi.fn() },
  driverLocation: { create: vi.fn() },
  vehicleLocation: { findUnique: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  vehicle: { findUnique: vi.fn(), findMany: vi.fn() },
  booking: { findFirst: vi.fn(), findMany: vi.fn() },
  $executeRawUnsafe: vi.fn(),
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const publish = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma', () => ({ prisma: db }));
vi.mock('@/server/realtime/hub', () => ({ publishEvent: publish }));

import { getLiveTracking, getVehicleTracking, ingestLocations, markStale } from '@/server/tracking/service';
import { TRACKING_CONFIG } from '@/server/tracking/config';

const admin = { id: 'admin', role: 'ADMIN' };
const user = { id: 'owner', role: 'USER' };
const point = () => ({ lat: 21, lng: 105, accuracyM: 10, recordedAt: new Date() });
const assignedDriver = { id: 'assigned-driver', user: { id: 'assigned-user', name: 'Assigned', phone: '111' } };
const tripDriver = { id: 'trip-driver', user: { id: 'trip-user', name: 'Trip driver', phone: '222' } };

beforeEach(() => {
  vi.resetAllMocks();
  db.$transaction.mockImplementation(async (callback) => callback(db));
  db.vehicleLocation.updateMany.mockResolvedValue({ count: 0 });
  db.vehicleLocation.findUnique.mockResolvedValue(null);
  db.trip.findFirst.mockResolvedValue(null);
  db.driverSession.findFirst.mockResolvedValue({ vehicleId: 'vehicle', driver: { currentVehicleId: 'vehicle' } });
});

describe('Tracking domain regressions (no database)', () => {
  it('requires an active trip or tracking session before accepting coordinates', async () => {
    db.driverSession.findFirst.mockResolvedValue(null);
    await expect(ingestLocations('driver', [point()])).rejects.toMatchObject({ status: 403, code: 'TRACKING_SESSION_REQUIRED' });
    expect(db.driverLocation.create).not.toHaveBeenCalled();
  });

  it('uses the idle cadence for idle-session points, rather than the trip cadence', async () => {
    const p = { ...point(), recordedAt: new Date(Date.now() - 15000) };
    expect((await ingestLocations('driver', [p])).accepted).toBe(1);
    expect(db.vehicleLocation.upsert).toHaveBeenCalled();
  });

  it.each([
    { lat: Number.NaN },
    { lng: Number.POSITIVE_INFINITY },
    { accuracyM: Number.NaN },
    { speedMps: Number.NaN },
    { headingDeg: Number.NaN },
    { recordedAt: new Date('invalid') },
  ])('rejects non-finite GPS data: %o', async (invalid) => {
    const result = await ingestLocations('driver', [{ ...point(), ...invalid }]);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toHaveLength(1);
    expect(db.driverLocation.create).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('retains delayed points in history without rewinding or broadcasting the current location', async () => {
    const p = point();
    db.vehicleLocation.findUnique.mockResolvedValue({ ...p, recordedAt: new Date(p.recordedAt.getTime() + 1000) });
    expect((await ingestLocations('driver', [p])).accepted).toBe(1);
    expect(db.driverLocation.create).toHaveBeenCalled();
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.vehicleLocation.upsert).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not let a duplicate timestamp revive stale telemetry', async () => {
    const p = point();
    db.vehicleLocation.findUnique.mockResolvedValue({ ...p, movement: 'GPS_LOST' });
    await ingestLocations('driver', [p]);
    expect(db.vehicleLocation.upsert).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('sorts a batch and publishes only the newest point using its active trip vehicle', async () => {
    db.trip.findFirst.mockResolvedValue({ id: 'trip', vehicleId: 'trip-vehicle', driver: tripDriver });
    const newest = point();
    const older = { ...newest, lat: 20, recordedAt: new Date(newest.recordedAt.getTime() - 1000) };
    await ingestLocations('driver', [newest, older]);
    expect(db.vehicleLocation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { vehicleId: 'trip-vehicle' },
      update: expect.objectContaining({ lat: newest.lat, recordedAt: newest.recordedAt, tripId: 'trip' }),
    }));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ driverPhone: '222' }) }));
  });

  it('does not revive an offline snapshot when the session ends during upload', async () => {
    db.driverSession.findFirst.mockResolvedValueOnce({ id: 'session', vehicleId: 'vehicle', driver: { currentVehicleId: 'vehicle' } }).mockResolvedValue(null);
    await expect(ingestLocations('driver', [point()])).rejects.toMatchObject({ code: 'TRACKING_SESSION_CHANGED' });
    expect(db.driverLocation.create).not.toHaveBeenCalled();
    expect(db.vehicleLocation.upsert).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not reassign an in-flight GPS batch to a newly started trip', async () => {
    db.trip.findFirst.mockResolvedValueOnce({ id: 'old-trip', vehicleId: 'vehicle', driver: tripDriver }).mockResolvedValue({ id: 'new-trip', vehicleId: 'vehicle' });
    await expect(ingestLocations('driver', [point()])).rejects.toMatchObject({ code: 'TRACKING_SESSION_CHANGED' });
    expect(db.vehicleLocation.upsert).not.toHaveBeenCalled();
  });

  it('uses separate trip and idle cutoffs when marking lost GPS', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await markStale();
      expect(db.vehicleLocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([
          { trip: { is: { status: 'ACTIVE' } }, receivedAt: { lt: new Date(now - TRACKING_CONFIG.tripIntervalSec * TRACKING_CONFIG.maxStaleMultiplier * 1000) } },
          { trip: { is: null }, receivedAt: { lt: new Date(now - TRACKING_CONFIG.idleIntervalSec * TRACKING_CONFIG.maxStaleMultiplier * 1000) } },
        ]) }),
      }));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('honors an explicit stale threshold for idle locations too', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await markStale(10);
      expect(db.vehicleLocation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ OR: expect.arrayContaining([
          { trip: { is: null }, receivedAt: { lt: new Date(now - 10000) } },
        ]) }),
      }));
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('returns the active trip driver contact instead of an unrelated current assignment', async () => {
    db.vehicle.findUnique.mockResolvedValue({ id: 'vehicle', currentDriver: assignedDriver, currentLocation: point() });
    db.trip.findFirst.mockResolvedValue({ id: 'trip', driver: tripDriver });
    const result = await getVehicleTracking('vehicle', admin);
    expect(result.driver).toMatchObject({ id: 'trip-driver', name: 'Trip driver', phone: '222' });
  });

  it('applies the same active-trip contact choice to live fleet results', async () => {
    db.vehicle.findMany.mockResolvedValue([{ id: 'vehicle', currentDriver: assignedDriver, trips: [{ driver: tripDriver }] }]);
    expect((await getLiveTracking(admin))[0].driver).toMatchObject({ id: 'trip-driver', phone: '222' });
  });

  it('rejects an unrelated user and scopes live queries to the owner active bookings', async () => {
    db.vehicle.findUnique.mockResolvedValue({ id: 'vehicle' });
    db.booking.findFirst.mockResolvedValue(null);
    await expect(getVehicleTracking('vehicle', user)).rejects.toMatchObject({ status: 403 });
    db.booking.findMany.mockResolvedValue([{ vehicleId: 'owned-vehicle' }]);
    db.vehicle.findMany.mockResolvedValue([]);
    await getLiveTracking(user, 'hub');
    expect(db.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 'owner' }) }));
    expect(db.vehicle.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: { in: ['owned-vehicle'] },
      OR: [{ homeLocationId: 'hub' }, { currentLocationId: 'hub' }],
    }) }));
  });
});
