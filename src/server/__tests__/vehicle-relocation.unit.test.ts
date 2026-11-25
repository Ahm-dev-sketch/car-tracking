import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '@/lib/auth-guard';

const mocks = vi.hoisted(() => {
  const delegate = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
  });
  return {
    db: {
      location: delegate(),
      vehicle: delegate(),
      driver: delegate(),
      trip: delegate(),
      booking: delegate(),
      vehicleAssignment: delegate(),
      driverSession: delegate(),
      vehicleLocation: delegate(),
      vehicleRelocation: delegate(),
      $queryRawUnsafe: vi.fn(),
    },
    transaction: vi.fn(),
    ensureVehicleAssignment: vi.fn(),
    audit: vi.fn(),
    notify: vi.fn(),
    notifyAdmins: vi.fn(),
    publishEvent: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: { ...mocks.db, $transaction: mocks.transaction },
}));
vi.mock('@/server/assignments/service', () => ({
  ensureVehicleAssignment: mocks.ensureVehicleAssignment,
}));
vi.mock('@/server/audit', () => ({ logAuditEvent: mocks.audit }));
vi.mock('@/server/notifications/service', () => ({
  notify: mocks.notify,
  notifyAdmins: mocks.notifyAdmins,
}));
vi.mock('@/server/realtime/hub', () => ({ publishEvent: mocks.publishEvent }));

import {
  cancelRelocation,
  completeRelocation,
  createRelocation,
  startRelocation,
} from '../relocations/service';

const adminActor: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@kcic.co.id',
  name: 'Admin Fleet',
  role: 'ADMIN',
};

const userActor: AuthenticatedUser = {
  id: 'user-1',
  email: 'staff@kcic.co.id',
  name: 'KCIC Staff',
  role: 'USER',
};

const assignedDriverActor: AuthenticatedUser = {
  id: 'driver-user-1',
  email: 'driver1@kcic.co.id',
  name: 'Driver One',
  role: 'DRIVER',
};

const otherDriverActor: AuthenticatedUser = {
  id: 'driver-user-2',
  email: 'driver2@kcic.co.id',
  name: 'Driver Two',
  role: 'DRIVER',
};

const hubHalim = { id: 'loc-halim', name: 'Stasiun Halim', code: 'HLM', isActive: true };
const hubTegalluar = { id: 'loc-tegalluar', name: 'Stasiun Tegalluar', code: 'TGL', isActive: true };

const baseVehicle = {
  id: 'veh-1',
  plateNumber: 'B 1234 KCC',
  brand: 'Toyota',
  model: 'Innova Zenix',
  status: 'AVAILABLE',
  homeLocationId: hubHalim.id,
  currentLocationId: hubHalim.id,
  currentDriverId: null,
};

const baseDriver = {
  id: 'drv-1',
  userId: assignedDriverActor.id,
  licenseNumber: 'SIM-A-001',
  status: 'OFFLINE',
  currentVehicleId: null,
  user: {
    id: assignedDriverActor.id,
    name: assignedDriverActor.name,
    email: assignedDriverActor.email,
    phone: '08123456789',
    isActive: true,
  },
};

function makeRelocationRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rel-1',
    relocationCode: 'REL-2026-0001',
    vehicleId: baseVehicle.id,
    driverId: baseDriver.id,
    fromLocationId: hubHalim.id,
    toLocationId: hubTegalluar.id,
    status: 'SCHEDULED',
    scheduledAt: new Date('2026-11-26T02:00:00.000Z'),
    departedAt: null,
    completedAt: null,
    notes: 'Rebalancing armada Halim -> Tegalluar',
    createdById: adminActor.id,
    vehicle: {
      ...baseVehicle,
      homeLocation: hubHalim,
      currentOperationalLocation: hubHalim,
    },
    driver: baseDriver,
    fromLocation: hubHalim,
    toLocation: hubTegalluar,
    createdBy: { id: adminActor.id, name: adminActor.name, email: adminActor.email },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(
    async (callback: (tx: typeof mocks.db) => Promise<unknown>) => callback(mocks.db)
  );
  mocks.db.$queryRawUnsafe.mockResolvedValue([]);
  mocks.ensureVehicleAssignment.mockResolvedValue({ id: BigInt(1) });
  mocks.audit.mockResolvedValue(undefined);
  mocks.notify.mockResolvedValue(undefined);
  mocks.notifyAdmins.mockResolvedValue(undefined);
  mocks.publishEvent.mockResolvedValue(undefined);

  mocks.db.vehicle.findUnique.mockResolvedValue(baseVehicle);
  mocks.db.vehicle.update.mockResolvedValue(baseVehicle);
  mocks.db.vehicle.updateMany.mockResolvedValue({ count: 0 });
  mocks.db.driver.findUnique.mockResolvedValue(baseDriver);
  mocks.db.driver.update.mockResolvedValue(baseDriver);
  mocks.db.driver.updateMany.mockResolvedValue({ count: 0 });
  mocks.db.trip.findFirst.mockResolvedValue(null);
  mocks.db.booking.findFirst.mockResolvedValue(null);
  mocks.db.driverSession.findFirst.mockResolvedValue(null);
  mocks.db.driverSession.create.mockResolvedValue({ id: 'sess-1' });
  mocks.db.driverSession.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.vehicleAssignment.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.vehicleLocation.upsert.mockResolvedValue({});
  mocks.db.vehicleLocation.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.vehicleRelocation.count.mockResolvedValue(0);
  mocks.db.vehicleRelocation.findFirst.mockResolvedValue(null);
  mocks.db.location.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === hubHalim.id) return hubHalim;
    if (where.id === hubTegalluar.id) return hubTegalluar;
    return null;
  });
});

describe('Vehicle relocation service RBAC & validation', () => {
  it('forbids non-admin users from creating or cancelling relocations', async () => {
    await expect(
      createRelocation(userActor, {
        vehicleId: baseVehicle.id,
        toLocationId: hubTegalluar.id,
        scheduledAt: new Date('2026-11-26T02:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });

    await expect(cancelRelocation('rel-1', assignedDriverActor)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('rejects relocation when destination hub equals origin hub', async () => {
    await expect(
      createRelocation(adminActor, {
        vehicleId: baseVehicle.id,
        fromLocationId: hubHalim.id,
        toLocationId: hubHalim.id,
        scheduledAt: new Date('2026-11-26T02:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 400, code: 'SAME_LOCATION' });
  });

  it('rejects relocation creation when vehicle is not AVAILABLE', async () => {
    mocks.db.vehicle.findUnique.mockResolvedValue({ ...baseVehicle, status: 'IN_USE' });

    await expect(
      createRelocation(adminActor, {
        vehicleId: baseVehicle.id,
        toLocationId: hubTegalluar.id,
        scheduledAt: new Date('2026-11-26T02:00:00.000Z'),
      })
    ).rejects.toMatchObject({ status: 409, code: 'VEHICLE_UNAVAILABLE' });
  });

  it('requires a driver when startImmediately is true', async () => {
    await expect(
      createRelocation(adminActor, {
        vehicleId: baseVehicle.id,
        toLocationId: hubTegalluar.id,
        scheduledAt: new Date('2026-11-26T02:00:00.000Z'),
        startImmediately: true,
      })
    ).rejects.toMatchObject({ status: 400, code: 'DRIVER_REQUIRED' });
  });

  it('forbids an unassigned driver from starting or completing a relocation', async () => {
    mocks.db.vehicleRelocation.findUnique.mockResolvedValue(
      makeRelocationRecord({ status: 'SCHEDULED' })
    );
    await expect(startRelocation('rel-1', otherDriverActor)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });

    mocks.db.vehicleRelocation.findUnique.mockResolvedValue(
      makeRelocationRecord({ status: 'IN_TRANSIT' })
    );
    await expect(completeRelocation('rel-1', otherDriverActor)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });
});

describe('Vehicle relocation lifecycle transitions & hub transfer automation', () => {
  it('transitions SCHEDULED -> IN_TRANSIT when started by assigned driver and sets vehicle IN_USE', async () => {
    const scheduled = makeRelocationRecord({ status: 'SCHEDULED' });
    const started = makeRelocationRecord({ status: 'IN_TRANSIT', departedAt: new Date() });
    mocks.db.vehicleRelocation.findUnique.mockResolvedValue(scheduled);
    mocks.db.vehicleRelocation.update.mockResolvedValue(started);

    const result = await startRelocation('rel-1', assignedDriverActor, {
      startLat: -6.245,
      startLng: 106.889,
    });

    expect(result.status).toBe('IN_TRANSIT');
    expect(mocks.ensureVehicleAssignment).toHaveBeenCalledWith(
      mocks.db,
      baseDriver.id,
      baseVehicle.id
    );
    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({
      where: { id: baseVehicle.id },
      data: { status: 'IN_USE', currentDriverId: baseDriver.id },
    });
    expect(mocks.db.driver.update).toHaveBeenCalledWith({
      where: { id: baseDriver.id },
      data: { status: 'ON_TRIP', currentVehicleId: baseVehicle.id },
    });
    expect(mocks.db.driverSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: baseDriver.id,
          vehicleId: baseVehicle.id,
          status: 'ACTIVE',
        }),
      })
    );
    expect(mocks.db.vehicleRelocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rel-1' },
        data: expect.objectContaining({
          status: 'IN_TRANSIT',
          driverId: baseDriver.id,
          departedAt: expect.any(Date),
        }),
      })
    );
    expect(mocks.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'location:update' })
    );
  });

  it('transitions IN_TRANSIT -> COMPLETED in one transaction and moves vehicle homeLocationId & currentLocationId to toLocationId', async () => {
    const inTransit = makeRelocationRecord({
      status: 'IN_TRANSIT',
      departedAt: new Date('2026-11-26T02:05:00.000Z'),
    });
    const completed = makeRelocationRecord({
      status: 'COMPLETED',
      departedAt: new Date('2026-11-26T02:05:00.000Z'),
      completedAt: new Date('2026-11-26T04:15:00.000Z'),
      vehicle: {
        ...baseVehicle,
        status: 'AVAILABLE',
        homeLocationId: hubTegalluar.id,
        currentLocationId: hubTegalluar.id,
        homeLocation: hubTegalluar,
        currentOperationalLocation: hubTegalluar,
      },
    });
    mocks.db.vehicleRelocation.findUnique.mockResolvedValue(inTransit);
    mocks.db.vehicleRelocation.update.mockResolvedValue(completed);

    const result = await completeRelocation('rel-1', assignedDriverActor, {
      endLat: -6.963,
      endLng: 107.716,
    });

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('COMPLETED');
    expect(result.vehicle.homeLocationId).toBe(hubTegalluar.id);
    expect(result.vehicle.currentLocationId).toBe(hubTegalluar.id);

    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({
      where: { id: baseVehicle.id },
      data: {
        status: 'AVAILABLE',
        homeLocation: { connect: { id: hubTegalluar.id } },
        currentOperationalLocation: { connect: { id: hubTegalluar.id } },
        currentDriver: { disconnect: true },
      },
    });
    expect(mocks.db.vehicleAssignment.updateMany).toHaveBeenCalledWith({
      where: { vehicleId: baseVehicle.id, driverId: baseDriver.id, unassignedAt: null },
      data: expect.objectContaining({
        unassignedAt: expect.any(Date),
        reason: 'Relocation REL-2026-0001 completed',
      }),
    });
    expect(mocks.db.driverSession.updateMany).toHaveBeenCalledWith({
      where: { driverId: baseDriver.id, vehicleId: baseVehicle.id, status: 'ACTIVE' },
      data: expect.objectContaining({ status: 'ENDED', endedAt: expect.any(Date) }),
    });
    expect(mocks.db.driver.updateMany).toHaveBeenCalledWith({
      where: { id: baseDriver.id, currentVehicleId: baseVehicle.id },
      data: { status: 'OFFLINE', currentVehicleId: null },
    });
    expect(mocks.db.vehicleRelocation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'rel-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          completedAt: expect.any(Date),
        }),
      })
    );
  });

  it('restores vehicle AVAILABLE at origin hub when an IN_TRANSIT relocation is cancelled', async () => {
    const inTransit = makeRelocationRecord({ status: 'IN_TRANSIT', departedAt: new Date() });
    const cancelled = makeRelocationRecord({ status: 'CANCELLED' });
    mocks.db.vehicleRelocation.findUnique.mockResolvedValue(inTransit);
    mocks.db.vehicleRelocation.update.mockResolvedValue(cancelled);

    const result = await cancelRelocation('rel-1', adminActor, { reason: 'Jadwal ditunda' });

    expect(result.status).toBe('CANCELLED');
    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({
      where: { id: baseVehicle.id },
      data: {
        status: 'AVAILABLE',
        currentDriver: { disconnect: true },
      },
    });
  });
});
