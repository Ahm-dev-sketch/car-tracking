'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
    user: {
      name: string;
      phone: string;
    };
  } | null;
}

function UserTrackingContent() {
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
    <section className="mb-6 space-y-4 rounded-2xl border-2.5 border-black bg-emerald-100 p-5 shadow-[4px_4px_0px_0px_#000]" aria-label="Active booking">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-wider text-emerald-950">Perjalanan Aktif Anda</span>
        <StatusBadge status={selectedBooking.status} />
      </div>

      {/* Proximity / Gojek-style Status Headline */}
      <div className="rounded-xl border-2 border-black bg-white p-4 shadow-[3px_3px_0px_0px_#000] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5 shrink-0">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              selectedBooking.status === 'ARRIVED' ? 'bg-emerald-400' : 'bg-emerald-600'
            }`} />
            <span className={`relative inline-flex rounded-full h-3.5 w-3.5 border border-black ${
              selectedBooking.status === 'ARRIVED' ? 'bg-emerald-400' : 'bg-emerald-500'
            }`} />
          </span>
          <div>
            <p className="font-black text-base text-zinc-950">
              {selectedBooking.status === 'ARRIVED'
                ? 'Driver sudah tiba di titik jemput!'
                : distanceToPickup?.proximity === 'near'
                ? 'Driver sudah sangat dekat!'
                : selectedBooking.status === 'IN_PROGRESS'
                ? 'Perjalanan sedang berlangsung'
                : 'Driver sedang menuju titik jemput'}
            </p>
            <p className="text-xs font-medium text-zinc-600">
              {distanceToPickup
                ? `Jarak ke penjemputan: ${distanceToPickup.text}`
                : selectedBooking.etaSeconds
                ? `Estimasi kedatangan: ${formatEta(selectedBooking.etaSeconds, selectedBooking.etaEstimated)}`
                : 'Memantau pergerakan armada secara langsung'}
            </p>
          </div>
        </div>
        {distanceToPickup && (
          <span className="rounded-md border-2 border-black bg-amber-200 px-3 py-1 font-mono text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000] shrink-0">
            {distanceToPickup.text}
          </span>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-lg border-2 border-black bg-white p-3 text-xs shadow-[2px_2px_0px_0px_#000]">
        <Icon name="route" className="mt-0.5 shrink-0 text-emerald-800" />
        <div className="min-w-0 flex-1">
          <p className="text-zinc-600 truncate"><span className="font-bold text-zinc-900">Jemput:</span> {selectedBooking.pickupLocation}</p>
          <p className="mt-1 font-bold text-zinc-950 truncate"><span className="font-bold text-zinc-900">Tujuan:</span> {selectedBooking.destination}</p>
        </div>
      </div>

      <DispatchProgress status={selectedBooking.status} etaSeconds={selectedBooking.etaSeconds} etaEstimated={selectedBooking.etaEstimated} compact />
    </section>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-intro">
        <div>
          <span className="eyebrow mb-3">Closer to your next stop</span>
          <h1 className="page-heading">Your journey, live.</h1>
          <p className="text-xs font-semibold text-zinc-600 mt-0.5">
            Keep your vehicle and driver in view.
          </p>
        </div>

        {/* Realtime WS status indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-zinc-600">Location feed</span>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-xs font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
              connectionState === 'open'
                ? 'bg-emerald-200 text-zinc-950'
                : 'bg-zinc-200 text-zinc-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full border border-black ${
                connectionState === 'open' ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
            {connectionState === 'open' ? 'CONNECTED' : 'POLLING'}
          </span>
        </div>
      </div>



      {(isLoading || mergedVehicles.length === 0) && bookingSummary}

      {isLoading ? (
        <div className="surface py-24 text-center text-zinc-500 text-sm" role="status">
          <Spinner size="lg" className="mb-2" />
          <p className="font-bold">Locating active vehicles...</p>
        </div>
      ) : mergedVehicles.length === 0 ? (
        <div className="surface p-8 sm:p-12 text-center text-zinc-500 text-sm">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl border-2 border-black bg-amber-200 text-zinc-950 shadow-[3px_3px_0px_0px_#000]"><Icon name="pin" className="size-6" /></span>
          <p className="font-black text-lg text-zinc-950">No active vehicle trips reporting live GPS</p>
          <p className="text-xs font-medium text-zinc-600 mt-1">
            Tracking is displayed once a driver starts a trip or an online driver shares telemetry.
          </p>
        </div>
      ) : (
        <div className="tracking-layout">
          {/* Main Map */}
          <div className="bezel min-w-0">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              routePoints={routePoints}
              className="tracking-map"
            />
          </div>

          {/* Vehicle & Driver Side Panel */}
          <div className="surface tracking-panel p-5 sm:p-6 flex flex-col justify-between">
            <div>
              {bookingSummary}
              <div className="border-b-2 border-black/10 pb-3 mb-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  Tracked Vehicles ({mergedVehicles.length})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mergedVehicles.map((v) => (
                    <button
                      key={v.vehicleId}
                      type="button"
                      onClick={() => setSelectedVehicleId(v.vehicleId)}
                      aria-pressed={v.vehicleId === selectedVehicleId}
                      className={`min-h-11 px-4 py-2 text-xs rounded-xl font-mono font-bold border-2 border-black cursor-pointer transition ${
                        v.vehicleId === selectedVehicleId
                          ? 'bg-emerald-400 text-zinc-950 shadow-[3px_3px_0px_0px_#000] translate-x-[-1px] translate-y-[-1px]'
                          : 'bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] hover:bg-zinc-100 hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000]'
                      }`}
                    >
                      {v.plateNumber}
                    </button>
                  ))}
                </div>
              </div>

              {selectedVehicle ? (
                <div className="space-y-4 text-sm">
                  {/* Driver Profile Card */}
                  {selectedVehicle.driverName && (
                    <div className="rounded-xl border-2 border-black bg-emerald-100 p-4 space-y-3 shadow-[3px_3px_0px_0px_#000]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-emerald-400 text-zinc-950 font-black text-base shadow-[2px_2px_0px_0px_#000]">
                          {selectedVehicle.driverName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-zinc-950 truncate">{selectedVehicle.driverName}</span>
                            <span className="rounded-md border-1.5 border-black bg-emerald-200 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-950 shadow-[1px_1px_0px_0px_#000] shrink-0">
                              Driver KCIC
                            </span>
                          </div>
                          {selectedVehicle.driverPhone && selectedVehicle.driverPhone !== 'REDACTED' && (
                            <p className="text-xs text-zinc-600 font-mono font-bold mt-0.5">{selectedVehicle.driverPhone}</p>
                          )}
                        </div>
                      </div>

                      {/* Contact Actions (WhatsApp & Call) */}
                      {rawPhone && (
                        <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black/10">
                          <a
                            href={`https://wa.me/${rawPhone}?text=${encodeURIComponent(
                              `Halo Pak ${selectedVehicle.driverName}, saya penumpang untuk pemesanan #${selectedBooking?.bookingNumber || ''}. Saya menunggu di ${selectedBooking?.pickupLocation || ''}.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-emerald-400 px-3 py-2 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition"
                          >
                            <svg className="size-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                              <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.582 2.128 2.182-.573c.978.58 1.911.928 3.145.929 3.178 0 5.767-2.587 5.768-5.766.001-3.187-2.575-5.77-5.764-5.771zm3.392 8.244c-.144.405-.837.774-1.17.824-.312.045-.698.074-2.001-.466-1.503-.623-2.529-2.115-2.607-2.219-.074-.103-.615-.818-.615-1.56 0-.743.391-1.107.531-1.258.14-.15.307-.188.409-.188.103 0 .205.004.296.009.096.005.225-.036.352.27.13.313.444 1.082.483 1.161.039.08.065.173.013.277-.052.103-.079.168-.156.259-.078.09-.163.201-.233.27-.08.077-.163.161-.07.32.093.16.413.682.886 1.103.609.543 1.123.711 1.282.79.16.08.254.07.348-.039.095-.109.406-.473.514-.635.109-.162.217-.135.367-.08.151.054.958.452 1.123.535.165.083.276.124.316.193.04.07.04.405-.104.81z"/>
                            </svg>
                            <span>WhatsApp</span>
                          </a>

                          <a
                            href={`tel:${selectedVehicle.driverPhone}`}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-white px-3 py-2 text-xs font-black text-zinc-950 shadow-[2px_2px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#000] transition"
                          >
                            <Icon name="phone" className="size-3.5 shrink-0" />
                            <span>Telepon</span>
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Vehicle Information */}
                  <div className="rounded-xl border-2 border-black bg-zinc-50 p-4 space-y-3 shadow-[3px_3px_0px_0px_#000]">
                    <div className="flex items-center justify-between">
                      <span className="inline-block px-3 py-1 bg-zinc-950 text-white font-mono font-black tracking-wider rounded-md border-2 border-black text-sm shadow-[2px_2px_0px_0px_#000]">
                        {selectedVehicle.plateNumber}
                      </span>
                      <StatusBadge status={selectedVehicle.status} />
                    </div>
                    {selectedVehicle.brand && (
                      <p className="text-xs text-zinc-700 font-bold">
                        {selectedVehicle.brand} {selectedVehicle.model}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black/10 text-xs">
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase font-black">
                          Movement
                        </span>
                        <div className="mt-0.5">
                          <MovementBadge movement={selectedVehicle.movement} />
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-500 uppercase font-black">
                          Accuracy
                        </span>
                        <div className="mt-0.5">
                          <GPSBadge accuracyM={selectedVehicle.accuracyM} />
                        </div>
                      </div>
                    </div>

                    {driverCurrentAddress && (
                      <div className="pt-2 border-t-2 border-black/10 text-xs">
                        <span className="text-[10px] text-zinc-500 uppercase font-black">
                          Posisi Terkini Armada
                        </span>
                        <p className="mt-0.5 flex items-center gap-1.5 text-zinc-900 font-bold line-clamp-2">
                          <Icon name="pin" className="size-3.5 shrink-0 text-emerald-700" />
                          <span>{driverCurrentAddress}</span>
                        </p>
                      </div>
                    )}

                    <div className="pt-2 border-t-2 border-black/10 flex items-center justify-between text-xs">
                      <span className="text-[10px] text-zinc-500 uppercase font-black">
                        Last Update
                      </span>
                      <div className="text-zinc-800 font-mono font-bold text-[11px]">
                        <RelativeTime date={selectedVehicle.recordedAt} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic">Pilih kendaraan untuk melihat detail posisi</p>
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
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <p>Loading tracking map...</p>
        </div>
      }
    >
      <UserTrackingContent />
    </Suspense>
  );
}
