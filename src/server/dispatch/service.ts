import { prisma } from '@/lib/prisma';
import { ensureVehicleAssignment } from '@/server/assignments/service';
import { ApiError } from '@/lib/errors';
import { logAuditEvent } from '@/server/audit';
import { notify, notifyAdmins } from '@/server/notifications/service';
import { publishEvent } from '@/server/realtime/hub';
import { haversineDistanceMeters } from '@/server/tracking/service';
import { TRACKING_CONFIG } from '@/server/tracking/config';
import { assertVehicleAvailableForWindow, lockAssignmentDriver } from '@/server/bookings/service';
import { DISPATCH_CONFIG, computeDriverCooldown } from './config';
import {
  Prisma,
  BookingStatus,
  OfferStatus,
  DriverSessionStatus,
  DriverStatus,
  VehicleStatus,
  TripStatus,
  MovementStatus,
} from '@prisma/client';

const publicUserSelect = { id: true, name: true, email: true, phone: true } satisfies Prisma.UserSelect;

export interface DispatchMutationContext {
  actorUserId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CandidateDriver {
  driverId: string;
  userId: string;
  name: string;
  phone: string | null;
  licenseNumber: string;
  vehicleId: string;
  vehiclePlateNumber: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleHomeLocationId: string | null;
  vehicleCurrentLocationId: string | null;
  lat: number | null;
  lng: number | null;
  receivedAt: Date | null;
  etaSeconds: number | null;
  etaEstimated: boolean;
  rank: number;
}

export function calculateEta(
  driverLat: number | null | undefined,
  driverLng: number | null | undefined,
  pickupLat: number | null | undefined,
  pickupLng: number | null | undefined
): { etaSeconds: number | null; etaEstimated: boolean } {
  if (
    driverLat === null ||
    driverLat === undefined ||
    driverLng === null ||
    driverLng === undefined ||
    pickupLat === null ||
    pickupLat === undefined ||
    pickupLng === null ||
    pickupLng === undefined
  ) {
    return { etaSeconds: null, etaEstimated: false };
  }

  const distance = haversineDistanceMeters(driverLat, driverLng, pickupLat, pickupLng);
  const etaSeconds = Math.max(1, Math.round(distance / DISPATCH_CONFIG.etaAvgSpeedMps));
  return { etaSeconds, etaEstimated: true };
}

export function isLocationFresh(
  receivedAt: Date | null | undefined,
  freshnessThreshold: Date
): boolean {
  if (!receivedAt) return false;
  return receivedAt >= freshnessThreshold;
}

export function checkLocationMatch(
  vehicle: { homeLocationId: string | null; currentLocationId: string | null },
  operationalLocationId: string,
  crossLocationDispatch: boolean
): boolean {
  if (crossLocationDispatch) return true;
  return (
    vehicle.homeLocationId === operationalLocationId ||
    vehicle.currentLocationId === operationalLocationId
  );
}

export function isCapacitySufficient(
  seatingCapacity: number,
  passengerCount: number
): boolean {
  return seatingCapacity >= passengerCount;
}

export function isPreferenceMatching(
  vehicleId: string,
  preferredVehicleId: string | null | undefined
): boolean {
  if (!preferredVehicleId) return true;
  return vehicleId === preferredVehicleId;
}

export async function findEligibleCandidates(
  bookingId: string,
  excludeDriverIds: string[] = []
): Promise<{ candidates: CandidateDriver[]; preferenceUnavailableReason?: string; alternatives?: Array<{ id: string; plateNumber: string; brand: string; model: string }> }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      operationalLocation: true,
      vehiclePreference: true,
    },
  });

  if (!booking) {
    throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }

  // Option B: vehiclePreferenceId specified
  if (booking.vehiclePreferenceId) {
    const prefVehicle = await prisma.vehicle.findUnique({
      where: { id: booking.vehiclePreferenceId },
    });

    let isAvailable = false;
    if (prefVehicle && (prefVehicle.status === VehicleStatus.AVAILABLE || prefVehicle.status === VehicleStatus.RESERVED)) {
      const conflict = await prisma.booking.findFirst({
        where: {
          vehicleId: prefVehicle.id,
          id: { not: booking.id },
          status: {
            in: [
              BookingStatus.APPROVED,
              BookingStatus.DRIVER_ASSIGNED,
              BookingStatus.DRIVER_EN_ROUTE,
              BookingStatus.ARRIVED,
              BookingStatus.IN_PROGRESS,
            ],
          },
          departureAt: { lt: booking.expectedReturnAt },
          expectedReturnAt: { gt: booking.departureAt },
        },
      });
      if (!conflict) {
        isAvailable = true;
      }
    }

    if (!isAvailable) {
      // Find alternatives at same operational location with sufficient seating
      const altVehicles = await prisma.vehicle.findMany({
        where: {
          id: { not: booking.vehiclePreferenceId },
          status: VehicleStatus.AVAILABLE,
          seatingCapacity: { gte: booking.passengerCount },
          OR: [
            { homeLocationId: booking.operationalLocationId },
            { currentLocationId: booking.operationalLocationId },
          ],
        },
        select: {
          id: true,
          plateNumber: true,
          brand: true,
          model: true,
        },
        take: 5,
      });

      return {
        candidates: [],
        preferenceUnavailableReason: `Preferred vehicle ${prefVehicle?.plateNumber ?? booking.vehiclePreferenceId} is currently unavailable for this window`,
        alternatives: altVehicles,
      };
    }
  }

  // GPS freshness threshold: idle interval * multiplier
  const maxIdleStaleMs =
    TRACKING_CONFIG.idleIntervalSec * DISPATCH_CONFIG.gpsFreshnessIdleMultiplier * 1000;
  const freshnessThreshold = new Date(Date.now() - maxIdleStaleMs);

  const now = new Date();

  // Drivers in active cooldown or holding a SENT offer for this booking
  const blockedOffers = await prisma.bookingOffer.findMany({
    where: {
      bookingId,
      OR: [
        { status: OfferStatus.SENT },
        { cooldownUntil: { gt: now } },
      ],
    },
    select: { driverId: true },
  });

  // Drivers holding a SENT offer on any booking (prevent simultaneous cross-booking dispatch)
  const busyOffers = await prisma.bookingOffer.findMany({
    where: {
      status: OfferStatus.SENT,
      expiresAt: { gt: now },
    },
    select: { driverId: true },
  });

  const allExcludedIds = Array.from(
    new Set([
      ...excludeDriverIds,
      ...blockedOffers.map((o) => o.driverId),
      ...busyOffers.map((o) => o.driverId),
    ])
  );

  // Active driver sessions
  const activeSessions = await prisma.driverSession.findMany({
    where: {
      status: DriverSessionStatus.ACTIVE,
      driver: {
        status: DriverStatus.AVAILABLE,
        id: { notIn: allExcludedIds },
        user: { isActive: true },
      },
    },
    include: {
      driver: {
        include: {
          user: { select: { id: true, name: true, phone: true } },
          currentVehicle: true,
        },
      },
      vehicle: true,
    },
  });

  const validCandidates: Array<{
    candidate: Omit<CandidateDriver, 'rank'>;
    receivedAt: Date | null;
  }> = [];

  for (const session of activeSessions) {
    const driver = session.driver;

    // Check if driver has conflicting active bookings
    const driverConflict = await prisma.booking.findFirst({
      where: {
        driverId: driver.id,
        id: { not: booking.id },
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
        departureAt: { lt: booking.expectedReturnAt },
        expectedReturnAt: { gt: booking.departureAt },
      },
    });

    if (driverConflict) {
      continue;
    }

    // Vehicle determination: session vehicle, or driver's current vehicle
    const vehicle = session.vehicle ?? driver.currentVehicle;
    if (!vehicle || (vehicle.currentDriverId && vehicle.currentDriverId !== driver.id)) {
      continue;
    }

    // Option B restriction: if vehiclePreferenceId set, vehicle must match
    if (!isPreferenceMatching(vehicle.id, booking.vehiclePreferenceId)) {
      continue;
    }

    // Vehicle status & capacity
    if (vehicle.status !== VehicleStatus.AVAILABLE && vehicle.status !== VehicleStatus.RESERVED) {
      continue;
    }
    if (!isCapacitySufficient(vehicle.seatingCapacity, booking.passengerCount)) {
      continue;
    }

    // Cross-location dispatch rule
    if (
      !checkLocationMatch(
        vehicle,
        booking.operationalLocationId,
        DISPATCH_CONFIG.crossLocationDispatch
      )
    ) {
      continue;
    }

    // Check vehicle conflicting bookings
    const vehicleConflict = await prisma.booking.findFirst({
      where: {
        vehicleId: vehicle.id,
        id: { not: booking.id },
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
        departureAt: { lt: booking.expectedReturnAt },
        expectedReturnAt: { gt: booking.departureAt },
      },
    });

    if (vehicleConflict) {
      continue;
    }

    // GPS location & freshness check
    const vehicleLocation = await prisma.vehicleLocation.findUnique({
      where: { vehicleId: vehicle.id },
    });

    // In active standby sessions, stationary drivers waiting at hubs remain eligible
    // within a 15-minute window even if browser GPS is throttled or stationary.
    const standbyCutoff = new Date(Date.now() - 15 * 60 * 1000);
    const candidateFreshnessThreshold =
      session.status === DriverSessionStatus.ACTIVE ? standbyCutoff : freshnessThreshold;

    // Check freshness: if no location or receivedAt is older than threshold
    if (!vehicleLocation || !isLocationFresh(vehicleLocation.receivedAt, candidateFreshnessThreshold)) {
      continue;
    }

    const { etaSeconds, etaEstimated } = calculateEta(
      vehicleLocation.lat,
      vehicleLocation.lng,
      booking.pickupLat,
      booking.pickupLng
    );

    validCandidates.push({
      candidate: {
        driverId: driver.id,
        userId: driver.user.id,
        name: driver.user.name,
        phone: driver.user.phone,
        licenseNumber: driver.licenseNumber,
        vehicleId: vehicle.id,
        vehiclePlateNumber: vehicle.plateNumber,
        vehicleBrand: vehicle.brand,
        vehicleModel: vehicle.model,
        vehicleHomeLocationId: vehicle.homeLocationId,
        vehicleCurrentLocationId: vehicle.currentLocationId,
        lat: vehicleLocation.lat,
        lng: vehicleLocation.lng,
        receivedAt: vehicleLocation.receivedAt,
        etaSeconds,
        etaEstimated,
      },
      receivedAt: vehicleLocation.receivedAt,
    });
  }

  // Fetch offer history for this booking to calculate priority tiers
  const previousBookingOffers = await prisma.bookingOffer.findMany({
    where: { bookingId },
    select: { driverId: true, sentAt: true },
    orderBy: { sentAt: 'desc' },
  });

  const driverOfferHistory = new Map<string, { count: number; lastSentAt: Date }>();
  for (const prev of previousBookingOffers) {
    const existing = driverOfferHistory.get(prev.driverId);
    if (!existing) {
      driverOfferHistory.set(prev.driverId, { count: 1, lastSentAt: prev.sentAt });
    } else {
      existing.count += 1;
    }
  }

  // Priority Queue Ranking:
  // 1. Fresh candidates (count === 0) first, over repeat candidates (count > 0)
  // 2. Repeat candidates: least attempts count first; tiebreak oldest lastSentAt (round-robin)
  // 3. etaSeconds asc (nulls last)
  // 4. receivedAt freshness desc (newer first)
  // 5. driverId asc (tiebreak)
  validCandidates.sort((a, b) => {
    const historyA = driverOfferHistory.get(a.candidate.driverId);
    const historyB = driverOfferHistory.get(b.candidate.driverId);
    const countA = historyA?.count ?? 0;
    const countB = historyB?.count ?? 0;

    if (countA === 0 && countB > 0) return -1;
    if (countB === 0 && countA > 0) return 1;

    if (countA !== countB) {
      return countA - countB;
    }

    if (countA > 0 && historyA && historyB) {
      const timeA = historyA.lastSentAt.getTime();
      const timeB = historyB.lastSentAt.getTime();
      if (timeA !== timeB) {
        return timeA - timeB; // Oldest offer first (fair round-robin)
      }
    }

    if (a.candidate.etaSeconds !== null && b.candidate.etaSeconds !== null) {
      if (a.candidate.etaSeconds !== b.candidate.etaSeconds) {
        return a.candidate.etaSeconds - b.candidate.etaSeconds;
      }
    } else if (a.candidate.etaSeconds !== null) {
      return -1;
    } else if (b.candidate.etaSeconds !== null) {
      return 1;
    }

    const timeA = a.receivedAt ? a.receivedAt.getTime() : 0;
    const timeB = b.receivedAt ? b.receivedAt.getTime() : 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }

    return a.candidate.driverId.localeCompare(b.candidate.driverId);
  });

  const candidates: CandidateDriver[] = validCandidates.map((item, idx) => ({
    ...item.candidate,
    rank: idx + 1,
  }));

  return { candidates };
}

async function lockSearchingBooking(tx: Prisma.TransactionClient, bookingId: string) {
  const locked = await tx.$queryRawUnsafe<Array<{ id: string; status: BookingStatus }>>(
    'SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', bookingId
  );
  if (!locked.length) {
    throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }
  if (locked[0].status !== BookingStatus.SEARCHING_DRIVER) {
    throw new ApiError(409, 'INVALID_BOOKING_STATUS', 'Booking is no longer searching for a driver');
  }
}

async function assertAssignmentVehicle(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  driverId: string,
  passengerCount: number
) {
  // Call after assertVehicleAvailableForWindow has locked the vehicle.
  const vehicle = await tx.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
  const otherSession = await tx.driverSession.findFirst({
    where: { vehicleId, status: DriverSessionStatus.ACTIVE, driverId: { not: driverId } },
  });
  const otherTrip = await tx.trip.findFirst({
    where: { vehicleId, status: TripStatus.ACTIVE, driverId: { not: driverId } },
  });
  if ((vehicle.currentDriverId && vehicle.currentDriverId !== driverId) || otherSession || otherTrip) {
    throw new ApiError(409, 'VEHICLE_ALREADY_ASSIGNED', 'Vehicle is currently in use by another driver');
  }
  if (!isCapacitySufficient(vehicle.seatingCapacity, passengerCount)) {
    throw new ApiError(409, 'INSUFFICIENT_CAPACITY', 'Vehicle has insufficient passenger capacity');
  }
}

export async function createOffer(
  bookingId: string,
  candidate: CandidateDriver,
  ctx?: DispatchMutationContext
) {
  const offer = await prisma.$transaction(async (tx) => {
    await lockSearchingBooking(tx, bookingId);
    await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', candidate.driverId);
    const activeBookingOffer = await tx.bookingOffer.findFirst({
      where: { bookingId, status: OfferStatus.SENT },
    });
    if (activeBookingOffer) {
      throw new ApiError(409, 'ACTIVE_OFFER_EXISTS', 'An active offer is already pending for this booking');
    }

    const driverActiveOffer = await tx.bookingOffer.findFirst({
      where: { driverId: candidate.driverId, status: OfferStatus.SENT },
    });
    if (driverActiveOffer) {
      throw new ApiError(409, 'DRIVER_BUSY_WITH_OFFER', 'Driver already has an active pending offer');
    }

    const driver = await tx.driver.findUnique({
      where: { id: candidate.driverId },
      include: { user: true, sessions: { where: { status: DriverSessionStatus.ACTIVE }, take: 1 } },
    });
    if (!driver || !driver.user.isActive || driver.status !== DriverStatus.AVAILABLE || !driver.sessions.length) {
      throw new ApiError(409, 'DRIVER_UNAVAILABLE', 'Driver is no longer online and available');
    }
    const expiresAt = new Date(Date.now() + DISPATCH_CONFIG.offerTimeoutSec * 1000);

    const previousAttempts = await tx.bookingOffer.count({
      where: { bookingId },
    });
    if (previousAttempts >= DISPATCH_CONFIG.maxAttempts) {
      throw new ApiError(409, 'MAX_ATTEMPTS_EXCEEDED', 'Dispatch attempt limit reached');
    }
    const attemptNo = previousAttempts + 1;

    const driverPreviousOffers = await tx.bookingOffer.count({
      where: { bookingId, driverId: candidate.driverId },
    });
    const roundNo = driverPreviousOffers + 1;

    const createdOffer = await tx.bookingOffer.create({
      data: {
        bookingId,
        driverId: candidate.driverId,
        attemptNo,
        roundNo,
        status: OfferStatus.SENT,
        expiresAt,
        rank: candidate.rank,
        etaSeconds: candidate.etaSeconds,
        etaEstimated: candidate.etaEstimated,
      },
      include: {
        booking: true,
        driver: { include: { user: { select: publicUserSelect } } },
      },
    });

    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: { status: BookingStatus.DRIVER_NOTIFIED },
    });

    return { ...createdOffer, booking: updatedBooking };
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? null,
    action: 'booking.offer_created',
    entityType: 'BookingOffer',
    entityId: offer.id,
    newValue: {
      offerId: offer.id,
      bookingId,
      driverId: candidate.driverId,
      attemptNo: offer.attemptNo,
      roundNo: offer.roundNo,
      rank: offer.rank,
      expiresAt: offer.expiresAt.toISOString(),
      etaSeconds: offer.etaSeconds,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  await publishEvent({
    type: 'offer',
    data: {
      offerId: offer.id,
      bookingId,
      etaSeconds: offer.etaSeconds,
      etaEstimated: offer.etaEstimated,
      pickupLocation: offer.booking.pickupLocation,
      destination: offer.booking.destination,
      expiresAt: offer.expiresAt.toISOString(),
      driverId: candidate.driverId,
      driverUserId: candidate.userId,
    },
  });

  if (offer.driver?.userId) {
    await notify(offer.driver.userId, {
      type: 'DISPATCH_OFFER',
      title: 'New Trip Offer',
      body: `You have received a ride offer for booking ${offer.booking.bookingNumber}`,
      data: { offerId: offer.id, bookingId },
    });
  }

  return offer;
}

export async function dispatchBooking(
  bookingId: string,
  ctx?: DispatchMutationContext
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { offers: true },
  });

  if (!booking) {
    throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  }

  if (booking.status !== BookingStatus.SEARCHING_DRIVER) {
    throw new ApiError(409, 'INVALID_BOOKING_STATUS', 'Booking is not searching for a driver');
  }

  const { candidates, preferenceUnavailableReason, alternatives } =
    await findEligibleCandidates(bookingId);

  // If vehicle preference was specified but unavailable
  if (preferenceUnavailableReason) {
    const updated = await prisma.$transaction(async (tx) => {
      await lockSearchingBooking(tx, bookingId);
      return tx.booking.update({
        where: { id: bookingId },
        data: {
          status: BookingStatus.NO_DRIVER_AVAILABLE,
          rejectedReason: preferenceUnavailableReason,
        },
        include: { operationalLocation: true },
      });
    });

    await logAuditEvent({
      actorUserId: ctx?.actorUserId ?? null,
      action: 'booking.dispatch_failed',
      entityType: 'Booking',
      entityId: bookingId,
      newValue: {
        status: BookingStatus.NO_DRIVER_AVAILABLE,
        reason: preferenceUnavailableReason,
      },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      booking: updated,
      dispatchState: BookingStatus.NO_DRIVER_AVAILABLE,
      alternatives: alternatives ?? [],
      reason: preferenceUnavailableReason,
    };
  }

  if (candidates.length === 0) {
    const updated = await prisma.$transaction(async (tx) => {
      await lockSearchingBooking(tx, bookingId);
      return tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.NO_DRIVER_AVAILABLE },
        include: { operationalLocation: true },
      });
    });

    await logAuditEvent({
      actorUserId: ctx?.actorUserId ?? null,
      action: 'booking.no_driver_available',
      entityType: 'Booking',
      entityId: bookingId,
      newValue: { status: BookingStatus.NO_DRIVER_AVAILABLE },
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
    });

    return {
      booking: updated,
      dispatchState: BookingStatus.NO_DRIVER_AVAILABLE,
      alternatives: [],
    };
  }

  // Create offer for the top ranked candidate
  const topCandidate = candidates[0];
  const offer = await createOffer(bookingId, topCandidate, ctx);

  return {
    booking: offer.booking,
    offer,
    dispatchState: BookingStatus.DRIVER_NOTIFIED,
  };
}

export async function acceptOffer(
  driverId: string,
  offerId: string,
  ctx?: DispatchMutationContext
) {
  const result = await prisma.$transaction(async (tx) => {
    // 1. Fetch and validate offer
    let offer = await tx.bookingOffer.findUnique({
      where: { id: offerId },
      include: {
        booking: true,
        driver: { include: { user: true } },
      },
    });

    if (!offer) {
      throw new ApiError(404, 'OFFER_NOT_FOUND', 'Offer not found');
    }

    if (offer.driverId !== driverId) {
      throw new ApiError(403, 'FORBIDDEN', 'This offer is not assigned to you');
    }

    if (offer.status !== OfferStatus.SENT) {
      throw new ApiError(409, 'OFFER_NOT_ACTIVE', `Offer is already in status ${offer.status}`);
    }

    if (offer.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'OFFER_EXPIRED', 'Offer has already expired');
    }

    // 2. Lock booking row
    const lockedBookings = await tx.$queryRawUnsafe<
      Array<{ id: string; status: BookingStatus }>
    >('SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', offer.bookingId);

    if (!lockedBookings || lockedBookings.length === 0) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    const currentBookingStatus = lockedBookings[0].status;
    if (
      currentBookingStatus !== BookingStatus.DRIVER_NOTIFIED &&
      currentBookingStatus !== BookingStatus.SEARCHING_DRIVER
    ) {
      throw new ApiError(
        409,
        'INVALID_BOOKING_STATUS',
        `Booking is in status ${currentBookingStatus}, cannot accept offer`
      );
    }

    // The offer may have changed while waiting for the booking lock.
    offer = await tx.bookingOffer.findUniqueOrThrow({
      where: { id: offerId },
      include: { booking: true, driver: { include: { user: true } } },
    });
    if (offer.status !== OfferStatus.SENT) {
      throw new ApiError(409, 'OFFER_NOT_ACTIVE', `Offer is in status ${offer.status}`);
    }
    if (offer.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'OFFER_EXPIRED', 'Offer has already expired');
    }

    // 3. Serialize assignments across bookings, using vehicle-first lock order.
    const { driver, vehicleId: targetVehicleId } = await lockAssignmentDriver(
      tx, driverId, offer.booking.vehicleId ?? offer.booking.vehiclePreferenceId
    );

    if (!driver.user.isActive || driver.status !== DriverStatus.AVAILABLE || !driver.sessions.length) {
      throw new ApiError(409, 'DRIVER_UNAVAILABLE', 'Driver is no longer online and available');
    }

    const driverConflict = await tx.booking.findFirst({
      where: {
        driverId,
        id: { not: offer.bookingId },
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
        departureAt: { lt: offer.booking.expectedReturnAt },
        expectedReturnAt: { gt: offer.booking.departureAt },
      },
    });

    if (driverConflict) {
      throw new ApiError(409, 'DRIVER_CONFLICT', 'Driver has a conflicting booking for this time window');
    }

    // 4. Determine vehicle and assert availability

    if (!targetVehicleId) {
      throw new ApiError(409, 'NO_VEHICLE_ASSIGNED', 'No vehicle found for assignment');
    }

    await assertVehicleAvailableForWindow(
      tx,
      targetVehicleId,
      offer.booking.departureAt,
      offer.booking.expectedReturnAt,
      offer.booking.id,
      false
    );

    await assertAssignmentVehicle(tx, targetVehicleId, driverId, offer.booking.passengerCount);
    if (!isPreferenceMatching(targetVehicleId, offer.booking.vehiclePreferenceId)) {
      throw new ApiError(409, 'VEHICLE_PREFERENCE_MISMATCH', 'Vehicle does not match the booking preference');
    }
    if (offer.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'OFFER_EXPIRED', 'Offer has already expired');
    }

    // 5. Update offer status to ACCEPTED
    const acceptedOffer = await tx.bookingOffer.update({
      where: { id: offerId },
      data: {
        status: OfferStatus.ACCEPTED,
        respondedAt: new Date(),
        cooldownUntil: null,
      },
    });

    // 6. Cancel other offers for this booking
    await tx.bookingOffer.updateMany({
      where: {
        bookingId: offer.bookingId,
        id: { not: offerId },
        status: OfferStatus.SENT,
      },
      data: {
        status: OfferStatus.CANCELLED,
        respondedAt: new Date(),
      },
    });

    await ensureVehicleAssignment(tx, driver.id, targetVehicleId);

    // 7. Update vehicle status to RESERVED and driver's current vehicle
    await tx.vehicle.update({
      where: { id: targetVehicleId },
      data: {
        status: VehicleStatus.RESERVED,
        currentDriverId: driver.id,
      },
    });

    await tx.driver.update({
      where: { id: driver.id },
      data: { currentVehicleId: targetVehicleId },
    });

    // 8. Update booking to DRIVER_ASSIGNED
    const updatedBooking = await tx.booking.update({
      where: { id: offer.bookingId },
      data: {
        status: BookingStatus.DRIVER_ASSIGNED,
        driverId: driver.id,
        vehicleId: targetVehicleId,
      },
      include: {
        user: { select: publicUserSelect },
        vehicle: true,
        driver: { include: { user: { select: publicUserSelect } } },
        operationalLocation: true,
      },
    });

    return { acceptedOffer, updatedBooking, driver, targetVehicleId };
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? result.driver.userId,
    action: 'booking.offer_accepted',
    entityType: 'BookingOffer',
    entityId: offerId,
    newValue: {
      offerId,
      bookingId: result.updatedBooking.id,
      driverId,
      vehicleId: result.targetVehicleId,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  await publishEvent({
    type: 'booking:update',
    data: {
      bookingId: result.updatedBooking.id,
      status: result.updatedBooking.status,
      userId: result.updatedBooking.userId,
    },
  });

  await notify(result.updatedBooking.userId, {
    type: 'DRIVER_ASSIGNED',
    title: 'Driver Assigned',
    body: `Driver has accepted booking ${result.updatedBooking.bookingNumber}`,
    data: { bookingId: result.updatedBooking.id, driverId },
  });

  await notifyAdmins({
    type: 'DRIVER_ASSIGNED',
    title: 'Driver Assigned',
    body: `Driver ${result.driver.user.name} accepted booking ${result.updatedBooking.bookingNumber}`,
    data: { bookingId: result.updatedBooking.id, driverId },
  });

  return { success: true, booking: result.updatedBooking, offer: result.acceptedOffer };
}

export async function rejectOffer(
  driverId: string,
  offerId: string,
  ctx?: DispatchMutationContext
) {
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.bookingOffer.findUnique({
      where: { id: offerId },
      include: { booking: true },
    });

    if (!offer) {
      throw new ApiError(404, 'OFFER_NOT_FOUND', 'Offer not found');
    }

    if (offer.driverId !== driverId) {
      throw new ApiError(403, 'FORBIDDEN', 'Offer not assigned to this driver');
    }

    if (offer.status !== OfferStatus.SENT) {
      throw new ApiError(409, 'OFFER_NOT_ACTIVE', `Offer is in status ${offer.status}`);
    }

    const locked = await tx.$queryRawUnsafe<Array<{ status: BookingStatus }>>(
      'SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', offer.bookingId
    );
    if (!locked.length || locked[0].status !== BookingStatus.DRIVER_NOTIFIED) {
      throw new ApiError(409, 'INVALID_BOOKING_STATUS', 'Booking is no longer waiting for this offer');
    }
    const currentOffer = await tx.bookingOffer.findUniqueOrThrow({ where: { id: offerId } });
    if (currentOffer.status !== OfferStatus.SENT) {
      throw new ApiError(409, 'OFFER_NOT_ACTIVE', `Offer is in status ${currentOffer.status}`);
    }
    if (currentOffer.expiresAt.getTime() <= Date.now()) {
      throw new ApiError(409, 'OFFER_EXPIRED', 'Offer has already expired');
    }

    const driverOffersCount = await tx.bookingOffer.count({
      where: { bookingId: offer.bookingId, driverId },
    });
    const cooldownUntil = computeDriverCooldown(driverOffersCount);

    const updatedOffer = await tx.bookingOffer.update({
      where: { id: offerId },
      data: {
        status: OfferStatus.REJECTED,
        respondedAt: new Date(),
        cooldownUntil,
      },
    });

    const updatedBooking = await tx.booking.update({
      where: { id: offer.bookingId },
      data: { status: BookingStatus.SEARCHING_DRIVER },
    });

    return { updatedOffer, updatedBooking };
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? null,
    action: 'booking.offer_rejected',
    entityType: 'BookingOffer',
    entityId: offerId,
    newValue: {
      offerId,
      bookingId: result.updatedBooking.id,
      driverId,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  // Advance to next candidate immediately if available
  const totalOffersCount = await prisma.bookingOffer.count({
    where: { bookingId: result.updatedBooking.id },
  });

  if (totalOffersCount < DISPATCH_CONFIG.maxAttempts) {
    const { candidates } = await findEligibleCandidates(result.updatedBooking.id);
    if (candidates.length > 0) {
      try {
        await createOffer(result.updatedBooking.id, candidates[0], ctx);
      } catch (error) {
        // The rejection is already committed; cancellation or another sweep may win dispatch.
        if (!(error instanceof ApiError) || error.code !== 'INVALID_BOOKING_STATUS') throw error;
      }
    }
  }

  return { success: true, nextOfferEtaSec: DISPATCH_CONFIG.offerTimeoutSec };
}

export async function dispatchSweep() {
  const now = new Date();

  // (a) Expire SENT offers past expiresAt
  const expiredOffers = await prisma.bookingOffer.findMany({
    where: {
      status: OfferStatus.SENT,
      expiresAt: { lte: now },
    },
    include: { booking: true },
  });

  for (const offer of expiredOffers) {
    try {
      const expired = await prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe('SELECT id FROM bookings WHERE id = $1 FOR UPDATE', offer.bookingId);
        const driverOffersCount = await tx.bookingOffer.count({
          where: { bookingId: offer.bookingId, driverId: offer.driverId },
        });
        const cooldownUntil = computeDriverCooldown(driverOffersCount, now);

        const changed = await tx.bookingOffer.updateMany({
          where: { id: offer.id, status: OfferStatus.SENT, expiresAt: { lte: now } },
          data: { status: OfferStatus.EXPIRED, respondedAt: now, cooldownUntil },
        });
        if (!changed.count) return false;

        await tx.booking.updateMany({
          where: { id: offer.bookingId, status: BookingStatus.DRIVER_NOTIFIED },
          data: { status: BookingStatus.SEARCHING_DRIVER },
        });
        return true;
      });
      if (!expired) continue;

      await logAuditEvent({
        actorUserId: null,
        action: 'booking.offer_expired',
        entityType: 'BookingOffer',
        entityId: offer.id,
        newValue: {
          offerId: offer.id,
          bookingId: offer.bookingId,
          driverId: offer.driverId,
        },
      });
    } catch {
      // Continue next offer on conflict
    }
  }

  // (b) Advance bookings in SEARCHING_DRIVER
  const searchingBookings = await prisma.booking.findMany({
    where: { status: BookingStatus.SEARCHING_DRIVER },
    include: {
      offers: { select: { driverId: true, sentAt: true }, orderBy: { sentAt: 'asc' } },
    },
  });

  const overallTimeoutMs = DISPATCH_CONFIG.overallTimeoutSec * 1000;

  for (const booking of searchingBookings) {
    try {
      const searchStartedAt = booking.offers[0]?.sentAt ?? booking.updatedAt;
      const isTimedOut = searchStartedAt.getTime() < Date.now() - overallTimeoutMs;
      const isMaxAttempts = booking.offers.length >= DISPATCH_CONFIG.maxAttempts;

      if (isTimedOut || isMaxAttempts) {
        // Escalate to ADMIN_INTERVENTION
        await prisma.$transaction(async (tx) => {
          await lockSearchingBooking(tx, booking.id);
          await tx.booking.update({
            where: { id: booking.id },
            data: { status: BookingStatus.ADMIN_INTERVENTION },
          });
        });

        await logAuditEvent({
          actorUserId: null,
          action: 'booking.admin_intervention',
          entityType: 'Booking',
          entityId: booking.id,
          newValue: {
            reason: isTimedOut ? 'OVERALL_TIMEOUT' : 'MAX_ATTEMPTS_EXCEEDED',
            attempts: booking.offers.length,
          },
        });

        await notifyAdmins({
          type: 'ADMIN_INTERVENTION',
          title: 'Admin Intervention Required',
          body: `Booking ${booking.bookingNumber} needs manual driver assignment (${isTimedOut ? 'timeout' : 'max attempts'})`,
          data: { bookingId: booking.id },
        });
        continue;
      }

      // Check next candidates with Priority Queue and Backoff
      const { candidates } = await findEligibleCandidates(booking.id);

      if (candidates.length > 0) {
        await createOffer(booking.id, candidates[0]);
      } else {
        // If 0 total attempts, mark NO_DRIVER_AVAILABLE
        if (booking.offers.length === 0) {
          await prisma.$transaction(async (tx) => {
            await lockSearchingBooking(tx, booking.id);
            await tx.booking.update({
              where: { id: booking.id },
              data: { status: BookingStatus.NO_DRIVER_AVAILABLE },
            });
          });

          await logAuditEvent({
            actorUserId: null,
            action: 'booking.no_driver_available',
            entityType: 'Booking',
            entityId: booking.id,
            newValue: { status: BookingStatus.NO_DRIVER_AVAILABLE },
          });
        }
      }
    } catch {
      // Continue next booking on conflict
    }
  }

  return { sweptAt: now.toISOString() };
}

export async function manualAssignBooking(
  adminId: string,
  bookingId: string,
  driverId: string,
  ctx?: DispatchMutationContext
) {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    include: { role: true },
  });

  if (!admin || admin.role.code !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only administrators can manually assign bookings');
  }

  const result = await prisma.$transaction(async (tx) => {
    const lockedBookings = await tx.$queryRawUnsafe<
      Array<{ id: string; status: BookingStatus }>
    >('SELECT id, status FROM bookings WHERE id = $1 FOR UPDATE', bookingId);

    if (!lockedBookings || lockedBookings.length === 0) {
      throw new ApiError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
    }

    const booking = await tx.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { operationalLocation: true },
    });

    const allowedStatuses: BookingStatus[] = [
      BookingStatus.ADMIN_INTERVENTION,
      BookingStatus.PENDING,
      BookingStatus.SEARCHING_DRIVER,
      BookingStatus.NO_DRIVER_AVAILABLE,
      BookingStatus.APPROVED,
    ];

    if (!allowedStatuses.includes(booking.status)) {
      throw new ApiError(
        409,
        'INVALID_STATUS',
        `Cannot manually assign booking in status ${booking.status}`
      );
    }

    const { driver, vehicleId: targetVehicleId } = await lockAssignmentDriver(
      tx, driverId, booking.vehicleId ?? booking.vehiclePreferenceId
    );

    if (!driver || !driver.user.isActive || driver.status === DriverStatus.ON_TRIP) {
      throw new ApiError(409, 'DRIVER_UNAVAILABLE', 'Driver is on a trip or unavailable');
    }

    const driverConflict = await tx.booking.findFirst({
      where: {
        driverId,
        id: { not: bookingId },
        status: {
          in: [
            BookingStatus.APPROVED,
            BookingStatus.DRIVER_ASSIGNED,
            BookingStatus.DRIVER_EN_ROUTE,
            BookingStatus.ARRIVED,
            BookingStatus.IN_PROGRESS,
          ],
        },
        departureAt: { lt: booking.expectedReturnAt },
        expectedReturnAt: { gt: booking.departureAt },
      },
    });

    if (driverConflict) {
      throw new ApiError(409, 'DRIVER_CONFLICT', 'Driver has a conflicting booking');
    }


    if (!targetVehicleId) {
      throw new ApiError(409, 'NO_VEHICLE_ASSIGNED', 'No vehicle assigned to driver or booking');
    }

    await assertVehicleAvailableForWindow(
      tx,
      targetVehicleId,
      booking.departureAt,
      booking.expectedReturnAt,
      booking.id,
      false
    );

    await assertAssignmentVehicle(tx, targetVehicleId, driverId, booking.passengerCount);

    await ensureVehicleAssignment(tx, driver.id, targetVehicleId);

    // Cancel any pending offers for this booking
    await tx.bookingOffer.updateMany({
      where: { bookingId, status: OfferStatus.SENT },
      data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
    });

    await tx.vehicle.update({
      where: { id: targetVehicleId },
      data: {
        status: VehicleStatus.RESERVED,
        currentDriverId: driver.id,
      },
    });

    await tx.driver.update({
      where: { id: driver.id },
      data: { currentVehicleId: targetVehicleId },
    });

    const updatedBooking = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.DRIVER_ASSIGNED,
        driverId: driver.id,
        vehicleId: targetVehicleId,
      },
      include: {
        user: { select: publicUserSelect },
        vehicle: true,
        driver: { include: { user: { select: publicUserSelect } } },
        operationalLocation: true,
      },
    });

    return { updatedBooking, driver, targetVehicleId };
  });

  await logAuditEvent({
    actorUserId: adminId,
    action: 'booking.manual_assign',
    entityType: 'Booking',
    entityId: bookingId,
    newValue: {
      bookingId,
      driverId,
      vehicleId: result.targetVehicleId,
      assignedBy: adminId,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  await publishEvent({
    type: 'booking:update',
    data: {
      bookingId: result.updatedBooking.id,
      status: result.updatedBooking.status,
      userId: result.updatedBooking.userId,
    },
  });

  await notify(result.updatedBooking.userId, {
    type: 'DRIVER_ASSIGNED',
    title: 'Driver Assigned',
    body: `A driver has been assigned to booking ${result.updatedBooking.bookingNumber}`,
    data: { bookingId: result.updatedBooking.id, driverId },
  });

  if (result.driver.userId) {
    await notify(result.driver.userId, {
      type: 'TRIP_ASSIGNED',
      title: 'Manual Trip Assignment',
      body: `You have been manually assigned to booking ${result.updatedBooking.bookingNumber}`,
      data: { bookingId: result.updatedBooking.id },
    });
  }

  return result.updatedBooking;
}

export async function listCandidates(
  adminId: string,
  bookingId: string
): Promise<CandidateDriver[]> {
  const admin = await prisma.user.findUnique({
    where: { id: adminId },
    include: { role: true },
  });

  if (!admin || admin.role.code !== 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Only administrators can view candidate drivers');
  }

  const { candidates } = await findEligibleCandidates(bookingId);
  return candidates;
}

export async function startDriverSession(
  driverId: string,
  input: { vehicleId?: string | null; startLat?: number | null; startLng?: number | null },
  ctx?: DispatchMutationContext
) {
  const session = await prisma.$transaction(async (tx) => {
    const { driver, vehicleId } = await lockAssignmentDriver(tx, driverId, input.vehicleId);
    if (!driver) {
      throw new ApiError(404, 'DRIVER_NOT_FOUND', 'Driver not found');
    }
    if (!driver.user.isActive) {
      throw new ApiError(403, 'FORBIDDEN', 'Driver account is inactive');
    }
    const activeTrip = await tx.trip.findFirst({ where: { status: TripStatus.ACTIVE, OR: [{ driverId }, ...(vehicleId ? [{ vehicleId }] : [])] } });
    if (driver.status === DriverStatus.ON_TRIP || activeTrip) {
      throw new ApiError(409, 'DRIVER_BUSY', 'Cannot start an idle session while a trip is active');
    }
    const existing = await tx.driverSession.findFirst({
      where: { driverId, status: DriverSessionStatus.ACTIVE },
    });
    if (existing) {
      throw new ApiError(409, 'SESSION_ALREADY_ACTIVE', 'Driver already has an active session');
    }

    if (!vehicleId) {
      throw new ApiError(400, 'VEHICLE_REQUIRED_FOR_TRACKING', 'Select a vehicle by license plate before going online.');
    }
    const otherSession = await tx.driverSession.findFirst({
      where: { vehicleId, status: DriverSessionStatus.ACTIVE, driverId: { not: driverId } },
    });
    if (otherSession) {
      throw new ApiError(409, 'VEHICLE_ALREADY_ASSIGNED', 'Another driver is already online with this vehicle.');
    }
    if (vehicleId) {
      const locked = await tx.$queryRawUnsafe<Array<{ id: string; status: VehicleStatus }>>(
        'SELECT id, status FROM vehicles WHERE id = $1 FOR UPDATE', vehicleId
      );
      if (!locked.length) {
        throw new ApiError(404, 'VEHICLE_NOT_FOUND', 'Vehicle not found');
      }
      if (locked[0].status !== VehicleStatus.AVAILABLE && locked[0].status !== VehicleStatus.RESERVED) {
        throw new ApiError(409, 'VEHICLE_UNAVAILABLE', 'Vehicle is unavailable');
      }
      await assertAssignmentVehicle(tx, vehicleId, driverId, 0);
    }

    await ensureVehicleAssignment(tx, driverId, vehicleId);
    await tx.vehicle.updateMany({ where: { currentDriverId: driverId, id: { not: vehicleId } }, data: { currentDriverId: null } });
    await tx.driver.updateMany({ where: { currentVehicleId: vehicleId, id: { not: driverId } }, data: { currentVehicleId: null } });
    await tx.driver.update({ where: { id: driverId }, data: { status: DriverStatus.AVAILABLE, currentVehicleId: vehicleId } });
    await tx.vehicle.update({ where: { id: vehicleId }, data: { currentDriverId: driverId } });

    if (vehicleId && input.startLat !== null && input.startLat !== undefined && input.startLng !== null && input.startLng !== undefined) {
      const now = new Date();
      await tx.vehicleLocation.upsert({
        where: { vehicleId },
        create: {
          vehicleId,
          driverId,
          lat: input.startLat,
          lng: input.startLng,
          accuracyM: 20,
          movement: MovementStatus.STOPPED,
          recordedAt: now,
          receivedAt: now,
        },
        update: {
          driverId,
          lat: input.startLat,
          lng: input.startLng,
          accuracyM: 20,
          movement: MovementStatus.STOPPED,
          recordedAt: now,
          receivedAt: now,
        },
      });
    }

    return tx.driverSession.create({
      data: {
        driverId,
        vehicleId: vehicleId ?? null,
        status: DriverSessionStatus.ACTIVE,
        startLat: input.startLat ?? null,
        startLng: input.startLng ?? null,
      },
      include: {
        vehicle: true,
        driver: { include: { user: { select: publicUserSelect } } },
      },
    });
  });

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? session.driver.userId,
    action: 'driver.session_start',
    entityType: 'DriverSession',
    entityId: session.id,
    newValue: {
      sessionId: session.id,
      driverId,
      vehicleId: session.vehicleId,
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  return session;
}

export async function endDriverSession(
  driverId: string,
  ctx?: DispatchMutationContext
) {
  const { session, ended, offers } = await prisma.$transaction(async (tx) => {
    // Driver-only lock: never acquire booking or vehicle locks in this transaction.
    await tx.$queryRawUnsafe('SELECT id FROM drivers WHERE id = $1 FOR UPDATE', driverId);
    const activeTrip = await tx.trip.findFirst({ where: { driverId, status: TripStatus.ACTIVE } });
    if (activeTrip) {
      throw new ApiError(409, 'DRIVER_BUSY', 'Abort or end the active trip before going offline');
    }
    const session = await tx.driverSession.findFirst({
      where: { driverId, status: DriverSessionStatus.ACTIVE },
      include: { driver: true },
    });
    if (!session) {
      throw new ApiError(404, 'NO_ACTIVE_SESSION', 'No active session found for driver');
    }
    const ended = await tx.driverSession.update({
      where: { id: session.id },
      data: { status: DriverSessionStatus.ENDED, endedAt: new Date() },
    });
    await tx.vehicleAssignment.updateMany({
      where: { unassignedAt: null, OR: [{ driverId }, ...(session.vehicleId ? [{ vehicleId: session.vehicleId }] : [])] },
      data: { unassignedAt: new Date(), reason: 'Driver session ended; released to pool' },
    });
    await tx.driver.update({ where: { id: driverId }, data: { status: DriverStatus.OFFLINE, currentVehicleId: null } });
    if (session.vehicleId) {
      await tx.vehicle.updateMany({
        where: { id: session.vehicleId, currentDriverId: driverId },
        data: { currentDriverId: null },
      });
    }
    await tx.vehicleLocation.updateMany({ where: { driverId }, data: { movement: MovementStatus.OFFLINE } });
    if (session.vehicleId) {
      await tx.vehicleLocation.updateMany({
        where: { vehicleId: session.vehicleId },
        data: {
          movement: MovementStatus.OFFLINE,
          speedMps: 0,
          recordedAt: new Date(),
          receivedAt: new Date(),
        },
      });
    }
    const offers = await tx.bookingOffer.findMany({
      where: { driverId, status: OfferStatus.SENT },
      select: { id: true, bookingId: true },
    });
    return { session, ended, offers };
  });

  // Release the driver lock before touching bookings; include expired SENT offers too.
  for (const offer of offers) {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe('SELECT id FROM bookings WHERE id = $1 FOR UPDATE', offer.bookingId);
      const cancelled = await tx.bookingOffer.updateMany({
        where: { id: offer.id, driverId, status: OfferStatus.SENT },
        data: { status: OfferStatus.CANCELLED, respondedAt: new Date() },
      });
      if (cancelled.count) {
        await tx.booking.updateMany({
          where: { id: offer.bookingId, status: BookingStatus.DRIVER_NOTIFIED },
          data: { status: BookingStatus.SEARCHING_DRIVER },
        });
      }
    });
  }

  await logAuditEvent({
    actorUserId: ctx?.actorUserId ?? session.driver.userId,
    action: 'driver.session_end',
    entityType: 'DriverSession',
    entityId: session.id,
    newValue: {
      sessionId: session.id,
      driverId,
      endedAt: ended.endedAt?.toISOString(),
    },
    ip: ctx?.ip,
    userAgent: ctx?.userAgent,
  });

  if (session.vehicleId) {
    try {
      const loc = await prisma.vehicleLocation.findUnique({
        where: { vehicleId: session.vehicleId },
        include: { vehicle: true },
      });
      if (loc) {
        const now = new Date();
        await publishEvent({
          type: 'location:update',
          data: {
            vehicleId: session.vehicleId,
            lat: loc.lat,
            lng: loc.lng,
            accuracyM: loc.accuracyM,
            speedMps: 0,
            headingDeg: loc.headingDeg ?? null,
            recordedAt: now.toISOString(),
            receivedAt: now.toISOString(),
            movement: MovementStatus.OFFLINE,
            driverName: null,
            driverPhone: null,
            plateNumber: loc.vehicle?.plateNumber ?? null,
            tripOrigin: null,
            tripDestination: null,
          },
        });
      }
    } catch {
      // Non-blocking realtime event notification
    }
  }

  return ended;
}

export async function getActiveDriverSession(driverId: string) {
  return prisma.driverSession.findFirst({
    where: { driverId, status: DriverSessionStatus.ACTIVE },
    include: {
      vehicle: true,
    },
  });
}

export async function getDriverOffers(driverId: string) {
  return prisma.bookingOffer.findMany({
    where: {
      driverId,
      status: OfferStatus.SENT,
      expiresAt: { gt: new Date() },
      booking: { status: BookingStatus.DRIVER_NOTIFIED },
    },
    orderBy: { sentAt: 'desc' },
    include: {
      booking: {
        include: {
          operationalLocation: true,
          vehicle: true,
        },
      },
    },
  });
}

export async function getAdminStats() {
  const [
    vehicles,
    activeSessions,
    onTripDrivers,
    offlineDrivers,
    bookings,
    locations,
  ] = await Promise.all([
    prisma.vehicle.findMany({
      select: {
        id: true,
        status: true,
        homeLocationId: true,
        currentLocationId: true,
      },
    }),
    prisma.driverSession.findMany({
      where: { status: DriverSessionStatus.ACTIVE },
      select: {
        driverId: true,
        vehicleId: true,
        vehicle: { select: { homeLocationId: true, currentLocationId: true } },
      },
    }),
    prisma.driver.count({ where: { status: DriverStatus.ON_TRIP } }),
    prisma.driver.count({ where: { status: DriverStatus.OFFLINE } }),
    prisma.booking.findMany({
      select: {
        id: true,
        status: true,
        operationalLocationId: true,
      },
    }),
    prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
    }),
  ]);

  const vehicleStats = {
    total: vehicles.length,
    available: vehicles.filter((v) => v.status === VehicleStatus.AVAILABLE).length,
    reserved: vehicles.filter((v) => v.status === VehicleStatus.RESERVED).length,
    inUse: vehicles.filter((v) => v.status === VehicleStatus.IN_USE).length,
    maintenance: vehicles.filter((v) => v.status === VehicleStatus.MAINTENANCE).length,
    inactive: vehicles.filter((v) => v.status === VehicleStatus.INACTIVE).length,
  };

  const onlineDriversCount = activeSessions.length;
  const driverStats = {
    online: onlineDriversCount,
    busy: onTripDrivers,
    offline: offlineDrivers,
  };

  const bookingStats = {
    active: bookings.filter((b) =>
      (
        [
          BookingStatus.DRIVER_ASSIGNED,
          BookingStatus.DRIVER_EN_ROUTE,
          BookingStatus.ARRIVED,
          BookingStatus.IN_PROGRESS,
        ] as BookingStatus[]
      ).includes(b.status)
    ).length,
    searching: bookings.filter((b) =>
      (
        [BookingStatus.SEARCHING_DRIVER, BookingStatus.DRIVER_NOTIFIED] as BookingStatus[]
      ).includes(b.status)
    ).length,
    unassigned: bookings.filter((b) =>
      (
        [BookingStatus.PENDING, BookingStatus.NO_DRIVER_AVAILABLE] as BookingStatus[]
      ).includes(b.status)
    ).length,
    adminIntervention: bookings.filter(
      (b) => b.status === BookingStatus.ADMIN_INTERVENTION
    ).length,
  };

  const byLocation = locations.map((loc) => {
    const locVehiclesList = vehicles.filter(
      (v) => v.homeLocationId === loc.id || v.currentLocationId === loc.id
    );
    const locVehicles = locVehiclesList.length;
    const locAvailable = locVehiclesList.filter((v) => v.status === VehicleStatus.AVAILABLE).length;
    const locInUse = locVehiclesList.filter((v) => v.status === VehicleStatus.IN_USE).length;
    const locReserved = locVehiclesList.filter((v) => v.status === VehicleStatus.RESERVED).length;
    const locMaintenance = locVehiclesList.filter((v) => v.status === VehicleStatus.MAINTENANCE).length;
    const inUseCount = locInUse + locReserved;
    const maxCapacity = locVehicles;
    const remainingCapacity = Math.max(0, locAvailable);
    const utilizationRate = maxCapacity > 0 ? Math.round((inUseCount / maxCapacity) * 100) : 0;

    const locDrivers = activeSessions.filter((s) => {
      const v = s.vehicle;
      return v && (v.homeLocationId === loc.id || v.currentLocationId === loc.id);
    }).length;

    const locBookings = bookings.filter(
      (b) =>
        b.operationalLocationId === loc.id &&
        !(
          [
            BookingStatus.COMPLETED,
            BookingStatus.CANCELLED,
            BookingStatus.REJECTED,
          ] as BookingStatus[]
        ).includes(b.status)
    ).length;

    const locPending = bookings.filter(
      (b) =>
        b.operationalLocationId === loc.id &&
        (
          [
            BookingStatus.PENDING,
            BookingStatus.SEARCHING_DRIVER,
            BookingStatus.DRIVER_NOTIFIED,
            BookingStatus.ADMIN_INTERVENTION,
          ] as BookingStatus[]
        ).includes(b.status)
    ).length;

    return {
      locationId: loc.id,
      name: loc.name,
      code: loc.code,
      vehicles: locVehicles,
      drivers: locDrivers,
      bookings: locBookings,
      maxCapacity,
      inUseVehicles: inUseCount,
      availableVehicles: locAvailable,
      maintenanceVehicles: locMaintenance,
      remainingCapacity,
      utilizationRate,
      pendingRequests: locPending,
    };
  });

  return {
    vehicles: vehicleStats,
    drivers: driverStats,
    bookings: bookingStats,
    byLocation,
  };
}
