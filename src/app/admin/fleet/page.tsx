'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FleetMap, VehicleMarkerData, getVehicleConditionVisual } from '@/components/map';
import { useRealtime } from '@/hooks/useRealtime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';
import { MessageSquare } from 'lucide-react';
import {
  getHubMapCenter,
  getHubCoordinates,
  DEFAULT_OPS_CENTER,
  ALL_HUBS_CORRIDOR_CENTER,
  ALL_HUBS_CORRIDOR_ZOOM,
} from '@/lib/operational-locations';

type TrackingRow = Pick<VehicleMarkerData, 'vehicleId' | 'plateNumber' | 'brand' | 'model' | 'status' | 'homeLocation'> & {
  driver?: { name: string; phone: string } | null;
  location: Pick<VehicleMarkerData, 'lat' | 'lng' | 'accuracyM' | 'speedMps' | 'headingDeg' | 'recordedAt' | 'movement'>;
  currentLocationInfo?: VehicleMarkerData['currentOperationalLocation'];
};

interface OperationalLocation {
  id: string;
  name: string;
  code: string;
}

function AdminFleetMapContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState<VehicleMarkerData[]>([]);
  const [locations, setLocations] = useState<OperationalLocation[]>([]);
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load locations
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          setLocations(json.data || []);
        }
      } catch {}
    }
    loadLocations();
  }, []);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/admin/fleet?${params.toString()}`);
  };

  const fetchLiveFleet = useCallback(async (signal: AbortSignal) => {
    try {
      const url = locationFilter
        ? `/api/tracking/live?locationId=${encodeURIComponent(locationFilter)}`
        : '/api/tracking/live';
      const res = await fetch(url, { signal, cache: 'no-store' });
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
              homeLocation: r.homeLocation || null,
              currentOperationalLocation: r.currentLocationInfo || null,
            }));

          try {
            const vUrl = locationFilter
              ? `/api/vehicles?locationId=${encodeURIComponent(locationFilter)}&limit=100`
              : '/api/vehicles?limit=100';

            const vRes = await fetch(vUrl, { signal, cache: 'no-store' });
            if (vRes.ok) {
              const vJson = await vRes.json();
              const hubVehicles: Array<{
                id: string;
                plateNumber: string;
                brand: string;
                model: string;
                status: string;
                homeLocation?: { id: string; name: string; code: string } | null;
                currentOperationalLocation?: { id: string; name: string; code: string } | null;
                currentDriver?: {
                  id: string;
                  licenseNumber: string;
                  user: { id: string; name: string; phone: string };
                } | null;
                updatedAt?: string;
              }> = vJson.data || [];

              const hubCounters: Record<string, number> = {};

              for (const hv of hubVehicles) {
                const existingIdx = mapped.findIndex((m) => m.vehicleId === hv.id);
                if (existingIdx >= 0) {
                  if (!mapped[existingIdx].status) mapped[existingIdx].status = hv.status;
                  if (!mapped[existingIdx].homeLocation && hv.homeLocation) {
                    mapped[existingIdx].homeLocation = hv.homeLocation;
                  }
                  if (!mapped[existingIdx].currentOperationalLocation && hv.currentOperationalLocation) {
                    mapped[existingIdx].currentOperationalLocation = hv.currentOperationalLocation;
                  }
                  continue;
                }

                const targetLoc = hv.currentOperationalLocation || hv.homeLocation;
                const hubKey = targetLoc?.code || targetLoc?.name || 'Halim';
                const hubCoords = getHubCoordinates(hubKey) || DEFAULT_OPS_CENTER;

                hubCounters[hubKey] = (hubCounters[hubKey] || 0) + 1;
                const parkedOffset = hubCounters[hubKey];

                const angle = parkedOffset * 1.15;
                const radius = 0.00035 + (parkedOffset * 0.00012);

                mapped.push({
                  vehicleId: hv.id,
                  plateNumber: hv.plateNumber,
                  brand: hv.brand,
                  model: hv.model,
                  status: hv.status,
                  driverName: hv.currentDriver?.user?.name || null,
                  driverPhone: hv.currentDriver?.user?.phone || null,
                  lat: hubCoords[0] + (Math.sin(angle) * radius),
                  lng: hubCoords[1] + (Math.cos(angle) * radius),
                  accuracyM: 15,
                  speedMps: 0,
                  headingDeg: 0,
                  recordedAt: hv.updatedAt || new Date().toISOString(),
                  movement: hv.status === 'MAINTENANCE' ? 'MAINTENANCE' : hv.status === 'INACTIVE' ? 'OFFLINE' : 'STOPPED',
                  homeLocation: hv.homeLocation || null,
                  currentOperationalLocation: hv.currentOperationalLocation || null,
                });
              }
            }
          } catch {}

          setVehicles(mapped);
          setSelectedVehicleId((current) =>
            mapped.some((v) => v.vehicleId === current) ? current : mapped[0]?.vehicleId ?? null
          );
        }
      } else if (res.status === 401 || res.status === 403) {
        setVehicles([]);
        setSelectedVehicleId(null);
      }
    } catch {} finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [locationFilter]);

  useEffect(() => {
    const controller = new AbortController();
    let fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        await fetchLiveFleet(controller.signal);
      } finally {
        fetching = false;
      }
    };
    void poll();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void poll();
      }
    }, 20000);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [fetchLiveFleet]);

  const { vehicles: realtimeVehicles, connectionState } = useRealtime();

  const mergedVehicles = useMemo(() => {
    return vehicles.map((v) => {
      const rt = realtimeVehicles.get(v.vehicleId);
      if (rt && Date.parse(rt.recordedAt) > Date.parse(v.recordedAt)) {
        return {
          ...v,
          lat: rt.lat,
          lng: rt.lng,
          accuracyM: rt.accuracyM,
          speedMps: rt.speedMps,
          headingDeg: rt.headingDeg,
          recordedAt: rt.recordedAt,
          movement: rt.movement,
          driverName: rt.driverName === undefined ? v.driverName : rt.driverName,
          driverPhone: rt.driverPhone === undefined ? v.driverPhone : rt.driverPhone,
          plateNumber: rt.plateNumber ?? v.plateNumber,
          tripOrigin: rt.tripOrigin ?? v.tripOrigin,
          tripDestination: rt.tripDestination ?? v.tripDestination,
          homeLocation: v.homeLocation,
          currentOperationalLocation: v.currentOperationalLocation,
        };
      }
      return v;
    });
  }, [vehicles, realtimeVehicles]);

  const selectedVehicle = mergedVehicles.find((v) => v.vehicleId === selectedVehicleId);
  const rawPhone = selectedVehicle?.driverPhone ? selectedVehicle.driverPhone.replace(/\D/g, '') : '';
  const waUrl = rawPhone ? `https://wa.me/${rawPhone}` : null;

  const movingCount = mergedVehicles.filter((v) => v.movement === 'MOVING').length;

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === locationFilter),
    [locations, locationFilter]
  );

  const currentMapCenter = useMemo(() => {
    if (selectedLocation) {
      return getHubMapCenter(selectedLocation.code || selectedLocation.name);
    }
    return { center: ALL_HUBS_CORRIDOR_CENTER, zoom: ALL_HUBS_CORRIDOR_ZOOM };
  }, [selectedLocation]);

  const conditionStats = useMemo(() => {
    let available = 0;
    let inUse = 0;
    let reserved = 0;
    let maintenance = 0;
    let inactive = 0;

    for (const v of mergedVehicles) {
      const s = (v.status || '').toUpperCase();
      if (s === 'MAINTENANCE') maintenance++;
      else if (s === 'INACTIVE') inactive++;
      else if (s === 'RESERVED') reserved++;
      else if (s === 'IN_USE' || v.movement === 'MOVING') inUse++;
      else available++;
    }

    return { total: mergedVehicles.length, available, inUse, reserved, maintenance, inactive };
  }, [mergedVehicles]);


  const legend = [
    { label: 'Total', value: conditionStats.total, dot: 'bg-slate-500', className: 'pill' },
    { label: 'Available', value: conditionStats.available, dot: 'bg-[var(--status-active-fg)]', className: 'pill pill-active' },
    { label: 'On trip', value: conditionStats.inUse, dot: 'bg-[var(--kcic-red)]', className: 'pill pill-error' },
    { label: 'Reserved', value: conditionStats.reserved, dot: 'bg-[var(--status-warning-fg)]', className: 'pill pill-warning' },
    { label: 'Maintenance', value: conditionStats.maintenance, dot: 'bg-[var(--status-warning-fg)]', className: 'pill pill-warning' },
    { label: 'Inactive', value: conditionStats.inactive, dot: 'bg-slate-400', className: 'pill' },
  ];

  return (
    <div className="w-full min-w-0 space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">
            <span className="relative flex size-1.5">
              <span className="live-ping absolute inset-0 rounded-full bg-[var(--kcic-red)]" aria-hidden="true" />
              <span className="relative size-1.5 rounded-full bg-[var(--kcic-red)]" aria-hidden="true" />
            </span>
            Live fleet radar
          </span>
          <h1 className="page-heading mt-2">
            {selectedLocation ? `Peta armada ${selectedLocation.name}` : 'Peta telemetri armada'}
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            {selectedLocation
              ? `Monitoring hub ${selectedLocation.name} (${selectedLocation.code}). ${mergedVehicles.length} unit, ${movingCount} bergerak.`
              : `Pelacakan posisi GPS real-time seluruh armada — ${mergedVehicles.length} unit, ${movingCount} bergerak.`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="fleet-hub-filter">
            Filter hub
          </label>
          <select
            id="fleet-hub-filter"
            value={locationFilter}
            onChange={(e) => {
              setLocationFilter(e.target.value);
              syncUrlParams({ locationId: e.target.value, location_id: '' });
            }}
            className="w-auto min-w-0 rounded-full py-2 pl-3.5 pr-8 text-[0.6875rem] font-semibold"
          >
            <option value="">Semua hub (koridor Whoosh)</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          <span className="pill">
            <span
              className={`size-1.5 rounded-full ${
                connectionState === 'open'
                  ? 'animate-pulse bg-[var(--status-active-fg)]'
                  : 'bg-slate-400'
              }`}
              aria-hidden="true"
            />
            <span>{connectionState === 'open' ? 'Live socket' : 'Polling 20s'}</span>
          </span>
        </div>
      </header>

      <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
        {legend.map((item) => (
          <span key={item.label} className={`${item.className} shrink-0`}>
            <span className={`size-1.5 rounded-full ${item.dot}`} aria-hidden="true" />
            <span>{item.label}</span>
            <span className="font-semibold tabular-nums">{item.value}</span>
          </span>
        ))}
      </div>

      {isLoading ? (
        <div
          className="card flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500"
          role="status"
        >
          <Spinner size="lg" className="text-[var(--kcic-red)]" />
          <p>Menghubungkan ke telemetri armada…</p>
        </div>
      ) : (
        <div className="tracking-layout">
          <div className="min-w-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              center={currentMapCenter.center}
              zoom={currentMapCenter.zoom}
              className="h-[58dvh] min-h-[22rem] w-full lg:h-[calc(100dvh-15rem)]"
            />
          </div>

          <div className="tracking-panel space-y-3">
            <section className="card overflow-hidden" aria-labelledby="unit-list-heading">
              <div className="border-b border-[var(--border-subtle)] px-4 py-3">
                <span className="eyebrow">
                  Unit terdata{' '}
                  <span className="tabular-nums opacity-70">({mergedVehicles.length})</span>
                </span>
              </div>
              <div className="no-scrollbar flex max-h-40 flex-wrap gap-1.5 overflow-y-auto p-3">
                {mergedVehicles.map((v) => {
                  const visual = getVehicleConditionVisual(v.status, v.movement);
                  const isSelected = v.vehicleId === selectedVehicleId;
                  return (
                    <button
                      key={v.vehicleId}
                      type="button"
                      onClick={() => setSelectedVehicleId(v.vehicleId)}
                      aria-pressed={isSelected}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.625rem] font-semibold transition-colors ${
                        isSelected
                          ? 'border-[var(--slate-navy)] bg-[var(--slate-navy)] text-white'
                          : 'border-[var(--border)] bg-white text-slate-700 hover:border-[var(--border-strong)]'
                      }`}
                    >
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: visual.color }}
                        aria-hidden="true"
                      />
                      <span className="mono-plate">{v.plateNumber}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedVehicle ? (
              <section className="card overflow-hidden" aria-label="Detail unit terpilih">
                <div className="border-b border-[var(--border-subtle)] px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="mono-plate rounded-[var(--radius-sm)] bg-[var(--canvas)] px-2 py-0.5 text-[0.8125rem] font-semibold text-slate-900">
                      {selectedVehicle.plateNumber}
                    </span>
                    <StatusBadge status={selectedVehicle.status} />
                  </div>
                  {selectedVehicle.brand && (
                    <p className="mt-1.5 text-xs font-medium text-slate-600">
                      {selectedVehicle.brand} {selectedVehicle.model}
                    </p>
                  )}
                  {(selectedVehicle.homeLocation || selectedVehicle.currentOperationalLocation) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {selectedVehicle.homeLocation && (
                        <LocationBadge
                          type="home"
                          name={selectedVehicle.homeLocation.name}
                          code={selectedVehicle.homeLocation.code}
                        />
                      )}
                      {selectedVehicle.currentOperationalLocation && (
                        <LocationBadge
                          type="current"
                          name={selectedVehicle.currentOperationalLocation.name}
                          code={selectedVehicle.currentOperationalLocation.code}
                        />
                      )}
                    </div>
                  )}
                </div>

                <dl className="grid grid-cols-2 gap-px border-b border-[var(--border-subtle)] bg-[var(--border-subtle)]">
                  <div className="bg-white px-4 py-2.5">
                    <dt className="metric-label">Pergerakan</dt>
                    <dd className="mt-1">
                      <MovementBadge movement={selectedVehicle.movement} />
                    </dd>
                  </div>
                  <div className="bg-white px-4 py-2.5">
                    <dt className="metric-label">Akurasi GPS</dt>
                    <dd className="mt-1">
                      <GPSBadge accuracyM={selectedVehicle.accuracyM} />
                    </dd>
                  </div>
                </dl>

                <div className="space-y-2.5 px-4 py-3.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">Update terakhir</span>
                    <span className="tabular-nums text-slate-700">
                      <RelativeTime date={selectedVehicle.recordedAt} />
                    </span>
                  </div>

                  {selectedVehicle.driverName && (
                    <div className="border-t border-[var(--border-subtle)] pt-2.5">
                      <p className="metric-label">Pengemudi</p>
                      <p className="mt-0.5 font-semibold text-slate-900">{selectedVehicle.driverName}</p>
                      {selectedVehicle.driverPhone && (
                        <div className="mt-1">
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-[var(--status-active-fg)] hover:underline"
                            >
                              <MessageSquare className="size-3" strokeWidth={2} aria-hidden="true" />
                              <span className="mono-plate">WhatsApp {selectedVehicle.driverPhone}</span>
                            </a>
                          ) : (
                            <span className="mono-plate text-[0.6875rem] font-semibold text-slate-600">
                              {selectedVehicle.driverPhone}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedVehicle.tripOrigin || selectedVehicle.tripDestination) && (
                    <div className="border-t border-[var(--border-subtle)] pt-2.5">
                      <div className="route-stepper">
                        {selectedVehicle.tripOrigin && (
                          <div className="route-point" data-kind="pickup">
                            <p className="route-label">Jemput</p>
                            <p className="route-value">{selectedVehicle.tripOrigin}</p>
                          </div>
                        )}
                        {selectedVehicle.tripDestination && (
                          <div className="route-point" data-kind="destination">
                            <p className="route-label">Tujuan</p>
                            <p className="route-value">{selectedVehicle.tripDestination}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <div className="card px-6 py-8 text-center text-[0.6875rem] leading-relaxed text-slate-400">
                Pilih unit di atas atau klik marker pada peta untuk melihat detail telemetri.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminFleetMapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat peta komando armada…</p>
        </div>
      }
    >
      <AdminFleetMapContent />
    </Suspense>
  );
}
