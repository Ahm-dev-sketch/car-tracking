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
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';

interface ActiveBookingInfo {
  id: string;
  bookingNumber: string;
  status: string;
  pickupLocation: string;
  destination: string;
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
  const fetchActiveBookings = async () => {
    try {
      const res = await fetch('/api/bookings?limit=10');
      if (res.ok) {
        const json = await res.json();
        const list: any[] = json.data || [];
        const active = list.filter((b) =>
          [
            'SEARCHING_DRIVER',
            'DRIVER_NOTIFIED',
            'DRIVER_ASSIGNED',
            'DRIVER_EN_ROUTE',
            'ARRIVED',
            'IN_PROGRESS',
          ].includes(b.status)
        );
        setActiveBookings(active);
        if (active.length > 0 && !selectedBookingId) {
          // If vehicleId in query matches a booking, select that; otherwise pick first
          const matched = active.find((b) => b.vehicle?.id === initialVehicleId);
          setSelectedBookingId(matched ? matched.id : active[0].id);
        }
      }
    } catch {
      // ignore
    }
  };

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
    fetchActiveBookings();
    const interval = setInterval(() => {
      fetchLiveTracking();
      fetchActiveBookings();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Connect to realtime WS
  const vehicleIds = useMemo(() => liveVehicles.map((v) => v.vehicleId), [liveVehicles]);
  const { vehicles: realtimeVehicles, bookings: realtimeBookings, connectionState } = useRealtime({
    vehicleIds,
  });

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

  // Current selected booking
  const selectedBooking = useMemo(() => {
    if (!selectedBookingId) return activeBookings[0] || null;
    const found = activeBookings.find((b) => b.id === selectedBookingId);
    if (!found) return null;
    // Check if realtime updated booking status
    const rt = realtimeBookings.get(found.id);
    if (rt) {
      return {
        ...found,
        status: rt.status,
      };
    }
    return found;
  }, [activeBookings, selectedBookingId, realtimeBookings]);

  // If a booking is selected, ensure its vehicle is selected if tracked
  useEffect(() => {
    if (selectedBooking?.vehicle?.id) {
      const exists = mergedVehicles.some((v) => v.vehicleId === selectedBooking.vehicle?.id);
      if (exists) {
        setSelectedVehicleId(selectedBooking.vehicle.id);
      }
    }
  }, [selectedBooking, mergedVehicles]);

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

      {/* Booking Status Header Banner */}
      {selectedBooking && (
        <div className="bg-white border border-zinc-200 rounded-lg p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-zinc-900">
                  Reservation #{selectedBooking.bookingNumber}
                </span>
                <StatusBadge status={selectedBooking.status} />
              </div>
              <p className="text-xs text-zinc-600 mt-0.5">
                {selectedBooking.pickupLocation} → {selectedBooking.destination}
              </p>
            </div>

            {/* ETA estimate */}
            <div className="flex items-center gap-2">
              {selectedBooking.etaSeconds !== undefined && selectedBooking.etaSeconds !== null && (
                <div className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded text-xs font-mono font-semibold">
                  ETA: {formatEta(selectedBooking.etaSeconds, selectedBooking.etaEstimated)}
                </div>
              )}
            </div>
          </div>

          {/* Dispatch Progress Tracker */}
          <DispatchProgress
            status={selectedBooking.status}
            etaSeconds={selectedBooking.etaSeconds}
            etaEstimated={selectedBooking.etaEstimated}
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-24 text-center text-zinc-500 text-sm bg-white rounded-lg border border-zinc-200">
          <Spinner size="lg" className="mb-2" />
          <p>Locating active vehicles...</p>
        </div>
      ) : mergedVehicles.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
          <p className="font-semibold text-zinc-700">No active vehicle trips reporting live GPS</p>
          <p className="text-xs text-zinc-400 mt-1">
            Tracking is displayed once a driver starts a trip or an online driver shares telemetry.
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
                    <div className="pt-2 border-t border-zinc-100 space-y-1">
                      <span className="text-[10px] text-zinc-400 uppercase font-semibold">
                        Driver
                      </span>
                      <div className="font-medium text-zinc-900">
                        {selectedVehicle.driverName}
                      </div>
                      {selectedVehicle.driverPhone && selectedVehicle.driverPhone !== 'REDACTED' && (
                        <div className="text-zinc-500">
                          {selectedVehicle.driverPhone}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedVehicle.tripOrigin && (
                    <div className="pt-2 border-t border-zinc-100 space-y-1 text-zinc-600">
                      <div>
                        <span className="font-semibold text-zinc-700">Origin: </span>
                        {selectedVehicle.tripOrigin}
                      </div>
                      {selectedVehicle.tripDestination && (
                        <div>
                          <span className="font-semibold text-zinc-700">Destination: </span>
                          {selectedVehicle.tripDestination}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-400 italic">Select a vehicle to inspect details</p>
              )}
            </div>

            {/* Direct driver communication */}
            {waUrl && (
              <div className="pt-4 border-t border-zinc-100 mt-4">
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Chat Driver on WhatsApp</span>
                </a>
              </div>
            )}
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
