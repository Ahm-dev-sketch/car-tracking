'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FleetMap, VehicleMarkerData } from '@/components/map';
import { useRealtime } from '@/hooks/useRealtime';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MovementBadge } from '@/components/ui/MovementBadge';
import { GPSBadge } from '@/components/ui/GPSBadge';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { Spinner } from '@/components/ui/Spinner';

function UserTrackingContent() {
  const searchParams = useSearchParams();
  const initialVehicleId = searchParams.get('vehicleId');

  const [liveVehicles, setLiveVehicles] = useState<VehicleMarkerData[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(initialVehicleId);
  const [isLoading, setIsLoading] = useState(true);

  // Initial fetch from GET /api/tracking/live
  const fetchLiveTracking = async () => {
    try {
      const res = await fetch('/api/tracking/live');
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
          }));
        setLiveVehicles(mapped);
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
    fetchLiveTracking();
    const interval = setInterval(fetchLiveTracking, 10000);
    return () => clearInterval(interval);
  }, []);

  // Connect to realtime WS
  const vehicleIds = useMemo(() => liveVehicles.map((v) => v.vehicleId), [liveVehicles]);
  const { vehicles: realtimeVehicles, connectionState } = useRealtime({ vehicleIds });

  // Merge live REST data with realtime WebSocket push
  const mergedVehicles = useMemo(() => {
    return liveVehicles.map((lv) => {
      const rt = realtimeVehicles.get(lv.vehicleId);
      if (rt) {
        return {
          ...lv,
          lat: rt.lat,
          lng: rt.lng,
          accuracyM: rt.accuracyM,
          speedMps: rt.speedMps,
          headingDeg: rt.headingDeg,
          recordedAt: rt.recordedAt,
          movement: rt.movement,
          driverName: rt.driverName ?? lv.driverName,
          driverPhone: rt.driverPhone ?? lv.driverPhone,
          plateNumber: rt.plateNumber ?? lv.plateNumber,
          tripOrigin: rt.tripOrigin ?? lv.tripOrigin,
          tripDestination: rt.tripDestination ?? lv.tripDestination,
        };
      }
      return lv;
    });
  }, [liveVehicles, realtimeVehicles]);

  const selectedVehicle = mergedVehicles.find((v) => v.vehicleId === selectedVehicleId);

  const rawPhone = selectedVehicle?.driverPhone ? selectedVehicle.driverPhone.replace(/\D/g, '') : '';
  const waUrl = rawPhone ? `https://wa.me/${rawPhone}` : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Live Vehicle Tracking</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Realtime location of vehicles assigned to your active reservations
          </p>
        </div>

        {/* Realtime WS status indicator */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Live Feed:</span>
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-mono text-[11px] border ${
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
            {connectionState === 'open' ? 'CONNECTED' : 'POLLING'}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-zinc-500 text-sm bg-white rounded-lg border border-zinc-200">
          <Spinner size="lg" className="mb-2" />
          <p>Locating active vehicles...</p>
        </div>
      ) : mergedVehicles.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
          <p className="font-semibold text-zinc-700">No active vehicle trips found</p>
          <p className="text-xs text-zinc-400 mt-1">
            Tracking is displayed once a booking is approved and the vehicle starts moving.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Main Map */}
          <div className="lg:col-span-3">
            <FleetMap
              vehicles={mergedVehicles}
              selectedVehicleId={selectedVehicleId}
              onSelectVehicle={(v) => setSelectedVehicleId(v.vehicleId)}
              className="h-[340px] sm:h-[460px] lg:h-[550px] w-full rounded-lg overflow-hidden border border-zinc-200"
            />
          </div>

          {/* Vehicle & Driver Side Panel */}
          <div className="bg-white border border-zinc-200 rounded-lg p-4 flex flex-col justify-between">
            <div>
              <div className="border-b border-zinc-100 pb-3 mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                  Tracked Vehicles ({mergedVehicles.length})
                </span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {mergedVehicles.map((v) => (
                    <button
                      key={v.vehicleId}
                      type="button"
                      onClick={() => setSelectedVehicleId(v.vehicleId)}
                      className={`px-2.5 py-1 text-xs rounded font-mono font-medium border cursor-pointer ${
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
                      Last Update
                    </span>
                    <div className="text-zinc-700">
                      <RelativeTime date={selectedVehicle.recordedAt} />
                    </div>
                  </div>

                  {selectedVehicle.driverName && (
                    <div className="pt-2 border-t border-zinc-100 space-y-1.5">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Driver Information
                      </span>
                      <div className="font-bold text-zinc-900">{selectedVehicle.driverName}</div>
                      {selectedVehicle.driverPhone && selectedVehicle.driverPhone !== 'REDACTED' && (
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
                  Select a vehicle marker on the map to inspect driver and telemetry.
                </div>
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
          <p>Loading tracking view...</p>
        </div>
      }
    >
      <UserTrackingContent />
    </Suspense>
  );
}
