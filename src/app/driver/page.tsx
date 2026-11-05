'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
import { fetchJson } from '@/lib/fetch-json';

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

interface VehicleOption {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  status: string;
  seatingCapacity: number;
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

function TripRoute({ pickup, destination }: { pickup: string; destination: string }) {
  return (
    <div className="relative space-y-5 py-1 pl-8">
      <span aria-hidden="true" className="absolute bottom-6 left-[7px] top-4 border-l-2 border-dashed border-zinc-950" />
      <div className="relative min-w-0">
        <span aria-hidden="true" className="absolute -left-8 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm border-2 border-black bg-white shadow-[1px_1px_0px_0px_#000]"><span className="h-1.5 w-1.5 bg-black" /></span>
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Pickup</p>
        <p className="mt-0.5 wrap-anywhere text-sm font-bold leading-snug text-zinc-800">{pickup}</p>
      </div>
      <div className="relative min-w-0">
        <span aria-hidden="true" className="absolute -left-8 top-0.5 flex h-4 w-4 items-center justify-center rounded-sm border-2 border-black bg-emerald-400 shadow-[1px_1px_0px_0px_#000]"><span className="h-1.5 w-1.5 bg-black" /></span>
        <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Destination</p>
        <p className="mt-0.5 wrap-anywhere text-base font-black leading-snug tracking-tight text-zinc-950">{destination}</p>
      </div>
    </div>
  );
}

export default function DriverDashboardPage() {
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
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleOption | null>(null);
  const [startPhase, setStartPhase] = useState<'gps' | 'request' | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [isAdvancingTrip, setIsAdvancingTrip] = useState(false);
  const actionInFlight = useRef(false);
  const dashboardRequest = useRef(0);
  const vehicleSearchRequest = useRef(0);
  const isStartingTrip = startPhase !== null;
  const startLabel = startPhase === 'gps' ? 'Getting GPS…' : 'Starting trip…';

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
  } | null>(null);

  const [telemetryWarning, setTelemetryWarning] = useState<string | null>(null);

  // Batch flush handler for useGeolocation
  const handleLocationFlush = useCallback(async (batch: GeoPoint[]) => {
    if (batch.length === 0) return;
    // Throw transport/HTTP failures so the hook retains unsent points for retry.
    try {
      const result = await fetchJson<{ data: { accepted: number; rejected: { reason: string }[] } }>('/api/tracking/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
      });
      // Invalid or stale fixes are not retryable; surface them without blocking fresh fixes.
      setTelemetryWarning(result.data.rejected.length > 0 ? result.data.rejected[0].reason : null);
    } catch (error) {
      setTelemetryWarning(error instanceof Error ? error.message : 'Location upload failed. Retrying.');
      throw error;
    }
  }, []);

  const {
    isTracking,
    currentPosition,
    signalStatus,
    movement,
    permissionDenied,
    error: geoError,
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
    const pts: RoutePoint[] = [];
    if (activeTrip.booking.pickupLat && activeTrip.booking.pickupLng) {
      pts.push({
        lat: activeTrip.booking.pickupLat,
        lng: activeTrip.booking.pickupLng,
        label: 'Jemput: ' + activeTrip.booking.pickupLocation,
        type: 'pickup',
      });
    }
    return pts;
  }, [activeTrip]);

  // Fetch driver offers (polling fallback)
  const fetchOffers = useCallback(async () => {
    const version = dashboardRequest.current;
    try {
      const json = await fetchJson<{ data: DriverOffer[] }>('/api/driver/offers');
      if (version === dashboardRequest.current) {
        setOffers((json.data || []).filter((o) => new Date(o.expiresAt).getTime() > Date.now()));
      }
    } catch {
      // Offers expire locally; the next polling interval retries delivery.
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

  // Load config, active session, active trip, assigned bookings
  const loadDashboardData = useCallback(async () => {
    const version = ++dashboardRequest.current;
    try {
      const config = await fetchJson<DashboardConfig>('/api/tracking/config');
      if (version !== dashboardRequest.current) return;
      if (config.realtimeToken) setRealtimeToken(config.realtimeToken);
      if (config.config?.tripIntervalSec) setTripIntervalSec(config.config.tripIntervalSec);
      setActiveTrip(config.sessionState.activeTrip);
      setActiveSession(config.sessionState.activeSession);

      // Filter on the server before pagination; history must not hide a pending pickup.
      const bookings: AssignedBooking[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = await fetchJson<{ data: AssignedBooking[]; pagination: { totalPages: number } }>(`/api/bookings?workflow=driver&limit=100&page=${page}`);
        if (version !== dashboardRequest.current) return;
        bookings.push(...result.data);
        totalPages = result.pagination.totalPages;
        page += 1;
      } while (page <= totalPages);
      setAssignedBookings(bookings);
      try {
        const poolRes = await fetchJson<{ data: VehicleOption[] }>('/api/vehicles?status=AVAILABLE&limit=12');
        if (version === dashboardRequest.current) setPoolVehicles(poolRes.data || []);
      } catch {
        // Pool vehicle list non-fatal
      }
      await fetchOffers();
    } catch (error) {
      if (version === dashboardRequest.current) {
        setActionError(error instanceof Error ? error.message : 'Unable to refresh the driver dashboard.');
      }
    } finally {
      if (version === dashboardRequest.current) setIsLoading(false);
    }
  }, [fetchOffers]);

  useEffect(() => {
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || actionInFlight.current || document.visibilityState === 'hidden') return;
      refreshing = true;
      try { await loadDashboardData(); } finally { refreshing = false; }
    };
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 15000);
    const offerInterval = setInterval(() => {
      if (!actionInFlight.current && document.visibilityState !== 'hidden') void fetchOffers();
    }, 3000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      dashboardRequest.current += 1;
      vehicleSearchRequest.current += 1;
      clearInterval(interval);
      clearInterval(offerInterval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [loadDashboardData, fetchOffers]);

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
      } else {
        const coords = await getCurrentPosition();
        const json = await fetchJson<{ data: DriverSession }>('/api/driver/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: selectedVehicle?.id || undefined, startLat: coords.lat, startLng: coords.lng }),
        });
        setActiveSession(json.data);
        startTracking();
        void fetchOffers();
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to change online status.');
      await loadDashboardData();
    } finally {
      actionInFlight.current = false;
      setIsTogglingOnline(false);
    }
  };

  // Accept offer
  const handleAcceptOffer = async (offerId: string) => {
    if (actionInFlight.current) {
      setActionError('Another action is in progress. Please wait.');
      return;
    }
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    try {
      await fetchJson(`/api/driver/offers/${offerId}/accept`, { method: 'POST' });
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to accept offer.');
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
    }
  };

  // Reject offer
  const handleRejectOffer = async (offerId: string) => {
    if (actionInFlight.current) {
      setActionError('Another action is in progress. Please wait.');
      return;
    }
    actionInFlight.current = true;
    dashboardRequest.current += 1;
    setActionError(null);
    try {
      await fetchJson(`/api/driver/offers/${offerId}/reject`, { method: 'POST' });
      setOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to reject offer.');
    } finally {
      await loadDashboardData();
      actionInFlight.current = false;
    }
  };

  // Dismiss expired offer
  const handleExpireOffer = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };

  // Vehicle plate search autocomplete
  const searchVehicle = async (term: string) => {
    const version = ++vehicleSearchRequest.current;
    setManualPlate(term);
    setSelectedVehicle(null);
    setMatchingVehicles([]);
    setStartError(null);
    if (term.trim().length < 2) return;
    try {
      const json = await fetchJson<{ data: VehicleOption[] }>(`/api/vehicles?search=${encodeURIComponent(term.trim())}&limit=20`);
      if (version === vehicleSearchRequest.current) {
        const available = json.data.filter((vehicle) => ['AVAILABLE', 'RESERVED'].includes(vehicle.status));
        setMatchingVehicles(available);
        if (available.length === 0) setStartError('No available vehicle matches this plate.');
      }
    } catch (error) {
      if (version === vehicleSearchRequest.current) {
        setStartError(error instanceof Error ? error.message : 'Unable to search vehicles.');
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
    try {
      const coords = await getCurrentPosition();
      setStartPhase('request');
      submitted = true;
      const json = await fetchJson<{ data: ActiveTrip }>('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...target, startLat: coords.lat, startLng: coords.lng }),
      });
      setActiveTrip(json.data);
      setElapsedDuration('');
      setTelemetryWarning(null);
      startTracking();
      await loadDashboardData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start trip. Please try again.';
      setStartError(message);
      setActionError(message);
      // A lost HTTP response does not prove a mutation failed. Reconcile before retry.
      if (submitted) await loadDashboardData();
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
      setActionError(error instanceof Error ? error.message : 'Unable to advance trip.');
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

    try {
      // Drain pending telemetry while the trip is ending
      let telemetryUploaded = true;
      try { await flushBuffer(); } catch { telemetryUploaded = false; }
      const endPayload: { endLat?: number; endLng?: number } = {};
      if (currentPosition) {
        endPayload.endLat = currentPosition.lat;
        endPayload.endLng = currentPosition.lng;
      }

      const aborted = Boolean(activeTrip.booking && currentBookingStatus !== 'IN_PROGRESS');
      const json = await fetchJson<{ data: { id: string; startedAt: string; endedAt?: string; distanceMeters?: number | null } }>(`/api/trips/${activeTrip.id}/${aborted ? 'abort' : 'end'}`, {
        method: aborted ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endPayload),
      });
      const trip = json.data;
      // Driver remains online on standby after ending trip (session & tracking stay active)
      setActiveTrip(null);
      setShowEndConfirm(false);
      setCompletedTripSummary({
        ...trip,
        durationMinutes: Math.round((new Date(trip.endedAt || Date.now()).getTime() - new Date(trip.startedAt).getTime()) / 60000),
        telemetryUploaded,
        aborted,
      });
      await loadDashboardData();
      startTracking();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to end trip.');
      await loadDashboardData();
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
    <div className="min-w-0 space-y-6 text-zinc-900">
      <header className="page-intro">
        <div>
          <p className="eyebrow">FleetTrack / Driver workspace</p>
          <h1 className="page-heading mt-2">Your driving day.</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-zinc-600">Your availability, assigned journeys, and live trip details, in one place.</p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <button
            type="button"
            disabled={isTogglingOnline || isStartingTrip || isLoading || Boolean(activeTrip)}
            onClick={handleToggleOnline}
            className={`${isOnline ? 'button-secondary' : 'button-primary'} min-h-12 w-full disabled:cursor-not-allowed sm:w-auto`}
          >
            {isTogglingOnline ? <Spinner size="sm" /> : <Icon name={isOnline ? 'close' : 'signal'} />}
            {isOnline ? 'Go offline' : 'Go online'}
          </button>
          <p className="text-xs font-semibold leading-relaxed text-zinc-600">{activeTrip ? 'Finish your trip before changing availability.' : isOnline ? 'Location sharing is on.' : 'Share your location to receive offers.'}</p>
        </div>
      </header>

      {/* Live tracking remains in the page flow, clear of the navigation dock. */}
      {activeTrip && (
        <div
          className={`driver-live-banner ${
            isSignalLostOrStale
              ? 'bg-amber-100 text-amber-950 border-amber-950!'
              : 'bg-emerald-100 text-emerald-950 border-emerald-950!'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <span className="relative flex h-4 w-4 shrink-0 mt-0.5 sm:mt-0">
                <span
                  className={`relative inline-flex rounded-full h-4 w-4 border-2 border-black ${
                    isSignalLostOrStale ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-black text-zinc-950">
                    {isSignalLostOrStale ? 'GPS signal interrupted' : 'Tracking active'}
                  </span>
                  <span
                    className={`rounded-md border-2 border-black px-2.5 py-0.5 text-xs font-black shadow-[2px_2px_0px_0px_#000] ${
                      isSignalLostOrStale
                        ? 'bg-amber-300 text-zinc-950'
                        : 'bg-emerald-300 text-zinc-950'
                    }`}
                  >
                    {isSignalLostOrStale ? 'Signal lost / paused' : 'Broadcasting live'}
                  </span>
                  {currentBookingStatus && (
                    <span className="rounded-md border-2 border-black bg-white px-2.5 py-0.5 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000]">
                      Status: {currentBookingStatus.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  )}
                </div>
                {isSignalLostOrStale ? (
                  <p className="mt-1 max-w-xl text-xs font-medium leading-relaxed text-amber-900">
                    Location updates pause when this tab is backgrounded or screen locks — reopen to resume
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-900">
                    Transmitting telemetry every {tripIntervalSec} seconds
                  </p>
                )}
              </div>
            </div>

            <div className="driver-trip-actions flex-wrap border-t-2 border-black/10 pt-4 text-sm md:border-0 md:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md border-2 border-black px-2.5 py-1 text-xs font-black shadow-[2px_2px_0px_0px_#000] capitalize ${
                    signalStatus === 'green'
                      ? 'bg-emerald-300 text-zinc-950'
                      : signalStatus === 'amber'
                      ? 'bg-amber-300 text-zinc-950'
                      : 'bg-rose-300 text-zinc-950'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full border border-black ${
                      signalStatus === 'green'
                        ? 'bg-emerald-500'
                        : signalStatus === 'amber'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  {confidenceScore > 0 ? `${confidenceScore}% Akurat` : signalStatus}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-black bg-white px-2 py-0.5 text-[11px] font-bold text-zinc-900 shadow-[2px_2px_0px_0px_#000]">
                  <Icon name={locationSource === 'wifi_cell_triangulation' ? 'wifi' : 'satellite'} className="size-3 text-zinc-700" />
                  <span>{locationSource === 'wifi_cell_triangulation' ? 'Wi-Fi/Cell' : 'GPS Presisi'}</span>
                </span>

                {jumpyDiscardCount > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-black bg-teal-200 px-2 py-0.5 text-[11px] font-bold text-teal-950 shadow-[2px_2px_0px_0px_#000]" title="Titik jumpy akibat sinyal dipantulkan telah dibersihkan otomatis">
                    <Icon name="shield" className="size-3 text-teal-900" />
                    <span>{jumpyDiscardCount} jumpy difilter</span>
                  </span>
                )}
              </div>

              <div className="rounded-md border-2 border-black bg-white px-3 py-1 shadow-[2px_2px_0px_0px_#000]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Duration</span>
                <span className="font-mono text-base font-black tabular-nums text-zinc-950">{elapsedDuration || '00:00:00'}</span>
              </div>

              <div className="rounded-md border-2 border-black bg-white px-3 py-1 shadow-[2px_2px_0px_0px_#000]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Last update</span>
                <span className="text-xs font-bold text-zinc-900">
                  {lastUpdated ? <RelativeTime date={lastUpdated} /> : 'Waiting...'}
                </span>
              </div>

              {/* Arrival Action when DRIVER_EN_ROUTE */}
              {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                <button
                  type="button"
                  onClick={handleArriveAtPickup}
                  disabled={isAdvancingTrip || isEndingTrip}
                  className="inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-400 px-5 py-3 text-sm font-black text-zinc-950 shadow-[3px_3px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_#000]"
                >
                  <Icon name="check" /><span>Mark arrived</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowEndConfirm(true)}
                className="hidden min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-black bg-rose-500 px-5 py-3 text-sm font-black text-white shadow-[3px_3px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[4px_4px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_#000] sm:inline-flex"
              >
                {stoppingPickup ? 'Stop pickup trip' : 'End trip'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Online Banner when NOT on active trip */}
      {!activeTrip && isOnline && (
        <div className="flex flex-col gap-4 rounded-2xl border-2.5 border-black bg-emerald-100 p-5 shadow-[4px_4px_0px_0px_#000] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              <span className="relative inline-flex rounded-full h-3.5 w-3.5 border border-black bg-emerald-500" />
            </span>
            <div>
              <span className="block text-sm font-black text-emerald-950">
                Online and sharing location
              </span>
              {activeSession?.vehicle && (
                <p className="mt-0.5 text-xs font-bold text-emerald-900">
                  Vehicle: <span className="font-mono font-black text-zinc-950">{activeSession.vehicle.plateNumber}</span> · {activeSession.vehicle.brand} {activeSession.vehicle.model}
                </p>
              )}
              <p className="mt-1 text-xs font-medium leading-relaxed text-emerald-900">
                Eligible for auto-dispatch offers. Keep this browser tab open.
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
              {isTogglingOnline ? <Spinner size="sm" /> : 'Go offline'}
            </button>
          </div>
        </div>
      )}

      {!activeTrip && <IosInstallHint />}


      {actionError && <ErrorBanner message={actionError} className="rounded-2xl! p-4! [&_button]:min-h-11 [&_button]:min-w-11" onDismiss={() => setActionError(null)} />}
      {geoError && <ErrorBanner message={geoError} className="rounded-2xl! p-4!" />}
      {telemetryWarning && <ErrorBanner message={`GPS upload warning: ${telemetryWarning}`} />}
      {isStartingTrip && <p role="status" aria-live="polite" className="flex items-center gap-3 text-sm font-bold text-emerald-950"><Spinner size="sm" />{startLabel} Please allow location access when prompted.</p>}

      {/* Permission Denied Banner with instructions */}
      {permissionDenied && (
        <div className="space-y-3 rounded-2xl border-2.5 border-black bg-amber-100 p-5 text-sm leading-relaxed text-zinc-950 shadow-[4px_4px_0px_0px_#000]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-black text-zinc-950">
              <Icon name="pin" className="shrink-0 text-amber-700" /><span>Izin Lokasi (GPS) Wajib Diaktifkan</span>
            </div>
            <button
              type="button"
              onClick={() => void getCurrentPosition().catch(() => {})}
              className="px-3.5 py-1.5 text-xs font-black bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000]"
            >
              Aktifkan Lokasi Sekarang
            </button>
          </div>
          <p className="text-xs font-semibold text-zinc-800">
            Browser Anda menolak atau belum memberikan akses GPS. Pengemudi wajib menyalakan lokasi agar dapat menerima penawaran trip dan menyiarkan armada.
          </p>
          <ul className="list-disc list-inside text-zinc-800 space-y-1 text-xs font-medium">
            <li>Klik ikon gembok / izin situs di address bar browser.</li>
            <li>Ubah opsi Lokasi (Location) menjadi &quot;Izinkan&quot; (Allow).</li>
            <li>Klik tombol &quot;Aktifkan Lokasi Sekarang&quot; di atas atau muat ulang halaman.</li>
          </ul>
        </div>
      )}

      {/* DISPATCH OFFERS PANEL (Realtime + Polling) */}
      {offers.length > 0 && (
        <div className="surface space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title flex items-center gap-2 text-zinc-900">
              <Icon name="bell" className="text-emerald-800" />
              Incoming offers ({offers.length})
            </h2>
            <span className="text-xs font-bold text-zinc-600">Respond before the 1-minute timer expires</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        </div>
      )}

      {/* MAIN VIEW: ACTIVE TRIP TELEMETRY */}
      {activeTrip ? (
        <section className="surface space-y-6 p-5 sm:p-8" aria-label="Active trip">
          <div className="flex flex-col justify-between gap-4 border-b-2 border-black/10 pb-6 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="eyebrow">Current journey</p>
              <h2 className="mt-2 wrap-anywhere text-2xl font-black tracking-tight sm:text-3xl text-zinc-950">{activeTrip.vehicle.brand} {activeTrip.vehicle.model}</h2>
              <p className="mt-2 flex items-center gap-2 font-mono text-sm font-bold text-zinc-700"><Icon name="car" className="shrink-0 text-emerald-800" />{activeTrip.vehicle.plateNumber}</p>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-3 sm:items-end">
              <StatusBadge status={activeTrip.status} />
              {activeTrip.booking && (
                <div className="rounded-lg border-2 border-black bg-zinc-50 p-2.5 shadow-[2px_2px_0px_0px_#000] text-left sm:text-right">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Booking reference</span>
                  <p className="mt-0.5 wrap-anywhere font-mono text-xs font-black text-zinc-900">{activeTrip.booking.bookingNumber}</p>
                </div>
              )}
            </div>
          </div>

          {activeTrip.booking ? (
            <div className="space-y-4">
              {/* PASSENGER PROFILE & CONTACT CARD (Gojek-style for Driver) */}
              <div className="rounded-xl border-2 border-black bg-emerald-50 p-4 space-y-3 shadow-[3px_3px_0px_0px_#000]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-emerald-400 text-zinc-950 font-black text-base shadow-[2px_2px_0px_0px_#000]">
                      {(activeTrip.booking.user?.name || 'Penumpang').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-black text-zinc-950 text-base">
                          {activeTrip.booking.user?.name || 'Penumpang KCIC'}
                        </h4>
                        <span className="rounded-md border-1.5 border-black bg-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-950 shadow-[1px_1px_0px_0px_#000]">
                          Penumpang
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-zinc-600 mt-0.5">
                        {activeTrip.booking.passengerCount ? `${activeTrip.booking.passengerCount} Penumpang` : '1 Penumpang'}
                      </p>
                    </div>
                  </div>

                  {/* Direct Contact Buttons (WhatsApp & Phone) */}
                  {activeTrip.booking.user?.phone && (
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://wa.me/${activeTrip.booking.user.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `Halo, saya pengemudi KCIC (${activeTrip.vehicle.plateNumber}) untuk pemesanan #${activeTrip.booking.bookingNumber}. Saya sedang menuju titik penjemputan (${activeTrip.booking.pickupLocation}).`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-emerald-400 px-3.5 py-2 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition"
                      >
                        <svg className="size-3.5 fill-current" viewBox="0 0 24 24">
                          <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.074-2.001-.466-1.503-.623-2.529-2.115-2.607-2.219-.074-.103-.615-.818-.615-1.56 0-.743.391-1.107.531-1.258.14-.15.307-.188.409-.188.103 0 .205.004.296.009.096.005.225-.036.352.27.13.313.444 1.082.483 1.161.039.08.065.173.013.277-.052.103-.079.168-.156.259-.078.09-.163.201-.233.27-.08.077-.163.161-.07.32.093.16.413.682.886 1.103.609.543 1.123.711 1.282.79.16.08.254.07.348-.039.095-.109.406-.473.514-.635.109-.162.217-.135.367-.08.151.054.958.452 1.123.535.165.083.276.124.316.193.04.07.04.405-.104.81z"/>
                        </svg>
                        <span>WhatsApp</span>
                      </a>
                      <a
                        href={`tel:${activeTrip.booking.user.phone}`}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-white px-3.5 py-2 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition"
                      >
                        <Icon name="phone" className="size-3.5" />
                        <span>Telepon</span>
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Route details */}
              <TripRoute pickup={activeTrip.booking.pickupLocation} destination={activeTrip.booking.destination} />

              {/* DRIVER LIVE NAVIGATION MAP */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-500">
                    Navigasi & Posisi Langsung Armada
                  </span>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                      currentBookingStatus === 'DRIVER_EN_ROUTE'
                        ? activeTrip.booking.pickupLocation
                        : activeTrip.booking.destination
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-amber-200 px-3 py-1.5 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition"
                  >
                    <span>Buka Google Maps</span>
                    <Icon name="arrowUp" className="size-3.5" />
                  </a>
                </div>

                <div className="bezel overflow-hidden rounded-xl">
                  <FleetMap
                    vehicles={driverVehicleMarker}
                    selectedVehicleId={activeTrip.vehicle.id}
                    routePoints={driverRoutePoints}
                    zoom={15}
                    className="h-[320px] sm:h-[380px] w-full"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border-2 border-black bg-zinc-50 p-5 shadow-[3px_3px_0px_0px_#000]">
              <Icon name="route" className="mt-0.5 shrink-0 text-emerald-800" />
              <div><h3 className="text-base font-black text-zinc-950">Ad-hoc vehicle trip</h3><p className="mt-1 text-xs font-medium leading-relaxed text-zinc-600">This journey is not linked to a booking. Your live trip telemetry appears below.</p></div>
            </div>
          )}

          {/* Workflow Stage Action Buttons for Driver */}
          {activeTrip.booking && (
            <div className="flex flex-col justify-between gap-4 rounded-xl border-2 border-black bg-emerald-100 p-5 shadow-[3px_3px_0px_0px_#000] lg:flex-row lg:items-center">
              <div>
                <span className="block text-xs font-black uppercase tracking-wider text-emerald-900">Current trip stage</span>
                <span className="mt-1 block text-base font-black leading-relaxed text-zinc-950">
                  {currentBookingStatus === 'DRIVER_EN_ROUTE'
                    ? 'En route to pickup location'
                    : currentBookingStatus === 'ARRIVED'
                    ? 'Arrived at pickup — awaiting passenger boarding'
                    : currentBookingStatus === 'IN_PROGRESS'
                    ? 'Trip in progress to destination'
                    : currentBookingStatus?.replace(/_/g, ' ').toLowerCase()}
                </span>
              </div>

              <div className="driver-trip-actions shrink-0">
                {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                  <button
                    type="button"
                    onClick={handleArriveAtPickup}
                    disabled={isAdvancingTrip || isEndingTrip}
                    className="button-primary"
                  >
                    <Icon name="check" /><span>Arrived at pickup</span>
                  </button>
                )}

                {currentBookingStatus === 'ARRIVED' && (
                  <button
                    type="button"
                    onClick={() => handleStartPassengerTrip(activeTrip.booking!.id)}
                    disabled={isAdvancingTrip || isEndingTrip}
                    className="button-primary"
                  >
                    <Icon name="arrow" /><span>Passengers boarded — start trip</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Warning banner when GPS is stale or signal lost */}
          {isSignalLostOrStale && (
            <div className="flex items-start gap-3 rounded-xl border-2 border-black bg-amber-100 p-5 text-sm leading-relaxed text-zinc-950 shadow-[3px_3px_0px_0px_#000]">
              <Icon name="signal" className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <span className="block font-black text-amber-950">GPS signal paused</span>
                <p className="mt-0.5 text-xs font-semibold text-amber-900 leading-relaxed">
                  Location updates pause when this tab is backgrounded or screen locks — reopen to resume.
                </p>
              </div>
            </div>
          )}

          {/* Realtime Telemetry Grid */}
          <div>
            <h3 className="section-title mb-4 text-zinc-950">
              Live telemetry
            </h3>

            <div className="grid grid-cols-1 gap-3 text-sm min-[380px]:grid-cols-2 lg:grid-cols-4">
              <div className="min-w-0 rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_0px_#000]">
                <span className="block text-[11px] font-black uppercase tracking-wider text-zinc-500">Signal</span>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border border-black ${
                      signalStatus === 'green'
                        ? 'bg-emerald-400'
                        : signalStatus === 'amber'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  <span className="font-black capitalize text-zinc-950">{signalStatus}</span>
                </div>
              </div>

              <div className="min-w-0 rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_0px_#000]">
                <span className="block text-[11px] font-black uppercase tracking-wider text-zinc-500">GPS accuracy</span>
                <div className="mt-1">
                  <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                </div>
              </div>

              <div className="min-w-0 rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_0px_#000]">
                <span className="block text-[11px] font-black uppercase tracking-wider text-zinc-500">Movement</span>
                <div className="mt-1">
                  <MovementBadge movement={movement} />
                </div>
              </div>

              <div className="min-w-0 rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_0px_#000]">
                <span className="block text-[11px] font-black uppercase tracking-wider text-zinc-500">Last update</span>
                <div className="mt-2 text-sm font-bold text-zinc-900">
                  <RelativeTime date={lastUpdated} />
                </div>
              </div>
            </div>

            {currentPosition && (
              <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border-2 border-black bg-zinc-100 p-4 font-mono text-xs font-bold text-zinc-800 shadow-[2px_2px_0px_0px_#000] min-[380px]:grid-cols-2 lg:grid-cols-4">
                <span>Lat: {currentPosition.lat.toFixed(5)}</span>
                <span>Lng: {currentPosition.lng.toFixed(5)}</span>
                <span>
                  Speed:{' '}
                  {currentPosition.speedMps !== null
                    ? `${(currentPosition.speedMps * 3.6).toFixed(1)} km/h`
                    : '0 km/h'}
                </span>
                <span>
                  Heading:{' '}
                  {currentPosition.headingDeg !== null
                    ? `${Math.round(currentPosition.headingDeg)}°`
                    : '—'}
                </span>
              </div>
            )}
          </div>

          <div className="driver-trip-actions justify-end border-t-2 border-black/10 pt-6">
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-black bg-rose-500 px-6 py-3 text-sm font-black text-white shadow-[4px_4px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_#000] sm:w-auto"
            >
              <Icon name="check" />{stoppingPickup ? 'Stop pickup trip' : 'Finish and end trip'}
            </button>
          </div>
        </section>
      ) : (
        /* NO ACTIVE TRIP: START TRIP INTERFACE */
        <div className="space-y-6">
          {/* Assigned Bookings Section */}
          <section className="surface space-y-5 p-5 sm:p-7" aria-label="Assigned bookings">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Your next pickup</p>
                <h2 className="section-title mt-2 text-zinc-900">
                  Assigned bookings <span className="ml-2 rounded-md border-2 border-black bg-emerald-200 px-2.5 py-0.5 text-xs font-black text-zinc-950 shadow-[1px_1px_0px_0px_#000]">{assignedBookings.length}</span>
                </h2>
                <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-600">Start an assigned trip to begin the drive to pickup.</p>
              </div>
            </div>

            {assignedBookings.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border-2 border-black bg-zinc-50 px-5 py-10 text-center shadow-[3px_3px_0px_0px_#000]">
                {isLoading ? (
                  <div role="status" className="flex items-center gap-3 text-sm font-bold text-zinc-700"><Spinner size="md" />Loading your assigned bookings...</div>
                ) : (
                  <>
                    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-emerald-300 text-zinc-950 shadow-[2px_2px_0px_0px_#000]"><Icon name="route" /></div>
                    <h3 className="text-base font-black text-zinc-900">Ready for your next assignment.</h3>
                    <p className="mt-2 max-w-sm text-xs font-medium leading-relaxed text-zinc-600">No active bookings are assigned to you. Go online above to receive dispatch offers.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-w-0 flex-col justify-between gap-5 rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_#000]"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="wrap-anywhere font-mono text-xs font-bold text-zinc-800 bg-zinc-100 px-2 py-1 rounded border border-black">{b.bookingNumber}</span>
                        <StatusBadge status={b.status} />
                      </div>

                      <TripRoute pickup={b.pickupLocation} destination={b.destination} />

                      <div className="rounded-lg border border-black bg-zinc-50 p-2.5 text-xs font-semibold text-zinc-700">
                        Departure:{' '}
                        {new Date(b.departureAt).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        • {b.passengerCount} passengers
                      </div>

                      {b.vehicle && (
                        <div className="wrap-anywhere flex items-center gap-1.5 border-t-2 border-black/10 pt-3 text-sm font-bold text-zinc-800">
                          <Icon name="car" className="size-4 shrink-0 text-zinc-700" />
                          <span>{b.vehicle.plateNumber} ({b.vehicle.brand} {b.vehicle.model})</span>
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
                      <span>{isStartingTrip ? startLabel : 'Start trip to pickup'}</span>
                    </button>
                    {startError && <ErrorBanner message={startError} />}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Ad-hoc Vehicle Trip Start & Pool Selection */}
          <section id="vehicle-selection" className="surface space-y-5 p-5 sm:p-7" aria-label="Vehicle selection and trip start">
            <div>
              <h2 className="section-title text-zinc-900">
                Select vehicle from pool
              </h2>
              <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-600">
                Pick an available vehicle to go online for dispatches or start an ad-hoc trip immediately.
              </p>
            </div>

            <div className="max-w-md space-y-3">
              <div>
                <label htmlFor="vehicle-plate" className="mb-2 block text-xs font-black uppercase tracking-wider text-zinc-700">
                  Search license plate
                </label>
                <input
                  id="vehicle-plate"
                  type="text"
                  placeholder="e.g. B 1234 ABC or D 8888 GH"
                  value={manualPlate}
                  disabled={isStartingTrip || isTogglingOnline}
                  onChange={(e) => searchVehicle(e.target.value)}
                  className="min-h-14 w-full rounded-xl border-2 border-black bg-white px-4 py-3 font-mono text-base font-bold text-zinc-950 shadow-[3px_3px_0px_0px_#000] outline-none placeholder:font-sans placeholder:font-normal placeholder:text-zinc-400 focus:shadow-[4px_4px_0px_0px_#059669]"
                />
              </div>

              {poolVehicles.length > 0 && !selectedVehicle && !manualPlate && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-black uppercase tracking-wider text-zinc-500">Available in pool</p>
                  <div className="flex flex-wrap gap-2">
                    {poolVehicles.map((v) => (
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
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-black bg-white px-3 py-2 text-xs font-bold text-zinc-900 shadow-[2px_2px_0px_0px_#000] transition hover:bg-emerald-100 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000]"
                      >
                        <span className="font-mono font-black text-zinc-950">{v.plateNumber}</span>
                        <span className="text-zinc-600">{v.brand} {v.model}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {matchingVehicles.length > 0 && !selectedVehicle && (
                <div className="overflow-hidden rounded-xl border-2 border-black bg-white divide-y-2 divide-black shadow-[4px_4px_0px_0px_#000]">
                  {matchingVehicles.map((v) => (
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
                      className="flex min-h-14 w-full cursor-pointer flex-wrap items-center justify-between gap-3 p-4 text-left text-sm hover:bg-zinc-50"
                    >
                      <div>
                        <span className="font-mono font-black text-zinc-950">{v.plateNumber}</span>
                        <span className="text-zinc-600 ml-2 font-medium">
                          {v.brand} {v.model}
                        </span>
                      </div>
                      <StatusBadge status={v.status} />
                    </button>
                  ))}
                </div>
              )}

              {selectedVehicle && (
                <div className="space-y-4 rounded-xl border-2 border-black bg-emerald-100 p-5 text-sm shadow-[4px_4px_0px_0px_#000]">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-zinc-950 text-base">{selectedVehicle.plateNumber}</span>
                      <p className="text-xs font-semibold text-zinc-700">
                        {selectedVehicle.brand} {selectedVehicle.model} ({selectedVehicle.seatingCapacity} seats)
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
                      className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border-2 border-black bg-white px-3 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000]"
                    >
                      Change
                    </button>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {!isOnline && (
                      <button
                        type="button"
                        onClick={handleToggleOnline}
                        disabled={isTogglingOnline || isStartingTrip || isLoading}
                        className="button-secondary flex-1"
                      >
                        {isTogglingOnline ? <Spinner size="sm" /> : <Icon name="signal" />}
                        <span>Go online with this unit</span>
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
                      <span>{isStartingTrip ? startLabel : `Start trip with ${selectedVehicle.plateNumber}`}</span>
                    </button>
                  </div>
                  <p role="status" aria-live="polite" className="text-xs font-semibold leading-relaxed text-emerald-950">
                    {startPhase === 'gps' ? 'Allow location access in the browser prompt. GPS can take up to 15 seconds.' : startPhase === 'request' ? 'Saving your trip. Please wait without closing this screen.' : 'GPS permission and HTTPS (or localhost) are required. Keep this screen open while driving.'}
                  </p>
                </div>
              )}
              {startError && <ErrorBanner message={startError} />}
            </div>
          </section>
        </div>
      )}

      {/* Confirmation Dialog to End Trip */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndTrip}
        title={stoppingPickup ? 'Stop this pickup trip?' : 'Finish and end trip?'}
        message={stoppingPickup ? 'This will stop tracking and take you offline. The booking stays assigned for retry; it will not be marked completed.' : 'This will finish the trip and take you offline. Any standing vehicle assignment remains reserved for you.'}
        confirmLabel={stoppingPickup ? 'Stop pickup trip' : 'End trip now'}
        isDestructive={true}
        isLoading={isEndingTrip}
      />

      {/* Trip Completed Summary Modal */}
      {completedTripSummary && (
        <Modal
          isOpen={Boolean(completedTripSummary)}
          onClose={() => setCompletedTripSummary(null)}
          title={completedTripSummary.aborted ? 'Pickup trip stopped' : 'Trip completed successfully'}
          description={completedTripSummary.aborted ? 'The booking remains assigned for retry' : 'GPS tracking session finalized'}
          footer={
            <button
              type="button"
              onClick={() => setCompletedTripSummary(null)}
              className="button-primary"
            >
              Done
            </button>
          }
        >
          <div className="space-y-5 text-sm">
            <div className="rounded-xl border-2 border-black bg-emerald-100 p-4 leading-relaxed text-zinc-950 shadow-[3px_3px_0px_0px_#000]">
              <span className="block font-black">{completedTripSummary.aborted ? 'Trip stopped, booking not completed' : 'Trip closed'}</span>
              <p className="mt-1 text-xs font-medium text-emerald-950">{completedTripSummary.telemetryUploaded ? 'Trip and online session closed. Valid GPS updates received by the server are retained.' : 'Trip closed, but some final GPS updates could not be uploaded. Your earlier stored updates are retained.'}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-xl border-2 border-black bg-zinc-50 p-3 shadow-[2px_2px_0px_0px_#000]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Duration</span>
                <span className="font-black text-sm text-zinc-950">
                  {completedTripSummary.durationMinutes} minutes
                </span>
              </div>
              <div className="rounded-xl border-2 border-black bg-zinc-50 p-3 shadow-[2px_2px_0px_0px_#000]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">Distance</span>
                <span className="font-black text-sm text-zinc-950">
                  {completedTripSummary.distanceMeters
                    ? `${(completedTripSummary.distanceMeters / 1000).toFixed(2)} km`
                    : 'Tracked via GPS'}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
