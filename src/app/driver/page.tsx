'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

interface DriverSession {
  id: string;
  driverId: string;
  vehicleId?: string | null;
  status: string;
  startedAt: string;
}

export default function DriverDashboardPage() {
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [assignedBookings, setAssignedBookings] = useState<AssignedBooking[]>([]);
  const [activeSession, setActiveSession] = useState<DriverSession | null>(null);
  const [offers, setOffers] = useState<DriverOffer[]>([]);
  const [tripIntervalSec, setTripIntervalSec] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

  // Online toggle state
  const isOnline = Boolean(activeSession && activeSession.status === 'ACTIVE');
  const [isTogglingOnline, setIsTogglingOnline] = useState(false);

  // Manual vehicle start trip
  const [manualPlate, setManualPlate] = useState('');
  const [matchingVehicles, setMatchingVehicles] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<any | null>(null);

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
  } | null>(null);

  // Batch flush handler for useGeolocation
  const handleLocationFlush = useCallback(async (batch: GeoPoint[]) => {
    if (batch.length === 0) return;
    try {
      const payload = {
        points: batch.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          accuracyM: p.accuracyM,
          speedMps: p.speedMps,
          headingDeg: p.headingDeg,
          recordedAt: p.recordedAt,
        })),
      };

      await fetch('/api/tracking/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      // Ingest error handled silently; buffer retention handles network hiccups
    }
  }, []);

  const {
    isTracking,
    currentPosition,
    quality,
    signalStatus,
    movement,
    permissionDenied,
    error: geoError,
    lastUpdated,
    isStale,
    getCurrentPosition,
    startTracking,
    stopTracking,
  } = useGeolocation({
    intervalSec: tripIntervalSec,
    onFlush: handleLocationFlush,
  });

  // Signal lost or stale calculation
  const isSignalLostOrStale =
    isStale ||
    signalStatus === 'red' ||
    movement === 'GPS_LOST' ||
    Boolean(geoError) ||
    (lastUpdated ? Date.now() - lastUpdated.getTime() > tripIntervalSec * 2 * 1000 : false);

  // Fetch driver offers (polling fallback)
  const fetchOffers = async () => {
    try {
      const res = await fetch('/api/driver/offers');
      if (res.ok) {
        const json = await res.json();
        const list: DriverOffer[] = json.data || [];
        // Filter out expired offers
        const active = list.filter((o) => new Date(o.expiresAt).getTime() > Date.now());
        setOffers(active);
      }
    } catch {
      // ignore
    }
  };

  // Connect realtime offers
  useRealtime({
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
  const loadDashboardData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [configRes, sessionRes, bookingsRes] = await Promise.all([
        fetch('/api/tracking/config'),
        fetch('/api/driver/sessions'),
        fetch('/api/bookings?limit=10'),
      ]);

      if (configRes.ok) {
        const cJson = await configRes.json();
        if (cJson.config?.tripIntervalSec) {
          setTripIntervalSec(cJson.config.tripIntervalSec);
        }
        if (cJson.sessionState?.activeTrip) {
          setActiveTrip(cJson.sessionState.activeTrip);
        } else {
          setActiveTrip(null);
        }
      }

      if (sessionRes.ok) {
        const sJson = await sessionRes.json();
        setActiveSession(sJson.data || null);
      }

      if (bookingsRes.ok) {
        const bJson = await bookingsRes.json();
        const list: AssignedBooking[] = bJson.data || [];
        // Filter to driver active workflow statuses
        const filtered = list.filter((b) =>
          ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status)
        );
        setAssignedBookings(filtered);
      }

      await fetchOffers();
    } catch {
      setActionError('Network error loading driver dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(() => {
      fetchOffers();
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // When active trip exists OR online session is active, activate GPS tracking
  useEffect(() => {
    if ((activeTrip || isOnline) && !isTracking && !permissionDenied) {
      startTracking();
    }
  }, [activeTrip, isOnline, isTracking, permissionDenied, startTracking]);

  // Session duration ticker
  useEffect(() => {
    if (!activeTrip) {
      setElapsedDuration('');
      return;
    }

    const startMs = new Date(activeTrip.startedAt).getTime();
    const updateTicker = () => {
      const diffMs = Math.max(0, Date.now() - startMs);
      const hrs = Math.floor(diffMs / 3600000);
      const mins = Math.floor((diffMs % 3600000) / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setElapsedDuration(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
    };

    updateTicker();
    const timer = setInterval(updateTicker, 1000);
    return () => clearInterval(timer);
  }, [activeTrip]);

  // Handle Online / Offline toggle
  const handleToggleOnline = async () => {
    setActionError(null);
    setIsTogglingOnline(true);
    try {
      if (isOnline) {
        // End online session
        const res = await fetch('/api/driver/sessions/current/end', {
          method: 'PATCH',
        });
        if (res.ok) {
          setActiveSession(null);
          if (!activeTrip) {
            stopTracking();
          }
        } else {
          const err = await res.json();
          setActionError(err.error?.message || 'Failed to end online session');
        }
      } else {
        // Start online session - explicit location permission consent
        const coords = await getCurrentPosition();
        const res = await fetch('/api/driver/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleId: selectedVehicle?.id || undefined,
            startLat: coords.lat,
            startLng: coords.lng,
          }),
        });
        if (res.ok) {
          const json = await res.json();
          setActiveSession(json.data);
          startTracking();
          fetchOffers();
        } else {
          const err = await res.json();
          setActionError(err.error?.message || 'Failed to start online session');
        }
      }
    } catch (err: any) {
      setActionError(err.message || 'GPS location permission required to go online');
    } finally {
      setIsTogglingOnline(false);
    }
  };

  // Accept offer
  const handleAcceptOffer = async (offerId: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/driver/offers/${offerId}/accept`, {
        method: 'POST',
      });
      if (res.ok) {
        setOffers((prev) => prev.filter((o) => o.id !== offerId));
        await loadDashboardData();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to accept offer. It may have expired.');
      }
    } catch {
      setActionError('Network error accepting offer');
    }
  };

  // Reject offer
  const handleRejectOffer = async (offerId: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/driver/offers/${offerId}/reject`, {
        method: 'POST',
      });
      if (res.ok) {
        setOffers((prev) => prev.filter((o) => o.id !== offerId));
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to reject offer');
      }
    } catch {
      setActionError('Network error rejecting offer');
    }
  };

  // Dismiss expired offer
  const handleExpireOffer = (offerId: string) => {
    setOffers((prev) => prev.filter((o) => o.id !== offerId));
  };

  // Vehicle plate search autocomplete
  const searchVehicle = async (term: string) => {
    setManualPlate(term);
    setSelectedVehicle(null);
    if (!term.trim() || term.length < 2) {
      setMatchingVehicles([]);
      return;
    }
    try {
      const res = await fetch(`/api/vehicles?search=${encodeURIComponent(term.trim())}&limit=5`);
      if (res.ok) {
        const json = await res.json();
        setMatchingVehicles(json.data || json.vehicles || []);
      }
    } catch {
      // ignore
    }
  };

  // Start trip from booking (transitions booking to DRIVER_EN_ROUTE)
  const handleStartBookingTrip = async (booking: AssignedBooking) => {
    setActionError(null);
    try {
      const initialCoords = await getCurrentPosition();

      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          vehicleId: booking.vehicle?.id || undefined,
          startLat: initialCoords.lat,
          startLng: initialCoords.lng,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setActiveTrip(json.data);
        startTracking();
        await loadDashboardData();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to start trip');
      }
    } catch (err: any) {
      setActionError(err.message || 'Geolocation access is required to start a trip');
    }
  };

  // Mark arrived at pickup location
  const handleArriveAtPickup = async () => {
    if (!activeTrip) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/trips/${activeTrip.id}/arrived`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadDashboardData();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to mark arrival at pickup');
      }
    } catch {
      setActionError('Network error marking arrival');
    }
  };

  // Start trip with passenger (ARRIVED -> IN_PROGRESS)
  const handleStartPassengerTrip = async (bookingId: string) => {
    setActionError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });
      if (res.ok) {
        await loadDashboardData();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to start in-progress trip');
      }
    } catch {
      setActionError('Network error advancing trip');
    }
  };

  // Start trip from vehicle
  const handleStartVehicleTrip = async () => {
    if (!selectedVehicle) return;
    setActionError(null);
    try {
      const initialCoords = await getCurrentPosition();

      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: selectedVehicle.id,
          startLat: initialCoords.lat,
          startLng: initialCoords.lng,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        setActiveTrip(json.data);
        startTracking();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to start vehicle trip');
      }
    } catch (err: any) {
      setActionError(err.message || 'Geolocation access is required to start a trip');
    }
  };

  // End trip action
  const handleEndTrip = async () => {
    if (!activeTrip) return;
    setIsEndingTrip(true);
    setActionError(null);

    try {
      const endPayload: { endLat?: number; endLng?: number } = {};
      if (currentPosition) {
        endPayload.endLat = currentPosition.lat;
        endPayload.endLng = currentPosition.lng;
      }

      const res = await fetch(`/api/trips/${activeTrip.id}/end`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endPayload),
      });

      if (res.ok) {
        const json = await res.json();
        const trip = json.data;
        if (!isOnline) {
          stopTracking();
        }
        setActiveTrip(null);
        setShowEndConfirm(false);

        // Calculate summary
        const start = new Date(trip.startedAt).getTime();
        const end = new Date(trip.endedAt || Date.now()).getTime();
        const durationMinutes = Math.round((end - start) / 60000);

        setCompletedTripSummary({
          id: trip.id,
          startedAt: trip.startedAt,
          endedAt: trip.endedAt,
          durationMinutes,
          distanceMeters: trip.distanceMeters,
        });

        loadDashboardData();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to end trip');
      }
    } catch {
      setActionError('Network error ending trip');
    } finally {
      setIsEndingTrip(false);
    }
  };

  // Find linked booking for the active trip if available
  const activeBooking = assignedBookings.find((b) => b.id === activeTrip?.booking?.id);
  const currentBookingStatus = activeBooking?.status || activeTrip?.booking?.status;

  return (
    <div className={`space-y-6 ${activeTrip ? 'pb-24 sm:pb-6' : ''}`}>
      {/* Persistent "Tracking active" banner when on trip */}
      {activeTrip && (
        <div
          className={`sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 -mt-6 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 transition-colors shadow-md ${
            isSignalLostOrStale
              ? 'bg-amber-950 text-amber-50 border-b border-amber-800'
              : 'bg-emerald-800 text-white border-b border-emerald-700'
          }`}
        >
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-3">
              <span className="relative flex h-3.5 w-3.5 shrink-0 mt-0.5 sm:mt-0">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isSignalLostOrStale ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    isSignalLostOrStale ? 'bg-amber-500' : 'bg-emerald-400'
                  }`}
                />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-xs sm:text-sm tracking-wide uppercase">
                    {isSignalLostOrStale ? 'GPS Signal Interrupted' : 'Tracking Active'}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold border ${
                      isSignalLostOrStale
                        ? 'bg-amber-900 text-amber-200 border-amber-700'
                        : 'bg-emerald-900 text-emerald-200 border-emerald-600'
                    }`}
                  >
                    {isSignalLostOrStale ? 'Signal Lost / Paused' : 'Broadcasting Live'}
                  </span>
                  {currentBookingStatus && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-white/20 text-white">
                      Status: {currentBookingStatus.replace(/_/g, ' ')}
                    </span>
                  )}
                </div>
                {isSignalLostOrStale ? (
                  <p className="text-xs text-amber-200 mt-1 leading-normal font-medium">
                    Location updates pause when this tab is backgrounded or screen locks — reopen to resume
                  </p>
                ) : (
                  <p className="text-xs text-emerald-100 mt-0.5">
                    Transmitting telemetry every {tripIntervalSec} seconds
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-4 text-xs font-mono border-t border-white/10 md:border-0 pt-2 md:pt-0">
              <div className="flex items-center gap-2">
                <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold uppercase font-sans border ${
                    signalStatus === 'green'
                      ? 'bg-emerald-900/60 text-emerald-200 border-emerald-600'
                      : signalStatus === 'amber'
                      ? 'bg-amber-900/60 text-amber-200 border-amber-600'
                      : 'bg-rose-900/60 text-rose-200 border-rose-600'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      signalStatus === 'green'
                        ? 'bg-emerald-400'
                        : signalStatus === 'amber'
                        ? 'bg-amber-400'
                        : 'bg-rose-400'
                    }`}
                  />
                  {signalStatus}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-sans opacity-70 block">Duration</span>
                <span className="text-sm sm:text-base font-bold">{elapsedDuration || '00:00:00'}</span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-sans opacity-70 block">Last Update</span>
                <span className="text-xs font-sans text-white/90">
                  {lastUpdated ? <RelativeTime date={lastUpdated} /> : 'Waiting...'}
                </span>
              </div>

              {/* Arrival Action when DRIVER_EN_ROUTE */}
              {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                <button
                  type="button"
                  onClick={handleArriveAtPickup}
                  className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded shadow-xs cursor-pointer uppercase tracking-wider text-xs font-sans inline-flex items-center gap-1"
                >
                  <span>✓ Mark Arrived</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowEndConfirm(true)}
                className="hidden sm:inline-flex min-h-[38px] px-3.5 py-1.5 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-100 font-bold rounded shadow-xs cursor-pointer uppercase tracking-wider text-xs font-sans items-center"
              >
                End Trip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Online Banner when NOT on active trip */}
      {!activeTrip && isOnline && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 block">
                Online — Sharing Location
              </span>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Eligible for auto-dispatch offers. Keep this browser tab open.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center">
            <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
            <button
              type="button"
              disabled={isTogglingOnline}
              onClick={handleToggleOnline}
              className="px-3 py-1 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded cursor-pointer"
            >
              {isTogglingOnline ? <Spinner size="sm" /> : 'Go Offline'}
            </button>
          </div>
        </div>
      )}

      {!activeTrip && <IosInstallHint />}

      {/* Header & Go Online Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Driver Operations</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Live trip management, dispatch offers, and automatic GPS telemetry
          </p>
        </div>

        {/* Go Online / Offline Toggle Button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={isTogglingOnline || Boolean(activeTrip)}
            onClick={handleToggleOnline}
            className={`min-h-[40px] px-4 py-2 rounded text-xs font-bold tracking-wide uppercase cursor-pointer inline-flex items-center gap-2 shadow-xs transition-colors ${
              isOnline
                ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {isTogglingOnline ? (
              <Spinner size="sm" />
            ) : (
              <span
                className={`w-2 h-2 rounded-full ${isOnline ? 'bg-rose-500' : 'bg-white'}`}
              />
            )}
            <span>{isOnline ? 'Go Offline' : 'Go Online (Share Location)'}</span>
          </button>
        </div>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {geoError && <ErrorBanner message={geoError} />}

      {/* Permission Denied Banner with instructions */}
      {permissionDenied && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs space-y-2">
          <div className="font-bold text-sm flex items-center gap-2 text-amber-800">
            <span>⚠️ Location Permission Required</span>
          </div>
          <p>
            Your browser denied GPS location access. Company compliance requires real-time telemetry while online.
          </p>
          <ul className="list-disc list-inside text-amber-800 space-y-1">
            <li>Click the site lock / settings icon in your browser address bar.</li>
            <li>Change "Location" from "Block" to "Allow".</li>
            <li>Reload the page to restart tracking.</li>
          </ul>
        </div>
      )}

      {/* DISPATCH OFFERS PANEL (Realtime + Polling) */}
      {offers.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
              Incoming Dispatch Offers ({offers.length})
            </h2>
            <span className="text-[11px] text-zinc-500">Respond before the 30s timer expires</span>
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
        <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-zinc-100 gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Current Vehicle</span>
              <h2 className="text-lg font-bold text-zinc-900">
                {activeTrip.vehicle.brand} {activeTrip.vehicle.model}{' '}
                <span className="font-mono text-zinc-600">({activeTrip.vehicle.plateNumber})</span>
              </h2>
            </div>

            {activeTrip.booking && (
              <div className="text-right sm:text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Booking Ref</span>
                <div className="font-bold text-sm text-zinc-800">{activeTrip.booking.bookingNumber}</div>
              </div>
            )}
          </div>

          {activeTrip.booking && (
            <div className="p-3 bg-zinc-50 rounded border border-zinc-200 text-xs grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-zinc-400 uppercase font-semibold">Origin</span>
                <p className="font-medium text-zinc-900 mt-0.5">{activeTrip.booking.pickupLocation}</p>
              </div>
              <div>
                <span className="text-zinc-400 uppercase font-semibold">Destination</span>
                <p className="font-medium text-zinc-900 mt-0.5">{activeTrip.booking.destination}</p>
              </div>
            </div>
          )}

          {/* Workflow Stage Action Buttons for Driver */}
          {activeTrip.booking && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-indigo-950 block">Current Trip Stage:</span>
                <span className="text-indigo-800 font-medium">
                  {currentBookingStatus === 'DRIVER_EN_ROUTE'
                    ? 'En route to pickup location'
                    : currentBookingStatus === 'ARRIVED'
                    ? 'Arrived at pickup — awaiting passenger boarding'
                    : currentBookingStatus === 'IN_PROGRESS'
                    ? 'Trip in progress to destination'
                    : currentBookingStatus?.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {currentBookingStatus === 'DRIVER_EN_ROUTE' && (
                  <button
                    type="button"
                    onClick={handleArriveAtPickup}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded font-bold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                  >
                    <span>✓ Arrived at Pickup</span>
                  </button>
                )}

                {currentBookingStatus === 'ARRIVED' && (
                  <button
                    type="button"
                    onClick={() => handleStartPassengerTrip(activeTrip.booking!.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold cursor-pointer shadow-xs inline-flex items-center gap-1.5"
                  >
                    <span>🚀 Passengers Boarded — Start Trip</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Warning banner when GPS is stale or signal lost */}
          {isSignalLostOrStale && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">⚠️</span>
              <div>
                <span className="font-bold block text-amber-900">GPS Signal Paused</span>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Location updates pause when this tab is backgrounded or screen locks — reopen to resume.
                </p>
              </div>
            </div>
          )}

          {/* Realtime Telemetry Grid */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">
              Live Telemetry State
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Signal</span>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      signalStatus === 'green'
                        ? 'bg-emerald-500'
                        : signalStatus === 'amber'
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                  />
                  <span className="font-bold text-zinc-800 uppercase">{signalStatus}</span>
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">GPS Accuracy</span>
                <div className="mt-1">
                  <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Movement</span>
                <div className="mt-1">
                  <MovementBadge movement={movement} />
                </div>
              </div>

              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Last Update</span>
                <div className="mt-1 font-mono text-zinc-700">
                  <RelativeTime date={lastUpdated} />
                </div>
              </div>
            </div>

            {currentPosition && (
              <div className="mt-3 p-2.5 bg-zinc-100 rounded text-[11px] font-mono text-zinc-600 flex flex-wrap items-center justify-between gap-2">
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

          <div className="pt-4 border-t border-zinc-200 flex items-center justify-end">
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded text-xs font-semibold cursor-pointer uppercase tracking-wider flex items-center justify-center"
            >
              Finish & End Trip
            </button>
          </div>
        </div>
      ) : (
        /* NO ACTIVE TRIP: START TRIP INTERFACE */
        <div className="space-y-6">
          {/* Assigned Bookings Section */}
          <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
                  Assigned Bookings ({assignedBookings.length})
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">Trips assigned or dispatched to you</p>
              </div>
            </div>

            {assignedBookings.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs border border-dashed border-zinc-200 rounded-md">
                No active bookings currently assigned to you. Go online above to receive dispatch offers.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assignedBookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 border border-zinc-200 rounded-lg bg-zinc-50/50 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-zinc-900">{b.bookingNumber}</span>
                        <StatusBadge status={b.status} />
                      </div>

                      <div className="text-xs text-zinc-700">
                        <span className="font-semibold">{b.pickupLocation}</span> →{' '}
                        <span className="font-semibold">{b.destination}</span>
                      </div>

                      <div className="text-[11px] text-zinc-500">
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
                        <div className="text-xs font-mono font-semibold text-zinc-800 pt-1 border-t border-zinc-100">
                          {b.vehicle.plateNumber} ({b.vehicle.brand} {b.vehicle.model})
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleStartBookingTrip(b)}
                      className="w-full min-h-[44px] py-2.5 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white rounded text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <span>🚀 Start Trip (En Route to Pickup)</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ad-hoc Vehicle Trip Start */}
          <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
                Start Trip by Vehicle
              </h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                If not linked to a specific booking, search vehicle plate to initiate session
              </p>
            </div>

            <div className="max-w-md space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700 block mb-1">
                  License Plate Search
                </label>
                <input
                  type="text"
                  placeholder="e.g. B 1234 ABC"
                  value={manualPlate}
                  onChange={(e) => searchVehicle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800 font-mono"
                />
              </div>

              {matchingVehicles.length > 0 && !selectedVehicle && (
                <div className="border border-zinc-200 rounded divide-y divide-zinc-100 bg-white">
                  {matchingVehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVehicle(v);
                        setManualPlate(`${v.plateNumber} (${v.brand} ${v.model})`);
                        setMatchingVehicles([]);
                      }}
                      className="w-full p-2.5 text-left text-xs hover:bg-zinc-50 flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <span className="font-mono font-bold text-zinc-900">{v.plateNumber}</span>
                        <span className="text-zinc-500 ml-2">
                          {v.brand} {v.model}
                        </span>
                      </div>
                      <StatusBadge status={v.status} />
                    </button>
                  ))}
                </div>
              )}

              {selectedVehicle && (
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-zinc-900">{selectedVehicle.plateNumber}</span>
                      <p className="text-zinc-600">
                        {selectedVehicle.brand} {selectedVehicle.model} ({selectedVehicle.seatingCapacity} seats)
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedVehicle(null);
                        setManualPlate('');
                      }}
                      className="text-xs text-rose-600 hover:text-rose-800 cursor-pointer font-medium"
                    >
                      Change
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartVehicleTrip}
                    className="w-full min-h-[44px] py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Start Trip with {selectedVehicle.plateNumber}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog to End Trip */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndTrip}
        title="Finish and End Trip?"
        message="This will record trip termination time, finalize your GPS track, and free the vehicle for new assignments."
        confirmLabel="End Trip Now"
        isDestructive={true}
        isLoading={isEndingTrip}
      />

      {/* Trip Completed Summary Modal */}
      {completedTripSummary && (
        <Modal
          isOpen={Boolean(completedTripSummary)}
          onClose={() => setCompletedTripSummary(null)}
          title="Trip Completed Successfully"
          description="GPS tracking session finalized"
          footer={
            <button
              type="button"
              onClick={() => setCompletedTripSummary(null)}
              className="px-4 py-2 bg-zinc-900 text-white rounded text-xs font-semibold cursor-pointer"
            >
              Done
            </button>
          }
        >
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-emerald-900">
              <span className="font-bold block">Trip Closed</span>
              <p className="mt-0.5">All telemetry successfully uploaded to server storage.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Duration</span>
                <span className="font-bold text-sm text-zinc-800">
                  {completedTripSummary.durationMinutes} minutes
                </span>
              </div>
              <div>
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Distance</span>
                <span className="font-bold text-sm text-zinc-800">
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
