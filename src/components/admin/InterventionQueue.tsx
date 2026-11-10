'use client';

import React, { useState, useEffect } from 'react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { FleetMap, VehicleMarkerData } from '@/components/map';
import { formatEta } from '@/components/booking/DispatchProgress';
import { Icon } from '@/components/ui/Icon';

export interface CandidateDriver {
  driverId: string;
  driverName?: string;
  name?: string;
  phone?: string | null;
  licenseNumber?: string;
  vehicleId?: string;
  plateNumber?: string;
  vehiclePlateNumber?: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleType?: string;
  seatingCapacity?: number;
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number;
  receivedAt?: string | Date | null;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  rank?: number;
}

export interface InterventionBooking {
  id: string;
  bookingNumber: string;
  pickupLocation: string;
  destination: string;
  departureAt: string;
  passengerCount: number;
  purpose: string;
  notes?: string | null;
  status: string;
  operationalLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export function InterventionQueue({ onAssigned }: { onAssigned?: () => void }) {
  const [bookings, setBookings] = useState<InterventionBooking[]>([]);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateDriver[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchInterventions = async (isInitial = false) => {
    if (isInitial) setLoadingBookings(true);
    try {
      const res = await fetch('/api/bookings?status=ADMIN_INTERVENTION&limit=20');
      if (res.ok) {
        const json = await res.json();
        const list: InterventionBooking[] = json.data || [];
        setBookings(list);
        if (list.length > 0 && !selectedBookingId) {
          setSelectedBookingId(list[0].id);
        } else if (list.length === 0) {
          setSelectedBookingId(null);
          setCandidates([]);
        }
      }
    } catch {
      // ignore
    } finally {
      if (isInitial) setLoadingBookings(false);
    }
  };

  useEffect(() => {
    fetchInterventions(true);
    const interval = setInterval(() => fetchInterventions(false), 20000);
    return () => clearInterval(interval);
  }, []);

  // Fetch candidates when a booking is selected
  useEffect(() => {
    if (!selectedBookingId) {
      setCandidates([]);
      return;
    }

    const fetchCandidates = async () => {
      setLoadingCandidates(true);
      setActionError(null);
      try {
        const res = await fetch(`/api/admin/dispatch/${selectedBookingId}/candidates`);
        if (res.ok) {
          const json = await res.json();
          setCandidates(json.data || []);
        } else {
          const err = await res.json();
          setActionError(err.error?.message || 'Failed to load driver candidates');
        }
      } catch {
        setActionError('Network error loading candidate drivers');
      } finally {
        setLoadingCandidates(false);
      }
    };

    fetchCandidates();
  }, [selectedBookingId]);

  const handleManualAssign = async (driverId: string) => {
    if (!selectedBookingId) return;
    setAssigningDriverId(driverId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const res = await fetch(`/api/admin/bookings/${selectedBookingId}/manual-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId }),
      });

      if (res.ok) {
        setSuccessMessage('Driver manually assigned successfully.');
        onAssigned?.();
        await fetchInterventions();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Failed to manually assign driver');
      }
    } catch {
      setActionError('Network error during manual assignment');
    } finally {
      setAssigningDriverId(null);
    }
  };

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId);

  // Map candidate locations into VehicleMarkerData for FleetMap
  const candidateMarkers: VehicleMarkerData[] = candidates
    .filter((c) => c.lat !== null && c.lat !== undefined && c.lng !== null && c.lng !== undefined)
    .map((c) => ({
      vehicleId: c.vehicleId || c.driverId,
      plateNumber: c.plateNumber || c.vehiclePlateNumber || 'VEHICLE',
      brand: c.vehicleBrand || '',
      model: c.vehicleModel || '',
      status: 'AVAILABLE',
      driverName: c.driverName || c.name || null,
      driverPhone: c.phone || null,
      lat: c.lat!,
      lng: c.lng!,
      accuracyM: c.accuracyM || 15,
      speedMps: null,
      headingDeg: null,
      recordedAt: c.receivedAt ? new Date(c.receivedAt).toISOString() : new Date().toISOString(),
      movement: 'STOPPED',
    }));

  if (loadingBookings && bookings.length === 0) {
    return (
      <div className="p-8 text-center bg-white border-2 border-black rounded-xl text-zinc-600 text-xs shadow-[3px_3px_0px_0px_#000]">
        <Spinner size="md" className="mb-2" />
        <p className="font-bold">Checking dispatch intervention queue...</p>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="p-4 bg-emerald-100 border-2 border-black rounded-xl flex items-center justify-between text-xs text-zinc-950 shadow-[3px_3px_0px_0px_#000]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full border border-black bg-emerald-500" />
          <span className="font-black">Intervention Queue Clear</span>
          <span className="font-medium text-emerald-950">
            — All auto-dispatch requests have been fulfilled or assigned.
          </span>
        </div>
        <span className="text-[11px] font-mono font-black text-zinc-900 bg-white px-2 py-0.5 rounded border border-black">0 PENDING ESCALATIONS</span>
      </div>
    );
  }

  return (
    <div className="bg-white border-2.5 border-black rounded-2xl p-5 space-y-4 shadow-[4px_4px_0px_0px_#000]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b-2 border-black/10 gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-3.5 w-3.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3.5 w-3.5 border border-black bg-amber-400" />
          </span>
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-950">
            Admin Intervention Queue ({bookings.length})
          </h2>
        </div>
        <span className="text-xs text-amber-950 font-bold bg-amber-200 px-2 py-0.5 rounded border border-black">
          Auto-dispatch timeout reached — Manual driver assignment required
        </span>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {successMessage && (
        <div className="flex items-center gap-1.5 p-3 bg-emerald-100 border-2 border-black rounded-xl text-zinc-950 text-xs font-bold shadow-[2px_2px_0px_0px_#000]">
          <Icon name="check" className="size-4 shrink-0 text-emerald-800" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Select booking pill list if multiple */}
      {bookings.length > 1 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {bookings.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedBookingId(b.id)}
              className={`px-3 py-1 text-xs rounded-lg font-bold border-2 border-black cursor-pointer transition ${
                b.id === selectedBookingId
                  ? 'bg-amber-300 text-zinc-950 shadow-[2px_2px_0px_0px_#000]'
                  : 'bg-white text-zinc-800 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
              }`}
            >
              #{b.bookingNumber} ({b.pickupLocation} → {b.destination})
            </button>
          ))}
        </div>
      )}

      {selectedBooking && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Booking Summary Card */}
          <div className="bg-zinc-50 border-2 border-black rounded-xl p-4 space-y-3 text-xs shadow-[3px_3px_0px_0px_#000]">
            <div className="flex items-center justify-between">
              <span className="font-black text-sm text-zinc-950">
                #{selectedBooking.bookingNumber}
              </span>
              <StatusBadge status="ADMIN_INTERVENTION" />
            </div>

            {selectedBooking.operationalLocation && (
              <div className="text-zinc-700 font-medium">
                <span className="font-bold text-zinc-900">Hub: </span>
                {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
              </div>
            )}

            <div className="space-y-1.5 pt-2 border-t-2 border-black/10">
              <div>
                <span className="text-[10px] uppercase font-black text-zinc-500 block">Pickup</span>
                <span className="font-bold text-zinc-900">{selectedBooking.pickupLocation}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-zinc-500 block">Destination</span>
                <span className="font-bold text-zinc-900">{selectedBooking.destination}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black/10 text-zinc-700">
              <div>
                <span className="text-[10px] uppercase font-black text-zinc-500 block">Passengers</span>
                <span className="font-bold text-zinc-900">{selectedBooking.passengerCount} Persons</span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-black text-zinc-500 block">Departure</span>
                <span className="font-bold text-zinc-900">
                  {new Date(selectedBooking.departureAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>

            {selectedBooking.purpose && (
              <div className="pt-2 border-t-2 border-black/10 text-zinc-700">
                <span className="text-[10px] uppercase font-black text-zinc-500 block">Purpose</span>
                <p className="mt-0.5 font-medium">{selectedBooking.purpose}</p>
              </div>
            )}
          </div>

          {/* Candidate Drivers & Mini Map */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-zinc-800">
                Eligible Candidate Drivers ({candidates.length})
              </span>
              {loadingCandidates && <Spinner size="sm" />}
            </div>

            {/* Mini Map of Candidate Drivers */}
            {candidateMarkers.length > 0 && (
              <div className="h-44 w-full rounded-xl border-2 border-black overflow-hidden shadow-[2px_2px_0px_0px_#000]">
                <FleetMap
                  vehicles={candidateMarkers}
                  className="h-full w-full"
                />
              </div>
            )}

            {/* Candidate List */}
            {candidates.length === 0 ? (
              <div className="p-6 bg-zinc-50 border-2 border-dashed border-zinc-400 rounded-xl text-center text-xs font-semibold text-zinc-600">
                {loadingCandidates
                  ? 'Scanning online drivers near pickup location...'
                  : 'No active eligible drivers found with fresh GPS in this location.'}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {candidates.map((c) => {
                  const driverName = c.driverName || c.name || 'Driver';
                  const plate = c.plateNumber || c.vehiclePlateNumber || '—';
                  const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
                  const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                  const isAssigning = assigningDriverId === c.driverId;
                  const etaText = formatEta(c.etaSeconds, c.etaEstimated);

                  return (
                    <div
                      key={c.driverId}
                      className="p-3 bg-white border-2 border-black rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs shadow-[2px_2px_0px_0px_#000]"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-zinc-950">{driverName}</span>
                          {c.phone && <span className="font-mono text-zinc-600">({c.phone})</span>}
                          {etaText && (
                            <span className="font-mono text-[10px] font-black text-zinc-950 bg-amber-200 px-1.5 py-0.5 rounded border border-black">
                              ETA: {etaText}
                            </span>
                          )}
                        </div>

                        <div className="text-zinc-700 flex items-center gap-2 font-medium">
                          <span className="font-mono font-bold text-zinc-900">{plate}</span>
                          {(c.vehicleBrand || c.vehicleModel) && (
                            <span>
                              • {c.vehicleBrand} {c.vehicleModel}
                            </span>
                          )}
                          {c.seatingCapacity && <span>• {c.seatingCapacity} seats</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {waUrl && (
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2.5 py-1.5 border-2 border-black bg-emerald-300 text-zinc-950 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 shadow-[1px_1px_0px_0px_#000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[2px_2px_0px_0px_#000]"
                          >
                            <Icon name="message" className="size-3.5 shrink-0" />
                            <span>WhatsApp</span>
                          </a>
                        )}

                        <button
                          type="button"
                          disabled={Boolean(assigningDriverId)}
                          onClick={() => handleManualAssign(c.driverId)}
                          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black disabled:opacity-50 text-white rounded-lg border-2 border-black text-xs font-black cursor-pointer inline-flex items-center gap-1.5 shadow-[2px_2px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px]"
                        >
                          {isAssigning ? <Spinner size="sm" /> : 'Assign Driver'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
