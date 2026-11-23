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
import { MapPin, Route } from 'lucide-react';
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
    <section className="card overflow-hidden" aria-label="Perjalanan aktif">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-4 py-3">
        <span className="eyebrow eyebrow-accent">
          <Route className="size-3" strokeWidth={2} aria-hidden="true" />
          Perjalanan aktif
        </span>
        <StatusBadge status={selectedBooking.status} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-[var(--status-active-bg)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex size-2.5 shrink-0">
            <span
              className="live-ping absolute inset-0 rounded-full bg-[var(--status-active-fg)]"
              aria-hidden="true"
            />
            <span className="relative size-2.5 rounded-full bg-[var(--status-active-fg)]" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[var(--status-active-fg)]">
              {selectedBooking.status === 'ARRIVED'
                ? 'Driver sudah tiba di titik jemput'
                : distanceToPickup?.proximity === 'near'
                  ? 'Driver sudah sangat dekat'
                  : selectedBooking.status === 'IN_PROGRESS'
                    ? 'Perjalanan sedang berlangsung'
                    : 'Driver sedang menuju titik penjemputan'}
            </p>
            <p className="mt-0.5 text-[0.6875rem] text-[var(--status-active-fg)]/80">
              {distanceToPickup
                ? `Jarak ke penjemputan ${distanceToPickup.text}`
                : selectedBooking.etaSeconds
                  ? `Estimasi kedatangan ${formatEta(selectedBooking.etaSeconds, selectedBooking.etaEstimated)}`
                  : 'Memantau telemetri GPS secara langsung'}
            </p>
          </div>
        </div>
        {distanceToPickup && (
          <span className="mono-plate shrink-0 rounded-full border border-[var(--status-active-border)] bg-white px-2.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-[var(--status-active-fg)]">
            {distanceToPickup.text}
          </span>
        )}
      </div>

      <div className="px-4 py-3.5">
        <div className="route-stepper">
          <div className="route-point" data-kind="pickup">
            <p className="route-label">Titik jemput</p>
            <p className="route-value">{selectedBooking.pickupLocation}</p>
          </div>
          <div className="route-point" data-kind="destination">
            <p className="route-label">Tujuan</p>
            <p className="route-value">{selectedBooking.destination}</p>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border-subtle)] px-4 py-3">
        <DispatchProgress
          status={selectedBooking.status}
          etaSeconds={selectedBooking.etaSeconds}
          etaEstimated={selectedBooking.etaEstimated}
          compact
        />
      </div>
    </section>
  );

  return (
    <div className="w-full min-w-0 space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">
            <span className="size-1.5 rounded-full bg-[var(--kcic-red)]" aria-hidden="true" />
            KCIC fleet telemetry
          </span>
          <h1 className="page-heading mt-2">Pantau perjalanan live</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            Posisi armada, rute navigasi, dan koordinasi pengemudi secara real-time.
          </p>
        </div>

        <span className="pill self-start">
          <span
            className={`size-1.5 rounded-full ${
              connectionState === 'open'
                ? 'animate-pulse bg-[var(--status-active-fg)]'
                : 'bg-slate-400'
            }`}
            aria-hidden="true"
          />
          <span>{connectionState === 'open' ? 'Live GPS stream' : 'Polling 20s'}</span>
        </span>
      </header>

      {(isLoading || mergedVehicles.length === 0) && bookingSummary}

      {isLoading ? (
        <div
          className="card flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500"
          role="status"
        >
          <Spinner size="lg" className="text-[var(--kcic-red)]" />
          <p>Mencari sinyal GPS armada…</p>
        </div>
      ) : mergedVehicles.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-12 text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-slate-400">
            <MapPin className="size-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <p className="text-[0.8125rem] font-semibold text-slate-900">
            Belum ada armada yang menyiarkan GPS aktif
          </p>
          <p className="mt-1 max-w-sm text-[0.6875rem] leading-relaxed text-slate-500">
            Pelacakan posisi akan tampil otomatis setelah pengemudi menyalakan sesi perjalanan atau
            transmisi telemetri.
          </p>
        </div>
      ) : (
        <div className="tracking-layout">
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              routePoints={routePoints}
              className="h-[58dvh] min-h-[22rem] w-full lg:h-[calc(100dvh-15rem)]"
            />
          </div>

          <div className="tracking-panel space-y-3">
            {bookingSummary}

            <section className="card overflow-hidden" aria-labelledby="tracked-vehicles-heading">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
                <h2 id="tracked-vehicles-heading" className="eyebrow">
                  Armada terlacak{' '}
                  <span className="tabular-nums opacity-70">({mergedVehicles.length})</span>
                </h2>
                <span className="text-[0.625rem] text-slate-400">Pilih unit</span>
              </div>

              <div className="flex flex-wrap gap-1.5 p-3">
                {mergedVehicles.map((v) => (
                  <button
                    key={v.vehicleId}
                    type="button"
                    onClick={() => setSelectedVehicleId(v.vehicleId)}
                    aria-pressed={v.vehicleId === selectedVehicleId}
                    className={`cursor-pointer rounded-full border px-3 py-1 text-[0.6875rem] font-semibold transition-colors ${
                      v.vehicleId === selectedVehicleId
                        ? 'border-[var(--kcic-red)] bg-[var(--kcic-red)] text-white'
                        : 'border-[var(--border)] bg-white text-slate-700 hover:border-[var(--border-strong)]'
                    }`}
                  >
                    <span className="mono-plate">{v.plateNumber}</span>
                  </button>
                ))}
              </div>

              {selectedVehicle && (
                <div className="space-y-3 border-t border-[var(--border-subtle)] p-3.5">
                  {selectedVehicle.driverName && (
                    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--slate-navy)] text-xs font-semibold text-white">
                          {selectedVehicle.driverName.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-slate-900">
                              {selectedVehicle.driverName}
                            </span>
                            <span className="pill pill-error">
                              <span>Driver KCIC</span>
                            </span>
                          </div>
                          <p className="mt-0.5 flex items-center gap-1 text-[0.625rem] text-slate-500">
                            <span
                              className="size-1.5 rounded-full bg-[var(--status-active-fg)]"
                              aria-hidden="true"
                            />
                            Kontak terlindungi (in-app)
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
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

                  <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono-plate rounded-[var(--radius-sm)] bg-[var(--canvas)] px-2 py-0.5 text-[0.8125rem] font-semibold text-slate-900">
                        {selectedVehicle.plateNumber}
                      </span>
                      <StatusBadge status={selectedVehicle.status} />
                    </div>

                    {selectedVehicle.brand && (
                      <p className="mt-1.5 text-[0.6875rem] font-medium text-slate-600">
                        {selectedVehicle.brand} {selectedVehicle.model}
                      </p>
                    )}

                    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                      <div>
                        <dt className="metric-label">Pergerakan</dt>
                        <dd className="mt-1">
                          <MovementBadge movement={selectedVehicle.movement} />
                        </dd>
                      </div>
                      <div>
                        <dt className="metric-label">Akurasi GPS</dt>
                        <dd className="mt-1">
                          <GPSBadge accuracyM={selectedVehicle.accuracyM} />
                        </dd>
                      </div>
                    </dl>

                    {driverCurrentAddress && (
                      <div className="mt-2.5 border-t border-[var(--border-subtle)] pt-2.5">
                        <p className="metric-label">Lokasi terkini</p>
                        <p className="mt-0.5 flex items-start gap-1.5 text-[0.6875rem] leading-relaxed text-slate-700">
                          <MapPin
                            className="mt-0.5 size-3 shrink-0 text-[var(--kcic-red)]"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          <span className="line-clamp-2">{driverCurrentAddress}</span>
                        </p>
                      </div>
                    )}

                    <div className="mt-2.5 flex items-center justify-between border-t border-[var(--border-subtle)] pt-2.5">
                      <span className="metric-label">Update terakhir</span>
                      <span className="text-[0.6875rem] font-medium tabular-nums text-slate-600">
                        <RelativeTime date={selectedVehicle.recordedAt} />
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </section>
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
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="lg" className="text-[var(--kcic-red)]" />
          <p>Memuat peta pelacakan…</p>
        </div>
      }
    >
      <UserTrackingContent />
    </Suspense>
  );
}
