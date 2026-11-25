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
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateVehicleCondition } from '@/lib/i18n';
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
  const { locale, t, format } = useTranslation();
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
        <div className="min-w-0">
          <span className="eyebrow mb-3">{t.adminPages.fleet.eyebrow}</span>
          <h1 className="page-heading">
            {selectedLocation
              ? format(t.adminPages.fleet.headingHub, { name: selectedLocation.name, code: selectedLocation.code })
              : t.adminPages.fleet.headingAll}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            {selectedLocation
              ? locale === 'id'
                ? `Peta hub operasional ${selectedLocation.name}. Unit armada: ${mergedVehicles.length}, Bergerak: ${movingCount}`
                : `Operational hub map for ${selectedLocation.name}. Fleet units: ${mergedVehicles.length}, Moving: ${movingCount}`
              : locale === 'id'
              ? `Peta GPS langsung seluruh operasi armada (${mergedVehicles.length} terpantau, ${movingCount} bergerak)`
              : `Realtime GPS map of entire corporate vehicle operations (${mergedVehicles.length} reporting, ${movingCount} moving)`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <label htmlFor="fleet-hub-filter" className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              {t.adminPages.fleet.hubLabel}
            </label>
            <select
              id="fleet-hub-filter"
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                syncUrlParams({ locationId: e.target.value, location_id: '' });
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.fleet.allHubsOption}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] font-medium tabular-nums ${
              connectionState === 'open'
                ? 'border-success-200 bg-success-50 text-success-700'
                : 'border-slate-200 bg-slate-50 text-slate-500'
            }`}
          >
            <span
              aria-hidden="true"
              className={`size-1.5 rounded-full ${
                connectionState === 'open' ? 'bg-success-600 status-ping' : 'bg-slate-400'
              }`}
            />
            {connectionState === 'open' ? t.adminPages.fleet.liveSocketBadge : t.adminPages.fleet.pollingBadge}
          </span>
        </div>
      </div>

      {/* Radar Condition Status Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-xs sm:p-2.5">
        <div className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t.adminPages.fleet.fleetStripLabel}</span>
          <span className="font-mono uppercase tabular-nums">{conditionStats.total} {t.common.units}</span>
        </div>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-success-200 bg-success-50 px-2.5 py-1 font-medium text-success-700">
          <span className="size-1.5 rounded-full bg-success-600" aria-hidden="true" />
          <span className="font-mono tabular-nums">{format(t.adminPages.fleet.statAvailable, { count: conditionStats.available })}</span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-danger-200 bg-danger-50 px-2.5 py-1 font-medium text-danger-700">
          <span className="relative size-1.5 rounded-full bg-danger-600 status-ping" aria-hidden="true" />
          <span className="font-mono tabular-nums">{format(t.adminPages.fleet.statInUse, { count: conditionStats.inUse })}</span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-200 bg-warning-50 px-2.5 py-1 font-medium text-warning-700">
          <span className="size-1.5 rounded-full bg-warning-600" aria-hidden="true" />
          <span className="font-mono tabular-nums">{format(t.adminPages.fleet.statReserved, { count: conditionStats.reserved })}</span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning-200 bg-white px-2.5 py-1 font-medium text-warning-700">
          <span className="size-1.5 rounded-full" style={{ backgroundColor: '#ea580c' }} aria-hidden="true" />
          <span className="font-mono tabular-nums">{format(t.adminPages.fleet.statMaintenance, { count: conditionStats.maintenance })}</span>
        </span>

        <span className="inline-flex items-center gap-1.5 rounded-full border border-info-200 bg-info-50 px-2.5 py-1 font-medium text-info-700">
          <span className="size-1.5 rounded-full bg-slate-400" aria-hidden="true" />
          <span className="font-mono tabular-nums">{format(t.adminPages.fleet.statInactive, { count: conditionStats.inactive })}</span>
        </span>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-24 text-center text-sm text-slate-500" role="status">
          <Spinner size="lg" className="mb-2" />
          <p className="font-medium">{t.adminPages.fleet.loadingTelemetry}</p>
        </div>
      ) : (
        <div className="tracking-layout">
          <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
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
          <div className="tracking-panel flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
            {mergedVehicles.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <p className="text-sm font-semibold text-slate-700">{t.adminPages.fleet.emptyHubTitle}</p>
                <p className="mt-1 text-slate-600">
                  {format(t.adminPages.fleet.emptyHubDesc, {
                    hub: selectedLocation?.name || t.adminPages.fleet.defaultOperationalName,
                  })}
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-3 border-b border-slate-200 pb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {locale === 'id' ? 'Unit Armada' : 'Fleet Units'}{' '}
                    <span className="font-mono tabular-nums">({mergedVehicles.length})</span>{' '}
                    {selectedLocation ? `— ${selectedLocation.name}` : ''}
                  </span>
                  <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto pr-1">
                    {mergedVehicles.map((v) => {
                      const visual = getVehicleConditionVisual(v.status, v.movement);
                      const isSelected = v.vehicleId === selectedVehicleId;
                      return (
                        <button
                          key={v.vehicleId}
                          type="button"
                          onClick={() => setSelectedVehicleId(v.vehicleId)}
                          aria-pressed={isSelected}
                          className={`flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
                            isSelected
                              ? 'border-brand-200 bg-brand-50 text-brand-700'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: visual.color }}
                            aria-hidden="true"
                          />
                          <span>{v.plateNumber}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

              {selectedVehicle ? (
                <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-sm font-semibold tracking-wide tabular-nums text-slate-900">
                        {selectedVehicle.plateNumber}
                      </span>
                      <StatusBadge status={selectedVehicle.status} />
                    </div>
                    {selectedVehicle.brand && (
                      <p className="mt-1 text-xs font-medium text-slate-500">
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

                    <div
                      className="mt-2.5 flex items-center justify-between rounded-md border p-2 text-xs"
                      style={{
                        backgroundColor: `${getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).color}0F`,
                        borderColor: `${getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).color}33`,
                      }}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                        {t.adminPages.fleet.radarConditionLabel}
                      </span>
                      <span
                        className="text-xs font-semibold uppercase tracking-wide"
                        style={{
                          color: getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).color,
                        }}
                      >
                        {translateVehicleCondition(
                          locale,
                          getVehicleConditionVisual(selectedVehicle.status, selectedVehicle.movement).badgeText
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {t.adminPages.fleet.movementLabel}
                      </span>
                      <div className="mt-1">
                        <MovementBadge movement={selectedVehicle.movement} />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {t.adminPages.fleet.accuracyLabel}
                      </span>
                      <div className="mt-1">
                        <GPSBadge accuracyM={selectedVehicle.accuracyM} />
                      </div>
                      {typeof selectedVehicle.accuracyM === 'number' && selectedVehicle.accuracyM > 100 && (
                        <div className="mt-1 flex items-start gap-1.5 rounded-md border border-warning-200 bg-warning-50 px-1.5 py-1 text-[10px] font-medium text-warning-700">
                          <Icon name="alert" className="mt-px size-3 shrink-0 text-warning-600" />
                          <span>{format(t.adminPages.fleet.cellWifiEstimated, { m: Math.round(selectedVehicle.accuracyM) })}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-0.5 border-t border-slate-100 pt-3 text-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {t.adminPages.fleet.telemetryTimeLabel}
                    </span>
                    <div className="font-mono text-[11px] font-medium tabular-nums text-slate-700">
                      <RelativeTime date={selectedVehicle.recordedAt} />
                    </div>
                  </div>

                  {selectedVehicle.driverName && (
                    <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {t.adminPages.fleet.operatorLabel}
                      </span>
                      <div className="font-semibold text-slate-900">{selectedVehicle.driverName}</div>
                      {selectedVehicle.driverPhone && (
                        <div>
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:border-brand-300 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                            >
                              <Icon name="message" className="size-3.5 shrink-0" />
                              <span className="tabular-nums">{t.common.whatsapp} {selectedVehicle.driverPhone}</span>
                            </a>
                          ) : (
                            <span className="font-mono font-medium tabular-nums text-slate-600">{selectedVehicle.driverPhone}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedVehicle.tripOrigin || selectedVehicle.tripDestination) && (
                    <div className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                      {selectedVehicle.tripOrigin && (
                        <div>
                          <strong className="font-semibold text-slate-800">{t.adminPages.fleet.originLabel}</strong> {selectedVehicle.tripOrigin}
                        </div>
                      )}
                      {selectedVehicle.tripDestination && (
                        <div>
                          <strong className="font-semibold text-slate-800">{t.adminPages.fleet.destinationLabel}</strong> {selectedVehicle.tripDestination}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-xs font-medium text-slate-600">
                  {t.adminPages.fleet.selectMarkerHint}
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
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-24 text-center text-xs text-slate-500" role="status">
          <Spinner size="md" className="mb-2" />
          <p className="font-medium">{t.adminPages.fleet.loadingSuspense}</p>
        </div>
      }
    >
      <AdminFleetMapContent />
    </Suspense>
  );
}
