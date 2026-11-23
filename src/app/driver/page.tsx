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
import { GreetingClock } from '@/components/ui/GreetingClock';
import { fetchJson } from '@/lib/fetch-json';
import { saveSnapshot, getSnapshot, enqueueOfflineAction, processOfflineQueue } from '@/lib/offline-sync';
import { TripCommunicationWidget } from '@/components/communication/TripCommunicationWidget';

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
  config?: { tripIntervalSec?: number };
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
  } catch {}
}

function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return error instanceof TypeError;
}


export default function DriverDashboardPage() {
  const { data: session, status } = useSession();
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [assignedBookings, setAssignedBookings] = useState<AssignedBooking[]>([]);
  const [activeSession, setActiveSession] = useState<DriverSession | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [tripIntervalSec, setTripIntervalSec] = useState(5);
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

  // Instant render: seed from snapshots
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
  }, [status]);

  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [startPhase, setStartPhase] = useState<'gps' | 'request' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isAdvancingTrip, setIsAdvancingTrip] = useState(false);
  const actionInFlight = useRef(false);
  const dashboardRequest = useRef(0);
  const vehicleSearchRequest = useRef(0);
  const isStartingTrip = startPhase !== null;
  const startLabel = startPhase === 'gps' ? 'Mengunci GPS…' : 'Memulai trip…';

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
    
    const now = Date.now();
    if (now < uploadBackoffUntil.current) return;

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
      if (isOfflineError(error)) {
        enqueueOfflineAction('DRIVER_LOCATION_PING', {
          endpoint: '/api/tracking/locations',
          method: 'POST',
          payload: { points: batch },
          tripId: activeTrip?.id,
        });
        return;
      }
      uploadBackoffUntil.current = Date.now() + 20000;
      setTelemetryWarning(error instanceof Error ? error.message : 'Location upload paused. Retrying in 20s.');
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
    intervalSec: tripIntervalSec,
    onFlush: handleLocationFlush,
  });

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
        label: 'Jemput: ' + booking.pickupLocation,
        type: 'pickup',
      });
    }
    const destLat = booking.destinationLat ?? linked?.destinationLat;
    const destLng = booking.destinationLng ?? linked?.destinationLng;
    if (destLat != null && destLng != null && Number.isFinite(destLat) && Number.isFinite(destLng)) {
      pts.push({
        lat: destLat,
        lng: destLng,
        label: 'Tujuan: ' + booking.destination,
        type: 'destination',
      });
    }
    return pts;
  }, [activeTrip, assignedBookings]);

  // Fetch driver offers
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
    } catch {}
  }, []);

  const loadDashboardData = useCallback(async () => {
    const version = ++dashboardRequest.current;
    try {
      let config: DashboardConfig | null = null;
      try {
        config = await fetchJson<DashboardConfig>('/api/tracking/config');
      } catch (cfgErr) {
        console.error('[Driver Data Fetch Error] config:', cfgErr);
      }

      if (version !== dashboardRequest.current) return;
      if (config) {
        if (config.realtimeToken) setRealtimeToken(config.realtimeToken);
        if (config.config?.tripIntervalSec) setTripIntervalSec(config.config.tripIntervalSec);
        const trip = config.sessionState?.activeTrip || null;
        const sess = config.sessionState?.activeSession || null;
        setActiveTrip(trip);
        setActiveSession(sess);
        writeSnapshot('driver_active_trip', trip);
        writeSnapshot('driver_session', sess);
      } else {
        setActiveTrip(readSnapshot<ActiveTrip | null>('driver_active_trip') ?? null);
        setActiveSession(readSnapshot<DriverSession | null>('driver_session') ?? null);
      }

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
        console.error('[Driver Data Fetch Error] bookings:', bookErr);
        setAssignedBookings(readSnapshot<AssignedBooking[]>('driver_bookings') ?? []);
      }

      try {
        const poolParams = new URLSearchParams({ status: 'AVAILABLE', limit: '30' });
        if (selectedLocationId) poolParams.set('locationId', selectedLocationId);

        const [poolResult, locsResult] = await Promise.allSettled([
          fetchJson<{ data: VehicleOption[] }>(`/api/vehicles?${poolParams.toString()}`),
          fetchJson<{ data: LocationOption[] }>('/api/locations'),
        ]);
        if (version === dashboardRequest.current) {
          if (poolResult.status === 'fulfilled') {
            const pool = poolResult.value?.data || [];
            setPoolVehicles(pool);
            writeSnapshot('driver_vehicle', pool);
          }
          if (locsResult.status === 'fulfilled' && locsResult.value?.data) {
            setLocations(locsResult.value.data);
            writeSnapshot('driver_locations', locsResult.value.data);
          }
        }
      } catch {}

      try {
        await fetchOffers();
      } catch {}
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
    const initialTimer = setTimeout(() => { void refresh(); }, 150);
    const interval = setInterval(() => { void refresh(); }, 15000);
    const offerInterval = setInterval(() => {
      if (!actionInFlight.current && document.visibilityState !== 'hidden') void fetchOffers();
    }, 12000);
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

  // Offline sync reconnection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      void processOfflineQueue().then(() => loadDashboardData()).catch(() => loadDashboardData());
    };
    const handleSyncComplete = () => { void loadDashboardData(); };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline-sync:complete', handleSyncComplete);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline-sync:complete', handleSyncComplete);
    };
  }, [loadDashboardData]);

  // GPS activation when online or on active trip
  useEffect(() => {
    if (isEndingTrip || isTogglingOnline) return;
    if ((activeTrip || isOnline) && !isTracking && !permissionDenied) {
      startTracking();
    } else if (!activeTrip && !isOnline && isTracking) {
      stopTracking();
    }
  }, [activeTrip, isOnline, isTracking, permissionDenied, startTracking, stopTracking, isEndingTrip, isTogglingOnline]);

  // Duration ticker
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

  // Request location on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    void getCurrentPosition().catch(() => {});
  }, [getCurrentPosition]);

  // Handle Online / Offline toggle
  const handleToggleOnline = async () => {
    if (actionInFlight.current || activeTrip) return;
    if (!isOnline && !selectedVehicle && !activeSession?.vehicle) {
      setActionError('Pilih mobil yang Anda gunakan dari pool terlebih dahulu.');
      document.getElementById('vehicle-selection')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    setIsTogglingOnline(true);
    try {
      if (isOnline) {
        stopTracking(false);
        await flushBuffer();
        await fetchJson('/api/driver/sessions/current/end', { method: 'PATCH' });
        stopTracking();
        setActiveSession(null);
        setOffers([]);
        setActionError(null);
      } else {
        let coords: { lat?: number; lng?: number } | null = null;
        if (currentPosition && Number.isFinite(currentPosition.lat) && Number.isFinite(currentPosition.lng)) {
          coords = { lat: currentPosition.lat, lng: currentPosition.lng };
        } else {
          try {
            coords = await getCurrentPosition({ allowCached: true });
          } catch {
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
      setActionError(error instanceof Error ? error.message : 'Gagal memperbarui status online.');
      await loadDashboardData();
    } finally {
      actionInFlight.current = false;
      setIsTogglingOnline(false);
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    if (actionInFlight.current) return;
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
        setActionError('Penawaran diterima offline — akan disinkronkan.');
      } else {
        setActionError(error instanceof Error ? error.message : 'Gagal menerima tawaran.');
      }
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
    }
  };

  const handleRejectOffer = async (offerId: string) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    try {
      await fetchJson(`/api/driver/offers/${offerId}/reject`, { method: 'POST' });
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Gagal menolak tawaran.');
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
    }
  };

  const handleExpireOffer = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };

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
          setStartError(locId ? 'Tidak ada armada tersedia di hub yang dipilih.' : 'Tidak ada armada yang cocok.');
        }
      }
    } catch (error) {
      if (version === vehicleSearchRequest.current) {
        setStartError(error instanceof Error ? error.message : 'Gagal mencari armada.');
      }
    }
  };

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
        setActionError('Trip dimulai offline — akan disinkronkan saat online.');
      } else {
        const message = error instanceof Error ? error.message : 'Gagal memulai trip. Silakan coba lagi.';
        setStartError(message);
        setActionError(message);
        if (submitted) await loadDashboardData();
      }
    } finally {
      actionInFlight.current = false;
      setStartPhase(null);
    }
  };

  const handleStartBookingTrip = (booking: AssignedBooking) =>
    startTripWith({ bookingId: booking.id, vehicleId: booking.vehicle?.id });

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
      setActionError(error instanceof Error ? error.message : 'Gagal memperbarui status perjalanan.');
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
      setIsAdvancingTrip(false);
    }
  };

  const handleArriveAtPickup = () => activeTrip && advanceTrip(`/api/trips/${activeTrip.id}/arrived`);
  const handleStartPassengerTrip = (bookingId: string) => advanceTrip(`/api/bookings/${bookingId}/status`, true);
  const handleStartVehicleTrip = () => selectedVehicle && startTripWith({ vehicleId: selectedVehicle.id });

  const handleEndTrip = async () => {
    if (!activeTrip || actionInFlight.current) return;
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setIsEndingTrip(true);
    setActionError(null);

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
      void loadDashboardData();
    } catch (error) {
      if (isOfflineError(error)) {
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
        setActionError(error instanceof Error ? error.message : 'Gagal mengakhiri trip.');
        void loadDashboardData();
      }
    } finally {
      actionInFlight.current = false;
      setIsEndingTrip(false);
    }
  };

  const activeBooking = assignedBookings.find((b) => b.id === activeTrip?.booking?.id);
  const currentBookingStatus = activeTrip?.booking?.status || activeBooking?.status;
  const stoppingPickup = Boolean(activeTrip?.booking && currentBookingStatus !== 'IN_PROGRESS');

  return (
    <div className="w-full min-w-0 space-y-5">
      <GreetingClock userName={session?.user?.name} roleLabel="Driver" />

      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">
            <span className="size-1.5 rounded-full bg-[var(--kcic-red)]" aria-hidden="true" />
            KCIC Driver Console
          </span>
          <h1 className="page-heading mt-2">Jadwal &amp; tugas mengemudi</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Ketersediaan tugas, navigasi rute penjemputan, dan telemetri langsung.
          </p>
        </div>

        <div className="flex flex-col gap-1.5 sm:items-end">
          <button
            type="button"
            disabled={isTogglingOnline || isStartingTrip || isLoading || Boolean(activeTrip)}
            onClick={handleToggleOnline}
            className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 ${
              isOnline
                ? 'cursor-pointer border border-[var(--status-active-border)] bg-[var(--status-active-bg)] text-[var(--status-active-fg)] hover:bg-[var(--status-active-border)]/40'
                : 'button-primary'
            }`}
          >
            {isTogglingOnline ? (
              <Spinner size="sm" />
            ) : isOnline ? (
              <span className="relative flex size-2">
                <span className="live-ping absolute inset-0 rounded-full bg-current" aria-hidden="true" />
                <span className="relative size-2 rounded-full bg-current" aria-hidden="true" />
              </span>
            ) : (
              <SignalGlyph />
            )}
            <span>{isOnline ? 'Online — klik untuk offline' : 'Aktifkan mode online'}</span>
          </button>
          <span className="text-[0.6875rem] text-slate-400">
            {activeTrip
              ? 'Selesaikan trip sebelum mengganti status.'
              : isOnline
                ? 'Siap menerima tawaran dispatch.'
                : 'Nyalakan untuk menerima order.'}
          </span>
        </div>
      </header>

      {/* Live active trip banner */}
      {activeTrip && (
        <div className="card overflow-hidden">
          <div className="flex flex-col gap-3 px-4 py-3.5 md:flex-row md:items-center md:justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="relative flex size-2.5 shrink-0">
                <span
                  className={`absolute inset-0 rounded-full ${
                    isSignalLostOrStale
                      ? 'bg-[var(--status-warning-fg)]'
                      : 'live-ping bg-[var(--status-active-fg)]'
                  }`}
                  aria-hidden="true"
                />
                <span
                  className={`relative size-2.5 rounded-full ${
                    isSignalLostOrStale ? 'bg-[var(--status-warning-fg)]' : 'bg-[var(--status-active-fg)]'
                  }`}
                  aria-hidden="true"
                />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[0.8125rem] font-semibold text-slate-900">
                    {isSignalLostOrStale ? 'Sinyal GPS terputus' : 'Perjalanan berlangsung'}
                  </span>
                  <span className={`pill ${isSignalLostOrStale ? 'pill-warning' : 'pill-active'}`}>
                    <span className="pill-dot" aria-hidden="true" />
                    <span>{isSignalLostOrStale ? 'Sinyal terjeda' : 'GPS aktif'}</span>
                  </span>
                  {currentBookingStatus && <StatusBadge status={currentBookingStatus} />}
                </div>
                <p className="mt-0.5 truncate text-[0.6875rem] text-slate-500">
                  Armada{' '}
                  <span className="mono-plate font-semibold text-slate-900">
                    {activeTrip.vehicle.plateNumber}
                  </span>{' '}
                  · {activeTrip.vehicle.brand} {activeTrip.vehicle.model}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-3 py-1.5 text-center">
                <span className="metric-label block">Durasi</span>
                <span className="mono-plate mt-0.5 block text-xs font-semibold tabular-nums text-slate-900">
                  {elapsedDuration || '00:00:00'}
                </span>
              </div>

              {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                <button
                  type="button"
                  onClick={handleArriveAtPickup}
                  disabled={isAdvancingTrip || isEndingTrip}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-4 py-2 text-xs font-semibold text-[var(--status-active-fg)] transition-colors hover:bg-[var(--status-active-border)]/40 disabled:opacity-50"
                >
                  <CheckGlyph />
                  <span>Tiba di titik jemput</span>
                </button>
              )}

              {currentBookingStatus === 'ARRIVED' && (
                <button
                  type="button"
                  onClick={() => handleStartPassengerTrip(activeTrip.booking!.id)}
                  disabled={isAdvancingTrip || isEndingTrip}
                  className="button-primary px-4 py-2"
                >
                  <ArrowRightGlyph />
                  <span>Penumpang naik</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowEndConfirm(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-border)]/40"
              >
                <span>{stoppingPickup ? 'Batalkan jemput' : 'Akhiri perjalanan'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standby banner */}
      {!activeTrip && isOnline && (
        <div className="flex flex-col gap-3 rounded-[var(--radius-xl)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="relative mt-1 flex size-2 shrink-0">
              <span className="live-ping absolute inset-0 rounded-full bg-[var(--status-active-fg)]" aria-hidden="true" />
              <span className="relative size-2 rounded-full bg-[var(--status-active-fg)]" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--status-active-fg)]">
                Mode siaga aktif — siap menerima order dispatch
              </p>
              {activeSession?.vehicle && (
                <p className="mt-0.5 text-[0.6875rem] text-[var(--status-active-fg)]/80">
                  Unit operasional{' '}
                  <span className="mono-plate font-semibold text-slate-900">
                    {activeSession.vehicle.plateNumber}
                  </span>{' '}
                  · {activeSession.vehicle.brand} {activeSession.vehicle.model}
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
            <button
              type="button"
              disabled={isTogglingOnline || isStartingTrip}
              onClick={handleToggleOnline}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[0.6875rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)] disabled:opacity-50"
            >
              {isTogglingOnline ? <Spinner size="xs" /> : null}
              <span>Off duty</span>
            </button>
          </div>
        </div>
      )}

      {!activeTrip && <IosInstallHint />}

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {geoError && <ErrorBanner message={geoError} onDismiss={() => clearGeoError()} />}
      {telemetryWarning && (
        <ErrorBanner
          message={`Peringatan GPS: ${telemetryWarning}`}
          onDismiss={() => setTelemetryWarning(null)}
        />
      )}

      {isStartingTrip && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-xs text-slate-600"
        >
          <Spinner size="sm" className="mt-px text-[var(--kcic-red)]" />
          <span className="min-w-0 leading-relaxed">
            <span className="font-semibold text-slate-900">{startLabel}</span> Mohon setujui akses
            lokasi jika muncul permohonan izin di browser.
          </span>
        </div>
      )}

      {/* Permission denied */}
      {permissionDenied && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--status-warning-fg)]">
              <MapPinGlyph />
              <span>Akses GPS wajib diaktifkan</span>
            </div>
            <button
              type="button"
              onClick={() => void getCurrentPosition().catch(() => {})}
              className="cursor-pointer rounded-full border border-[var(--status-warning-border)] bg-white px-3 py-1 text-[0.6875rem] font-semibold text-[var(--status-warning-fg)]"
            >
              Aktifkan lokasi
            </button>
          </div>
          <p className="mt-2 text-[0.6875rem] leading-relaxed text-[var(--status-warning-fg)]/85">
            Browser Anda belum memberi izin GPS. Pengemudi wajib menyalakan lokasi agar dapat menerima
            tawaran perjalanan dan menyiarkan status armada.
          </p>
        </div>
      )}

      {/* Incoming offers */}
      {offers.length > 0 && (
        <section className="card overflow-hidden" aria-labelledby="driver-offers-heading">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="icon-tile-accent">
                <BellGlyph />
              </span>
              <div className="min-w-0">
                <span className="eyebrow eyebrow-accent">Perlu respons</span>
                <h2 id="driver-offers-heading" className="section-title mt-0.5">
                  Tawaran masuk{' '}
                  <span className="font-normal text-slate-400 tabular-nums">({offers.length})</span>
                </h2>
              </div>
            </div>
            <span className="pill pill-warning">
              <TimerGlyph />
              <span>Batas respons 60 detik</span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2">
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

      {/* Active trip: map + telemetry + passenger panel */}
      {activeTrip ? (
        <div className="tracking-layout">
          <div className="min-w-0 space-y-3">
            <div className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5">
                <span className="eyebrow">
                  <NavigationGlyph />
                  Navigasi rute langsung
                </span>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    currentBookingStatus === 'DRIVER_EN_ROUTE'
                      ? activeTrip.booking?.pickupLocation || ''
                      : activeTrip.booking?.destination || ''
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
                >
                  <span>Buka Google Maps</span>
                  <ChevronRightGlyph />
                </a>
              </div>

              <FleetMap
                vehicles={driverVehicleMarker}
                selectedVehicleId={activeTrip.vehicle.id}
                routePoints={driverRoutePoints}
                zoom={15}
                className="h-[320px] w-full sm:h-[420px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="card p-3.5">
                <span className="metric-label block">Sinyal GPS</span>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className={`size-2 rounded-full ${
                      signalStatus === 'green'
                        ? 'bg-[var(--status-active-fg)]'
                        : signalStatus === 'amber'
                          ? 'bg-[var(--status-warning-fg)]'
                          : 'bg-[var(--status-error-fg)]'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="text-xs font-semibold capitalize text-slate-900">{signalStatus}</span>
                </div>
                {confidenceScore > 0 && (
                  <p className="mt-1 text-[0.625rem] font-medium tabular-nums text-slate-400">
                    {confidenceScore}% akurasi sinyal
                  </p>
                )}
              </div>

              <div className="card p-3.5">
                <span className="metric-label block">Akurasi</span>
                <div className="mt-1.5">
                  <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                </div>
                <p className="mt-1 text-[0.625rem] font-medium text-slate-400">
                  {locationSource === 'wifi_cell_triangulation' ? 'Wi-Fi / Cell' : 'GPS presisi'}
                </p>
              </div>

              <div className="card p-3.5">
                <span className="metric-label block">Pergerakan</span>
                <div className="mt-1.5">
                  <MovementBadge movement={movement} />
                </div>
              </div>

              <div className="card p-3.5">
                <span className="metric-label block">Update terakhir</span>
                <div className="mt-1.5 text-xs font-semibold text-slate-700">
                  <RelativeTime date={lastUpdated} />
                </div>
              </div>
            </div>

            {jumpyDiscardCount > 0 && (
              <p className="flex items-center gap-1.5 px-1 text-[0.625rem] font-medium text-slate-400">
                <ShieldGlyph />
                <span className="tabular-nums">{jumpyDiscardCount} titik jumpy difilter otomatis</span>
              </p>
            )}
          </div>

          <div className="tracking-panel space-y-3">
            {activeTrip.booking && (
              <div className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-4 py-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--slate-navy)] text-xs font-semibold text-white">
                    {(activeTrip.booking.user?.name || 'P').slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8125rem] font-semibold text-slate-900">
                      {activeTrip.booking.user?.name || 'Penumpang KCIC'}
                    </p>
                    <p className="text-[0.6875rem] text-slate-500">
                      {activeTrip.booking.passengerCount
                        ? `${activeTrip.booking.passengerCount} penumpang`
                        : '1 penumpang'}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3">
                  <TripCommunicationWidget
                    bookingId={activeTrip.booking?.id}
                    tripId={activeTrip.id}
                    currentUserId={(session?.user as any)?.id || 'driver-user'}
                    currentUserName={session?.user?.name || 'Driver KCIC'}
                    currentUserRole="DRIVER"
                    partnerId={activeTrip.booking?.user?.id}
                    partnerName={activeTrip.booking?.user?.name || 'Penumpang'}
                    partnerRole="USER"
                    variant="buttons"
                  />
                </div>

                <div className="border-t border-[var(--border-subtle)] px-4 py-3.5">
                  <TripRoute
                    pickup={activeTrip.booking.pickupLocation}
                    destination={activeTrip.booking.destination}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* No active trip */
        <div className="space-y-5">
          {/* Assigned bookings */}
          <section className="card overflow-hidden" aria-labelledby="assigned-bookings-heading">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
              <span className="eyebrow">Jadwal penjemputan</span>
              <h2 id="assigned-bookings-heading" className="section-title mt-1">
                Tugas perjalanan ditugaskan{' '}
                <span className="font-normal text-slate-400 tabular-nums">
                  ({assignedBookings.length})
                </span>
              </h2>
            </div>

            {assignedBookings.length === 0 ? (
              <div className="flex flex-col items-center px-6 py-10 text-center">
                {isLoading ? (
                  <div role="status" className="flex items-center gap-2 text-xs text-slate-500">
                    <Spinner size="sm" className="text-[var(--kcic-red)]" />
                    <span>Memuat daftar penugasan…</span>
                  </div>
                ) : (
                  <>
                    <span className="mb-3 grid size-10 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-slate-400">
                      <RouteGlyph />
                    </span>
                    <p className="text-xs font-semibold text-slate-900">Belum ada tugas penjemputan</p>
                    <p className="mt-1 max-w-sm text-[0.6875rem] leading-relaxed text-slate-500">
                      Aktifkan mode online untuk menerima penawaran dispatch otomatis di stasiun atau hub
                      Anda.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-4 sm:p-5 md:grid-cols-2">
                {assignedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex flex-col justify-between gap-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-4 transition-colors hover:border-[var(--border-strong)]"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono-plate truncate rounded-[var(--radius-xs)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-700">
                          #{b.bookingNumber}
                        </span>
                        <StatusBadge status={b.status} />
                      </div>

                      <TripRoute pickup={b.pickupLocation} destination={b.destination} />

                      <p className="flex flex-wrap items-center gap-x-1.5 text-[0.6875rem] text-slate-500">
                        <ClockGlyph />
                        <span>Berangkat</span>
                        <strong className="font-semibold tabular-nums text-slate-800">
                          {new Date(b.departureAt).toLocaleDateString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </strong>
                        <span className="text-slate-300">·</span>
                        <span className="tabular-nums">{b.passengerCount} penumpang</span>
                      </p>

                      {b.vehicle && (
                        <p className="flex items-center gap-1.5 border-t border-[var(--border-subtle)] pt-2 text-[0.6875rem] text-slate-600">
                          <CarGlyph />
                          <span className="mono-plate font-semibold text-slate-900">
                            {b.vehicle.plateNumber}
                          </span>
                          <span className="truncate">
                            {b.vehicle.brand} {b.vehicle.model}
                          </span>
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartBookingTrip(b)}
                      disabled={
                        isStartingTrip ||
                        isTogglingOnline ||
                        isLoading ||
                        !['APPROVED', 'DRIVER_ASSIGNED'].includes(b.status)
                      }
                      className="button-primary w-full py-2.5"
                    >
                      {isStartingTrip ? (
                        <Spinner size="sm" className="text-white" />
                      ) : (
                        <ArrowRightGlyph />
                      )}
                      <span>{isStartingTrip ? startLabel : 'Mulai menuju penjemputan'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Vehicle pool */}
          <section id="vehicle-selection" className="card overflow-hidden">
            <div className="border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
              <span className="eyebrow">Pool kendaraan KCIC</span>
              <h2 className="section-title mt-1">Pilih armada siap operasi</h2>
              <p className="mt-1 text-[0.6875rem] leading-relaxed text-slate-500">
                Pilih armada dari stasiun hub Anda untuk memulai mode online atau perjalanan operasional.
              </p>
            </div>

            <div className="space-y-3.5 p-4 sm:p-5">
              {/* Hub filter */}
              <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLocationId('');
                    void fetchPoolVehicles('');
                  }}
                  aria-pressed={!selectedLocationId}
                  className="chip shrink-0"
                >
                  Semua hub
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
                      aria-pressed={isSelected}
                      className="chip shrink-0"
                    >
                      <span>{loc.name}</span>
                      <span className="mono-plate text-[0.625rem] opacity-60">{loc.code}</span>
                    </button>
                  );
                })}
              </div>

              <div className="max-w-md">
                <label className="sr-only" htmlFor="driver-vehicle-search">
                  Cari armada
                </label>
                <div className="relative">
                  <SearchGlyph />
                  <input
                    id="driver-vehicle-search"
                    type="text"
                    placeholder="Cari plat nomor, merek, atau tipe armada…"
                    value={manualPlate}
                    disabled={isStartingTrip || isTogglingOnline}
                    onChange={(e) => searchVehicle(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              {poolVehicles.length > 0 && !selectedVehicle && !manualPlate && (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                        className="flex cursor-pointer flex-col items-start gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3.5 text-left transition-colors hover:border-[var(--border-strong)]"
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="mono-plate rounded-[var(--radius-xs)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-900">
                            {v.plateNumber}
                          </span>
                          {hub && (
                            <span className="truncate text-[0.625rem] font-medium text-slate-400">
                              {hub.name}
                            </span>
                          )}
                        </span>
                        <span className="text-[0.6875rem] text-slate-600">
                          {v.brand} {v.model} · {v.seatingCapacity} kursi
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {matchingVehicles.length > 0 && !selectedVehicle && (
                <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-white">
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
                        className="list-row w-full cursor-pointer text-left"
                      >
                        <span className="mono-plate shrink-0 rounded-[var(--radius-xs)] bg-[var(--canvas)] px-2 py-1 text-[0.6875rem] font-semibold text-slate-900">
                          {v.plateNumber}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-medium text-slate-900">
                            {v.brand} {v.model}
                          </span>
                          <span className="block truncate text-[0.625rem] text-slate-400">
                            {hub ? `${hub.name} · ${v.seatingCapacity} kursi` : `${v.seatingCapacity} kursi`}
                          </span>
                        </span>
                        <StatusBadge status={v.status} />
                        <ChevronRightGlyph />
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedVehicle && (
                <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono-plate text-[0.9375rem] font-semibold text-slate-900">
                          {selectedVehicle.plateNumber}
                        </span>
                        <span className="pill pill-active">
                          <span className="pill-dot" aria-hidden="true" />
                          <span>Armada terpilih</span>
                        </span>
                      </div>
                      <p className="mt-0.5 text-[0.6875rem] text-slate-600">
                        {selectedVehicle.brand} {selectedVehicle.model} ·{' '}
                        {selectedVehicle.seatingCapacity} kursi
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
                      className="shrink-0 cursor-pointer rounded-full px-2 py-1 text-[0.6875rem] font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 transition-colors hover:text-slate-900"
                    >
                      Ganti
                    </button>
                  </div>

                  <div className="driver-trip-actions mt-3.5">
                    {!isOnline && (
                      <button
                        type="button"
                        onClick={handleToggleOnline}
                        disabled={isTogglingOnline || isStartingTrip || isLoading}
                        className="button-secondary px-4 py-2.5"
                      >
                        {isTogglingOnline ? <Spinner size="sm" /> : <SignalGlyph />}
                        <span>Online dengan unit ini</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleStartVehicleTrip}
                      disabled={isStartingTrip || isTogglingOnline || isLoading}
                      className="button-primary px-4 py-2.5"
                    >
                      {isStartingTrip && <Spinner size="sm" className="text-white" />}
                      <span>
                        {isStartingTrip
                          ? startLabel
                          : `Mulai trip operasional (${selectedVehicle.plateNumber})`}
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {startError && <ErrorBanner message={startError} />}
            </div>
          </section>
        </div>
      )}

      {/* End trip confirm */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndTrip}
        title={stoppingPickup ? 'Batalkan penjemputan ini?' : 'Akhiri dan selesaikan perjalanan?'}
        message={
          stoppingPickup
            ? 'Tracking akan dihentikan dan booking kembali ke antrean penugasan.'
            : 'Perjalanan akan diselesaikan dan ringkasan jarak tempuh GPS dicatat.'
        }
        confirmLabel={stoppingPickup ? 'Hentikan penjemputan' : 'Selesaikan trip'}
        isDestructive={true}
        isLoading={isEndingTrip}
      />

      {/* Completed summary */}
      {completedTripSummary && (
        <Modal
          isOpen={Boolean(completedTripSummary)}
          onClose={() => setCompletedTripSummary(null)}
          title={
            completedTripSummary.pendingSync
              ? 'Trip selesai (menunggu sinkronisasi)'
              : completedTripSummary.aborted
                ? 'Penjemputan dihentikan'
                : 'Perjalanan berhasil diselesaikan'
          }
          description={
            completedTripSummary.pendingSync
              ? 'Perjalanan selesai offline — akan disinkronkan otomatis saat online'
              : completedTripSummary.aborted
                ? 'Booking tetap tersimpan untuk penugasan ulang'
                : 'Sesi pelacakan GPS telah difinalisasi'
          }
          footer={
            <button
              type="button"
              onClick={() => setCompletedTripSummary(null)}
              className="button-primary w-full"
            >
              Selesai
            </button>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] p-3">
                <span className="metric-label block">Durasi</span>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {completedTripSummary.durationMinutes} menit
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] p-3">
                <span className="metric-label block">Jarak tempuh</span>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {completedTripSummary.distanceMeters
                    ? `${(completedTripSummary.distanceMeters / 1000).toFixed(2)} km`
                    : 'Terdata via GPS'}
                </p>
              </div>
            </div>

            {!completedTripSummary.aborted && (
              <div className="rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3.5">
                <span className="block text-[0.6875rem] font-semibold text-[var(--status-warning-fg)]">
                  Verifikasi dokumen nota dinas
                </span>
                <p className="mt-1 text-[0.6875rem] leading-relaxed text-[var(--status-warning-fg)]/85">
                  Perjalanan telah selesai. Booking memasuki tahap verifikasi akhir sebelum
                  diselesaikan resmi oleh dispatcher KCIC.
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* -- Small local glyphs --------------------------------------------------- */
import {
  ArrowRight,
  Bell,
  Car,
  Check,
  ChevronRight,
  Clock,
  MapPin,
  Navigation,
  Route,
  Search,
  ShieldCheck,
  Signal,
  Timer,
} from 'lucide-react';

function ArrowRightGlyph() {
  return <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />;
}
function BellGlyph() {
  return <Bell className="size-4" strokeWidth={1.9} aria-hidden="true" />;
}
function CarGlyph() {
  return <Car className="size-3.5" strokeWidth={1.9} aria-hidden="true" />;
}
function CheckGlyph() {
  return <Check className="size-3.5" strokeWidth={2.3} aria-hidden="true" />;
}
function ChevronRightGlyph() {
  return <ChevronRight className="size-3" strokeWidth={2.4} aria-hidden="true" />;
}
function ClockGlyph() {
  return <Clock className="size-3" strokeWidth={2} aria-hidden="true" />;
}
function MapPinGlyph() {
  return <MapPin className="size-3.5" strokeWidth={2} aria-hidden="true" />;
}
function NavigationGlyph() {
  return <Navigation className="size-3" strokeWidth={2} aria-hidden="true" />;
}
function RouteGlyph() {
  return <Route className="size-4" strokeWidth={1.85} aria-hidden="true" />;
}
function SignalGlyph() {
  return <Signal className="size-3.5" strokeWidth={2} aria-hidden="true" />;
}
function TimerGlyph() {
  return <Timer className="size-3" strokeWidth={2} aria-hidden="true" />;
}
function SearchGlyph() {
  return (
    <Search
      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}
function ShieldGlyph() {
  return <ShieldCheck className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />;
}

function TripRoute({ pickup, destination }: { pickup: string; destination: string }) {
  return (
    <div className="route-stepper">
      <div className="route-point" data-kind="pickup">
        <p className="route-label">Titik jemput</p>
        <p className="route-value">{pickup}</p>
      </div>
      <div className="route-point" data-kind="destination">
        <p className="route-label">Tujuan</p>
        <p className="route-value">{destination}</p>
      </div>
    </div>
  );
}