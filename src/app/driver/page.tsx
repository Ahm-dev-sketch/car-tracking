'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useGeolocation, GeoPoint } from '@/hooks/useGeolocation';
import { useRealtime } from '@/hooks/useRealtime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { IosInstallHint } from '@/components/providers/InstallPrompt';
import { OfferCard, DriverOffer } from '@/components/driver/OfferCard';
import { FleetMap, VehicleMarkerData, RoutePoint } from '@/components/map';
import { Icon } from '@/components/ui/Icon';
import { GreetingClock } from '@/components/ui/GreetingClock';
import { fetchJson } from '@/lib/fetch-json';
import { saveSnapshot, getSnapshot, enqueueOfflineAction, processOfflineQueue } from '@/lib/offline-sync';
import { TripCommunicationWidget } from '@/components/communication/TripCommunicationWidget';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateStatus } from '@/lib/i18n';
import { formatBookingDateTime } from '@/lib/booking-time';

interface ActiveTrip {
  id: string;
  status: string;
  startedAt: string;
  startLat: number;
  startLng: number;
  vehicle: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  };
  booking?: {
    id: string;
    bookingNumber: string;
    pickupLocation: string;
    destination: string;
    status?: string;
    passengerCount?: number;
    pickupLat?: number | null;
    pickupLng?: number | null;
    destinationLat?: number | null;
    destinationLng?: number | null;
    user?: {
      id: string;
      name: string;
      phone?: string | null;
    } | null;
  } | null;
}

interface AssignedBooking {
  id: string;
  bookingNumber: string;
  pickupLocation: string;
  destination: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  departureAt: string;
  purpose: string;
  passengerCount: number;
  status: string;
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  } | null;
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

interface VehicleOption {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  status: string;
  seatingCapacity: number;
  homeLocation?: { id: string; name: string; code: string } | null;
  currentOperationalLocation?: { id: string; name: string; code: string } | null;
}

interface DashboardConfig {
  config?: { tripIntervalSec?: number; idleIntervalSec?: number };
  sessionState: { activeTrip: ActiveTrip | null; activeSession: DriverSession | null };
  realtimeToken?: string | null;
}

interface DriverSession {
  id: string;
  driverId: string;
  vehicleId?: string | null;
  status: string;
  startedAt: string;
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  } | null;
}

interface DriverRelocation {
  id: string;
  relocationCode: string;
  status: 'SCHEDULED' | 'IN_TRANSIT' | string;
  scheduledAt: string;
  departedAt?: string | null;
  notes?: string | null;
  vehicle: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    status: string;
  };
  fromLocation: LocationOption;
  toLocation: LocationOption;
}

// Offline-first safe cache read/write (storage failures are non-fatal to the driver flow)
function readSnapshot<T>(key: string): T | null {
  try {
    return getSnapshot<T>(key) ?? null;
  } catch {
    return null;
  }
}

function writeSnapshot<T>(key: string, data: T): void {
  try {
    saveSnapshot<T>(key, data);
  } catch {
    // Cache writes are best-effort; never block the driver flow.
  }
}

// Network failure (fetch TypeError) or the browser reporting itself offline.
function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return error instanceof TypeError;
}

function TripRoute({ pickup, destination }: { pickup: string; destination: string }) {
  const { t } = useTranslation();
  return (
    <div className="relative space-y-4 py-1 pl-7">
      <span
        aria-hidden="true"
        className="absolute bottom-2.5 left-[5px] top-3 border-l border-dashed border-slate-300"
      />
      <div className="relative min-w-0">
        <span
          aria-hidden="true"
          className="absolute -left-7 top-1.5 size-2.5 rounded-full bg-slate-300 dark:bg-slate-500 ring-2 ring-white dark:ring-[#1e293b]"
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t.driverPages.console.pickupLabel}</p>
        <p className="mt-1 wrap-anywhere text-sm font-medium leading-snug text-slate-600">{pickup}</p>
      </div>
      <div className="relative min-w-0">
        <span
          aria-hidden="true"
          className="absolute -left-7 top-1.5 size-2.5 rounded-full bg-brand-600 ring-2 ring-white dark:ring-[#1e293b]"
        />
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{t.driverPages.console.destinationLabel}</p>
        <p className="mt-1 wrap-anywhere text-base font-semibold leading-snug tracking-tight text-slate-900">
          {destination}
        </p>
      </div>
    </div>
  );
}

export default function DriverDashboardPage() {
  const { locale, t, format } = useTranslation();
  const dateLocale = locale === 'id' ? 'id-ID' : 'en-US';
  const tRef = useRef(t);
  tRef.current = t;
  const { data: session, status } = useSession();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [assignedBookings, setAssignedBookings] = useState<AssignedBooking[]>([]);
  const [activeSession, setActiveSession] = useState<DriverSession | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [tripIntervalSec, setTripIntervalSec] = useState(5);
  const [idleIntervalSec, setIdleIntervalSec] = useState(25);
  const lastPoolFetchLocationRef = useRef<string | undefined>('__UNLOADED__');
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [realtimeToken, setRealtimeToken] = useState<string | undefined>(undefined);

  // Online toggle state
  const isOnline = Boolean(activeSession && activeSession.status === 'ACTIVE');
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);

  // Manual vehicle start trip
  const [manualPlate, setManualPlate] = useState('');
  const [matchingVehicles, setMatchingVehicles] = useState<VehicleOption[]>([]);
  const [poolVehicles, setPoolVehicles] = useState<VehicleOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [relocations, setRelocations] = useState<DriverRelocation[]>([]);
  const [relocationActionId, setRelocationActionId] = useState<string | null>(null);
  const [relocationNotice, setRelocationNotice] = useState<string | null>(null);
  const [confirmCompleteRelocation, setConfirmCompleteRelocation] = useState<DriverRelocation | null>(null);

  const inTransitRelocation = useMemo(
    () => relocations.find((r) => r.status === 'IN_TRANSIT') ?? null,
    [relocations]
  );

  // Instant render (stale-while-revalidate): seed from last-known snapshots on mount
  // so an active trip / assignments never flash as empty; loadDashboardData revalidates.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const cachedTrip = getSnapshot<ActiveTrip>('driver_active_trip');
    if (cachedTrip) setActiveTrip(cachedTrip);
    const cachedSession = getSnapshot<DriverSession>('driver_session');
    if (cachedSession) setActiveSession(cachedSession);
    const cachedBookings = getSnapshot<AssignedBooking[]>('driver_bookings');
    if (cachedBookings && cachedBookings.length > 0) setAssignedBookings(cachedBookings);
    const cachedOffers = getSnapshot<DriverOffer[]>('driver_offers');
    if (cachedOffers && cachedOffers.length > 0) setOffers(cachedOffers);
    const cachedVehicles = getSnapshot<VehicleOption[]>('driver_vehicle');
    if (cachedVehicles && cachedVehicles.length > 0) setPoolVehicles(cachedVehicles);
    const cachedLocations = getSnapshot<LocationOption[]>('driver_locations');
    if (cachedLocations && cachedLocations.length > 0) setLocations(cachedLocations);
    const cachedRelocations = getSnapshot<DriverRelocation[]>('driver_relocations');
    if (cachedRelocations && cachedRelocations.length > 0) setRelocations(cachedRelocations);
  }, [status]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [startPhase, setStartPhase] = useState<'gps' | 'request' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isAdvancingTrip, setIsAdvancingTrip] = useState(false);
  const actionInFlight = useRef(false);
  const sessionEndingRef = useRef(false);
  const dashboardRequest = useRef(0);
  const vehicleSearchRequest = useRef(0);
  const isStartingTrip = startPhase !== null;
  const startLabel = startPhase === 'gps' ? t.driverPages.console.startPhaseGps : t.driverPages.console.startPhaseStarting;

  // Elapsed trip duration ticker
  const [elapsedDuration, setElapsedDuration] = useState('');

  // End trip state
  const [isEndingTrip, setIsEndingTrip] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [completedTripSummary, setCompletedTripSummary] = useState<{
    id: string;
    startedAt: string;
    endedAt?: string;
    durationMinutes?: number;
    distanceMeters?: number | null;
    telemetryUploaded: boolean;
    aborted: boolean;
    pendingSync: boolean;
  } | null>(null);

  const [telemetryWarning, setTelemetryWarning] = useState<string | null>(null);
  const uploadBackoffUntil = useRef<number>(0);

  // Batch flush handler for useGeolocation with backoff protection
  const handleLocationFlush = useCallback(async (batch: GeoPoint[]) => {
    if (status !== 'authenticated') return;
    if (batch.length === 0) return;
    
    // Check if in backoff period due to server error (e.g. 500)
    const now = Date.now();
    if (now < uploadBackoffUntil.current) {
      return;
    }

    try {
      const result = await fetchJson<{ data?: { accepted: number; rejected: { reason: string }[] }; buffered?: boolean }>('/api/tracking/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
      });
      uploadBackoffUntil.current = 0;
      if (result?.buffered) {
        setTelemetryWarning(null);
      } else {
        setTelemetryWarning(result?.data?.rejected && result.data.rejected.length > 0 ? result.data.rejected[0].reason : null);
      }
    } catch (error) {
      // Session is ending: an already in-flight location POST may 403 after the
      // server ends the session. Swallow it — no backoff, no warning, no rethrow.
      if (sessionEndingRef.current) return;
      // Offline: buffer points into the persisted queue (module caps at 200 points)
      if (isOfflineError(error)) {
        enqueueOfflineAction('DRIVER_LOCATION_PING', {
          endpoint: '/api/tracking/locations',
          method: 'POST',
          payload: { points: batch },
          tripId: activeTrip?.id,
        });
        return;
      }
      // Apply 20s backoff to avoid continuous request loops if server is encountering issues
      uploadBackoffUntil.current = Date.now() + 20000;
      setTelemetryWarning(error instanceof Error ? error.message : tRef.current.driverPages.console.locationUploadPaused);
      throw error;
    }
  }, [activeTrip, status]);

  const {
    isTracking,
    currentPosition,
    signalStatus,
    movement,
    permissionDenied,
    error: geoError,
    clearError: clearGeoError,
    lastUpdated,
    isStale,
    confidenceScore,
    locationSource,
    jumpyDiscardCount,
    getCurrentPosition,
    startTracking,
    stopTracking,
    flushBuffer,
  } = useGeolocation({
    intervalSec: activeTrip || inTransitRelocation ? tripIntervalSec : idleIntervalSec,
    wakeLockEnabled: Boolean(activeTrip || inTransitRelocation),
    minDistanceMeters: 15,
    heartbeatIntervalSec: 50,
    onFlush: handleLocationFlush,
  });

  // Signal lost or stale calculation
  const isSignalLostOrStale =
    isStale ||
    signalStatus === 'red' ||
    movement === 'GPS_LOST' ||
    Boolean(geoError);

  const driverVehicleMarker = useMemo<VehicleMarkerData[]>(() => {
    if (!activeTrip) return [];
    const lat = currentPosition?.lat ?? activeTrip.startLat ?? -6.2088;
    const lng = currentPosition?.lng ?? activeTrip.startLng ?? 106.8456;
    return [
      {
        vehicleId: activeTrip.vehicle.id,
        plateNumber: activeTrip.vehicle.plateNumber,
        brand: activeTrip.vehicle.brand,
        model: activeTrip.vehicle.model,
        status: activeTrip.status,
        lat,
        lng,
        accuracyM: currentPosition?.accuracyM ?? 10,
        speedMps: currentPosition?.speedMps,
        headingDeg: currentPosition?.headingDeg,
        recordedAt: currentPosition?.recordedAt ?? new Date().toISOString(),
        movement: movement,
        tripOrigin: activeTrip.booking?.pickupLocation,
        tripDestination: activeTrip.booking?.destination,
      },
    ];
  }, [activeTrip, currentPosition, movement]);

  const driverRoutePoints = useMemo<RoutePoint[]>(() => {
    if (!activeTrip?.booking) return [];
    const booking = activeTrip.booking;
    const linked = assignedBookings.find((b) => b.id === booking.id);
    const pts: RoutePoint[] = [];
    if (booking.pickupLat && booking.pickupLng) {
      pts.push({
        lat: booking.pickupLat,
        lng: booking.pickupLng,
        label: `${tRef.current.driverPages.console.pickupLabel}: ${booking.pickupLocation}`,
        type: 'pickup',
      });
    }
    const destLat = booking.destinationLat ?? linked?.destinationLat;
    const destLng = booking.destinationLng ?? linked?.destinationLng;
    if (
      destLat != null &&
      destLng != null &&
      Number.isFinite(destLat) &&
      Number.isFinite(destLng)
    ) {
      pts.push({
        lat: destLat,
        lng: destLng,
        label: `${tRef.current.driverPages.console.destinationLabel}: ${booking.destination}`,
        type: 'destination',
      });
    }
    return pts;
  }, [activeTrip, assignedBookings, locale]);

  // Fetch driver offers (polling fallback)
  const fetchOffers = useCallback(async () => {
    const version = dashboardRequest.current;
    try {
      const json = await fetchJson<{ data: DriverOffer[] }>('/api/driver/offers');
      if (version === dashboardRequest.current) {
        const fresh = (json.data || []).filter((o) => new Date(o.expiresAt).getTime() > Date.now());
        setOffers(fresh);
        writeSnapshot('driver_offers', fresh);
      }
    } catch {
      // Offers expire locally; the next polling interval retries delivery.
      // Offline fallback: restore cached offers so an assigned dispatch never disappears.
      const cached = readSnapshot<DriverOffer[]>('driver_offers');
      if (cached && version === dashboardRequest.current) {
        setOffers(cached.filter((o) => new Date(o.expiresAt).getTime() > Date.now()));
      }
    }
  }, []);

  // Connect realtime offers
  useRealtime({
    token: realtimeToken,
    onOffer: (newOffer) => {
      setOffers((prev) => {
        const exists = prev.some((o) => o.id === newOffer.offerId);
        if (exists) return prev;
        const mapped: DriverOffer = {
          id: newOffer.offerId,
          bookingId: newOffer.bookingId,
          expiresAt: newOffer.expiresAt,
          etaSeconds: newOffer.etaSeconds,
          etaEstimated: newOffer.etaEstimated,
          pickupLocation: newOffer.pickupLocation,
          destination: newOffer.destination,
        };
        return [mapped, ...prev];
      });
    },
  });

  const fetchPoolVehicles = useCallback(async (locId: string) => {
    try {
      const params = new URLSearchParams({ status: 'AVAILABLE', limit: '30' });
      if (locId) params.set('locationId', locId);
      const poolRes = await fetchJson<{ data: VehicleOption[] }>(`/api/vehicles?${params.toString()}`);
      setPoolVehicles(poolRes.data || []);
    } catch {
      // non-fatal
    }
  }, []);

  // Load config, active session, active trip, assigned bookings
  const loadDashboardData = useCallback(async () => {
    const version = ++dashboardRequest.current;
    try {
      let config: DashboardConfig | null = null;
      try {
        config = await fetchJson<DashboardConfig>('/api/tracking/config');
      } catch (cfgErr) {
        console.error('[Driver Data Fetch Error] client /api/tracking/config:', cfgErr);
      }

      if (version !== dashboardRequest.current) return;
      if (config) {
        if (config.realtimeToken) setRealtimeToken(config.realtimeToken);
        if (config.config?.tripIntervalSec) setTripIntervalSec(config.config.tripIntervalSec);
        if (config.config?.idleIntervalSec) {
          setIdleIntervalSec(Math.max(20, config.config.idleIntervalSec));
        }
        const trip = config.sessionState?.activeTrip || null;
        const sess = config.sessionState?.activeSession || null;
        setActiveTrip(trip);
        setActiveSession(sess);
        writeSnapshot('driver_active_trip', trip);
        writeSnapshot('driver_session', sess);
      } else {
        // Offline fallback: restore in-flight trip/session so an active job survives reload
        setActiveTrip(readSnapshot<ActiveTrip | null>('driver_active_trip') ?? null);
        setActiveSession(readSnapshot<DriverSession | null>('driver_session') ?? null);
      }

      // Filter on the server before pagination; history must not hide a pending pickup.
      const bookings: AssignedBooking[] = [];
      let page = 1;
      let totalPages = 1;
      try {
        do {
          const result = await fetchJson<{ data: AssignedBooking[]; pagination: { totalPages: number } }>(
            `/api/bookings?workflow=driver&limit=100&page=${page}`
          );
          if (version !== dashboardRequest.current) return;
          if (Array.isArray(result?.data)) {
            bookings.push(...result.data);
          }
          totalPages = result?.pagination?.totalPages ?? 1;
          page += 1;
        } while (page <= totalPages);
        setAssignedBookings(bookings);
        writeSnapshot('driver_bookings', bookings);
      } catch (bookErr) {
        console.error('[Driver Data Fetch Error] client /api/bookings:', bookErr);
        setAssignedBookings(readSnapshot<AssignedBooking[]>('driver_bookings') ?? []);
      }

      try {
        const relRes = await fetchJson<{ data: DriverRelocation[] }>('/api/driver/relocations');
        if (version !== dashboardRequest.current) return;
        const relList = Array.isArray(relRes?.data) ? relRes.data : [];
        setRelocations(relList);
        writeSnapshot('driver_relocations', relList);
      } catch (relErr) {
        console.error('[Driver Data Fetch Error] client /api/driver/relocations:', relErr);
        setRelocations(readSnapshot<DriverRelocation[]>('driver_relocations') ?? []);
      }

      const currentTripState = config
        ? config.sessionState?.activeTrip || null
        : (readSnapshot<ActiveTrip | null>('driver_active_trip') ?? null);
      const shouldFetchPoolAndLocations =
        !currentTripState || lastPoolFetchLocationRef.current !== selectedLocationId;

      if (shouldFetchPoolAndLocations) {
        try {
          const poolParams = new URLSearchParams({ status: 'AVAILABLE', limit: '30' });
          if (selectedLocationId) poolParams.set('locationId', selectedLocationId);

          const [poolResult, locsResult] = await Promise.allSettled([
            fetchJson<{ data: VehicleOption[] }>(`/api/vehicles?${poolParams.toString()}`),
            fetchJson<{ data: LocationOption[] }>('/api/locations'),
          ]);
          if (version === dashboardRequest.current) {
            if (poolResult.status === 'fulfilled' && locsResult.status === 'fulfilled') {
              lastPoolFetchLocationRef.current = selectedLocationId;
            }
            if (poolResult.status === 'fulfilled') {
              const pool = poolResult.value?.data || [];
              setPoolVehicles(pool);
              writeSnapshot('driver_vehicle', pool);
            } else {
              console.error('[Driver Data Fetch Error] client pool vehicles:', poolResult.reason);
              const cached = readSnapshot<VehicleOption[]>('driver_vehicle');
              if (cached) setPoolVehicles(cached);
            }
            if (locsResult.status === 'fulfilled' && locsResult.value?.data) {
              setLocations(locsResult.value.data);
              writeSnapshot('driver_locations', locsResult.value.data);
            } else if (locsResult.status === 'rejected') {
              console.error('[Driver Data Fetch Error] client locations:', locsResult.reason);
              const cached = readSnapshot<LocationOption[]>('driver_locations');
              if (cached) setLocations(cached);
            }
          }
        } catch (poolErr) {
          console.error('[Driver Data Fetch Error] client pool vehicles/locations:', poolErr);
        }
      }

      try {
        await fetchOffers();
      } catch (offerErr) {
        console.error('[Driver Data Fetch Error] client fetchOffers:', offerErr);
      }
    } catch (error) {
      console.error('[Driver Data Fetch Error] loadDashboardData unhandled:', error);
      // Do not flash red "Internal server error" alert banner on background dashboard refresh
    } finally {
      if (version === dashboardRequest.current) setIsLoading(false);
    }
  }, [fetchOffers, selectedLocationId]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || actionInFlight.current || document.visibilityState === 'hidden') return;
      refreshing = true;
      try { await loadDashboardData(); } finally { refreshing = false; }
    };
    // Stagger initial load so dashboard and offers don't hit pool at exact same millisecond
    const initialTimer = setTimeout(() => {
      void refresh();
    }, 150);
    const interval = setInterval(() => { void refresh(); }, 15000);
    const offerInterval = setInterval(() => {
      if (!actionInFlight.current && document.visibilityState !== 'hidden') void fetchOffers();
    }, 12000); // Throttled to 12s to prevent serverless connection pool exhaustion
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(initialTimer);
      dashboardRequest.current += 1;
      vehicleSearchRequest.current += 1;
      clearInterval(interval);
      clearInterval(offerInterval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadDashboardData, fetchOffers, status]);

  // Reconnect & sync: drain the offline queue when back online or after a sync completes.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      void processOfflineQueue()
        .then(() => loadDashboardData())
        .catch(() => loadDashboardData());
    };
    const handleSyncComplete = () => {
      void loadDashboardData();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline-sync:complete', handleSyncComplete);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline-sync:complete', handleSyncComplete);
    };
  }, [loadDashboardData]);

  // When active trip exists OR online session is active, activate GPS tracking
  useEffect(() => {
    if (isEndingTrip || isTogglingOnline) return;
    if ((activeTrip || isOnline) && !isTracking && !permissionDenied) {
      startTracking();
    } else if (!activeTrip && !isOnline && isTracking) {
      stopTracking();
    }
  }, [activeTrip, isOnline, isTracking, permissionDenied, startTracking, stopTracking, isEndingTrip, isTogglingOnline]);

  // Session duration ticker
  useEffect(() => {
    if (!activeTrip) return;

    const startMs = new Date(activeTrip.startedAt).getTime();
    const updateTicker = () => {
      const diffMs = Math.max(0, Date.now() - startMs);
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setElapsedDuration(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
    };

    const timer = setInterval(updateTicker, 1000);
    return () => clearInterval(timer);
  }, [activeTrip]);

  // Proactively check and request location on mount (Location is mandatory for Driver)
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then((status) => {
        if (status.state === 'prompt' || status.state === 'granted') {
          void getCurrentPosition().catch(() => {});
        }
      }).catch(() => {
        void getCurrentPosition().catch(() => {});
      });
    } else {
      void getCurrentPosition().catch(() => {});
    }
  }, [getCurrentPosition]);

  // Handle Online / Offline toggle
  const handleToggleOnline = async () => {
    if (actionInFlight.current || activeTrip) return;
    if (!isOnline && !selectedVehicle && !activeSession?.vehicle) {
      setActionError(tRef.current.driverPages.console.pickVehicleFirst);
      document.getElementById('vehicle-selection')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    setIsTogglingOnline(true);
    try {
      if (isOnline) {
        // Stop the geolocation watcher and cancel any queued flush BEFORE ending the
        // session, so no in-flight location POST races the server-side end (403).
        sessionEndingRef.current = true;
        stopTracking(); // discard=true: cancels flush interval + clears buffer + watch
        try {
          await fetchJson('/api/driver/sessions/current/end', { method: 'PATCH' });
          // UI already transitions to Offline here whether or not the server reports
          // alreadyEnded; a 200 response means we are cleanly offline.
          setActiveSession(null);
          setOffers([]);
          setActionError(null);
        } finally {
          sessionEndingRef.current = false;
        }
      } else {
        let coords: { lat?: number; lng?: number } | null = null;
        if (currentPosition && Number.isFinite(currentPosition.lat) && Number.isFinite(currentPosition.lng)) {
          coords = { lat: currentPosition.lat, lng: currentPosition.lng };
        } else {
          try {
            coords = await getCurrentPosition({ allowCached: true });
          } catch {
            // GPS can take time or be rejected; fallback to currentPosition without blocking going online
            coords = currentPosition ? { lat: currentPosition.lat, lng: currentPosition.lng } : null;
          }
        }

        const targetVehicleId = selectedVehicle?.id || activeSession?.vehicleId || undefined;
        const res = await fetchJson<{ data?: DriverSession; success?: boolean }>('/api/driver/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId: targetVehicleId,
            startLat: coords?.lat ?? null,
            startLng: coords?.lng ?? null,
          }),
        });

        const newSession = res?.data || (res as unknown as DriverSession);
        if (newSession) {
          setActiveSession(newSession);
          setActionError(null);
          startTracking();
          void fetchOffers();
        }
      }
    } catch (error) {
      console.error('[Driver Session Error] handleToggleOnline:', error);
      setActionError(error instanceof Error ? error.message : tRef.current.driverPages.console.unableChangeOnline);
      await loadDashboardData();
    } finally {
      actionInFlight.current = false;
      setIsTogglingOnline(false);
    }
  };

  // Accept offer
  const handleAcceptOffer = async (offerId: string) => {
    if (actionInFlight.current) {
      setActionError(tRef.current.driverPages.console.actionInProgress);
      return;
    }
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    try {
      await fetchJson(`/api/driver/offers/${offerId}/accept`, { method: 'POST' });
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (error) {
      if (isOfflineError(error)) {
        enqueueOfflineAction('DRIVER_ACCEPT_OFFER', {
          endpoint: `/api/driver/offers/${offerId}/accept`,
          method: 'POST',
          offerId,
        });
        setOffers((prev) => prev.filter((o) => o.id !== offerId));
        setActionError(tRef.current.driverPages.console.offerAcceptedOffline);
      } else {
        setActionError(error instanceof Error ? error.message : tRef.current.driverPages.console.unableAcceptOffer);
      }
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
    }
  };

  // Reject offer
  const handleRejectOffer = async (offerId: string) => {
    if (actionInFlight.current) {
      setActionError(tRef.current.driverPages.console.actionInProgress);
      return;
    }
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    try {
      await fetchJson(`/api/driver/offers/${offerId}/reject`, { method: 'POST' });
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : tRef.current.driverPages.console.unableRejectOffer);
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
    }
  };

  // Dismiss expired offer
  const handleExpireOffer = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };

  const resolveOptionalCoords = async (): Promise<{ lat?: number; lng?: number }> => {
    if (currentPosition && Number.isFinite(currentPosition.lat) && Number.isFinite(currentPosition.lng)) {
      return { lat: currentPosition.lat, lng: currentPosition.lng };
    }
    try {
      const pos = await getCurrentPosition({ allowCached: true });
      return { lat: pos.lat, lng: pos.lng };
    } catch {
      return {};
    }
  };

  const handleStartRelocation = async (rel: DriverRelocation) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setRelocationActionId(rel.id);
    setActionError(null);
    setRelocationNotice(null);
    try {
      const coords = await resolveOptionalCoords();
      await fetchJson(`/api/admin/relocations/${rel.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startLat: coords.lat,
          startLng: coords.lng,
        }),
      });
      startTracking();
      setRelocationNotice(
        format(tRef.current.driverPages.console.relocationStartedNotice, { code: rel.relocationCode })
      );
      await loadDashboardData();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : tRef.current.driverPages.console.relocationActionError
      );
    } finally {
      setRelocationActionId(null);
      actionInFlight.current = false;
    }
  };

  const handleCompleteRelocationConfirm = async () => {
    const target = confirmCompleteRelocation;
    if (!target || actionInFlight.current) return;
    actionInFlight.current = true;
    setRelocationActionId(target.id);
    setActionError(null);
    setRelocationNotice(null);
    try {
      const coords = await resolveOptionalCoords();
      await fetchJson(`/api/admin/relocations/${target.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endLat: coords.lat,
          endLng: coords.lng,
        }),
      });
      setConfirmCompleteRelocation(null);
      setRelocationNotice(
        format(tRef.current.driverPages.console.relocationCompletedNotice, {
          hub: `${target.toLocation.name} (${target.toLocation.code})`,
        })
      );
      await loadDashboardData();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : tRef.current.driverPages.console.relocationActionError
      );
    } finally {
      setRelocationActionId(null);
      actionInFlight.current = false;
    }
  };

  // Vehicle plate search autocomplete
  const searchVehicle = async (term: string, locId = selectedLocationId) => {
    const version = ++vehicleSearchRequest.current;
    setManualPlate(term);
    setSelectedVehicle(null);
    setMatchingVehicles([]);
    setStartError(null);
    if (term.trim().length < 2) return;
    try {
      const params = new URLSearchParams({ search: term.trim(), limit: '20' });
      if (locId) params.set('locationId', locId);
      const json = await fetchJson<{ data: VehicleOption[] }>(`/api/vehicles?${params.toString()}`);
      if (version === vehicleSearchRequest.current) {
        const available = json.data.filter((vehicle) => ['AVAILABLE', 'RESERVED'].includes(vehicle.status));
        setMatchingVehicles(available);
        if (available.length === 0) {
          setStartError(locId ? tRef.current.driverPages.console.noMatchingPlateHub : tRef.current.driverPages.console.noMatchingPlate);
        }
      }
    } catch (error) {
      if (version === vehicleSearchRequest.current) {
        setStartError(error instanceof Error ? error.message : tRef.current.driverPages.console.unableSearchVehicles);
      }
    }
  };

  // Both entry points share GPS consent, pending feedback and duplicate-click protection.
  const startTripWith = async (target: { vehicleId?: string; bookingId?: string }) => {
    if (actionInFlight.current || activeTrip) return;
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    setStartError(null);
    setStartPhase('gps');
    let submitted = false;
    let coords: { lat: number; lng: number } | null = null;
    try {
      // Fast path: if currentPosition is already known, use it immediately without waiting for a new GPS lock
      if (currentPosition && Number.isFinite(currentPosition.lat) && Number.isFinite(currentPosition.lng)) {
        coords = { lat: currentPosition.lat, lng: currentPosition.lng };
      } else {
        const pos = await getCurrentPosition({ allowCached: true });
        coords = { lat: pos.lat, lng: pos.lng };
      }
      setStartPhase('request');
      submitted = true;
      const json = await fetchJson<{ data: ActiveTrip }>('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, startLat: coords.lat, startLng: coords.lng }),
      });
      setActiveTrip(json.data);
      writeSnapshot('driver_active_trip', json.data);
      setElapsedDuration('');
      setTelemetryWarning(null);
      startTracking();
      await loadDashboardData();
    } catch (error) {
      if (isOfflineError(error) && target.bookingId && coords) {
        const tempTripId = `offline-trip-${Date.now()}`;
        const booking = assignedBookings.find((b) => b.id === target.bookingId);
        const vehicleSource = booking?.vehicle || selectedVehicle;
        const localTrip: ActiveTrip = {
          id: tempTripId,
          status: 'IN_PROGRESS',
          startedAt: new Date().toISOString(),
          startLat: coords.lat,
          startLng: coords.lng,
          vehicle: vehicleSource
            ? { id: vehicleSource.id, plateNumber: vehicleSource.plateNumber, brand: vehicleSource.brand, model: vehicleSource.model }
            : { id: target.vehicleId || 'offline-vehicle', plateNumber: '—', brand: '', model: '' },
          booking: booking
            ? {
                id: booking.id,
                bookingNumber: booking.bookingNumber,
                pickupLocation: booking.pickupLocation,
                destination: booking.destination,
                status: booking.status,
                passengerCount: booking.passengerCount,
              }
            : null,
        };
        setActiveTrip(localTrip);
        writeSnapshot('driver_active_trip', localTrip);
        setElapsedDuration('');
        setTelemetryWarning(null);
        startTracking();
        enqueueOfflineAction('DRIVER_START_TRIP', {
          endpoint: '/api/trips',
          method: 'POST',
          payload: { ...target, startLat: coords.lat, startLng: coords.lng },
          bookingId: target.bookingId,
          tempTripId,
          tripId: tempTripId,
        });
        setActionError(tRef.current.driverPages.console.tripStartedOffline);
      } else {
        const message = error instanceof Error ? error.message : tRef.current.driverPages.console.unableStartTrip;
        setStartError(message);
        setActionError(message);
        // A lost HTTP response does not prove a mutation failed. Reconcile before retry.
        if (submitted) await loadDashboardData();
      }
    } finally {
      actionInFlight.current = false;
      setStartPhase(null);
    }
  };

  const handleStartBookingTrip = (booking: AssignedBooking) => startTripWith({ bookingId: booking.id, vehicleId: booking.vehicle?.id });

  const advanceTrip = async (url: string, passengerBoarded = false) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setIsAdvancingTrip(true);
    setActionError(null);
    try {
      await fetchJson(url, passengerBoarded ? {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'IN_PROGRESS' }),
      } : { method: 'POST' });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : tRef.current.driverPages.console.unableAdvanceTrip);
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
      setIsAdvancingTrip(false);
    }
  };

  const handleArriveAtPickup = () => activeTrip && advanceTrip(`/api/trips/${activeTrip.id}/arrived`);
  const handleStartPassengerTrip = (bookingId: string) => advanceTrip(`/api/bookings/${bookingId}/status`, true);

  const handleStartVehicleTrip = () => selectedVehicle && startTripWith({ vehicleId: selectedVehicle.id });

  // End trip action
  const handleEndTrip = async () => {
    if (!activeTrip || actionInFlight.current) return;
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setIsEndingTrip(true);
    setActionError(null);

    // Drain pending telemetry while the trip is ending
    let telemetryUploaded = true;
    try { await flushBuffer(); } catch { telemetryUploaded = false; }
    const endPayload: { endLat?: number; endLng?: number } = {};
    if (currentPosition) {
      endPayload.endLat = currentPosition.lat;
      endPayload.endLng = currentPosition.lng;
    }
    const aborted = Boolean(activeTrip.booking && currentBookingStatus !== 'IN_PROGRESS');

    try {
      const json = await fetchJson<{ data: { id: string; startedAt: string; endedAt?: string; distanceMeters?: number | null } }>(`/api/trips/${activeTrip.id}/${aborted ? 'abort' : 'end'}`, {
        method: aborted ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endPayload),
      });
      const trip = json.data;
      // Optimistic UI: Immediately clear active trip, close confirmation modal, and stop loading
      setActiveTrip(null);
      writeSnapshot('driver_active_trip', null);
      setShowEndConfirm(false);
      setIsEndingTrip(false);
      actionInFlight.current = false;
      setCompletedTripSummary({
        ...trip,
        durationMinutes: Math.round((new Date(trip.endedAt || Date.now()).getTime() - new Date(trip.startedAt).getTime()) / 60000),
        telemetryUploaded,
        aborted,
        pendingSync: false,
      });
      startTracking();
      // Non-blocking background refresh
      void loadDashboardData();
    } catch (error) {
      if (isOfflineError(error)) {
        // Optimistic offline end: queue the mutation, clear the trip, and don't trap the driver
        enqueueOfflineAction('DRIVER_END_TRIP', {
          endpoint: `/api/trips/${activeTrip.id}/${aborted ? 'abort' : 'end'}`,
          method: aborted ? 'POST' : 'PATCH',
          payload: endPayload,
          bookingId: activeTrip.booking?.id,
          tripId: activeTrip.id,
        });
        setActiveTrip(null);
        writeSnapshot('driver_active_trip', null);
        setShowEndConfirm(false);
        setCompletedTripSummary({
          id: activeTrip.id,
          startedAt: activeTrip.startedAt,
          durationMinutes: Math.round((Date.now() - new Date(activeTrip.startedAt).getTime()) / 60000),
          distanceMeters: null,
          telemetryUploaded,
          aborted,
          pendingSync: true,
        });
      } else {
        setActionError(error instanceof Error ? error.message : tRef.current.driverPages.console.unableEndTrip);
        void loadDashboardData();
      }
    } finally {
      actionInFlight.current = false;
      setIsEndingTrip(false);
    }
  };

  // Find linked booking for the active trip if available
  const activeBooking = assignedBookings.find((b) => b.id === activeTrip?.booking?.id);
  const currentBookingStatus = activeTrip?.booking?.status || activeBooking?.status;
  const stoppingPickup = Boolean(activeTrip?.booking && currentBookingStatus !== 'IN_PROGRESS');

  return (
    <div className="min-w-0 space-y-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 lg:space-y-4">
      <GreetingClock userName={session?.user?.name} roleLabel={t.nav.roles.DRIVER} />

      <header className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">{t.driverPages.console.eyebrow}</p>
          <h1 className="page-heading mt-2">{t.driverPages.console.heading}</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500">
            {t.driverPages.console.description}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            disabled={isTogglingOnline || isStartingTrip || isLoading || Boolean(activeTrip) || Boolean(inTransitRelocation)}
            onClick={handleToggleOnline}
            className={`${
              isOnline
                ? 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900'
                : 'button-primary'
            } min-h-12 w-full disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto`}
          >
            {isTogglingOnline ? <Spinner size="sm" /> : <Icon name={isOnline ? 'check' : 'signal'} />}
            {isOnline ? t.driverPages.console.onlineGoOfflineBtn : t.driverPages.console.goOnlineBtn}
          </button>
          <p className="text-xs font-medium leading-relaxed text-slate-500">
            {activeTrip || inTransitRelocation
              ? t.driverPages.console.finishBeforeOfflineHint
              : isOnline
              ? t.driverPages.console.sharingOnHint
              : t.driverPages.console.sharingOffHint}
          </p>
        </div>
      </header>

      {/* Live tracking strip — sits in page flow, clear of the navigation dock */}
      {activeTrip && (
        <div className="driver-live-banner">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3 sm:items-center">
              <span className="relative mt-0.5 flex size-2.5 shrink-0 sm:mt-0" aria-hidden="true">
                <span
                  className={`absolute inset-0 rounded-full ${
                    isSignalLostOrStale ? 'bg-warning-600' : 'bg-success-600'
                  }`}
                />
                {!isSignalLostOrStale && (
                  <span className="absolute inset-0 rounded-full bg-success-600 status-ping" />
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold tracking-tight text-slate-900">
                    {isSignalLostOrStale ? t.driverPages.console.gpsInterrupted : t.driverPages.console.trackingActive}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      isSignalLostOrStale
                        ? 'border-warning-200 bg-warning-50 text-warning-700'
                        : 'border-success-200 bg-success-50 text-success-700'
                    }`}
                  >
                    {isSignalLostOrStale ? t.driverPages.console.signalLostPaused : t.driverPages.console.broadcastingLive}
                  </span>
                  {currentBookingStatus && (
                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Status: {translateStatus(locale, currentBookingStatus)}
                    </span>
                  )}
                </div>
                {isSignalLostOrStale ? (
                  <p className="mt-1 max-w-xl text-xs font-medium leading-relaxed text-warning-700">
                    {locale === 'id'
                      ? 'Pembaruan lokasi dijeda saat tab berada di latar belakang atau layar terkunci — buka kembali untuk melanjutkan'
                      : 'Location updates pause when this tab is backgrounded or screen locks — reopen to resume'}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                    {locale === 'id'
                      ? `Mengirim telemetri setiap ${activeTrip ? tripIntervalSec : idleIntervalSec} detik`
                      : `Transmitting telemetry every ${activeTrip ? tripIntervalSec : idleIntervalSec} seconds`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4 md:border-0 md:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${
                    signalStatus === 'green'
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : signalStatus === 'amber'
                      ? 'border-warning-200 bg-warning-50 text-warning-700'
                      : 'border-danger-200 bg-danger-50 text-danger-700'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-1.5 rounded-full ${
                      signalStatus === 'green'
                        ? 'bg-success-600'
                        : signalStatus === 'amber'
                        ? 'bg-warning-600'
                        : 'bg-danger-600'
                    }`}
                  />
                  {confidenceScore > 0 ? format(t.driverPages.console.accuracyPct, { pct: confidenceScore }) : signalStatus}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-[#334155] dark:bg-[#111827] dark:text-[#cbd5e1]">
                  <Icon
                    name={locationSource === 'wifi_cell_triangulation' ? 'wifi' : 'satellite'}
                    className="size-3 text-slate-400"
                  />
                  <span>{locationSource === 'wifi_cell_triangulation' ? t.driverPages.console.wifiCellSource : t.driverPages.console.preciseGpsSource}</span>
                </span>

                {jumpyDiscardCount > 0 && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-info-200 bg-info-50 px-2 py-1 text-[11px] font-medium text-info-700"
                    title={t.driverPages.console.jumpyTitle}
                  >
                    <Icon name="shield" className="size-3" />
                    <span className="tabular-nums">
                      {jumpyDiscardCount} {locale === 'id' ? 'jumpy difilter' : 'jumpy filtered'}
                    </span>
                  </span>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-1">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.durationLabel}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {elapsedDuration || '00:00:00'}
                </span>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-1">
                <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.lastUpdateLabel}
                </span>
                <span className="text-xs font-medium text-slate-600">
                  {lastUpdated ? <RelativeTime date={lastUpdated} /> : t.driverPages.console.waitingLabel}
                </span>
              </div>

              {/* Arrival action when DRIVER_EN_ROUTE */}
              {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                <button
                  type="button"
                  onClick={handleArriveAtPickup}
                  disabled={isAdvancingTrip || isEndingTrip}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="check" className="size-4" /><span>{t.driverPages.console.markArrivedBtn}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowEndConfirm(true)}
                className="hidden min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-danger-200 bg-white px-5 text-sm font-semibold text-danger-700 transition-colors hover:border-danger-300 hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:inline-flex"
              >
                <Icon name="close" className="size-4" />
                {stoppingPickup ? t.driverPages.console.stopPickupBtn : t.driverPages.console.endTripBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent online banner when NOT on an active trip */}
      {!activeTrip && isOnline && (
        <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <span className="relative mt-1.5 flex size-2.5 shrink-0" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-success-600" />
              <span className="absolute inset-0 rounded-full bg-success-600 status-ping" />
            </span>
            <div>
              <span className="block text-sm font-semibold tracking-tight text-slate-900">
                {t.driverPages.console.onlineAndSharing}
              </span>
              {activeSession?.vehicle && (
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  {t.driverPages.history.colVehicle}:{' '}
                  <span className="font-mono font-semibold text-slate-800 tabular-nums">
                    {activeSession.vehicle.plateNumber}
                  </span>{' '}
                  &middot; {activeSession.vehicle.brand} {activeSession.vehicle.model}
                </p>
              )}
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                {t.driverPages.console.eligibleHint}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:self-center">
            <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
            <button
              type="button"
              disabled={isTogglingOnline || isStartingTrip}
              onClick={handleToggleOnline}
              className="button-secondary"
            >
              {isTogglingOnline ? <Spinner size="sm" /> : t.driverPages.console.goOfflineBtn}
            </button>
          </div>
        </div>
      )}

      {!activeTrip && <IosInstallHint />}


      {relocationNotice && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-xs font-medium text-success-800">
          <div className="flex items-center gap-2">
            <Icon name="check" className="size-4 shrink-0 text-success-600" />
            <span>{relocationNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setRelocationNotice(null)}
            className="cursor-pointer rounded px-2 py-1 text-xs font-semibold text-success-700 hover:bg-success-100"
          >
            {t.common.close}
          </button>
        </div>
      )}

      {inTransitRelocation && !activeTrip && (
        <div className="driver-live-banner">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
                <span
                  className={`absolute inset-0 rounded-full ${
                    isSignalLostOrStale ? 'bg-warning-600' : 'bg-success-600'
                  }`}
                />
                {!isSignalLostOrStale && (
                  <span className="absolute inset-0 animate-ping rounded-full bg-success-600 opacity-60" />
                )}
              </span>
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-brand-700">
                  {t.driverPages.console.relocationEyebrow} · {inTransitRelocation.relocationCode}
                </div>
                <div className="text-sm font-semibold text-slate-900">
                  {inTransitRelocation.vehicle.plateNumber} ({inTransitRelocation.fromLocation.name} → {inTransitRelocation.toLocation.name})
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
              <MovementBadge movement={movement} />
            </div>
          </div>
        </div>
      )}

      {actionError && (
        <ErrorBanner
          message={actionError}
          className="rounded-xl! p-4! [&_button]:min-h-11 [&_button]:min-w-11"
          onDismiss={() => setActionError(null)}
        />
      )}
      {geoError && (
        <ErrorBanner
          message={geoError}
          className="rounded-xl! p-4!"
          onDismiss={() => clearGeoError()}
        />
      )}
      {telemetryWarning && (
        <ErrorBanner
          message={`${locale === 'id' ? 'Peringatan unggah GPS' : 'GPS upload warning'}: ${telemetryWarning}`}
          className="rounded-xl! p-4!"
          onDismiss={() => setTelemetryWarning(null)}
        />
      )}
      {isStartingTrip && (
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 text-sm font-medium text-slate-600"
        >
          <Spinner size="sm" />
          {startLabel} {locale === 'id' ? 'Izinkan akses lokasi saat diminta.' : 'Please allow location access when prompted.'}
        </p>
      )}

      {/* Permission denied banner with instructions */}
      {permissionDenied && (
        <div className="space-y-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-relaxed text-warning-700 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold text-warning-700">
              <Icon name="pin" className="size-4 shrink-0" />
              <span>{t.driverPages.console.gpsRequiredTitle}</span>
            </div>
            <button
              type="button"
              onClick={() => void getCurrentPosition().catch(() => {})}
              className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-warning-200 bg-white px-3.5 text-xs font-semibold text-warning-700 transition-colors hover:border-warning-600 hover:bg-warning-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              {t.driverPages.console.enableLocationNowBtn}
            </button>
          </div>
          <p className="text-xs font-medium text-warning-700">
            {t.driverPages.console.gpsDeniedDesc}
          </p>
          <ul className="list-inside list-disc space-y-1 text-xs font-medium text-warning-700">
            <li>{t.driverPages.console.gpsStep1}</li>
            <li>{t.driverPages.console.gpsStep2}</li>
            <li>{t.driverPages.console.gpsStep3}</li>
          </ul>
        </div>
      )}

      {/* DISPATCH OFFERS PANEL (realtime + polling) */}
      {offers.length > 0 && (
        <section className="surface space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <Icon name="bell" className="size-4" />
              </span>
              {t.driverPages.console.incomingOffersTitle}
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-brand-700">
                {offers.length}
              </span>
            </h2>
            <span className="text-[11px] font-medium text-slate-500">
              {t.driverPages.console.respondTimerHint}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {offers.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onAccept={handleAcceptOffer}
                onReject={handleRejectOffer}
                onExpire={handleExpireOffer}
              />
            ))}
          </div>
        </section>
      )}

      {/* MAIN VIEW: ACTIVE TRIP TELEMETRY */}
      {activeTrip ? (
        <section className="surface space-y-5 p-4 sm:p-6" aria-label={t.driverPages.console.activeTripAria}>
          <div className="flex flex-col justify-between gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="eyebrow">{t.driverPages.console.currentJourneyEyebrow}</p>
              <h2 className="mt-2 wrap-anywhere text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
                {activeTrip.vehicle.brand} {activeTrip.vehicle.model}
              </h2>
              <p className="mt-2 flex items-center gap-2 font-mono text-sm font-medium text-slate-600 tabular-nums">
                <Icon name="car" className="size-4 shrink-0 text-slate-400" />
                {activeTrip.vehicle.plateNumber}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
              <StatusBadge status={activeTrip.status} />
              {activeTrip.booking && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-left sm:text-right">
                  <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {t.driverPages.console.bookingRefLabel}
                  </span>
                  <p className="mt-0.5 wrap-anywhere font-mono text-xs font-semibold text-slate-800 tabular-nums">
                    {activeTrip.booking.bookingNumber}
                  </p>
                </div>
              )}
            </div>
          </div>

          {activeTrip.booking ? (
            <div className="space-y-4">
              {/* Passenger profile & contact */}
              <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-sm font-semibold tracking-wide text-white">
                      {(activeTrip.booking.user?.name || t.driverPages.console.passengersLabel).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="truncate text-sm font-semibold tracking-tight text-slate-900">
                          {activeTrip.booking.user?.name || t.driverPages.console.passengersLabel}
                        </h4>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">
                          {t.driverPages.console.passengersLabel}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        {activeTrip.booking.passengerCount
                          ? format(t.driverPages.console.passengersCountLabel, { count: activeTrip.booking.passengerCount })
                          : t.driverPages.console.onePassengerLabel}
                      </p>
                    </div>
                  </div>

                  {/* In-app realtime chat & voice call */}
                  <div className="w-full border-t border-slate-100 pt-3 sm:w-auto sm:border-0 sm:pt-0">
                    <TripCommunicationWidget
                      bookingId={activeTrip.booking?.id}
                      tripId={activeTrip.id}
                      currentUserId={(session?.user as any)?.id || 'driver-user'}
                      currentUserName={session?.user?.name || t.nav.roles.DRIVER}
                      currentUserRole="DRIVER"
                      partnerId={activeTrip.booking?.user?.id}
                      partnerName={activeTrip.booking?.user?.name || t.driverPages.console.passengersLabel}
                      partnerRole="USER"
                      variant="buttons"
                    />
                  </div>
                </div>
              </div>

              {/* Route details */}
              <TripRoute pickup={activeTrip.booking.pickupLocation} destination={activeTrip.booking.destination} />

              {/* Driver live navigation map */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {locale === 'id' ? 'Navigasi & posisi langsung armada' : 'Live fleet navigation & position'}
                  </span>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      currentBookingStatus === 'DRIVER_EN_ROUTE'
                        ? activeTrip.booking.pickupLocation
                        : activeTrip.booking.destination
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    <span>{t.driverPages.console.openGoogleMaps}</span>
                    <Icon name="arrowUp" className="size-3.5" />
                  </a>
                </div>

                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <FleetMap
                    vehicles={driverVehicleMarker}
                    selectedVehicleId={activeTrip.vehicle.id}
                    routePoints={driverRoutePoints}
                    zoom={15}
                    className="h-[320px] w-full sm:h-[380px]"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
              <Icon name="route" className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                  {t.driverPages.console.adHocTripTitle}
                </h3>
                <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                  {t.driverPages.console.adHocTripDesc}
                </p>
              </div>
            </div>
          )}

          {/* Workflow stage action buttons */}
          {activeTrip.booking && (
            <div className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 lg:flex-row lg:items-center sm:p-5">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.currentStageLabel}
                </span>
                <span className="mt-1 block text-sm font-semibold leading-relaxed text-slate-900">
                  {currentBookingStatus === 'DRIVER_EN_ROUTE'
                    ? t.driverPages.console.stageEnRoute
                    : currentBookingStatus === 'ARRIVED'
                    ? t.driverPages.console.stageArrived
                    : currentBookingStatus === 'IN_PROGRESS'
                    ? t.driverPages.console.stageInProgress
                    : translateStatus(locale, currentBookingStatus)}
                </span>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                  <button
                    type="button"
                    onClick={handleArriveAtPickup}
                    disabled={isAdvancingTrip || isEndingTrip}
                    className="button-primary"
                  >
                    <Icon name="check" /><span>{t.driverPages.console.arrivedAtPickupBtn}</span>
                  </button>
                )}

                {currentBookingStatus === 'ARRIVED' && (
                  <button
                    type="button"
                    onClick={() => handleStartPassengerTrip(activeTrip.booking!.id)}
                    disabled={isAdvancingTrip || isEndingTrip}
                    className="button-primary"
                  >
                    <Icon name="arrow" /><span>{t.driverPages.console.boardedStartBtn}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* GPS stale / signal lost warning */}
          {isSignalLostOrStale && (
            <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm leading-relaxed text-warning-700 sm:p-5">
              <Icon name="signal" className="mt-0.5 size-4 shrink-0" />
              <div>
                <span className="block font-semibold">{t.driverPages.console.gpsSignalPausedTitle}</span>
                <p className="mt-0.5 text-xs font-medium leading-relaxed text-warning-700">
                  {locale === 'id'
                    ? 'Pembaruan lokasi dijeda saat tab ini berada di latar belakang atau layar terkunci — buka kembali untuk melanjutkan.'
                    : 'Location updates pause when this tab is backgrounded or screen locks — reopen to resume.'}
                </p>
              </div>
            </div>
          )}

          {/* Realtime telemetry grid */}
          <div>
            <h3 className="section-title mb-3">{t.driverPages.console.liveTelemetryHeading}</h3>

            <div className="grid grid-cols-1 gap-2.5 text-sm min-[380px]:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.signalLabel}
                </span>
                <div className="mt-1.5 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${
                      signalStatus === 'green'
                        ? 'bg-success-600'
                        : signalStatus === 'amber'
                        ? 'bg-warning-600'
                        : 'bg-danger-600'
                    }`}
                  />
                  <span className="font-semibold capitalize text-slate-900">{signalStatus}</span>
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.gpsAccuracyLabel}
                </span>
                <div className="mt-1.5">
                  <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.movementLabel}
                </span>
                <div className="mt-1.5">
                  <MovementBadge movement={movement} />
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3.5">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  {t.driverPages.console.lastUpdateLabel}
                </span>
                <div className="mt-1.5 text-sm font-medium text-slate-600">
                  <RelativeTime date={lastUpdated} />
                </div>
              </div>
            </div>

            {currentPosition && (
              <div className="mt-2.5 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5 font-mono text-xs font-medium text-slate-600 tabular-nums min-[380px]:grid-cols-2 lg:grid-cols-4">
                <span>Lat: {currentPosition.lat.toFixed(5)}</span>
                <span>Lng: {currentPosition.lng.toFixed(5)}</span>
                <span>
                  {t.map.speedLabel}{' '}
                  {currentPosition.speedMps !== null
                    ? `${(currentPosition.speedMps * 3.6).toFixed(1)} ${t.map.kmh}`
                    : `0 ${t.map.kmh}`}
                </span>
                <span>
                  {locale === 'id' ? 'Arah:' : 'Heading:'}{' '}
                  {currentPosition.headingDeg !== null
                    ? `${Math.round(currentPosition.headingDeg)}°`
                    : t.common.noDataDash}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-danger-200 bg-white px-6 text-sm font-semibold text-danger-700 transition-colors hover:border-danger-300 hover:bg-danger-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 sm:w-auto"
            >
              <Icon name="close" className="size-4" />
              {stoppingPickup ? t.driverPages.console.stopPickupBtn : t.driverPages.console.finishAndEndBtn}
            </button>
          </div>
        </section>
      ) : (
        /* NO ACTIVE TRIP: START TRIP INTERFACE */
        <div className="space-y-3.5 lg:space-y-4">
          {/* Assigned Vehicle Relocations */}
          {relocations.length > 0 && (
            <section className="surface space-y-4 border-brand-200 p-4 sm:p-5" aria-label={t.driverPages.console.relocationHeading}>
              <div>
                <p className="eyebrow">{t.driverPages.console.relocationEyebrow}</p>
                <h2 className="section-title mt-2 flex flex-wrap items-center gap-2">
                  {t.driverPages.console.relocationHeading}
                  <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-brand-700">
                    {relocations.length}
                  </span>
                </h2>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                  {t.driverPages.console.relocationSub}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {relocations.map((rel) => {
                  const busy = relocationActionId === rel.id;
                  return (
                    <div
                      key={rel.id}
                      className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-brand-200 bg-white p-4"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                            {rel.relocationCode}
                          </span>
                          <StatusBadge status={rel.status} />
                        </div>

                        <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3 py-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                            {t.driverPages.console.relocationRouteLabel}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900">
                            <span>{rel.fromLocation.name} ({rel.fromLocation.code})</span>
                            <Icon name="arrow" className="size-4 text-brand-600" />
                            <span>{rel.toLocation.name} ({rel.toLocation.code})</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          <Icon name="car" className="size-4 shrink-0 text-slate-400" />
                          <span className="font-mono font-semibold text-slate-900">{rel.vehicle.plateNumber}</span>
                          <span>
                            ({rel.vehicle.brand} {rel.vehicle.model})
                          </span>
                        </div>

                        <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-600 tabular-nums">
                          <div>
                            {t.driverPages.console.relocationScheduledLabel}: {formatBookingDateTime(rel.scheduledAt, locale)}
                          </div>
                          {rel.departedAt && (
                            <div>
                              {t.driverPages.console.relocationDepartedLabel}: {formatBookingDateTime(rel.departedAt, locale)}
                            </div>
                          )}
                          {rel.notes && (
                            <div className="border-t border-slate-200 pt-1 text-slate-500">
                              {t.driverPages.console.relocationNotesLabel}: {rel.notes}
                            </div>
                          )}
                        </div>
                      </div>

                      {rel.status === 'SCHEDULED' ? (
                        <button
                          type="button"
                          disabled={busy || Boolean(inTransitRelocation)}
                          onClick={() => handleStartRelocation(rel)}
                          className="button-primary w-full"
                        >
                          {busy ? <Spinner size="sm" /> : <Icon name="arrow" />}
                          <span>{t.driverPages.console.relocationStartBtn}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => setConfirmCompleteRelocation(rel)}
                          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-success-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-success-700 disabled:opacity-50"
                        >
                          {busy ? <Spinner size="sm" /> : <Icon name="check" />}
                          <span>{t.driverPages.console.relocationCompleteBtn}</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Assigned bookings */}
          <section className="surface space-y-4 p-4 sm:p-5" aria-label={t.driverPages.console.assignedBookingsAria}>
            <div>
              <p className="eyebrow">{t.driverPages.console.nextPickupEyebrow}</p>
              <h2 className="section-title mt-2 flex flex-wrap items-center gap-2">
                {t.driverPages.console.assignedBookingsHeading}
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-600">
                  {assignedBookings.length}
                </span>
              </h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                {t.driverPages.console.assignedBookingsSub}
              </p>
            </div>

            {assignedBookings.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-slate-50/60 px-5 py-10 text-center">
                {isLoading ? (
                  <div
                    role="status"
                    className="flex items-center gap-3 text-sm font-medium text-slate-500"
                  >
                    <Spinner size="md" />{t.driverPages.console.loadingAssigned}
                  </div>
                ) : (
                  <>
                    <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400">
                      <Icon name="route" />
                    </div>
                    <h3 className="text-sm font-semibold tracking-tight text-slate-900">
                      {t.driverPages.console.readyNextTitle}
                    </h3>
                    <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
                      {t.driverPages.console.readyNextDesc}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                {assignedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-w-0 flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="wrap-anywhere rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                          {b.bookingNumber}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>

                      <TripRoute pickup={b.pickupLocation} destination={b.destination} />

                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-medium text-slate-600">
                        {t.userPages.bookings.departureLabel}:{' '}
                        <span className="tabular-nums">
                          {new Date(b.departureAt).toLocaleDateString(dateLocale, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>{' '}
                        &middot;{' '}
                        <span className="tabular-nums">
                          {format(t.driverPages.console.passengersCountLabel, { count: b.passengerCount })}
                        </span>
                      </div>

                      {b.vehicle && (
                        <div className="wrap-anywhere flex items-center gap-1.5 border-t border-slate-100 pt-3 text-sm font-medium text-slate-600">
                          <Icon name="car" className="size-4 shrink-0 text-slate-400" />
                          <span>
                            {b.vehicle.plateNumber} ({b.vehicle.brand} {b.vehicle.model})
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartBookingTrip(b)}
                      disabled={isStartingTrip || isTogglingOnline || isLoading || !['APPROVED', 'DRIVER_ASSIGNED'].includes(b.status)}
                      aria-busy={isStartingTrip}
                      className="button-primary w-full"
                    >
                      {isStartingTrip ? <Spinner size="sm" /> : <Icon name="arrow" />}
                      <span>{isStartingTrip ? startLabel : t.driverPages.console.startTripToPickupBtn}</span>
                    </button>
                    {startError && <ErrorBanner message={startError} />}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ad-hoc vehicle trip start & pool selection */}
          <section id="vehicle-selection" className="surface space-y-4 p-4 sm:p-5" aria-label={t.driverPages.console.vehicleSelectionAria}>
            <div>
              <h2 className="section-title">{t.driverPages.console.selectPoolHeading}</h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                {t.driverPages.console.selectPoolSub}
              </p>
            </div>

            <div className="max-w-md space-y-3">
              {/* Hub location filter */}
              <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    <Icon name="pin" className="size-3.5 text-brand-600" />
                    {t.driverPages.console.filterHubLabel}
                  </span>
                  {selectedLocationId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLocationId('');
                        void fetchPoolVehicles('');
                      }}
                      className="cursor-pointer text-[11px] font-semibold text-brand-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      {t.driverPages.console.resetFilterBtn}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocationId('');
                      void fetchPoolVehicles('');
                    }}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                      !selectedLocationId
                        ? 'border-brand-200 bg-brand-50 text-brand-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {t.driverPages.console.allHubsPill}
                  </button>
                  {locations.map((loc) => {
                    const isSelected = selectedLocationId === loc.id;
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => {
                          const next = isSelected ? '' : loc.id;
                          setSelectedLocationId(next);
                          void fetchPoolVehicles(next);
                        }}
                        className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                          isSelected
                            ? 'border-brand-200 bg-brand-50 text-brand-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}
                      >
                        <span>{loc.name}</span>
                        <span
                          className={`ml-1.5 rounded border px-1 font-mono text-[10px] tabular-nums ${
                            isSelected
                              ? 'border-brand-200 bg-white text-brand-700'
                              : 'border-slate-200 bg-slate-50 text-slate-500'
                          }`}
                        >
                          {loc.code}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="vehicle-plate"
                  className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  {selectedLocationId
                    ? format(t.driverPages.console.searchPlateLabel, {
                        hub: locations.find((l) => l.id === selectedLocationId)?.name || 'hub',
                      })
                    : locale === 'id'
                    ? 'Cari plat nomor'
                    : 'Search license plate'}
                </label>
                <input
                  id="vehicle-plate"
                  type="text"
                  placeholder={t.driverPages.console.searchPlatePlaceholder}
                  value={manualPlate}
                  disabled={isStartingTrip || isTogglingOnline}
                  onChange={(e) => searchVehicle(e.target.value)}
                  className="min-h-12 w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-base font-medium text-slate-900 outline-none transition placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>

              {poolVehicles.length > 0 && !selectedVehicle && !manualPlate && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {locale === 'id' ? 'Tersedia di pool' : 'Available in pool'} ({poolVehicles.length})
                    </p>
                    {selectedLocationId && (
                      <span className="text-[11px] font-medium text-slate-500">
                        {format(t.driverPages.console.hubPrefix, {
                          name: locations.find((l) => l.id === selectedLocationId)?.name || '',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {poolVehicles.map((v) => {
                      const hub = v.currentOperationalLocation || v.homeLocation;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => {
                            vehicleSearchRequest.current += 1;
                            setStartError(null);
                            setSelectedVehicle(v);
                            setManualPlate(`${v.plateNumber} (${v.brand} ${v.model})`);
                            setMatchingVehicles([]);
                          }}
                          className="flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                        >
                          <div className="flex w-full flex-wrap items-center justify-between gap-1">
                            <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                              {v.plateNumber}
                            </span>
                            {hub && (
                              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                {hub.name} ({hub.code})
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-slate-500">
                            {v.brand} {v.model} &middot;{' '}
                            <span className="tabular-nums">{v.seatingCapacity}</span> {t.common.seats}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {poolVehicles.length === 0 && !selectedVehicle && !manualPlate && selectedLocationId && (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center">
                  <p className="text-xs font-medium text-slate-500">
                    {format(t.driverPages.console.noPoolVehicles, {
                      hub: locations.find((l) => l.id === selectedLocationId)?.name || (locale === 'id' ? 'ini' : 'this hub'),
                    })}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLocationId('');
                      void fetchPoolVehicles('');
                    }}
                    className="mt-2 cursor-pointer text-xs font-semibold text-brand-700 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                  >
                    {t.driverPages.console.showAllHubVehiclesBtn}
                  </button>
                </div>
              )}

              {matchingVehicles.length > 0 && !selectedVehicle && (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {matchingVehicles.map((v) => {
                    const hub = v.currentOperationalLocation || v.homeLocation;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => {
                          vehicleSearchRequest.current += 1;
                          setStartError(null);
                          setSelectedVehicle(v);
                          setManualPlate(`${v.plateNumber} (${v.brand} ${v.model})`);
                          setMatchingVehicles([]);
                        }}
                        className="flex min-h-14 w-full cursor-pointer flex-wrap items-center justify-between gap-3 p-3.5 text-left text-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-slate-900"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono font-semibold text-slate-900 tabular-nums">
                              {v.plateNumber}
                            </span>
                            {hub && (
                              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                                {hub.name} ({hub.code})
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-medium text-slate-500">
                            {v.brand} {v.model}
                          </span>
                        </div>
                        <StatusBadge status={v.status} />
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedVehicle && (
                <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                          {selectedVehicle.plateNumber}
                        </span>
                        {(selectedVehicle.currentOperationalLocation || selectedVehicle.homeLocation) && (
                          <span className="rounded border border-brand-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                            {(selectedVehicle.currentOperationalLocation || selectedVehicle.homeLocation)?.name}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {selectedVehicle.brand} {selectedVehicle.model} (
                        <span className="tabular-nums">{selectedVehicle.seatingCapacity}</span> {t.common.seats})
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={isStartingTrip || isTogglingOnline}
                      onClick={() => {
                        vehicleSearchRequest.current += 1;
                        setStartError(null);
                        setSelectedVehicle(null);
                        setManualPlate('');
                      }}
                      className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.driverPages.console.changeBtn}
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    {!isOnline && (
                      <button
                        type="button"
                        onClick={handleToggleOnline}
                        disabled={isTogglingOnline || isStartingTrip || isLoading}
                        className="button-secondary flex-1"
                      >
                        {isTogglingOnline ? <Spinner size="sm" /> : <Icon name="signal" />}
                        <span>{t.driverPages.console.goOnlineWithUnitBtn}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleStartVehicleTrip}
                      disabled={isStartingTrip || isTogglingOnline || isLoading}
                      aria-busy={isStartingTrip}
                      className="button-primary flex-1"
                    >
                      {isStartingTrip && <Spinner size="sm" />}
                      <span>
                        {isStartingTrip
                          ? startLabel
                          : locale === 'id'
                          ? `Mulai trip dengan ${selectedVehicle.plateNumber}`
                          : `Start trip with ${selectedVehicle.plateNumber}`}
                      </span>
                    </button>
                  </div>
                  <p role="status" aria-live="polite" className="text-[11px] font-medium leading-relaxed text-slate-500">
                    {startPhase === 'gps'
                      ? t.driverPages.console.hintPermission
                      : startPhase === 'request'
                      ? t.driverPages.console.hintSaving
                      : t.driverPages.console.hintKeepOpen}
                  </p>
                </div>
              )}
              {startError && <ErrorBanner message={startError} />}
            </div>
          </section>
        </div>
      )}

      {/* Confirmation dialog to complete inter-hub relocation */}
      <ConfirmDialog
        isOpen={Boolean(confirmCompleteRelocation)}
        onClose={() => setConfirmCompleteRelocation(null)}
        onConfirm={handleCompleteRelocationConfirm}
        title={t.driverPages.console.relocationConfirmCompleteTitle}
        message={
          confirmCompleteRelocation
            ? format(t.driverPages.console.relocationConfirmCompleteMessage, {
                plate: confirmCompleteRelocation.vehicle.plateNumber,
                hub: `${confirmCompleteRelocation.toLocation.name} (${confirmCompleteRelocation.toLocation.code})`,
              })
            : ''
        }
        confirmLabel={t.driverPages.console.relocationCompleteBtn}
        isLoading={Boolean(confirmCompleteRelocation && relocationActionId === confirmCompleteRelocation.id)}
      />

      {/* Confirmation dialog to end trip */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndTrip}
        title={stoppingPickup ? t.driverPages.console.confirmStopTitle : t.driverPages.console.confirmFinishTitle}
        message={stoppingPickup ? t.driverPages.console.confirmStopDesc : t.driverPages.console.confirmFinishDesc}
        confirmLabel={stoppingPickup ? t.driverPages.console.confirmStopBtn : t.driverPages.console.confirmFinishBtn}
        isDestructive={true}
        isLoading={isEndingTrip}
      />

      {/* Trip completed summary modal */}
      {completedTripSummary && (
        <Modal
          isOpen={Boolean(completedTripSummary)}
          onClose={() => setCompletedTripSummary(null)}
          title={completedTripSummary.pendingSync
            ? t.driverPages.console.summaryOfflineTitle
            : completedTripSummary.aborted
            ? t.driverPages.console.summaryAbortedTitle
            : t.driverPages.console.summaryDoneTitle}
          description={completedTripSummary.pendingSync
            ? t.driverPages.console.summaryOfflineDesc
            : completedTripSummary.aborted
            ? t.driverPages.console.summaryAbortedDesc
            : t.driverPages.console.summaryDoneDesc}
          footer={
            <button
              type="button"
              onClick={() => setCompletedTripSummary(null)}
              className="button-primary"
            >
              {t.driverPages.console.doneBtn}
            </button>
          }
        >
          <div className="space-y-4 text-sm">
            {completedTripSummary.pendingSync && (
              <div className="rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-xs text-warning-700">
                <span className="mb-0.5 block font-semibold">{t.driverPages.console.summaryOfflineTitle}</span>
                <p className="text-[11px] font-medium leading-relaxed text-warning-700">
                  {t.driverPages.console.summaryOfflineBannerBody}
                </p>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 bg-white p-4 leading-relaxed">
              <span className="block font-semibold text-slate-900">
                {completedTripSummary.aborted
                  ? t.driverPages.console.summaryAbortedNoticeTitle
                  : t.driverPages.console.summaryClosedTitle}
              </span>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                {completedTripSummary.telemetryUploaded
                  ? t.driverPages.console.summarySyncedNotice
                  : t.driverPages.console.summaryPartialNotice}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {t.driverPages.console.summaryDurationLabel}
                </span>
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {completedTripSummary.durationMinutes} {locale === 'id' ? 'menit' : 'minutes'}
                </span>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  {t.driverPages.console.summaryDistanceLabel}
                </span>
                <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {completedTripSummary.distanceMeters
                    ? `${(completedTripSummary.distanceMeters / 1000).toFixed(2)} km`
                    : t.driverPages.console.summaryGpsTrackedFallback}
                </span>
              </div>
            </div>

            {!completedTripSummary.aborted && (
              <div className="rounded-xl border border-warning-200 bg-warning-50 p-3.5 text-xs text-warning-700">
                <span className="mb-0.5 block font-semibold">{t.driverPages.console.summaryWaitNotaTitle}</span>
                <p className="text-[11px] font-medium leading-relaxed text-warning-700">
                  {t.driverPages.console.summaryWaitNotaBody}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
