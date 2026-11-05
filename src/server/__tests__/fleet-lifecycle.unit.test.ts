import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const delegate = () => ({
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  });
  return {
    db: {
      driver: delegate(),
      user: delegate(),
      vehicle: delegate(),
      vehicleAssignment: delegate(),
      trip: delegate(),
      booking: delegate(),
      driverSession: delegate(),
      vehicleLocation: delegate(),
      $queryRawUnsafe: vi.fn(),
    },
    transaction: vi.fn(),
    audit: vi.fn(),
  };
});

vi.mock('@/lib/prisma', () => ({
  prisma: { ...mocks.db, $transaction: mocks.transaction },
}));
vi.mock('@/server/audit', () => ({ logAuditEvent: mocks.audit }));

import { assignVehicle, unassignVehicle } from '../assignments/service';
import { createDriver, deactivateDriver, updateDriver } from '../drivers/service';
import { createVehicle, deleteVehicle, updateVehicle } from '../vehicles/service';
import { updateUser } from '../users/service';

const user = { id: 'user-1', isActive: true };
const driver = {
  id: 'driver-1', userId: user.id, user, licenseNumber: 'LICENSE-1',
  status: 'OFFLINE', currentVehicleId: null, currentVehicle: null,
};
const vehicle = { id: 'vehicle-1', plateNumber: 'TEST-1', status: 'AVAILABLE', currentDriverId: null };
const assignment = {
  id: BigInt(1), driverId: driver.id, vehicleId: vehicle.id,
  assignedAt: new Date('2026-11-03T00:00:00Z'), unassignedAt: null, reason: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.transaction.mockImplementation(async (callback: (tx: typeof mocks.db) => Promise<unknown>) => callback(mocks.db));
  mocks.db.$queryRawUnsafe.mockResolvedValue([]);
  mocks.db.driver.findUnique.mockResolvedValue(driver);
  mocks.db.driver.findFirst.mockResolvedValue(null);
  mocks.db.driver.update.mockResolvedValue(driver);
  mocks.db.vehicle.findUnique.mockResolvedValue(vehicle);
  mocks.db.vehicle.update.mockResolvedValue(vehicle);
  mocks.db.vehicleAssignment.findFirst.mockResolvedValue(null);
  mocks.db.vehicleAssignment.findUnique.mockResolvedValue(assignment);
  mocks.db.vehicleAssignment.create.mockResolvedValue(assignment);
  mocks.db.vehicleAssignment.update.mockResolvedValue({ ...assignment, unassignedAt: new Date() });
  mocks.db.trip.findFirst.mockResolvedValue(null);
  mocks.db.booking.findFirst.mockResolvedValue(null);
  mocks.db.driverSession.findFirst.mockResolvedValue(null);
  mocks.db.driverSession.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.user.findUnique.mockResolvedValue(user);
  mocks.db.user.update.mockResolvedValue(user);
});

function withAssignment(status = 'RESERVED') {
  mocks.db.driver.findUnique.mockResolvedValue({ ...driver, currentVehicleId: vehicle.id });
  mocks.db.vehicle.findUnique.mockResolvedValue({ ...vehicle, currentDriverId: driver.id, status });
  mocks.db.vehicleAssignment.findFirst.mockResolvedValue(assignment);
}

function expectNoFleetWrites() {
  expect(mocks.db.driver.update).not.toHaveBeenCalled();
  expect(mocks.db.vehicle.update).not.toHaveBeenCalled();
  expect(mocks.db.vehicleAssignment.create).not.toHaveBeenCalled();
  expect(mocks.db.vehicleAssignment.update).not.toHaveBeenCalled();
  expect(mocks.db.user.update).not.toHaveBeenCalled();
  expect(mocks.db.driverSession.updateMany).not.toHaveBeenCalled();
}

describe('Vehicle assignment lifecycle', () => {
  it('releases legacy mirrors even when no assignment history was created', async () => {
    mocks.db.driver.findUnique.mockResolvedValue({ ...driver, currentVehicleId: vehicle.id });
    mocks.db.vehicle.findUnique.mockResolvedValue({ ...vehicle, currentDriverId: driver.id, status: 'RESERVED' });
    mocks.db.vehicleAssignment.create.mockImplementation(async ({ data }) => ({ id: BigInt(2), ...data }));
    const result = await unassignVehicle(driver.id);
    expect(result.id).toBe('2');
    expect(mocks.db.vehicleAssignment.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      driverId: driver.id, vehicleId: vehicle.id, assignedAt: expect.any(Date), unassignedAt: expect.any(Date), reason: 'Reconciled legacy assignment mirrors',
    }) });
    expect(mocks.db.driver.update).toHaveBeenCalledWith({ where: { id: driver.id }, data: { currentVehicleId: null, status: 'OFFLINE' } });
    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({ where: { id: vehicle.id }, data: { currentDriverId: null, status: 'AVAILABLE' } });
  });
  it('locks both rows before reading eligibility and writes both mirrors atomically', async () => {
    const result = await assignVehicle(driver.id, vehicle.id);
    expect(result.id).toBe('1');
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.db.$queryRawUnsafe).toHaveBeenNthCalledWith(1,
      'SELECT id FROM vehicles WHERE id = $1 FOR UPDATE', vehicle.id);
    expect(mocks.db.$queryRawUnsafe).toHaveBeenNthCalledWith(2,
      'SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driver.id);
    expect(mocks.db.$queryRawUnsafe.mock.invocationCallOrder[1])
      .toBeLessThan(mocks.db.driver.findUnique.mock.invocationCallOrder[0]);
    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({
      where: { id: vehicle.id }, data: { status: 'RESERVED', currentDriverId: driver.id },
    });
    expect(mocks.db.driver.update).toHaveBeenCalledWith({
      where: { id: driver.id }, data: { status: 'AVAILABLE', currentVehicleId: vehicle.id },
    });
  });

  it.each([
    [{ ...driver, user: { ...user, isActive: false } }, 'DRIVER_INACTIVE'],
    [{ ...driver, status: 'ON_TRIP' }, 'DRIVER_BUSY'],
    [{ ...driver, currentVehicleId: 'other-vehicle' }, 'DRIVER_ALREADY_ASSIGNED'],
  ])('rejects an ineligible driver without writing', async (record, code) => {
    mocks.db.driver.findUnique.mockResolvedValue(record);
    await expect(assignVehicle(driver.id, vehicle.id)).rejects.toMatchObject({ status: 409, code });
    expectNoFleetWrites();
  });

  it('does not overwrite a mirror-only vehicle assignment', async () => {
    mocks.db.vehicle.findUnique.mockResolvedValue({ ...vehicle, currentDriverId: 'other-driver' });
    await expect(assignVehicle(driver.id, vehicle.id)).rejects.toMatchObject({ code: 'VEHICLE_ALREADY_ASSIGNED' });
    expectNoFleetWrites();
  });

  it.each(['trip', 'driverSession', 'booking'] as const)('rejects assignment with an active %s', async (domain) => {
    mocks.db[domain].findFirst.mockResolvedValue({ id: 'active' });
    await expect(assignVehicle(driver.id, vehicle.id)).rejects.toMatchObject({ status: 409 });
    expectNoFleetWrites();
  });

  it.each(['trip', 'booking'] as const)('cannot unassign during an active %s even with stale status', async (domain) => {
    withAssignment();
    mocks.db[domain].findFirst.mockResolvedValue({ id: 'active' });
    await expect(unassignVehicle(driver.id)).rejects.toMatchObject({ status: 409 });
    expectNoFleetWrites();
  });

  it('rejects an unassignment already closed by another request after locking', async () => {
    withAssignment();
    mocks.db.vehicleAssignment.findUnique.mockResolvedValue({ ...assignment, unassignedAt: new Date() });
    await expect(unassignVehicle(driver.id)).rejects.toMatchObject({ code: 'ASSIGNMENT_CONFLICT' });
    expectNoFleetWrites();
  });

  it('does not clear newer assignment mirrors', async () => {
    withAssignment();
    mocks.db.vehicle.findUnique.mockResolvedValue({ ...vehicle, currentDriverId: 'other-driver' });
    await expect(unassignVehicle(driver.id)).rejects.toMatchObject({ code: 'ASSIGNMENT_CONFLICT' });
    expectNoFleetWrites();
  });

  it.each(['MAINTENANCE', 'INACTIVE', 'AVAILABLE', 'RESERVED'])('unassign preserves %s unless releasing RESERVED', async (status) => {
    withAssignment(status);
    await unassignVehicle(driver.id);
    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({
      where: { id: vehicle.id },
      data: { currentDriverId: null, status: status === 'RESERVED' ? 'AVAILABLE' : status },
    });
    expect(mocks.db.driverSession.updateMany).toHaveBeenCalledWith({
      where: { driverId: driver.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: expect.any(Date) },
    });
    expect(mocks.db.vehicleLocation.updateMany).toHaveBeenCalledWith({ where: { OR: [{ driverId: driver.id }, { vehicleId: vehicle.id }] }, data: { movement: 'OFFLINE' } });
  });

  it('refuses to unassign an IN_USE vehicle even if its trip record is stale', async () => {
    withAssignment('IN_USE');
    await expect(unassignVehicle(driver.id)).rejects.toMatchObject({ code: 'ACTIVE_TRIP' });
    expectNoFleetWrites();
  });
});

describe('Driver status and account lifecycle', () => {
  it('cannot create a phantom ON_TRIP driver', async () => {
    await expect(createDriver({
      email: 'driver@example.test', name: 'Driver', phone: '123', password: 'password123',
      licenseNumber: 'LICENSE-2', status: 'ON_TRIP',
    })).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(['ON_TRIP', 'AVAILABLE', 'OFFLINE'])('cannot take a driver offline while a trip exists (%s mirror)', async (status) => {
    mocks.db.driver.findUnique.mockResolvedValue({ ...driver, status });
    mocks.db.trip.findFirst.mockResolvedValue({ id: 'trip-1' });
    await expect(updateDriver(driver.id, { status: 'OFFLINE' })).rejects.toMatchObject({ code: 'DRIVER_BUSY' });
    expectNoFleetWrites();
  });

  it.each(['AVAILABLE', 'OFFLINE'])('ends online sessions when an idle %s driver is taken offline', async (status) => {
    mocks.db.driver.findUnique.mockResolvedValue({ ...driver, status });
    await updateDriver(driver.id, { status: 'OFFLINE' });
    expect(mocks.db.vehicleLocation.updateMany).toHaveBeenCalledWith({ where: { driverId: driver.id }, data: { movement: 'OFFLINE' } });
    expect(mocks.db.driverSession.updateMany).toHaveBeenCalledWith({
      where: { driverId: driver.id, status: 'ACTIVE' },
      data: { status: 'ENDED', endedAt: expect.any(Date) },
    });
  });

  it('cannot take a driver offline while a booking is committed', async () => {
    mocks.db.driver.findUnique.mockResolvedValue({ ...driver, status: 'AVAILABLE' });
    mocks.db.booking.findFirst.mockResolvedValue({ id: 'booking-1' });
    await expect(updateDriver(driver.id, { status: 'OFFLINE' })).rejects.toMatchObject({ code: 'ACTIVE_BOOKING' });
    expectNoFleetWrites();
  });

  it('cannot make an inactive driver available', async () => {
    mocks.db.driver.findUnique.mockResolvedValue({ ...driver, user: { ...user, isActive: false } });
    await expect(updateDriver(driver.id, { status: 'AVAILABLE' })).rejects.toMatchObject({ code: 'DRIVER_INACTIVE' });
    expectNoFleetWrites();
  });

  it.each(['MAINTENANCE', 'INACTIVE', 'IN_USE'])('cannot make a driver available with a %s vehicle', async (status) => {
    mocks.db.driver.findUnique.mockResolvedValue({
      ...driver, currentVehicleId: vehicle.id, currentVehicle: { ...vehicle, status },
    });
    await expect(updateDriver(driver.id, { status: 'AVAILABLE' })).rejects.toMatchObject({ code: 'VEHICLE_UNAVAILABLE' });
    expectNoFleetWrites();
  });

  const deactivate = [
    ['driver', () => deactivateDriver(driver.id)],
    ['user', () => updateUser(user.id, { isActive: false })],
  ] as const;
  describe.each(deactivate)('deactivation through the %s service', (_name, action) => {
    it.each(['trip', 'booking', 'driverSession'] as const)('rejects active %s despite cleared mirrors', async (domain) => {
      mocks.db[domain].findFirst.mockResolvedValue({ id: 'active' });
      await expect(action()).rejects.toMatchObject({ status: 409 });
      expectNoFleetWrites();
    });

    it('rejects an active assignment', async () => {
      mocks.db.vehicleAssignment.findFirst.mockResolvedValue(assignment);
      await expect(action()).rejects.toMatchObject({ code: 'DRIVER_ASSIGNED' });
      expectNoFleetWrites();
    });

    it('deactivates the idle account and marks the driver offline in one transaction', async () => {
      await action();
      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(mocks.db.user.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: user.id }, data: { isActive: false },
      }));
      expect(mocks.db.driver.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: driver.id }, data: expect.objectContaining({ status: 'OFFLINE' }),
      }));
    });
  });

  it('allows deactivating a non-driver without driver lifecycle checks', async () => {
    mocks.db.driver.findUnique.mockResolvedValue(null);
    await updateUser(user.id, { isActive: false });
    expect(mocks.db.user.update).toHaveBeenCalled();
    expect(mocks.db.trip.findFirst).not.toHaveBeenCalled();
  });
});

describe('Vehicle withdrawal and status lifecycle', () => {
  it('cannot create a phantom IN_USE vehicle', async () => {
    await expect(createVehicle({
      plateNumber: 'TEST-2', brand: 'Toyota', model: 'Test', vehicleType: 'SEDAN',
      seatingCapacity: 4, status: 'IN_USE',
    })).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    expect(mocks.db.vehicle.create).not.toHaveBeenCalled();
  });

  it('cannot manually set IN_USE', async () => {
    await expect(updateVehicle(vehicle.id, { status: 'IN_USE' })).rejects.toMatchObject({ code: 'INVALID_STATUS' });
    expectNoFleetWrites();
  });

  const withdraw = [
    ['delete', () => deleteVehicle(vehicle.id)],
    ['inactive', () => updateVehicle(vehicle.id, { status: 'INACTIVE' })],
    ['maintenance', () => updateVehicle(vehicle.id, { status: 'MAINTENANCE' })],
  ] as const;
  describe.each(withdraw)('%s withdrawal', (_name, action) => {
    it.each(['trip', 'booking', 'driverSession'] as const)('rejects active %s even with stale AVAILABLE status', async (domain) => {
      mocks.db[domain].findFirst.mockResolvedValue({ id: 'active' });
      await expect(action()).rejects.toMatchObject({ status: 409 });
      expectNoFleetWrites();
    });

    it('rejects a mirror-only driver assignment', async () => {
      mocks.db.driver.findFirst.mockResolvedValue(driver);
      await expect(action()).rejects.toMatchObject({ code: 'VEHICLE_ASSIGNED' });
      expectNoFleetWrites();
    });

    it('allows withdrawal of an idle, unassigned vehicle', async () => {
      await action();
      expect(mocks.transaction).toHaveBeenCalledOnce();
      expect(mocks.db.vehicle.update).toHaveBeenCalled();
      expect(mocks.db.$queryRawUnsafe.mock.invocationCallOrder[0])
        .toBeLessThan(mocks.db.vehicle.findUnique.mock.invocationCallOrder[0]);
    });
  });

  it('allows metadata updates during an active trip without changing its status', async () => {
    mocks.db.vehicle.findUnique.mockResolvedValue({ ...vehicle, status: 'IN_USE' });
    await updateVehicle(vehicle.id, { brand: 'Updated brand' });
    expect(mocks.db.vehicle.update).toHaveBeenCalledWith({
      where: { id: vehicle.id }, data: { brand: 'Updated brand' },
    });
  });
});
