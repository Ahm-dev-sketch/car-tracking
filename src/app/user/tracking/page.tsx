'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { FleetMap, VehicleMarkerData, RoutePoint } from '@/components/map';
import { useRealtime } from '@/hooks/useRealtime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';
import { Icon } from '@/components/ui/Icon';
import { reverseGeocodeWithCache } from '@/lib/client-geocode-cache';
import { TripCommunicationWidget } from '@/components/communication/TripCommunicationWidget';

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type TrackingRow = Pick<VehicleMarkerData, 'vehicleId' | 'plateNumber' | 'brand' | 'model' | 'status'> & {
  driver?: { name: string; phone: string } | null;
  location: Pick<VehicleMarkerData, 'lat' | 'lng' | 'accuracyM' | 'speedMps' | 'headingDeg' | 'recordedAt' | 'movement'>;
};

interface ActiveBookingInfo {
  id: string;
  bookingNumber: string;
  status: string;
  pickupLocation: string;
  destination: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  passengerCount?: number;
  vehicleId?: string | null;
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  } | null;
  driver?: {
    id: string;
    user?: {
      id?: string;
      name: string;
      phone: string;
    } | null;
  } | null;
}

function UserTrackingContent() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const initialVehicleId = searchParams.get('vehicleId');

  const [liveVehicles, setLiveVehicles] = useState<VehicleMarkerData[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(initialVehicleId);
  const [activeBookings, setActiveBookings] = useState<ActiveBookingInfo[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch active bookings
  const fetchActiveBookings = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch('/api/bookings?limit=100', { signal, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const list: ActiveBookingInfo[] = json.data || [];
        if (signal.aborted) return;
        const active = list.filter((b) =>
          [
            'APPROVED',
            'SEARCHING_DRIVER',
            'DRIVER_NOTIFIED',
            'DRIVER_ASSIGNED',
            'DRIVER_EN_ROUTE',
            'ARRIVED',
            'IN_PROGRESS',
          ].includes(b.status)
        );
        setActiveBookings(active);
        setSelectedBookingId((current) => {
          if (active.some((b) => b.id === current)) return current;
          const matched = active.find((b) => b.vehicle?.id === initialVehicleId);
          return matched?.id ?? active[0]?.id ?? null;
        });
      } else if (res.status === 401 || res.status === 403) {
        setActiveBookings([]);
        setSelectedBookingId(null);
      }
    } catch {
      // ignore
    }
  }, [initialVehicleId]);

  // Initial fetch from GET /api/tracking/live
  const fetchLiveTracking = useCallback(async (signal: AbortSignal) => {
    try {
      const res = await fetch('/api/tracking/live', { signal, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (signal.aborted) return;
        if (!json.warning) {
          const rows: TrackingRow[] = json.data || [];
          const mapped: VehicleMarkerData[] = rows
            .filter((r) => r.location && r.location.lat !== undefined && r.location.lng !== undefined)
            .map((r) => ({
              vehicleId: r.vehicleId,
              plateNumber: r.plateNumber,
              brand: r.brand,
              model: r.model,
              status: r.status,
              driverName: r.driver?.name || null,
              driverPhone: r.driver?.phone || null,
              lat: r.location.lat,
              lng: r.location.lng,
              accuracyM: r.location.accuracyM ?? 10,
              speedMps: r.location.speedMps,
              headingDeg: r.location.headingDeg,
              recordedAt: r.location.recordedAt,
              movement: r.location.movement || 'STOPPED',
            }));
          setLiveVehicles(mapped);
          setSelectedVehicleId((current) =>
            mapped.some((v) => v.vehicleId === current) ? current : mapped[0]?.vehicleId ?? null
          );
        }
      } else if (res.status === 401 || res.status === 403) {
        setLiveVehicles([]);
        setSelectedVehicleId(null);
      }
    } catch {
      // ignore
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        await Promise.all([fetchLiveTracking(controller.signal), fetchActiveBookings(controller.signal)]);
      } finally {
        fetching = false;
      }
    };
    void poll();
    const interval = setInterval(poll, 10000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchLiveTracking, fetchActiveBookings]);

  // Connect to realtime WS
  const vehicleIds = useMemo(() => liveVehicles.map((v) => v.vehicleId), [liveVehicles]);
  const { vehicles: realtimeVehicles, connectionState } = useRealtime({
    vehicleIds,
  });

  // Merge live REST data with realtime WebSocket push
  const mergedVehicles = useMemo(() => {
    return liveVehicles.map((lv) => {
      const rt = realtimeVehicles.get(lv.vehicleId);
      if (rt && Date.parse(rt.recordedAt) > Date.parse(lv.recordedAt)) {
        return {
          ...lv,
          lat: rt.lat,
          lng: rt.lng,
          accuracyM: rt.accuracyM,
          speedMps: rt.speedMps,
          headingDeg: rt.headingDeg,
          recordedAt: rt.recordedAt,
          movement: rt.movement,
          driverName: rt.driverName === undefined ? lv.driverName : rt.driverName,
          driverPhone: rt.driverPhone === undefined ? lv.driverPhone : rt.driverPhone,
          plateNumber: rt.plateNumber ?? lv.plateNumber,
          tripOrigin: rt.tripOrigin ?? lv.tripOrigin,
          tripDestination: rt.tripDestination ?? lv.tripDestination,
        };
      }
      return lv;
    });
  }, [liveVehicles, realtimeVehicles]);

  // REST is authoritative: booking events carry no timestamp to order against it.
  const selectedBooking = useMemo(() =>
    activeBookings.find((b) => b.vehicle?.id === selectedVehicleId) ??
    activeBookings.find((b) => b.id === selectedBookingId) ??
    activeBookings[0] ?? null,
  [activeBookings, selectedVehicleId, selectedBookingId]);

  const selectedVehicle = mergedVehicles.find((v) => v.vehicleId === selectedVehicleId);
  const rawPhone = selectedVehicle?.driverPhone ? selectedVehicle.driverPhone.replace(/\D/g, '') : '';
  const waUrl = rawPhone ? `https://wa.me/${rawPhone}` : null;

  const routePoints = useMemo<RoutePoint[]>(() => {
    if (!selectedBooking) return [];
    const pts: RoutePoint[] = [];
    if (
      selectedBooking.pickupLat !== null &&
      selectedBooking.pickupLat !== undefined &&
      selectedBooking.pickupLng !== null &&
      selectedBooking.pickupLng !== undefined
    ) {
      pts.push({
        lat: selectedBooking.pickupLat,
        lng: selectedBooking.pickupLng,
        label: 'Jemput: ' + selectedBooking.pickupLocation,
        type: 'pickup',
      });
    }
    if (
      selectedBooking.destinationLat !== null &&
      selectedBooking.destinationLat !== undefined &&
      selectedBooking.destinationLng !== null &&
      selectedBooking.destinationLng !== undefined
    ) {
      pts.push({
        lat: selectedBooking.destinationLat,
        lng: selectedBooking.destinationLng,
        label: 'Tujuan: ' + selectedBooking.destination,
        type: 'destination',
      });
    }
    return pts;
  }, [selectedBooking]);

  const distanceToPickup = useMemo(() => {
    if (!selectedVehicle || !selectedBooking?.pickupLat || !selectedBooking?.pickupLng) return null;
    const km = calculateDistanceKm(
      selectedVehicle.lat,
      selectedVehicle.lng,
      selectedBooking.pickupLat,
      selectedBooking.pickupLng
    );
    let text = `${km.toFixed(1)} km`;
    if (km < 1) {
      text = `${Math.round(km * 1000)} m`;
    }
    let proximity: 'arrived' | 'near' | 'approaching' = 'approaching';
    if (selectedBooking.status === 'ARRIVED') {
      proximity = 'arrived';
    } else if (km <= 0.4) {
      proximity = 'near';
    }
    return { km, text, proximity };
  }, [selectedVehicle, selectedBooking]);

  const [driverCurrentAddress, setDriverCurrentAddress] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedVehicle?.lat || !selectedVehicle?.lng) {
      setDriverCurrentAddress(null);
      return;
    }
    let cancelled = false;
    reverseGeocodeWithCache(selectedVehicle.lat, selectedVehicle.lng)
      .then((addr) => {
        if (!cancelled) setDriverCurrentAddress(addr);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedVehicle?.lat, selectedVehicle?.lng]);

  const bookingSummary = selectedBooking && (
    <section className="space-y-3" aria-label="Active booking">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Perjalanan aktif Anda
        </p>
        <StatusBadge status={selectedBooking.status} />
      </div>

      {/* Proximity headline */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
            <span
              className={`absolute inset-0 rounded-full ${
                selectedBooking.status === 'ARRIVED' ? 'bg-success-600' : 'bg-brand-600'
              } status-ping`}
            />
            <span
              className={`relative inline-flex size-2.5 rounded-full ${
                selectedBooking.status === 'ARRIVED' ? 'bg-success-600' : 'bg-brand-600'
              }`}
            />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug tracking-tight text-slate-900">
              {selectedBooking.status === 'ARRIVED'
                ? 'Driver sudah tiba di titik jemput!'
                : distanceToPickup?.proximity === 'near'
                ? 'Driver sudah sangat dekat!'
                : selectedBooking.status === 'IN_PROGRESS'
                ? 'Perjalanan sedang berlangsung'
                : 'Driver sedang menuju titik jemput'}
            </p>
            <p className="mt-0.5 text-xs font-medium text-slate-500">
              {distanceToPickup
                ? `Jarak ke penjemputan: ${distanceToPickup.text}`
                : selectedBooking.etaSeconds
                ? `Estimasi kedatangan: ${formatEta(selectedBooking.etaSeconds, selectedBooking.etaEstimated)}`
                : 'Memantau pergerakan armada secara langsung'}
            </p>
          </div>
        </div>
        {distanceToPickup && (
          <span className="shrink-0 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 font-mono text-xs font-semibold text-brand-700 tabular-nums">
            {distanceToPickup.text}
          </span>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-xs">
        <Icon name="route" className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-500">
            <span className="font-semibold text-slate-700">Jemput:</span> {selectedBooking.pickupLocation}
          </p>
          <p className="mt-1 truncate font-semibold text-slate-900">
            <span className="font-semibold text-slate-700">Tujuan:</span> {selectedBooking.destination}
          </p>
        </div>
      </div>

      <DispatchProgress status={selectedBooking.status} etaSeconds={selectedBooking.etaSeconds} etaEstimated={selectedBooking.etaEstimated} compact />
    </section>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Closer to your next stop</p>
          <h1 className="page-heading mt-2">Your journey, live.</h1>
          <p className="mt-3 text-sm font-medium leading-relaxed text-slate-500">
            Keep your vehicle and driver in view.
          </p>
        </div>

        {/* Realtime WS status indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Location feed
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${
              connectionState === 'open'
                ? 'border-success-200 bg-success-50 text-success-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${
                connectionState === 'open' ? 'bg-success-600' : 'bg-slate-400'
              }`}
            />
            {connectionState === 'open' ? 'Connected' : 'Polling'}
          </span>
        </div>
      </div>



      {(isLoading || mergedVehicles.length === 0) && bookingSummary}

      {isLoading ? (
        <div className="surface py-20 text-center text-sm font-medium text-slate-500" role="status">
          <Spinner size="lg" className="mb-2" />
          <p>Locating active vehicles...</p>
        </div>
      ) : mergedVehicles.length === 0 ? (
        <div className="surface px-6 py-12 text-center sm:py-16">
          <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
            <Icon name="pin" className="size-6" />
          </span>
          <p className="text-base font-semibold tracking-tight text-slate-900">
            No active vehicle trips reporting live GPS
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs font-medium leading-relaxed text-slate-500">
            Tracking is displayed once a driver starts a trip or an online driver shares telemetry.
          </p>
        </div>
      ) : (
        <div className="tracking-layout">
          {/* Main Map */}
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              routePoints={routePoints}
              className="tracking-map"
            />
          </div>

          {/* Vehicle & Driver Side Panel */}
          <div className="surface tracking-panel flex flex-col justify-between p-4 sm:p-5">
            <div className="space-y-4">
              {bookingSummary}

              <div className="border-b border-slate-100 pb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Tracked vehicles ({mergedVehicles.length})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mergedVehicles.map((v) => (
                    <button
                      key={v.vehicleId}
                      type="button"
                      onClick={() => setSelectedVehicleId(v.vehicleId)}
                      aria-pressed={v.vehicleId === selectedVehicleId}
                      className={`min-h-9 cursor-pointer rounded-lg border px-3 font-mono text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                        v.vehicleId === selectedVehicleId
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      {v.plateNumber}
                    </button>
                  ))}
                </div>
              </div>

              {selectedVehicle ? (
                <div className="space-y-3 text-sm">
                  {/* Driver Profile Card */}
                  {selectedVehicle.driverName && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="flex items-center gap-3">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 font-mono text-sm font-semibold tracking-wide text-white">
                          {selectedVehicle.driverName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
                              {selectedVehicle.driverName}
                            </span>
                            <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-700">
                              Driver KCIC
                            </span>
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                            <span className="inline-block size-1.5 rounded-full bg-success-600" aria-hidden="true" />
                            <span>Kontak Terproteksi (In-App Saja)</span>
                          </p>
                        </div>
                      </div>

                      {/* In-App Real-time Chat & Voice Call */}
                      <div className="border-t border-slate-100 pt-3">
                        <TripCommunicationWidget
                          bookingId={selectedBooking?.id}
                          currentUserId={(session?.user as any)?.id || 'passenger-user'}
                          currentUserName={session?.user?.name || 'Penumpang'}
                          currentUserRole="USER"
                          partnerId={selectedBooking?.driver?.user?.id || selectedBooking?.driver?.id}
                          partnerName={selectedVehicle.driverName || 'Driver KCIC'}
                          partnerRole="DRIVER"
                          variant="buttons"
                        />
                      </div>
                    </div>
                  )}

                  {/* Vehicle Information */}
                  <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-sm font-semibold tracking-wide text-slate-900 tabular-nums">
                        {selectedVehicle.plateNumber}
                      </span>
                      <StatusBadge status={selectedVehicle.status} />
                    </div>
                    {selectedVehicle.brand && (
                      <p className="text-xs font-medium text-slate-500">
                        {selectedVehicle.brand} {selectedVehicle.model}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Movement
                        </span>
                        <div className="mt-1">
                          <MovementBadge movement={selectedVehicle.movement} />
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Accuracy
                        </span>
                        <div className="mt-1">
                          <GPSBadge accuracyM={selectedVehicle.accuracyM} />
                        </div>
                        {typeof selectedVehicle.accuracyM === 'number' && selectedVehicle.accuracyM > 100 && (
                          <div className="mt-1.5 flex items-start gap-1 rounded border border-warning-200 bg-warning-50 px-1.5 py-1 text-[10px] font-medium leading-snug text-warning-700">
                            <Icon name="alert" className="mt-px size-3 shrink-0" />
                            <span>Posisi estimasi seluler/Wi-Fi (radius &plusmn;{Math.round(selectedVehicle.accuracyM)} m)</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {driverCurrentAddress && (
                      <div className="border-t border-slate-100 pt-3 text-xs">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                          Posisi terkini armada
                        </span>
                        <p className="mt-1 flex items-start gap-1.5 font-medium text-slate-700">
                          <Icon name="pin" className="mt-px size-3.5 shrink-0 text-brand-600" />
                          <span className="line-clamp-2">{driverCurrentAddress}</span>
                        </p>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Last update
                      </span>
                      <div className="font-medium text-slate-500">
                        <RelativeTime date={selectedVehicle.recordedAt} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs italic text-slate-400">Pilih kendaraan untuk melihat detail posisi</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UserTrackingPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm font-medium text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>Loading tracking map...</p>
        </div>
      }
    >
      <UserTrackingContent />
    </Suspense>
  );
}
