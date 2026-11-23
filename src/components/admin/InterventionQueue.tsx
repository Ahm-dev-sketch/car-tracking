'use client';

import React, { useState, useEffect } from 'react';
import { Check, MessageSquare, Phone, Route, Timer, TriangleAlert, UserRound } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner, SuccessBanner } from '@/components/ui/ErrorBanner';
import { FleetMap, VehicleMarkerData } from '@/components/map';
import { formatEta } from '@/components/booking/DispatchProgress';

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
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        fetchInterventions(false);
      }
    }, 20000);
    return () => clearInterval(interval);
  }, []);

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
          setActionError(err.error?.message || 'Gagal memuat kandidat pengemudi');
        }
      } catch {
        setActionError('Kendala jaringan saat memuat kandidat driver');
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
        setSuccessMessage('Pengemudi berhasil ditugaskan secara manual.');
        onAssigned?.();
        await fetchInterventions();
      } else {
        const err = await res.json();
        setActionError(err.error?.message || 'Gagal menugaskan pengemudi');
      }
    } catch {
      setActionError('Kendala jaringan saat proses penugasan');
    } finally {
      setAssigningDriverId(null);
    }
  };

  const selectedBooking = bookings.find((b) => b.id === selectedBookingId);

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
      <div
        role="status"
        className="card flex items-center justify-center gap-2.5 px-6 py-8 text-xs text-slate-500"
      >
        <Spinner size="sm" className="text-[var(--kcic-red)]" />
        <span>Memeriksa antrean intervensi dispatch…</span>
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-white text-[var(--status-active-fg)]">
            <Check className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
          </span>
          <span className="min-w-0 text-xs leading-relaxed text-[var(--status-active-fg)]">
            <strong className="font-semibold">Antrean intervensi kosong</strong>
            <span className="text-[var(--status-active-fg)]/80">
              {' '}
              — semua permintaan auto-dispatch sudah terpenuhi.
            </span>
          </span>
        </div>
        <span className="mono-plate shrink-0 rounded-full border border-[var(--status-active-border)] bg-white px-2.5 py-0.5 text-[0.625rem] font-semibold text-[var(--status-active-fg)]">
          0 PENDING
        </span>
      </div>
    );
  }

  return (
    <section className="card overflow-hidden" aria-labelledby="intervention-queue-heading">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">
            <span className="relative flex size-1.5">
              <span className="live-ping absolute inset-0 rounded-full bg-[var(--status-warning-fg)]" aria-hidden="true" />
              <span className="relative size-1.5 rounded-full bg-[var(--status-warning-fg)]" aria-hidden="true" />
            </span>
            Butuh tindakan
          </span>
          <h2 id="intervention-queue-heading" className="section-title mt-1">
            Antrean intervensi dispatch{' '}
            <span className="font-normal text-slate-400 tabular-nums">({bookings.length})</span>
          </h2>
        </div>
        <span className="pill pill-warning">
          <span>Auto-dispatch habis — penugasan manual</span>
        </span>
      </div>

      <div className="space-y-3.5 p-4 sm:p-5">
        {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
        {successMessage && (
          <SuccessBanner message={successMessage} onDismiss={() => setSuccessMessage(null)} />
        )}

        {/* Booking selector */}
        {bookings.length > 1 && (
          <div className="no-scrollbar -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
            {bookings.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBookingId(b.id)}
                aria-pressed={b.id === selectedBookingId}
                className="chip shrink-0"
              >
                <span className="mono-plate font-semibold">#{b.bookingNumber}</span>
              </button>
            ))}
          </div>
        )}

        {selectedBooking && (
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
            {/* Booking summary */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="mono-plate truncate text-[0.8125rem] font-semibold text-slate-900">
                  #{selectedBooking.bookingNumber}
                </span>
                <StatusBadge status="ADMIN_INTERVENTION" />
              </div>

              {selectedBooking.operationalLocation && (
                <p className="mt-2 text-[0.6875rem] text-slate-500">
                  Hub{' '}
                  <span className="font-semibold text-slate-700">
                    {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
                  </span>
                </p>
              )}

              <div className="route-stepper mt-4">
                <div className="route-point" data-kind="pickup">
                  <p className="route-label">Titik jemput</p>
                  <p className="route-value">{selectedBooking.pickupLocation}</p>
                </div>
                <div className="route-point" data-kind="destination">
                  <p className="route-label">Tujuan</p>
                  <p className="route-value">{selectedBooking.destination}</p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--border-subtle)] pt-3">
                <div>
                  <dt className="route-label">Penumpang</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900">
                    {selectedBooking.passengerCount} orang
                  </dd>
                </div>
                <div>
                  <dt className="route-label">Keberangkatan</dt>
                  <dd className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900">
                    {new Date(selectedBooking.departureAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </dd>
                </div>
                {selectedBooking.purpose && (
                  <div className="col-span-2">
                    <dt className="route-label">Keperluan</dt>
                    <dd className="mt-0.5 text-[0.6875rem] leading-relaxed text-slate-600">
                      {selectedBooking.purpose}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Candidates */}
            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="eyebrow">
                  <UserRound className="size-3" strokeWidth={2} aria-hidden="true" />
                  Kandidat terdekat ({candidates.length})
                </span>
                {loadingCandidates && <Spinner size="sm" className="text-[var(--kcic-red)]" />}
              </div>

              {candidateMarkers.length > 0 && (
                <div className="h-40 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">
                  <FleetMap vehicles={candidateMarkers} className="h-full w-full" />
                </div>
              )}

              {candidates.length === 0 ? (
                <div className="flex flex-col items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] bg-[var(--canvas)] px-6 py-8 text-center">
                  {loadingCandidates ? (
                    <p className="text-[0.6875rem] text-slate-500">
                      Memindai pengemudi online di dekat titik penjemputan…
                    </p>
                  ) : (
                    <>
                      <span className="mb-2 grid size-9 place-items-center rounded-full border border-[var(--border)] bg-white text-slate-400">
                        <Route className="size-4" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <p className="text-xs font-semibold text-slate-900">Tidak ada kandidat</p>
                      <p className="mt-1 max-w-xs text-[0.6875rem] leading-relaxed text-slate-500">
                        Belum ada pengemudi online dengan sinyal GPS aktif di hub ini.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-0.5">
                  {candidates.map((c) => {
                    const driverName = c.driverName || c.name || 'Driver';
                    const plate = c.plateNumber || c.vehiclePlateNumber || '—';
                    const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
                    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                    const isAssigning = assigningDriverId === c.driverId;
                    const etaText = formatEta(c.etaSeconds, c.etaEstimated);

                    return (
                      <li
                        key={c.driverId}
                        className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3 transition-colors hover:border-[var(--border-strong)] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate text-xs font-semibold text-slate-900">
                              {driverName}
                            </span>
                            {c.phone && (
                              <span className="mono-plate text-[0.625rem] text-slate-400">
                                {c.phone}
                              </span>
                            )}
                            {etaText && (
                              <span className="pill pill-warning">
                                <Timer className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
                                <span>ETA {etaText}</span>
                              </span>
                            )}
                          </div>

                          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-slate-500">
                            <span className="mono-plate font-semibold text-slate-700">{plate}</span>
                            {(c.vehicleBrand || c.vehicleModel) && (
                              <span className="truncate">
                                {c.vehicleBrand} {c.vehicleModel}
                              </span>
                            )}
                            {c.seatingCapacity && (
                              <span className="tabular-nums">{c.seatingCapacity} kursi</span>
                            )}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="button-secondary px-3 py-2 text-[0.6875rem]"
                            >
                              <MessageSquare className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
                              <span>WhatsApp</span>
                            </a>
                          )}
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="icon-button size-9"
                              aria-label={`Telepon ${driverName}`}
                            >
                              <Phone className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
                            </a>
                          )}

                          <button
                            type="button"
                            disabled={Boolean(assigningDriverId)}
                            onClick={() => handleManualAssign(c.driverId)}
                            className="button-primary px-3.5 py-2 text-[0.6875rem]"
                          >
                            {isAssigning ? (
                              <Spinner size="sm" className="text-white" />
                            ) : (
                              <TriangleAlert className="size-3.5" strokeWidth={2} aria-hidden="true" />
                            )}
                            <span>{isAssigning ? 'Menugaskan…' : 'Tugaskan'}</span>
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
