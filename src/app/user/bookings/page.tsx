'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';
import {
  ChevronRight,
  CircleAlert,
  Download,
  Navigation,
  Plus,
  Upload,
} from 'lucide-react';
import { saveSnapshot, getSnapshot, getOfflineQueue, processOfflineQueue } from '@/lib/offline-sync';

interface Booking {
  id: string;
  bookingNumber: string;
  pickupLocation: string;
  destination: string;
  departureAt: string;
  expectedReturnAt: string;
  passengerCount: number;
  purpose: string;
  notes?: string | null;
  status: string;
  serviceType?: 'DROP_OFF' | 'STANDBY';
  notaDinasUrl?: string | null;
  notaDinasFilename?: string | null;
  rejectedReason?: string | null;
  createdAt: string;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  operationalLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    vehicleType: string;
    status: string;
    homeLocation?: { id: string; name: string; code: string } | null;
    currentLocation?: { id: string; name: string; code: string } | null;
    currentOperationalLocation?: { id: string; name: string; code: string } | null;
  } | null;
  driver?: {
    id: string;
    licenseNumber: string;
    user: {
      id: string;
      name: string;
      phone: string;
    };
  } | null;
}

function UserBookingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Instant render (stale-while-revalidate): seed from last-known snapshot on mount
  // so the screen fills immediately; the background fetch below then revalidates.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const cachedLocations = getSnapshot<LocationOption[]>('locations_list');
    if (cachedLocations && cachedLocations.length > 0) setLocations(cachedLocations);
    const cachedBookings = getSnapshot<Booking[]>('user_bookings');
    if (cachedBookings && cachedBookings.length > 0) setBookings(cachedBookings);
  }, [status]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Filters
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Detail Drawer
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  // Cancel Confirmation
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Create Booking Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Upload Nota Dinas Modal
  const [uploadBooking, setUploadBooking] = useState<Booking | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Fetch locations
  useEffect(() => {
    if (status !== 'authenticated') return;
    async function loadLocations() {
      const applySnapshot = () => {
        const cached = getSnapshot<LocationOption[]>('locations_list');
        if (cached && cached.length > 0) setLocations(cached);
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        applySnapshot();
        return;
      }

      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          const list: LocationOption[] = json.data || [];
          setLocations(list);
          saveSnapshot('locations_list', list);
        } else {
          applySnapshot();
        }
      } catch {
        applySnapshot();
      }
    }
    loadLocations();
  }, [status]);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/user/bookings?${params.toString()}`);
  };

  const mergePendingOffline = (list: Booking[]): Booking[] => {
    let pending: Booking[] = [];
    try {
      pending = getOfflineQueue()
        .filter((item) => item.type === 'USER_CREATE_BOOKING')
        .map((item) => {
          const p = (item.payload ?? {}) as any;
          const createdAt = item.createdAt
            ? new Date(item.createdAt).toISOString()
            : new Date().toISOString();
          return {
            id: item.id,
            bookingNumber: `OFFLINE-${String(item.id).slice(0, 8).toUpperCase()}`,
            pickupLocation: p.pickupLocation ?? '',
            destination: p.destination ?? '',
            departureAt: p.departureAt ?? createdAt,
            expectedReturnAt: p.expectedReturnAt ?? createdAt,
            passengerCount: Number(p.passengerCount) || 1,
            purpose: p.purpose ?? '',
            notes: p.notes ?? null,
            status: 'OFFLINE_PENDING',
            serviceType: p.serviceType,
            createdAt,
          } as Booking;
        });
    } catch {
      pending = [];
    }
    return [...pending, ...list];
  };

  const fetchBookings = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);

    const applySnapshot = () => {
      const cached = getSnapshot<Booking[]>('user_bookings');
      const list: Booking[] = cached && cached.length > 0 ? cached : [];
      setBookings(mergePendingOffline(list));
      setTotalRecords(list.length);
      setTotalPages(1);
      setPage(targetPage);
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      applySnapshot();
      setIsLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);

      const res = await fetch(`/api/bookings?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list: Booking[] = json.data || [];
        saveSnapshot('user_bookings', list);
        setBookings(mergePendingOffline(list));
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load bookings');
      }
    } catch {
      applySnapshot();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(1);
    syncUrlParams({
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [statusFilter, locationFilter]);

  // Re-sync when offline actions are flushed or the device comes back online
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSync = () => {
      processOfflineQueue()
        .then(() => fetchBookings(1))
        .catch(() => {
          // non-fatal: retry on next online/sync event
        });
    };

    window.addEventListener('offline-sync:complete', handleSync);
    window.addEventListener('online', handleSync);
    return () => {
      window.removeEventListener('offline-sync:complete', handleSync);
      window.removeEventListener('online', handleSync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelConfirm = async () => {
    if (!cancellingBooking) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${cancellingBooking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason || undefined }),
      });

      if (res.ok) {
        // Optimistically remove the cancelled booking from list + snapshot so it
        // never lingers, then refetch to reconcile with server truth.
        setBookings((prev) => prev.filter((b) => b.id !== cancellingBooking.id));
        const cached = getSnapshot<Booking[]>('user_bookings');
        if (cached && cached.length > 0) {
          saveSnapshot(
            'user_bookings',
            cached.filter((b) => b.id !== cancellingBooking.id),
          );
        }
        setCancellingBooking(null);
        setCancelReason('');
        fetchBookings(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to cancel booking');
      }
    } catch {
      setApiError('Network error cancelling booking');
    } finally {
      setIsCancelling(false);
    }
  };

  const handleUploadNotaDinas = async () => {
    if (!uploadBooking || !uploadFile) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const res = await fetch(`/api/bookings/${uploadBooking.id}/nota-dinas`, {
        method: 'POST',
        body: formData,
      });

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        // Non-JSON response (e.g. gateway timeout or proxy HTML)
      }

      if (!res.ok || json?.success === false) {
        const errorMsg =
          json?.message ||
          json?.error?.message ||
          (res.status === 413
            ? 'Ukuran berkas melebihi batas maksimal 10MB'
            : res.status === 404
            ? 'Data pesanan booking tidak ditemukan'
            : res.status === 403
            ? 'Akses ditolak: Anda tidak memiliki wewenang mengunggah nota dinas pada pesanan ini'
            : res.status >= 500
            ? `Terjadi kesalahan server (${res.status}): Gagal memproses penyimpanan nota dinas`
            : `Gagal mengunggah nota dinas (${res.status}: ${res.statusText || 'Error'})`);
        setUploadError(errorMsg);
        return;
      }

      const updated = json?.data;
      if (updated) {
        setBookings((prev) =>
          prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
        );
        if (selectedBooking && selectedBooking.id === updated.id) {
          setSelectedBooking((prev) => (prev ? { ...prev, ...updated } : null));
        }
      } else {
        fetchBookings(page);
      }
      setUploadBooking(null);
      setUploadFile(null);
    } catch (err: any) {
      console.error('[Upload Nota Dinas UI Error]:', err);
      setUploadError(err?.message || 'Terjadi kesalahan jaringan saat mengunggah nota dinas');
    } finally {
      setIsUploading(false);
    }
  };

  const columns: Column<Booking>[] = [
    {
      header: 'Reservasi',
      accessorKey: 'bookingNumber',
      cell: (b) => (
        <div className="min-w-0">
          <span className="mono-plate text-[0.8125rem] font-semibold text-slate-900">
            {b.bookingNumber}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span className={`pill ${b.serviceType === 'STANDBY' ? 'pill-warning' : ''}`}>
              <span className="pill-dot" aria-hidden="true" />
              <span>{b.serviceType === 'STANDBY' ? 'Standby' : 'Drop off'}</span>
            </span>
            {b.operationalLocation && (
              <span className="text-[0.625rem] font-medium uppercase tracking-[0.06em] text-slate-400">
                {b.operationalLocation.code}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Rute',
      cell: (b) => (
        <div className="min-w-0 max-w-[14rem]">
          <div className="truncate text-[0.8125rem] font-medium text-slate-800">
            {b.pickupLocation}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-slate-500">
            <span aria-hidden="true" className="text-slate-300">
              &rarr;
            </span>
            <span className="truncate">{b.destination}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Berangkat',
      cell: (b) => (
        <div className="whitespace-nowrap text-xs">
          <div className="tabular-nums font-medium text-slate-800">
            {new Date(b.departureAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="tabular-nums text-slate-500">
            {new Date(b.departureAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      ),
    },
    {
      header: 'Armada',
      cell: (b) =>
        b.vehicle ? (
          <div className="min-w-0">
            <div className="mono-plate text-[0.6875rem] font-semibold text-slate-900">
              {b.vehicle.plateNumber}
            </div>
            <div className="max-w-[9rem] truncate text-[0.6875rem] text-slate-500">
              {b.vehicle.brand}
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Belum ditugaskan</span>
        ),
    },
    {
      header: 'Status',
      cell: (b) => (
        <div className="space-y-1">
          {b.status === 'OFFLINE_PENDING' ? (
            <span className="pill pill-warning">
              <span className="pill-dot" aria-hidden="true" />
              <span>Menunggu sinkron</span>
            </span>
          ) : (
            <StatusBadge status={b.status} />
          )}
          {b.etaSeconds !== undefined && b.etaSeconds !== null && (
            <div className="tabular-nums text-[0.6875rem] font-medium text-[var(--status-standby-fg)]">
              ETA {formatEta(b.etaSeconds, b.etaEstimated)}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Aksi',
      cell: (b) => {
        const canCancel = [
          'PENDING',
          'SEARCHING_DRIVER',
          'DRIVER_NOTIFIED',
          'DRIVER_ASSIGNED',
        ].includes(b.status);

        const canTrack =
          Boolean(b.vehicle) &&
          ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status);

        return (
          <div
            className="flex flex-wrap items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {canTrack && b.vehicle && (
              <Link
                href={`/user/tracking?vehicleId=${b.vehicle.id}`}
                className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--status-active-fg)] transition-opacity hover:opacity-80"
              >
                <span className="live-ping relative flex size-1.5" aria-hidden="true">
                  <span className="absolute inset-0 rounded-full bg-current" />
                  <span className="relative size-1.5 rounded-full bg-current" />
                </span>
                Lacak
              </Link>
            )}
            {b.status === 'PENDING_COMPLETION' && (
              <button
                type="button"
                onClick={() => setUploadBooking(b)}
                className={`inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-full)] px-2.5 py-1 text-[0.6875rem] font-semibold text-white transition-opacity hover:opacity-90 ${
                  b.rejectedReason
                    ? 'bg-[var(--kcic-red)]'
                    : 'bg-[var(--slate-navy)]'
                }`}
              >
                <Upload className="size-3" strokeWidth={2.4} aria-hidden="true" />
                <span>
                  {b.rejectedReason ? 'Revisi nota' : b.notaDinasUrl ? 'Ganti nota' : 'Unggah nota'}
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
            >
              Rincian
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="cursor-pointer rounded-[var(--radius-full)] px-2 py-1 text-[0.6875rem] font-medium text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-bg)]"
              >
                Batalkan
              </button>
            )}
          </div>
        );
      },
    },
  ];
  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">Riwayat &amp; status</span>
          <h1 className="page-heading mt-2">Pemesanan saya</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Pantau reservasi kendaraan dinas dan status penugasan pengemudi.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="button-primary self-start sm:self-auto"
        >
          <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
          <span>Pengajuan baru</span>
        </button>
      </header>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="booking-hub" className="metric-label shrink-0">
              Hub
            </label>
            <select
              id="booking-hub"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-auto min-w-0 max-w-[12rem] rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua lokasi</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="booking-status" className="metric-label shrink-0">
              Status
            </label>
            <select
              id="booking-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto min-w-0 max-w-[12rem] rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua status</option>
              <option value="SEARCHING_DRIVER">Mencari driver</option>
              <option value="DRIVER_NOTIFIED">Driver dihubungi</option>
              <option value="DRIVER_ASSIGNED">Driver ditugaskan</option>
              <option value="DRIVER_EN_ROUTE">Menuju penjemputan</option>
              <option value="ARRIVED">Driver tiba</option>
              <option value="IN_PROGRESS">Sedang berjalan</option>
              <option value="PENDING_COMPLETION">Menunggu approval nota</option>
              <option value="COMPLETED">Selesai</option>
              <option value="NO_DRIVER_AVAILABLE">Driver tidak tersedia</option>
              <option value="ADMIN_INTERVENTION">Eskalasi admin</option>
              <option value="CANCELLED">Dibatalkan</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        onRowClick={(b) => setSelectedBooking(b)}
        emptyMessage="Belum ada reservasi pada filter ini"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchBookings(p)}
      />

      {/* Detail drawer */}
      <Drawer
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        width="lg"
        title={selectedBooking ? `Reservasi ${selectedBooking.bookingNumber}` : 'Reservasi'}
        description={
          selectedBooking
            ? `Diajukan ${new Date(selectedBooking.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}`
            : ''
        }
        footer={
          selectedBooking && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
                  selectedBooking.status
                ) &&
                  selectedBooking.vehicle && (
                    <Link
                      href={`/user/tracking?vehicleId=${selectedBooking.vehicle.id}`}
                      className="button-primary"
                    >
                      <Navigation className="size-4" strokeWidth={2} aria-hidden="true" />
                      <span>Lacak kendaraan</span>
                    </Link>
                  )}
                {selectedBooking.status === 'PENDING_COMPLETION' && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = selectedBooking;
                      setUploadBooking(b);
                    }}
                    className="button-primary"
                  >
                    <Upload className="size-4" strokeWidth={2.2} aria-hidden="true" />
                    <span>
                      {selectedBooking.rejectedReason
                        ? 'Revisi nota dinas'
                        : selectedBooking.notaDinasUrl
                          ? 'Ganti nota dinas'
                          : 'Unggah nota dinas'}
                    </span>
                  </button>
                )}
              </div>

              {[
                'PENDING',
                'SEARCHING_DRIVER',
                'DRIVER_NOTIFIED',
                'DRIVER_ASSIGNED',
              ].includes(selectedBooking.status) && (
                <button
                  type="button"
                  onClick={() => {
                    const b = selectedBooking;
                    setSelectedBooking(null);
                    setCancellingBooking(b);
                  }}
                  className="button-ghost text-[var(--status-error-fg)]"
                >
                  Batalkan reservasi
                </button>
              )}
            </div>
          )
        }
      >
        {selectedBooking && (
          <div className="space-y-3">
            <DispatchProgress
              status={selectedBooking.status}
              etaSeconds={selectedBooking.etaSeconds}
              etaEstimated={selectedBooking.etaEstimated}
            />

            <section className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">Rute perjalanan</span>
                <span
                  className={`pill ${selectedBooking.serviceType === 'STANDBY' ? 'pill-warning' : ''}`}
                >
                  <span className="pill-dot" aria-hidden="true" />
                  <span>
                    {selectedBooking.serviceType === 'STANDBY'
                      ? 'Standby operasional'
                      : 'Drop off sekali jalan'}
                  </span>
                </span>
              </div>

              <div className="route-stepper mt-3.5">
                <div className="route-point" data-kind="pickup">
                  <span className="route-label">Penjemputan</span>
                  <p className="route-value">{selectedBooking.pickupLocation}</p>
                </div>
                <div className="route-point" data-kind="destination">
                  <span className="route-label">Tujuan</span>
                  <p className="route-value">{selectedBooking.destination}</p>
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[var(--border-subtle)] pt-3.5 text-xs">
                <div>
                  <dt className="metric-label">Berangkat</dt>
                  <dd className="tabular-nums mt-0.5 font-medium text-slate-800">
                    {new Date(selectedBooking.departureAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">Kembali</dt>
                  <dd className="tabular-nums mt-0.5 font-medium text-slate-800">
                    {new Date(selectedBooking.expectedReturnAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="metric-label">Penumpang</dt>
                  <dd className="tabular-nums mt-0.5 font-medium text-slate-800">
                    {selectedBooking.passengerCount} orang
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="metric-label">Keperluan</dt>
                  <dd className="mt-0.5 font-medium text-slate-800 wrap-anywhere">
                    {selectedBooking.purpose}
                  </dd>
                </div>
                {selectedBooking.operationalLocation && (
                  <div className="col-span-2">
                    <dt className="metric-label">Hub operasional</dt>
                    <dd className="mt-1">
                      <LocationBadge
                        type="home"
                        name={selectedBooking.operationalLocation.name}
                        code={selectedBooking.operationalLocation.code}
                      />
                    </dd>
                  </div>
                )}
              </dl>

              {selectedBooking.notes && (
                <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-xs leading-relaxed text-slate-600 wrap-anywhere">
                  <span className="font-medium text-slate-800">Catatan </span>
                  {selectedBooking.notes}
                </p>
              )}
            </section>

            {(selectedBooking.vehicle || selectedBooking.driver) && (
              <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <span className="metric-label">Armada</span>
                  {selectedBooking.vehicle ? (
                    <>
                      <div className="mt-1 flex items-center gap-2">
                        <p className="mono-plate text-sm font-semibold text-slate-900">
                          {selectedBooking.vehicle.plateNumber}
                        </p>
                        <StatusBadge status={selectedBooking.vehicle.status} />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        {selectedBooking.vehicle.homeLocation && (
                          <LocationBadge
                            type="home"
                            name={selectedBooking.vehicle.homeLocation.name}
                            code={selectedBooking.vehicle.homeLocation.code}
                          />
                        )}
                        {(selectedBooking.vehicle.currentLocation ||
                          selectedBooking.vehicle.currentOperationalLocation) && (
                          <LocationBadge
                            type="current"
                            name={
                              (
                                selectedBooking.vehicle.currentLocation ||
                                selectedBooking.vehicle.currentOperationalLocation
                              )?.name
                            }
                            code={
                              (
                                selectedBooking.vehicle.currentLocation ||
                                selectedBooking.vehicle.currentOperationalLocation
                              )?.code
                            }
                          />
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Belum ada armada</p>
                  )}
                </div>

                <div className="min-w-0 sm:border-l sm:border-[var(--border-subtle)] sm:pl-3">
                  <span className="metric-label">Driver</span>
                  {selectedBooking.driver ? (
                    <>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {selectedBooking.driver.user.name}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-[var(--status-active-fg)]">
                        <span className="pill-dot" aria-hidden="true" />
                        <span>Kontak terproteksi in-app</span>
                      </p>
                      <Link
                        href={`/user/tracking?vehicleId=${selectedBooking.vehicle?.id || ''}`}
                        className="mt-1.5 inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-[var(--kcic-red)] hover:underline"
                      >
                        Buka tracking &amp; chat
                        <ChevronRight className="size-3" strokeWidth={2.4} aria-hidden="true" />
                      </Link>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Belum ada driver</p>
                  )}
                </div>
              </section>
            )}

            {/* Nota dinas */}
            <section className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">Dokumen nota dinas</span>
                <span
                  className={`pill ${
                    selectedBooking.rejectedReason
                      ? 'pill-error'
                      : selectedBooking.notaDinasUrl
                        ? 'pill-active'
                        : 'pill-warning'
                  }`}
                >
                  <span className="pill-dot" aria-hidden="true" />
                  <span>
                    {selectedBooking.rejectedReason
                      ? 'Ditolak \u00b7 perlu revisi'
                      : selectedBooking.notaDinasUrl
                        ? 'Terlampir'
                        : 'Belum dilampirkan'}
                  </span>
                </span>
              </div>

              {selectedBooking.rejectedReason && (
                <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2.5 text-xs">
                  <p className="flex items-center gap-1.5 font-semibold text-[var(--status-error-fg)]">
                    <CircleAlert className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                    <span>Nota dinas ditolak admin</span>
                  </p>
                  <p className="mt-1 leading-relaxed text-[var(--status-error-fg)]/85 wrap-anywhere">
                    {selectedBooking.rejectedReason}
                  </p>
                  <p className="mt-1 text-[0.6875rem] text-slate-500">
                    Silakan unggah dokumen perbaikan melalui tombol revisi.
                  </p>
                </div>
              )}

              {selectedBooking.notaDinasUrl ? (
                <div className="mt-3 space-y-2">
                  <p className="truncate text-xs text-slate-500">
                    <span className="font-medium text-slate-800">
                      {selectedBooking.notaDinasFilename || 'nota-dinas.pdf'}
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={selectedBooking.notaDinasUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button-secondary"
                    >
                      <Download className="size-3.5" strokeWidth={2} aria-hidden="true" />
                      <span>Lihat dokumen</span>
                    </a>
                    {selectedBooking.status === 'PENDING_COMPLETION' && (
                      <button
                        type="button"
                        onClick={() => setUploadBooking(selectedBooking)}
                        className="button-ghost text-[var(--kcic-red)]"
                      >
                        {selectedBooking.rejectedReason ? 'Unggah revisi' : 'Unggah ulang'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 space-y-2.5">
                  <p className="text-xs leading-relaxed text-slate-500">
                    {selectedBooking.status === 'PENDING_COMPLETION'
                      ? 'Trip telah selesai. Silakan unggah nota dinas untuk diverifikasi oleh admin KCIC.'
                      : 'Belum ada nota dinas yang dilampirkan pada pesanan ini.'}
                  </p>
                  {selectedBooking.status === 'PENDING_COMPLETION' && (
                    <button
                      type="button"
                      onClick={() => setUploadBooking(selectedBooking)}
                      className="button-primary"
                    >
                      <Upload className="size-4" strokeWidth={2.2} aria-hidden="true" />
                      <span>Unggah nota dinas</span>
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* Cancel */}
      <Modal
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        title="Batalkan reservasi"
        description={`Reservasi ${cancellingBooking?.bookingNumber}`}
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCancellingBooking(null)}
              disabled={isCancelling}
              className="button-secondary"
            >
              Simpan reservasi
            </button>
            <button
              type="button"
              onClick={handleCancelConfirm}
              disabled={isCancelling}
              className="button-danger"
            >
              {isCancelling && <Spinner size="xs" />}
              <span>Batalkan reservasi</span>
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-600">
            Reservasi ini akan dibatalkan dan driver tidak akan ditugaskan.
          </p>
          <div>
            <label
              htmlFor="cancel-reason"
              className="mb-1.5 block text-xs font-medium text-slate-700"
            >
              Alasan pembatalan <span className="text-slate-400">(opsional)</span>
            </label>
            <input
              id="cancel-reason"
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Contoh: Jadwal berubah, perjalanan ditunda"
            />
          </div>
        </div>
      </Modal>

      {/* Upload nota dinas */}
      {uploadBooking && (
        <Modal
          isOpen={Boolean(uploadBooking)}
          onClose={() => {
            if (isUploading) return;
            setUploadBooking(null);
            setUploadFile(null);
            setUploadError(null);
          }}
          title="Lampirkan nota dinas"
          description={`Reservasi ${uploadBooking.bookingNumber} \u00b7 ${uploadBooking.pickupLocation} \u2192 ${uploadBooking.destination}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {uploadError && (
              <ErrorBanner message={uploadError} onDismiss={() => setUploadError(null)} />
            )}

            {uploadBooking.rejectedReason ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2.5 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-[var(--status-error-fg)]">
                  <CircleAlert className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
                  <span>Catatan penolakan sebelumnya</span>
                </p>
                <p className="mt-1 leading-relaxed text-[var(--status-error-fg)]/85 wrap-anywhere">
                  {uploadBooking.rejectedReason}
                </p>
                <p className="mt-1 text-[0.6875rem] text-slate-500">
                  Pastikan dokumen revisi sudah jelas dan sesuai catatan admin.
                </p>
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5 text-xs leading-relaxed text-slate-600">
                Perjalanan telah selesai. Sesuai ketentuan operasional KCIC, lampirkan nota dinas
                (PDF, JPG, PNG, atau WebP, maks. 10 MB) untuk diverifikasi admin.
              </div>
            )}

            <div>
              <label htmlFor="nota-file" className="mb-1.5 block text-xs font-medium text-slate-700">
                File dokumen atau foto nota dinas
              </label>
              <input
                id="nota-file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadFile(f);
                  setUploadError(null);
                }}
                className="w-full rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] p-2.5 text-xs file:mr-3 file:cursor-pointer file:rounded-[var(--radius-full)] file:border-0 file:bg-[var(--slate-navy)] file:px-3.5 file:py-1.5 file:text-[0.6875rem] file:font-semibold file:text-white"
              />
            </div>

            {uploadFile && (
              <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] px-3 py-2.5 text-xs">
                <div className="min-w-0">
                  <span className="block truncate font-medium text-slate-900">
                    {uploadFile.name}
                  </span>
                  <span className="tabular-nums text-[0.6875rem] text-slate-400">
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB
                  </span>
                </div>
                <span className="pill pill-active shrink-0">
                  <span className="pill-dot" aria-hidden="true" />
                  <span>Siap diunggah</span>
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => {
                  setUploadBooking(null);
                  setUploadFile(null);
                  setUploadError(null);
                }}
                disabled={isUploading}
                className="button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleUploadNotaDinas}
                disabled={!uploadFile || isUploading}
                className="button-primary"
              >
                {isUploading ? (
                  <Spinner size="xs" />
                ) : (
                  <Upload className="size-4" strokeWidth={2.2} aria-hidden="true" />
                )}
                <span>{isUploading ? 'Mengunggah\u2026' : 'Unggah nota dinas'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      <BookingModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          fetchBookings(1);
        }}
        initialLocationId={locationFilter || undefined}
      />
    </div>
  );
}

export default function UserBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat reservasi&hellip;</p>
        </div>
      }
    >
      <UserBookingsContent />
    </Suspense>
  );
}
