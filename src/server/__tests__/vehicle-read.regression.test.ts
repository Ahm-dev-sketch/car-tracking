import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  vehicle: vi.fn(),
  vehicles: vi.fn(),
  count: vi.fn(),
  booking: vi.fn(),
  bookings: vi.fn(),
}));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user },
    vehicle: { findUnique: mocks.vehicle, findMany: mocks.vehicles, count: mocks.count },
    booking: { findFirst: mocks.booking, findMany: mocks.bookings },
  },
}));
vi.mock('@/server/audit', () => ({ logAuditEvent: vi.fn() }));

import { getVehicleById, listVehicles } from '../vehicles/service';
import { GET } from '../../app/api/vehicles/[id]/route';

const admin = { id: 'admin-user', role: 'ADMIN' };
const owner = { id: 'booking-owner', role: 'USER' };
const unrelated = { id: 'unrelated-user', role: 'USER' };
const driverActor = { id: 'driver-user', role: 'DRIVER' };
const currentDriver = {
  id: 'driver-1', licenseNumber: 'PRIVATE-LICENSE', status: 'AVAILABLE',
  user: { id: driverActor.id, name: 'Driver Name', phone: 'PRIVATE-PHONE' },
};
const assignment = {
  id: BigInt(42), driverId: currentDriver.id, assignedAt: new Date('2026-11-03T00:00:00Z'),
  driver: currentDriver,
};
const vehicle = {
  id: 'vehicle-1', plateNumber: 'TEST-1', brand: 'Toyota', model: 'Test',
  seatingCapacity: 7, status: 'RESERVED', currentDriver, assignments: [assignment],
};
const visibleStatuses = ['APPROVED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.vehicle.mockResolvedValue(vehicle);
  mocks.vehicles.mockResolvedValue([vehicle]);
  mocks.count.mockResolvedValue(1);
  mocks.booking.mockResolvedValue(null);
  mocks.bookings.mockResolvedValue([]);
  mocks.auth.mockResolvedValue({ user: { id: unrelated.id, role: 'ADMIN' } });
  mocks.user.mockResolvedValue({ ...unrelated, isActive: true, role: { code: 'USER' } });
});

function expectRedacted(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain('PRIVATE-PHONE');
  expect(serialized).not.toContain('PRIVATE-LICENSE');
  expect(serialized).not.toContain('"assignments"');
}

describe('Vehicle detail driver privacy', () => {
  it.each([unrelated, { id: 'other-driver-user', role: 'DRIVER' }])(
    'redacts both current-driver and assignment contacts for an unrelated actor', async (actor) => {
      const result = await getVehicleById(vehicle.id, actor);
      expect(result.currentDriver).toEqual({
        ...currentDriver, licenseNumber: 'REDACTED', user: { ...currentDriver.user, phone: 'REDACTED' },
      });
      expect(result.currentAssignment).toEqual({
        id: '42', assignedAt: assignment.assignedAt, driverId: currentDriver.id,
        driverName: currentDriver.user.name, driverPhone: 'REDACTED', licenseNumber: 'REDACTED',
      });
      expectRedacted(result);
      expect(currentDriver.user.phone).toBe('PRIVATE-PHONE');
    }
  );

  it.each([admin, driverActor])('preserves contacts for the admin or the driver themselves', async (actor) => {
    const result = await getVehicleById(vehicle.id, actor);
    expect(result.currentDriver).toEqual(currentDriver);
    expect(result.currentAssignment?.driverPhone).toBe('PRIVATE-PHONE');
    expect(result.currentAssignment?.licenseNumber).toBe('PRIVATE-LICENSE');
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it('allows only the owner of an active booking linked to this vehicle', async () => {
    mocks.booking.mockResolvedValue({ id: 'active-booking' });
    const result = await getVehicleById(vehicle.id, owner);
    expect(result.currentDriver).toEqual(currentDriver);
    expect(result.currentAssignment?.driverPhone).toBe('PRIVATE-PHONE');
    expect(mocks.booking).toHaveBeenCalledWith({
      where: { userId: owner.id, vehicleId: vehicle.id, status: { in: visibleStatuses } },
      select: { id: true },
    });
  });

  it('does not grant a driver access to a different assignment through their own current-driver mirror', async () => {
    mocks.vehicle.mockResolvedValue({
      ...vehicle,
      assignments: [{ ...assignment, driver: {
        ...currentDriver, user: { ...currentDriver.user, id: 'other-driver-user' },
      } }],
    });
    const result = await getVehicleById(vehicle.id, driverActor);
    expect(result.currentDriver?.user.phone).toBe('PRIVATE-PHONE');
    expect(result.currentAssignment?.driverPhone).toBe('REDACTED');
    expect(result.currentAssignment?.licenseNumber).toBe('REDACTED');
  });

  it('redacts assignment contacts when the current-driver mirror is empty', async () => {
    mocks.vehicle.mockResolvedValue({ ...vehicle, currentDriver: null });
    const result = await getVehicleById(vehicle.id, unrelated);
    expect(result.currentDriver).toBeNull();
    expect(result.currentAssignment?.driverPhone).toBe('REDACTED');
    expectRedacted(result);
  });

  it('preserves null relations', async () => {
    mocks.vehicle.mockResolvedValue({ ...vehicle, currentDriver: null, assignments: [] });
    const result = await getVehicleById(vehicle.id, unrelated);
    expect(result.currentDriver).toBeNull();
    expect(result.currentAssignment).toBeNull();
  });

  it('preserves trusted internal calls without an actor', async () => {
    const result = await getVehicleById(vehicle.id);
    expect(result.currentDriver).toEqual(currentDriver);
    expect(result.currentAssignment?.driverPhone).toBe('PRIVATE-PHONE');
    expect(mocks.booking).not.toHaveBeenCalled();
  });

  it('preserves not-found behavior', async () => {
    mocks.vehicle.mockResolvedValue(null);
    await expect(getVehicleById('missing', unrelated)).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('Vehicle list privacy and capacity', () => {
  it('redacts non-admin lists without actor context and omits raw/serialized assignments', async () => {
    const result = await listVehicles({ isAdmin: false });
    expect(result.data[0].currentDriver?.user.phone).toBe('REDACTED');
    expect(result.data[0].currentDriver?.licenseNumber).toBe('REDACTED');
    expect(result.data[0]).not.toHaveProperty('currentAssignment');
    expectRedacted(result);
  });

  it('retains trusted admin response structures and assignment serialization', async () => {
    const result = await listVehicles({ isAdmin: true });
    expect(result.data[0].currentDriver).toEqual(currentDriver);
    expect(result.data[0]).toHaveProperty('currentAssignment', {
      id: '42', assignedAt: assignment.assignedAt, driverId: currentDriver.id,
      driverName: currentDriver.user.name, driverPhone: 'PRIVATE-PHONE', licenseNumber: 'PRIVATE-LICENSE',
    });
    expect(result.data[0]).not.toHaveProperty('assignments');
  });

  it('uses the actor role rather than a contradictory isAdmin flag', async () => {
    const result = await listVehicles({ actor: unrelated, isAdmin: true });
    expectRedacted(result);
    expect(result.data[0]).not.toHaveProperty('currentAssignment');
    expect(mocks.vehicles).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { not: 'INACTIVE' } },
    }));
  });

  it('allows driver-own contact information when actor context is supplied', async () => {
    const result = await listVehicles({ actor: driverActor });
    expect(result.data[0].currentDriver).toEqual(currentDriver);
    expect(mocks.bookings).not.toHaveBeenCalled();
  });

  it('queries owner permissions in one batch and never grants access to another vehicle', async () => {
    mocks.vehicles.mockResolvedValue([vehicle, { ...vehicle, id: 'vehicle-2' }]);
    mocks.count.mockResolvedValue(2);
    mocks.bookings.mockResolvedValue([{ vehicleId: vehicle.id }]);
    const result = await listVehicles({ actor: owner });
    expect(result.data[0].currentDriver).toEqual(currentDriver);
    expect(result.data[1].currentDriver?.user.phone).toBe('REDACTED');
    expect(result.data[1].currentDriver?.licenseNumber).toBe('REDACTED');
    expect(mocks.bookings).toHaveBeenCalledOnce();
    expect(mocks.bookings).toHaveBeenCalledWith({
      where: {
        userId: owner.id, vehicleId: { in: ['vehicle-1', 'vehicle-2'] },
        status: { in: visibleStatuses },
      },
      select: { vehicleId: true },
    });
  });

  it.each([4, 5, 7, 10])('treats %s+ seats as minimum capacity in both count and list queries', async (seats) => {
    await listVehicles({ seats });
    expect(mocks.count).toHaveBeenCalledWith({
      where: { status: { not: 'INACTIVE' }, seatingCapacity: { gte: seats } },
    });
    expect(mocks.vehicles).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: { not: 'INACTIVE' }, seatingCapacity: { gte: seats } },
    }));
  });
});

describe('Public vehicle detail route', () => {
  const request = () => new NextRequest('http://localhost/api/vehicles/vehicle-1');
  const context = () => ({ params: Promise.resolve({ id: vehicle.id }) });

  it('passes the revalidated actor and does not trust an old ADMIN JWT', async () => {
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.currentDriver.user.phone).toBe('REDACTED');
    expect(body.data.currentAssignment.driverPhone).toBe('REDACTED');
    expectRedacted(body);
  });

  it('allows the active booking owner through the public route', async () => {
    mocks.auth.mockResolvedValue({ user: { id: owner.id, role: 'USER' } });
    mocks.user.mockResolvedValue({ ...owner, isActive: true, role: { code: 'USER' } });
    mocks.booking.mockResolvedValue({ id: 'active-booking' });
    const response = await GET(request(), context());
    expect(response.status).toBe(200);
    expect((await response.json()).data.currentDriver.user.phone).toBe('PRIVATE-PHONE');
  });

  it('rejects a deactivated account before reading vehicle data', async () => {
    mocks.user.mockResolvedValue({ ...unrelated, isActive: false, role: { code: 'ADMIN' } });
    const response = await GET(request(), context());
    expect(response.status).toBe(401);
    expect(mocks.vehicle).not.toHaveBeenCalled();
  });
});
