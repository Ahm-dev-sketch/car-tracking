'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FleetMap, VehicleMarkerData, getVehicleConditionVisual } from '@/components/map';
import { useRealtime } from '@/hooks/useRealtime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import {
  getHubMapCenter,
  getHubCoordinates,
  DEFAULT_OPS_CENTER,
  DEFAULT_OPS_ZOOM,
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
  const locationsRef = useRef<OperationalLocation[]>([]);
  locationsRef.current = locations;
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
      } catch {
        // ignore
      }
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

        // Load registered fleet units to ensure ALL units (Available, Inactive, Maintenance, etc.)
        // appear on the radar map across the entire corridor or for the filtered hub
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

            // Group offsets per hub so parked pool units cluster around their respective operational hub
            const hubCounters: Record<string, number> = {};

            for (const hv of hubVehicles) {
              const existingIdx = mapped.findIndex((m) => m.vehicleId === hv.id);
              if (existingIdx >= 0) {
                // Enrich existing live telemetry unit with DB status and hub relations if missing
                if (!mapped[existingIdx].status) mapped[existingIdx].status = hv.status;
                if (!mapped[existingIdx].homeLocation && hv.homeLocation) {
                  mapped[existingIdx].homeLocation = hv.homeLocation;
                }
                if (!mapped[existingIdx].currentOperationalLocation && hv.currentOperationalLocation) {
                  mapped[existingIdx].currentOperationalLocation = hv.currentOperationalLocation;
                }
                continue;
              }

              // Vehicle without live telemetry: position at its operational hub or home location
              const targetLoc = hv.currentOperationalLocation || hv.homeLocation;
              const hubKey = targetLoc?.code || targetLoc?.name || 'Halim';
              const hubCoords = getHubCoordinates(hubKey) || DEFAULT_OPS_CENTER;

              hubCounters[hubKey] = (hubCounters[hubKey] || 0) + 1;
              const parkedOffset = hubCounters[hubKey];

              // Spiral distribution around hub so vehicles don't overlap on identical pixel
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
        } catch {
          // Non-fatal if vehicle pool enrichment fails
        }

        setVehicles(mapped);
        setSelectedVehicleId((current) =>
          mapped.some((v) => v.vehicleId === current) ? current : mapped[0]?.vehicleId ?? null
        );
        }
      } else if (res.status === 401 || res.status === 403) {
        setVehicles([]);
        setSelectedVehicleId(null);
      }
    } catch {
      // ignore
    } finally {
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

  // Admin subscribes to all realtime telemetry via useRealtime
  const { vehicles: realtimeVehicles, connectionState } = useRealtime();

  // Merge REST with WS live data
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

  return (
    <div className="space-y-4">
      <div className="page-intro">
        <div>
          <span className="eyebrow mb-3">Every vehicle, in view</span>
          <h1 className="page-heading">
            {selectedLocation ? `Fleet Map: ${selectedLocation.name} (${selectedLocation.code})` : 'Follow your fleet.'}
          </h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {selectedLocation
              ? `Operational hub map for ${selectedLocation.name}. Fleet units: ${mergedVehicles.length}, Moving: ${movingCount}`
              : `Realtime GPS map of entire corporate vehicle operations (${mergedVehicles.length} reporting, ${movingCount} moving)`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">Hub:</span>
            <select
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                syncUrlParams({ locationId: e.target.value, location_id: '' });
              }}
              className="px-3 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
            >
              <option value="">All Hubs (Seluruh Wilayah)</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

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
            {connectionState === 'open' ? 'LIVE SOCKET' : 'POLLING'}
          </span>
        </div>
      </div>

      {/* Radar Condition Status Bar */}
      <div className="flex flex-wrap items-center gap-2 p-2 sm:p-2.5 bg-white border-2 border-black rounded-xl shadow-[2px_2px_0px_0px_#000] text-xs font-mono">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-100 font-bold text-zinc-900 border border-zinc-300">
          <span>FLEET:</span>
          <span className="text-zinc-600">{conditionStats.total} UNITS</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-teal-50 border border-teal-300 text-teal-900 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 border border-white shadow-sm inline-block"></span>
          <span>AVAILABLE ({conditionStats.available})</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-rose-50 border border-rose-300 text-rose-900 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-600 border border-white shadow-sm inline-block animate-ping"></span>
          <span>IN USE / MOVING ({conditionStats.inUse})</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-50 border border-amber-300 text-amber-900 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white shadow-sm inline-block"></span>
          <span>RESERVED ({conditionStats.reserved})</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-50 border border-orange-300 text-orange-900 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-orange-600 border border-white shadow-sm inline-block"></span>
          <span>MAINTENANCE ({conditionStats.maintenance})</span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-100 border border-slate-300 text-slate-800 font-bold">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-600 border border-white shadow-sm inline-block"></span>
          <span>INACTIVE ({conditionStats.inactive})</span>
        </div>
      </div>

      {isLoading ? (
        <div className="surface py-24 text-center text-zinc-500 text-sm" role="status">
          <Spinner size="lg" className="mb-2" />
          <p>Acquiring fleet telemetry...</p>
        </div>
      ) : (
        <div className="tracking-layout">
          <div className="bezel min-w-0">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              center={currentMapCenter.center}
              zoom={currentMapCenter.zoom}
              className="tracking-map"
            />
          </div>

          {/* Telemetry and Driver Details Panel */}
          <div className="surface tracking-panel p-5 sm:p-6 flex flex-col justify-between">
            {mergedVehicles.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                <p className="font-semibold text-zinc-700 text-sm">Tidak ada armada aktif di wilayah ini</p>
                <p className="mt-1 text-zinc-400">Peta wilayah {selectedLocation?.name || 'operasional'} tetap aktif di atas.</p>
              </div>
            ) : (
              <div>
                <div className="border-b-2 border-black/10 pb-3 mb-3">
                  <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                    Fleet Units ({mergedVehicles.length}) {selectedLocation ? `— ${selectedLocation.name}` : ''}
                  </span>
                  <div className="mt-2 flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {mergedVehicles.map((v) => {
                      const visual = getVehicleConditionVisual(v.status, v.movement);
                      const isSelected = v.vehicleId === selectedVehicleId;
                      return (
                        <button
                          key={v.vehicleId}
                          type="button"
                          onClick={() => setSelectedVehicleId(v.vehicleId)}
                          aria-pressed={isSelected}
                          className={`min-h-9 px-2.5 py-1 text-xs rounded-lg font-mono font-bold border-2 border-black cursor-pointer transition flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-zinc-950 text-white shadow-[3px_3px_0px_0px_#000] translate-x-[-1px] translate-y-[-1px]'
                              : 'bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] hover:bg-zinc-100'
                          }`}
                        >
                          <span
                            className="w-2 h-2 rounded-full border border-black/30 shrink-0"
                            style={{ backgroundColor: visual.color }}
                          />
                          <span>{v.plateNumber}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              {selectedVehicle ? (
                <div className="space-y-4 rounded-xl border-2 border-black bg-zinc-50 p-4 text-sm shadow-[3px_3px_0px_0px_#000]">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-block px-3 py-1 bg-zinc-950 text-white font-mono font-black tracking-wider rounded-md border-2 border-black text-sm shadow-[2px_2px_0px_0px_#000]">
                        {selectedVehicle.plateNumber}
                      </span>
                      <StatusBadge status={selectedVehicle.status} />
                    </div>
                    {selectedVehicle.brand && (
                      <p className="text-zinc-700 font-bold mt-1 text-xs">
                        {selectedVehicle.brand} {selectedVehicle.model}
                      </p>
                    )}
                    {(selectedVehicle.homeLocation || selectedVehicle.currentOperationalLocation) && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2">
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

                    <div
                      className="flex items-center justify-between p-2 rounded-lg border border-black/10 text-xs mt-2.5"
                      style={{
                        backgroundColor: `${getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).color}15`,
                      }}
                    >
                      <span className="text-zinc-700 font-black text-[10px] uppercase tracking-wider">
                        Radar Condition:
                      </span>
                      <span
                        className="font-black text-xs uppercase tracking-wide"
                        style={{
                          color: getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).color,
                        }}
                      >
                        {getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).badgeText}
                      </span>
                    </div>
                  </div>

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
                      {typeof selectedVehicle.accuracyM === 'number' && selectedVehicle.accuracyM > 100 && (
                        <div className="mt-1 rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          ⚠️ Posisi estimasi seluler/Wi-Fi (radius ±{Math.round(selectedVehicle.accuracyM)} m)
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t-2 border-black/10 space-y-0.5 text-xs">
                    <span className="text-[10px] text-zinc-500 uppercase font-black">
                      Telemetry Time
                    </span>
                    <div className="text-zinc-800 font-mono font-bold text-[11px]">
                      <RelativeTime date={selectedVehicle.recordedAt} />
                    </div>
                  </div>

                  {selectedVehicle.driverName && (
                    <div className="pt-2 border-t-2 border-black/10 space-y-1.5 text-xs">
                      <span className="text-[10px] text-zinc-500 uppercase font-black">
                        Operator
                      </span>
                      <div className="font-black text-zinc-950">{selectedVehicle.driverName}</div>
                      {selectedVehicle.driverPhone && (
                        <div>
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-emerald-300 px-2.5 py-1 text-xs font-bold text-zinc-950 shadow-[1px_1px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[2px_2px_0px_0px_#000]"
                            >
                              <Icon name="message" className="size-3.5 shrink-0" />
                              <span>WhatsApp {selectedVehicle.driverPhone}</span>
                            </a>
                          ) : (
                            <span className="font-mono text-zinc-700 font-bold">{selectedVehicle.driverPhone}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedVehicle.tripOrigin || selectedVehicle.tripDestination) && (
                    <div className="pt-2 border-t-2 border-black/10 text-xs text-zinc-700 space-y-1">
                      {selectedVehicle.tripOrigin && (
                        <div>
                          <strong className="text-zinc-900 font-bold">Origin:</strong> {selectedVehicle.tripOrigin}
                        </div>
                      )}
                      {selectedVehicle.tripDestination && (
                        <div>
                          <strong className="text-zinc-900 font-bold">Destination:</strong> {selectedVehicle.tripDestination}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs font-semibold text-zinc-500 py-6 text-center">
                  Select a marker on the map to inspect unit details.
                </div>
              )}
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
        <div className="py-24 text-center text-zinc-500 text-xs">
          <Spinner size="md" className="mb-2" />
          <p>Loading fleet command...</p>
        </div>
      }
    >
      <AdminFleetMapContent />
    </Suspense>
  );
}
