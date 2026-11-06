import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BookingStatus, DriverStatus, VehicleStatus } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  bookingCreate: vi.fn(),
  bookingFindUnique: vi.fn(),
  bookingFindUniqueOrThrow: vi.fn(),
  bookingUpdate: vi.fn(),
  bookingCount: vi.fn(),
  locationFindFirst: vi.fn(),
  driverFindUnique: vi.fn(),
  driverFindUniqueOrThrow: vi.fn(),
  driverUpdate: vi.fn().mockResolvedValue({}),
  vehicleFindUnique: vi.fn(),
  vehicleFindUniqueOrThrow: vi.fn(),
  vehicleUpdate: vi.fn(),
  bookingOfferUpdateMany: vi.fn(),
  vehicleAssignmentFindFirst: vi.fn().mockResolvedValue(null),
  vehicleAssignmentCreate: vi.fn().mockResolvedValue({}),
  vehicleAssignmentUpdateMany: vi.fn().mockResolvedValue({}),
  driverSessionFindFirst: vi.fn().mockResolvedValue(null),
  tripFindFirst: vi.fn().mockResolvedValue(null),
  notify: vi.fn(),
  notifyAdmins: vi.fn(),
  transaction: vi.fn(),
  queryRawUnsafe: vi.fn(),
}));

vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/server/notifications/service', () => ({
  notify: mocks.notify,
  notifyAdmins: mocks.notifyAdmins,
}));
vi.mock('@/lib/prisma', () => {
  const db = {
    user: { findUnique: mocks.user, findMany: vi.fn().mockResolvedValue([]) },
    booking: {
      create: mocks.bookingCreate,
      findUnique: mocks.bookingFindUnique,
      findUniqueOrThrow: mocks.bookingFindUniqueOrThrow,
      update: mocks.bookingUpdate,
      count: mocks.bookingCount,
      findFirst: vi.fn().mockResolvedValue(null),
    },
    location: { findFirst: mocks.locationFindFirst },
    driver: {
      findUnique: mocks.driverFindUnique,
      findUniqueOrThrow: mocks.driverFindUniqueOrThrow,
      update: mocks.driverUpdate,
    },
    driverSession: {
      findFirst: mocks.driverSessionFindFirst,
    },
    trip: {
      findFirst: mocks.tripFindFirst,
    },
    vehicle: {
      findUnique: mocks.vehicleFindUnique,
      findUniqueOrThrow: mocks.vehicleFindUniqueOrThrow,
      update: mocks.vehicleUpdate,
    },
    bookingOffer: { updateMany: mocks.bookingOfferUpdateMany },
    vehicleAssignment: {
      findFirst: mocks.vehicleAssignmentFindFirst,
      create: mocks.vehicleAssignmentCreate,
      updateMany: mocks.vehicleAssignmentUpdateMany,
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $queryRawUnsafe: mocks.queryRawUnsafe,
  };

  return {
    prisma: {
      ...db,
      $transaction: (fn: any) =>
        typeof fn === 'function' ? fn(db) : mocks.transaction(fn),
    },
  };
});

import { POST as createBookingRoute } from '@/app/api/bookings/route';
import { POST as manualAssignRoute } from '@/app/api/admin/bookings/[id]/manual-assign/route';

describe('Option 1: Manual Admin Booking & Assignment Workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. POST /api/bookings creates booking in PENDING status without auto-dispatching', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.user.mockResolvedValue({
      id: 'user-1',
      name: 'User KCIC',
      email: 'user@kcic.co.id',
      isActive: true,
      role: { code: 'USER' },
    });
    mocks.locationFindFirst.mockResolvedValue({ id: 'loc-1' });
    mocks.bookingCount.mockResolvedValue(0);

    const createdBooking = {
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      userId: 'user-1',
      status: BookingStatus.PENDING,
      departureAt: new Date(Date.now() + 86400000),
      expectedReturnAt: new Date(Date.now() + 90000000),
      pickupLocation: 'Stasiun Halim',
      destination: 'Kantor KCIC',
      passengerCount: 2,
      purpose: 'Dinas',
      serviceType: 'DROP_OFF',
      user: { id: 'user-1', name: 'User KCIC', email: 'user@kcic.co.id', phone: '0812' },
      vehicle: null,
      operationalLocation: { id: 'loc-1', name: 'Halim', code: 'HLM' },
    };
    mocks.bookingCreate.mockResolvedValue(createdBooking);

    const body = {
      operationalLocationId: 'loc-1',
      pickupLocation: 'Stasiun Halim',
      destination: 'Kantor KCIC',
      departureAt: new Date(Date.now() + 86400000).toISOString(),
      expectedReturnAt: new Date(Date.now() + 90000000).toISOString(),
      passengerCount: 2,
      purpose: 'Dinas',
      serviceType: 'DROP_OFF',
    };

    const req = new NextRequest('http://localhost:3000/api/bookings', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const res = await createBookingRoute(req, undefined as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.status).toBe(BookingStatus.PENDING);

    // Verify admin in-app notification sent
    expect(mocks.notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'BOOKING_CREATED',
      })
    );
  });

  it('2. POST /api/admin/bookings/[id]/manual-assign assigns driver and vehicle directly to PENDING booking', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'admin-1' } });
    mocks.user.mockResolvedValue({
      id: 'admin-1',
      name: 'Admin GA',
      email: 'admin@kcic.co.id',
      isActive: true,
      role: { code: 'ADMIN' },
    });

    mocks.queryRawUnsafe.mockResolvedValue([
      { id: 'bk-1', status: BookingStatus.PENDING },
    ]);

    mocks.bookingFindUniqueOrThrow.mockResolvedValue({
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      status: BookingStatus.PENDING,
      departureAt: new Date(Date.now() + 86400000),
      expectedReturnAt: new Date(Date.now() + 90000000),
      passengerCount: 2,
      vehicleId: null,
      vehiclePreferenceId: null,
      operationalLocation: { id: 'loc-1' },
      userId: 'user-1',
    });

    mocks.driverFindUnique.mockResolvedValue({
      id: 'driver-1',
      userId: 'u-driver',
      currentVehicleId: 'veh-1',
      status: DriverStatus.AVAILABLE,
      user: { id: 'u-driver', isActive: true, name: 'Pak Supir' },
      sessions: [],
    });

    mocks.driverFindUniqueOrThrow.mockResolvedValue({
      id: 'driver-1',
      userId: 'u-driver',
      currentVehicleId: 'veh-1',
      status: DriverStatus.AVAILABLE,
      user: { id: 'u-driver', isActive: true, name: 'Pak Supir' },
      sessions: [],
    });

    mocks.vehicleFindUnique.mockResolvedValue({
      id: 'veh-1',
      plateNumber: 'B 1234 KC',
      status: VehicleStatus.AVAILABLE,
      seatingCapacity: 7,
    });

    mocks.vehicleFindUniqueOrThrow.mockResolvedValue({
      id: 'veh-1',
      plateNumber: 'B 1234 KC',
      status: VehicleStatus.AVAILABLE,
      seatingCapacity: 7,
    });

    mocks.vehicleUpdate.mockResolvedValue({});
    mocks.bookingOfferUpdateMany.mockResolvedValue({ count: 0 });

    const updatedBooking = {
      id: 'bk-1',
      bookingNumber: 'BK-2026-0001',
      status: BookingStatus.DRIVER_ASSIGNED,
      driverId: 'driver-1',
      vehicleId: 'veh-1',
      userId: 'user-1',
      user: { id: 'user-1', name: 'User KCIC', email: 'user@kcic.co.id', phone: '0812' },
      driver: { id: 'driver-1', user: { id: 'u-driver', name: 'Pak Supir' } },
      vehicle: { id: 'veh-1', plateNumber: 'B 1234 KC' },
    };
    mocks.bookingUpdate.mockResolvedValue(updatedBooking);

    const req = new NextRequest('http://localhost:3000/api/admin/bookings/bk-1/manual-assign', {
      method: 'POST',
      body: JSON.stringify({
        driverId: 'driver-1',
        vehicleId: 'veh-1',
      }),
    });

    const res = await manualAssignRoute(req, {
      params: Promise.resolve({ id: 'bk-1' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe(BookingStatus.DRIVER_ASSIGNED);

    // Verify notifications to user and driver
    expect(mocks.notify).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'DRIVER_ASSIGNED' })
    );
    expect(mocks.notify).toHaveBeenCalledWith(
      'u-driver',
      expect.objectContaining({ type: 'TRIP_ASSIGNED' })
    );
  });
});
