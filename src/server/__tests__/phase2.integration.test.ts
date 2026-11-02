process.env.DATABASE_URL =
  'postgresql://postgres:postgres@localhost:5432/car_tracking_test?schema=public';

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import {
  assignVehicle,
  unassignVehicle,
} from '@/server/assignments/service';
import {
  createVehicle,
  deleteVehicle,
} from '@/server/vehicles/service';
import { createDriver } from '@/server/drivers/service';
import { createUser } from '@/server/users/service';
import {
  rateLimit,
  resetRateLimitStore,
  withRateLimit,
} from '@/lib/rate-limit';
import { NextRequest } from 'next/server';
import { RoleCode, VehicleStatus, DriverStatus } from '@prisma/client';

describe('Phase 2 PostgreSQL Integration Tests', () => {
  let adminUserId: string;

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
    // Truncate mutation tables between tests
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE audit_logs, vehicle_assignments, drivers, vehicles, users CASCADE;
    `);

    // Create an admin user for context
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { code: RoleCode.ADMIN },
    });
    const admin = await createUser({
      email: 'admin@integration.test',
      name: 'Admin Tester',
      phone: '0123456789',
      password: 'admin-password-123',
      roleId: adminRole.id,
    });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. assign happy path: sets status, mirrors, and active row', async () => {
    const vehicle = await createVehicle({
      plateNumber: '29A-111.11',
      brand: 'Toyota',
      model: 'Vios',
      vehicleType: 'SEDAN',
      seatingCapacity: 4,
    });

    const driver = await createDriver({
      email: 'driver1@integration.test',
      name: 'Driver One',
      phone: '090111222',
      password: 'password123',
      licenseNumber: 'LIC-001',
    });

    const assignment = await assignVehicle(driver.id, vehicle.id, {
      actorUserId: adminUserId,
      ip: '127.0.0.1',
      userAgent: 'integration-test',
    });

    expect(assignment.vehicleId).toBe(vehicle.id);
    expect(assignment.driverId).toBe(driver.id);
    expect(assignment.unassignedAt).toBeNull();

    // Verify vehicle mirrors
    const updatedVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle.id },
    });
    expect(updatedVehicle.status).toBe(VehicleStatus.RESERVED);
    expect(updatedVehicle.currentDriverId).toBe(driver.id);

    // Verify driver mirrors
    const updatedDriver = await prisma.driver.findUniqueOrThrow({
      where: { id: driver.id },
    });
    expect(updatedDriver.status).toBe(DriverStatus.AVAILABLE);
    expect(updatedDriver.currentVehicleId).toBe(vehicle.id);
  });

  it('2. double-assign same vehicle throws 409 conflict', async () => {
    const vehicle = await createVehicle({
      plateNumber: '29A-222.22',
      brand: 'Honda',
      model: 'City',
      vehicleType: 'SEDAN',
      seatingCapacity: 4,
    });

    const driver1 = await createDriver({
      email: 'driver2a@integration.test',
      name: 'Driver 2A',
      phone: '090222333',
      password: 'password123',
      licenseNumber: 'LIC-002A',
    });

    const driver2 = await createDriver({
      email: 'driver2b@integration.test',
      name: 'Driver 2B',
      phone: '090222444',
      password: 'password123',
      licenseNumber: 'LIC-002B',
    });

    await assignVehicle(driver1.id, vehicle.id, { actorUserId: adminUserId });

    // Attempt second assign on same vehicle
    await expect(
      assignVehicle(driver2.id, vehicle.id, { actorUserId: adminUserId })
    ).rejects.toThrowError(ApiError);

    try {
      await assignVehicle(driver2.id, vehicle.id, { actorUserId: adminUserId });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
    }
  });

  it('3. assign maintenance vehicle throws 409', async () => {
    const vehicle = await createVehicle({
      plateNumber: '29A-333.33',
      brand: 'Ford',
      model: 'Transit',
      vehicleType: 'VAN',
      seatingCapacity: 16,
      status: VehicleStatus.MAINTENANCE,
    });

    const driver = await createDriver({
      email: 'driver3@integration.test',
      name: 'Driver Three',
      phone: '090333444',
      password: 'password123',
      licenseNumber: 'LIC-003',
    });

    await expect(
      assignVehicle(driver.id, vehicle.id, { actorUserId: adminUserId })
    ).rejects.toThrowError(ApiError);

    try {
      await assignVehicle(driver.id, vehicle.id, { actorUserId: adminUserId });
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.code).toBe('VEHICLE_UNAVAILABLE');
    }
  });

  it('4. unassign clears mirrors and resets statuses', async () => {
    const vehicle = await createVehicle({
      plateNumber: '29A-444.44',
      brand: 'Kia',
      model: 'Carnival',
      vehicleType: 'MPV',
      seatingCapacity: 7,
    });

    const driver = await createDriver({
      email: 'driver4@integration.test',
      name: 'Driver Four',
      phone: '090444555',
      password: 'password123',
      licenseNumber: 'LIC-004',
    });

    await assignVehicle(driver.id, vehicle.id, { actorUserId: adminUserId });

    const unassigned = await unassignVehicle(driver.id, 'Shift completed', {
      actorUserId: adminUserId,
    });

    expect(unassigned.unassignedAt).not.toBeNull();
    expect(unassigned.reason).toBe('Shift completed');

    const updatedVehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vehicle.id },
    });
    expect(updatedVehicle.status).toBe(VehicleStatus.AVAILABLE);
    expect(updatedVehicle.currentDriverId).toBeNull();

    const updatedDriver = await prisma.driver.findUniqueOrThrow({
      where: { id: driver.id },
    });
    expect(updatedDriver.status).toBe(DriverStatus.OFFLINE);
    expect(updatedDriver.currentVehicleId).toBeNull();
  });

  it('5. vehicle delete refused (409) while assigned', async () => {
    const vehicle = await createVehicle({
      plateNumber: '29A-555.55',
      brand: 'Hyundai',
      model: 'SantaFe',
      vehicleType: 'SUV',
      seatingCapacity: 7,
    });

    const driver = await createDriver({
      email: 'driver5@integration.test',
      name: 'Driver Five',
      phone: '090555666',
      password: 'password123',
      licenseNumber: 'LIC-005',
    });

    await assignVehicle(driver.id, vehicle.id, { actorUserId: adminUserId });

    await expect(deleteVehicle(vehicle.id)).rejects.toThrowError(ApiError);

    try {
      await deleteVehicle(vehicle.id);
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(409);
      expect(apiErr.code).toBe('VEHICLE_ASSIGNED');
    }
  });

  it('6. rate limit exceeded returns 429', async () => {
    const testKey = 'test-client-ip:/api/test';
    // Consume 3 calls in a window with limit 3
    for (let i = 0; i < 3; i++) {
      const res = rateLimit({ key: testKey, limit: 3, windowMs: 10000 });
      expect(res.success).toBe(true);
    }

    // 4th call must fail
    const exceeded = rateLimit({ key: testKey, limit: 3, windowMs: 10000 });
    expect(exceeded.success).toBe(false);
    expect(exceeded.remaining).toBe(0);

    // Verify withRateLimit middleware wrapper returning 429
    const handler = withRateLimit(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      { limit: 2, windowMs: 10000, keyGenerator: () => 'wrapped-test-key' }
    );

    const req = new NextRequest('http://localhost:3000/api/test');
    const r1 = await handler(req, {});
    expect(r1.status).toBe(200);

    const r2 = await handler(req, {});
    expect(r2.status).toBe(200);

    const r3 = await handler(req, {});
    expect(r3.status).toBe(429);
    const body = await r3.json();
    expect(body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('7. audit row written to DB on assign', async () => {
    const vehicle = await createVehicle({
      plateNumber: '29A-777.77',
      brand: 'Toyota',
      model: 'Camry',
      vehicleType: 'SEDAN',
      seatingCapacity: 5,
    });

    const driver = await createDriver({
      email: 'driver7@integration.test',
      name: 'Driver Seven',
      phone: '090777888',
      password: 'password123',
      licenseNumber: 'LIC-007',
    });

    const assignment = await assignVehicle(driver.id, vehicle.id, {
      actorUserId: adminUserId,
      ip: '10.0.0.1',
      userAgent: 'TestBrowser/1.0',
    });

    const auditRow = await prisma.auditLog.findFirst({
      where: {
        action: 'ASSIGN_VEHICLE',
        entityId: assignment.id,
      },
    });

    expect(auditRow).not.toBeNull();
    expect(auditRow?.actorUserId).toBe(adminUserId);
    expect(auditRow?.entityType).toBe('VehicleAssignment');
    expect(auditRow?.ip).toBe('10.0.0.1');
    expect(auditRow?.userAgent).toBe('TestBrowser/1.0');
  });
});
