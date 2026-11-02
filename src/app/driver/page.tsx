'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGeolocation, GeoPoint } from '@/hooks/useGeolocation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Modal } from '@/components/ui/Modal';
import { IosInstallHint } from '@/components/providers/InstallPrompt';

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
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  } | null;
}

export default function DriverDashboardPage() {
  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [assignedBookings, setAssignedBookings] = useState<AssignedBooking[]>([]);
  const [tripIntervalSec, setTripIntervalSec] = useState(5);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);

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

  // Signal lost or stale calculation (watchPosition error or >2x interval staleness)
  const isSignalLostOrStale =
    isStale ||
    signalStatus === 'red' ||
    movement === 'GPS_LOST' ||
    Boolean(geoError) ||
    (lastUpdated ? Date.now() - lastUpdated.getTime() > tripIntervalSec * 2 * 1000 : false);

  // Load config & active trip
  const loadDashboardData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const [configRes, bookingsRes] = await Promise.all([
        fetch('/api/tracking/config'),
        fetch('/api/bookings?status=DRIVER_ASSIGNED'),
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

      if (bookingsRes.ok) {
        const bJson = await bookingsRes.json();
        setAssignedBookings(bJson.data || []);
      }
    } catch {
      setActionError('Network error loading driver dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // When active trip exists, automatically activate GPS tracking if not already tracking
  useEffect(() => {
    if (activeTrip && !isTracking && !permissionDenied) {
      startTracking();
    }
  }, [activeTrip, isTracking, permissionDenied, startTracking]);

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

  // Start trip from booking
  const handleStartBookingTrip = async (booking: AssignedBooking) => {
    setActionError(null);
    try {
      // 1. Request geolocation permission
      const initialCoords = await getCurrentPosition();

      // 2. Start Trip via API
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
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to start trip');
      }
    } catch (err: any) {
      setActionError(err.message || 'Geolocation access is required to start a trip');
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
        stopTracking();
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

        // Refresh assigned bookings
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
                </div>
                {isSignalLostOrStale ? (
                  <p className="text-xs text-amber-200 mt-1 leading-normal font-medium">
                    Location updates pause when this tab is backgrounded or the screen locks — reopen to resume
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

      {/* iOS install tip for driver when not on active trip */}
      {!activeTrip && <IosInstallHint />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Driver Operations</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Live trip management and automatic GPS telemetry</p>
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
            Your browser denied GPS location access. Company compliance requires real-time telemetry while on trip.
          </p>
          <ul className="list-disc list-inside text-amber-800 space-y-1">
            <li>Click the site lock / settings icon in your browser address bar.</li>
            <li>Change "Location" from "Block" to "Allow".</li>
            <li>Reload the page to restart tracking.</li>
          </ul>
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

          {/* Warning banner when GPS is stale or signal lost */}
          {isSignalLostOrStale && (
            <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 text-xs flex items-start gap-2.5">
              <span className="text-base shrink-0">⚠️</span>
              <div>
                <span className="font-bold block text-amber-900">GPS Signal Paused</span>
                <p className="mt-0.5 text-amber-800 leading-relaxed">
                  Location updates pause when this tab is backgrounded or the screen locks — reopen to resume.
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
              {/* GPS Signal */}
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

              {/* Accuracy Quality */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">GPS Accuracy</span>
                <div className="mt-1">
                  <GPSBadge accuracyM={currentPosition?.accuracyM} signal={signalStatus} />
                </div>
              </div>

              {/* Movement Status */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Movement</span>
                <div className="mt-1">
                  <MovementBadge movement={movement} />
                </div>
              </div>

              {/* Last Position Update */}
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded">
                <span className="text-zinc-400 uppercase text-[10px] font-semibold block">Last Update</span>
                <div className="mt-1 font-mono text-zinc-700">
                  <RelativeTime date={lastUpdated} />
                </div>
              </div>
            </div>

            {/* Current Coordinates preview */}
            {currentPosition && (
              <div className="mt-3 p-2.5 bg-zinc-100 rounded text-[11px] font-mono text-zinc-600 flex flex-wrap items-center justify-between gap-2">
                <span>Lat: {currentPosition.lat.toFixed(5)}</span>
                <span>Lng: {currentPosition.lng.toFixed(5)}</span>
                <span>Speed: {currentPosition.speedMps !== null ? `${(currentPosition.speedMps * 3.6).toFixed(1)} km/h` : '0 km/h'}</span>
                <span>Heading: {currentPosition.headingDeg !== null ? `${Math.round(currentPosition.headingDeg)}°` : '—'}</span>
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
                <p className="text-xs text-zinc-500 mt-0.5">Trips dispatched to you by administrator</p>
              </div>
            </div>

            {assignedBookings.length === 0 ? (
              <div className="py-6 text-center text-zinc-500 text-xs border border-dashed border-zinc-200 rounded-md">
                No bookings currently assigned to you. You can start an unassigned trip below.
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
                        <StatusBadge status="DRIVER_ASSIGNED" />
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
                      <span>🚀 Start Trip from Booking</span>
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
                <label className="block text-xs font-semibold uppercase text-zinc-700 mb-1">
                  License Plate
                </label>
                <input
                  type="text"
                  placeholder="e.g. B 1234 ABC"
                  value={manualPlate}
                  onChange={(e) => searchVehicle(e.target.value)}
                  className="w-full px-3 py-2.5 text-base sm:text-xs border border-zinc-300 rounded uppercase font-mono focus:outline-none focus:ring-1 focus:ring-zinc-800"
                />
              </div>

              {/* Suggestions */}
              {matchingVehicles.length > 0 && !selectedVehicle && (
                <div className="border border-zinc-200 rounded divide-y divide-zinc-100 max-h-40 overflow-y-auto">
                  {matchingVehicles.map((v) => (
                    <div
                      key={v.id}
                      onClick={() => {
                        setSelectedVehicle(v);
                        setManualPlate(v.plateNumber);
                      }}
                      className="p-3 hover:bg-zinc-50 cursor-pointer text-xs flex items-center justify-between min-h-[44px]"
                    >
                      <span className="font-mono font-semibold">{v.plateNumber}</span>
                      <span className="text-zinc-500">{v.brand} {v.model}</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedVehicle && (
                <div className="p-3 bg-zinc-50 rounded border border-zinc-200 text-xs space-y-1">
                  <div className="font-bold text-zinc-900 font-mono">{selectedVehicle.plateNumber}</div>
                  <div className="text-zinc-600">{selectedVehicle.brand} {selectedVehicle.model}</div>
                  <div className="text-zinc-500">Status: {selectedVehicle.status}</div>
                </div>
              )}

              <button
                type="button"
                disabled={!selectedVehicle}
                onClick={handleStartVehicleTrip}
                className="w-full min-h-[44px] py-2.5 bg-zinc-900 hover:bg-zinc-800 active:bg-black text-white rounded text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
              >
                Start Trip with Vehicle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Bottom Bar for End Trip */}
      {activeTrip && (
        <div className="fixed bottom-0 inset-x-0 z-30 sm:hidden bg-white/95 backdrop-blur-md border-t border-zinc-200 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Active Vehicle
            </div>
            <div className="text-xs font-mono font-bold text-zinc-900 truncate">
              {activeTrip.vehicle.plateNumber}
            </div>
            <div className="text-[11px] font-mono text-emerald-600 font-semibold">
              ⏱ {elapsedDuration || '00:00:00'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowEndConfirm(true)}
            className="min-h-[44px] px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold rounded-lg uppercase tracking-wider text-xs shadow-xs cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
          >
            <span>Finish Trip</span>
          </button>
        </div>
      )}

      {/* End Trip Confirmation */}
      <ConfirmDialog
        isOpen={showEndConfirm}
        onClose={() => setShowEndConfirm(false)}
        onConfirm={handleEndTrip}
        title="End Current Trip"
        message="Are you sure you want to finalize this trip? Tracking will be halted and the trip will be marked COMPLETED."
        confirmLabel="Yes, End Trip"
        isDestructive={false}
        isLoading={isEndingTrip}
      />

      {/* Completed Trip Summary Modal */}
      <Modal
        isOpen={Boolean(completedTripSummary)}
        onClose={() => setCompletedTripSummary(null)}
        title="Trip Completed"
        maxWidth="sm"
        footer={
          <button
            type="button"
            onClick={() => setCompletedTripSummary(null)}
            className="w-full py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
          >
            Close Summary
          </button>
        }
      >
        {completedTripSummary && (
          <div className="space-y-4 text-xs text-center py-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <h4 className="font-bold text-base text-zinc-900">Trip Recorded Successfully</h4>
            <div className="grid grid-cols-2 gap-2 text-left bg-zinc-50 p-3 rounded border border-zinc-200">
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Duration</span>
                <span className="font-bold text-sm text-zinc-900">
                  {completedTripSummary.durationMinutes} minutes
                </span>
              </div>
              <div>
                <span className="text-zinc-400 block text-[10px] uppercase font-semibold">Distance</span>
                <span className="font-bold text-sm text-zinc-900">
                  {completedTripSummary.distanceMeters !== null && completedTripSummary.distanceMeters !== undefined
                    ? `${(completedTripSummary.distanceMeters / 1000).toFixed(1)} km`
                    : 'Recorded'}
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
