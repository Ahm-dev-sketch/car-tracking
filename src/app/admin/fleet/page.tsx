'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FleetMap, VehicleMarkerData } from '@/components/map';
import { useRealtime } from '@/hooks/useRealtime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';

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

  const fetchLiveFleet = async () => {
    try {
      const url = locationFilter
        ? `/api/tracking/live?locationId=${encodeURIComponent(locationFilter)}`
        : '/api/tracking/live';
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const rows: any[] = json.data || [];
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
            accuracyM: r.location.accuracyM || 10,
            speedMps: r.location.speedMps,
            headingDeg: r.location.headingDeg,
            recordedAt: r.location.recordedAt,
            movement: r.location.movement || 'STOPPED',
            homeLocation: r.homeLocation || null,
            currentOperationalLocation: r.currentLocationInfo || null,
          }));
        setVehicles(mapped);
        if (!selectedVehicleId && mapped.length > 0) {
          setSelectedVehicleId(mapped[0].vehicleId);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveFleet();
    syncUrlParams({ locationId: locationFilter });
    const interval = setInterval(fetchLiveFleet, 10000);
    return () => clearInterval(interval);
  }, [locationFilter]);

  // Admin subscribes to all realtime telemetry via useRealtime
  const { vehicles: realtimeVehicles, connectionState } = useRealtime();

  // Merge REST with WS live data
  const mergedVehicles = useMemo(() => {
    return vehicles.map((v) => {
      const rt = realtimeVehicles.get(v.vehicleId);
      if (rt) {
        return {
          ...v,
          lat: rt.lat,
          lng: rt.lng,
          accuracyM: rt.accuracyM,
          speedMps: rt.speedMps,
          headingDeg: rt.headingDeg,
          recordedAt: rt.recordedAt,
          movement: rt.movement,
          driverName: rt.driverName ?? v.driverName,
          driverPhone: rt.driverPhone ?? v.driverPhone,
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Fleet Command & Map</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Realtime GPS map of entire corporate vehicle operations ({mergedVehicles.length} reporting, {movingCount} moving)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">Hub:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-2.5 py-1 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="">All Hubs</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-mono text-[11px] border ${
              connectionState === 'open'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-zinc-100 text-zinc-600 border-zinc-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionState === 'open' ? 'bg-emerald-500' : 'bg-zinc-400'
              }`}
            />
            {connectionState === 'open' ? 'LIVE SOCKET' : 'POLLING'}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-zinc-500 text-sm bg-white rounded-lg border border-zinc-200">
          <Spinner size="lg" className="mb-2" />
          <p>Acquiring fleet telemetry...</p>
        </div>
      ) : mergedVehicles.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
          <p className="font-semibold text-zinc-700">No active vehicle telemetry received</p>
          <p className="text-xs text-zinc-400 mt-1">
            Locations will populate as drivers activate trips and stream coordinates.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              className="h-[360px] sm:h-[480px] lg:h-[600px] w-full rounded-lg overflow-hidden border border-zinc-200"
            />
          </div>

          {/* Telemetry and Driver Details Panel */}
          <div className="bg-white border border-zinc-200 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <div className="border-b border-zinc-100 pb-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Fleet Units ({mergedVehicles.length})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {mergedVehicles.map((v) => (
                    <button
                      key={v.vehicleId}
                      type="button"
                      onClick={() => setSelectedVehicleId(v.vehicleId)}
                      className={`px-2 py-1 text-xs rounded font-mono font-medium border cursor-pointer ${
                        v.vehicleId === selectedVehicleId
                          ? 'bg-zinc-900 text-white border-zinc-900'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {v.plateNumber}
                    </button>
                  ))}
                </div>
              </div>

              {selectedVehicle ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-base text-zinc-900">
                        {selectedVehicle.plateNumber}
                      </span>
                      <StatusBadge status={selectedVehicle.status} />
                    </div>
                    {selectedVehicle.brand && (
                      <p className="text-zinc-600 mt-0.5">
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
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
                    <div>
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Movement
                      </span>
                      <div className="mt-0.5">
                        <MovementBadge movement={selectedVehicle.movement} />
                      </div>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Accuracy
                      </span>
                      <div className="mt-0.5">
                        <GPSBadge accuracyM={selectedVehicle.accuracyM} />
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-zinc-100 space-y-1">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                      Telemetry Time
                    </span>
                    <div className="text-zinc-700 font-mono">
                      <RelativeTime date={selectedVehicle.recordedAt} />
                    </div>
                  </div>

                  {selectedVehicle.driverName && (
                    <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Operator
                      </span>
                      <div className="font-bold text-zinc-900">{selectedVehicle.driverName}</div>
                      {selectedVehicle.driverPhone && (
                        <div>
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:underline"
                            >
                              <span>📱 WhatsApp {selectedVehicle.driverPhone}</span>
                            </a>
                          ) : (
                            <span className="text-zinc-600">{selectedVehicle.driverPhone}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(selectedVehicle.tripOrigin || selectedVehicle.tripDestination) && (
                    <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-600 space-y-0.5">
                      {selectedVehicle.tripOrigin && (
                        <div>
                          <strong className="text-zinc-700">Origin:</strong> {selectedVehicle.tripOrigin}
                        </div>
                      )}
                      {selectedVehicle.tripDestination && (
                        <div>
                          <strong className="text-zinc-700">Destination:</strong> {selectedVehicle.tripDestination}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-zinc-400 py-6 text-center">
                  Select a marker on the map to inspect unit details.
                </div>
              )}
            </div>
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
