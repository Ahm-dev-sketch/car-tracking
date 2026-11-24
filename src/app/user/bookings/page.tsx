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
import { Icon } from '@/components/ui/Icon';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';
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
      const useSnapshot = () => {
        const cached = getSnapshot<LocationOption[]>('locations_list');
        if (cached && cached.length > 0) setLocations(cached);
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        useSnapshot();
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
          useSnapshot();
        }
      } catch {
        useSnapshot();
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
      header: 'Booking #',
      accessorKey: 'bookingNumber',
      cell: (b) => (
        <div>
          <span className="text-sm font-semibold tabular-nums text-slate-900">{b.bookingNumber}</span>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                b.serviceType === 'STANDBY'
                  ? 'border-warning-200 bg-warning-50 text-warning-700'
                  : 'border-brand-200 bg-brand-50 text-brand-700'
              }`}
            >
              {b.serviceType === 'STANDBY' ? 'Standby' : 'Drop Off'}
            </span>
            {b.operationalLocation && (
              <span className="text-[10px] font-medium text-slate-500">
                {b.operationalLocation.code}
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Route',
      cell: (b) => (
        <div className="max-w-[220px]">
          <div className="truncate font-medium text-slate-900">{b.pickupLocation}</div>
          <div className="flex items-center gap-1 truncate text-xs text-slate-500">
            <Icon name="arrow" className="size-3 shrink-0 text-slate-400" />
            <span className="truncate">{b.destination}</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Departure',
      cell: (b) => (
        <div className="text-xs tabular-nums">
          <div className="font-medium text-slate-900">
            {new Date(b.departureAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="text-slate-500">
            {new Date(b.departureAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
        </div>
      ),
    },
    {
      header: 'Vehicle',
      cell: (b) =>
        b.vehicle ? (
          <div>
            <div className="font-mono text-xs font-semibold tabular-nums text-slate-900">{b.vehicle.plateNumber}</div>
            <div className="text-[11px] text-slate-500">{b.vehicle.brand}</div>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Unassigned</span>
        ),
    },
    {
      header: 'Status',
      cell: (b) => (
        <div className="space-y-1">
          {b.status === 'OFFLINE_PENDING' ? (
            <span className="inline-flex max-w-full items-center rounded border border-warning-200 bg-warning-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warning-700">
              MENUNGGU SYNC (OFFLINE)
            </span>
          ) : (
            <StatusBadge status={b.status} />
          )}
          {b.etaSeconds !== undefined && b.etaSeconds !== null && (
            <div className="text-[10px] tabular-nums text-slate-500">
              ETA: {formatEta(b.etaSeconds, b.etaEstimated)}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Actions',
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
          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {canTrack && b.vehicle && (
              <Link
                href={`/user/tracking?vehicleId=${b.vehicle.id}`}
                className="inline-flex min-h-11 items-center rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Track
              </Link>
            )}
            {b.status === 'PENDING_COMPLETION' && (
              <button
                type="button"
                onClick={() => setUploadBooking(b)}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                  b.rejectedReason
                    ? 'bg-danger-600 text-white hover:bg-danger-700'
                    : 'bg-brand-600 text-white hover:bg-brand-700'
                }`}
              >
                {b.rejectedReason ? 'Revisi Nota' : b.notaDinasUrl ? 'Ganti Nota' : 'Upload Nota'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Details
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="cursor-pointer rounded-lg border border-transparent px-2 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
              >
                Cancel
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const pendingCount = bookings.filter((b) =>
    ['PENDING', 'SEARCHING_DRIVER', 'DRIVER_NOTIFIED'].includes(b.status)
  ).length;
  const activeCount = bookings.filter((b) =>
    ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status)
  ).length;
  const needNotaCount = bookings.filter((b) => b.status === 'PENDING_COMPLETION').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Bookings</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Track your trip reservations and assignments</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:self-auto"
        >
          <Icon name="plus" className="size-4" />
          <span>New Reservation</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Pemesanan</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Mencari Driver</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-warning-600">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Perjalanan Aktif</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Perlu Nota Dinas</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{needNotaCount}</p>
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Location filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Location</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">All Statuses</option>
              <option value="SEARCHING_DRIVER">Searching Driver</option>
              <option value="DRIVER_NOTIFIED">Driver Notified</option>
              <option value="DRIVER_ASSIGNED">Driver Assigned</option>
              <option value="DRIVER_EN_ROUTE">Driver En Route</option>
              <option value="ARRIVED">Arrived</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="PENDING_COMPLETION">Menunggu Nota Dinas</option>
              <option value="COMPLETED">Completed</option>
              <option value="NO_DRIVER_AVAILABLE">No Driver Available</option>
              <option value="ADMIN_INTERVENTION">Admin Intervention</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        onRowClick={(b) => setSelectedBooking(b)}
        emptyMessage="No reservations found"
      />

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchBookings(p)}
      />

      {/* Booking Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={selectedBooking ? `Reservation #${selectedBooking.bookingNumber}` : 'Booking'}
        description={
          selectedBooking
            ? `Created ${new Date(selectedBooking.createdAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}`
            : ''
        }
        footer={
          selectedBooking && (
            <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
                  selectedBooking.status
                ) &&
                  selectedBooking.vehicle && (
                    <Link
                      href={`/user/tracking?vehicleId=${selectedBooking.vehicle.id}`}
                      className="inline-flex min-h-9 items-center rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      Track Vehicle Live
                    </Link>
                  )}
                {selectedBooking.status === 'PENDING_COMPLETION' && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = selectedBooking;
                      setUploadBooking(b);
                    }}
                    className={`inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold text-white transition-colors ${
                      selectedBooking.rejectedReason
                        ? 'bg-danger-600 hover:bg-danger-700'
                        : 'bg-brand-600 hover:bg-brand-700'
                    }`}
                  >
                    <Icon name="download" className="size-3.5 rotate-180" />
                    <span>
                      {selectedBooking.rejectedReason
                        ? 'Revisi Dokumen Nota Dinas'
                        : selectedBooking.notaDinasUrl
                        ? 'Ganti Nota Dinas'
                        : 'Upload Nota Dinas'}
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
                  className="min-h-9 cursor-pointer rounded-lg border border-transparent px-3.5 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
                >
                  Cancel Reservation
                </button>
              )}
            </div>
          )
        }
      >
        {selectedBooking && (
          <div className="space-y-4 text-sm">
            {/* Dispatch progress visual */}
            <DispatchProgress
              status={selectedBooking.status}
              etaSeconds={selectedBooking.etaSeconds}
              etaEstimated={selectedBooking.etaEstimated}
            />

            {/* Service Type & Operational Hub */}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Jenis Layanan</span>
                <span
                  className={`mt-1 inline-block rounded border px-2 py-0.5 text-[11px] font-semibold ${
                    selectedBooking.serviceType === 'STANDBY'
                      ? 'border-warning-200 bg-warning-50 text-warning-700'
                      : 'border-brand-200 bg-brand-50 text-brand-700'
                  }`}
                >
                  {selectedBooking.serviceType === 'STANDBY'
                    ? 'Standby (Operasional Seharian)'
                    : 'Drop Off (Sekali Jalan)'}
                </span>
              </div>
              {selectedBooking.operationalLocation && (
                <div className="text-right">
                  <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Hub Operasional</span>
                  <span className="font-semibold text-slate-900">
                    {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
                  </span>
                </div>
              )}
            </div>

            {/* Nota Dinas Section */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                  <Icon name="bookings" className="size-4 text-brand-600" />
                  <span>Dokumen Nota Dinas</span>
                </span>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                    selectedBooking.rejectedReason
                      ? 'border-danger-200 bg-danger-50 text-danger-700'
                      : selectedBooking.notaDinasUrl
                      ? 'border-success-200 bg-success-50 text-success-700'
                      : 'border-warning-200 bg-warning-50 text-warning-700'
                  }`}
                >
                  {selectedBooking.rejectedReason
                    ? 'Ditolak (Perlu Revisi)'
                    : selectedBooking.notaDinasUrl
                    ? 'Terlampir'
                    : 'Belum Dilampirkan'}
                </span>
              </div>

              {selectedBooking.rejectedReason && (
                <div className="space-y-1 rounded-lg border border-danger-200 bg-danger-50 p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-danger-700">
                    <Icon name="close" className="size-3.5 text-danger-600" />
                    <span>Nota Dinas Ditolak Admin</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-danger-700">
                    <span className="font-semibold">Alasan:</span> {selectedBooking.rejectedReason}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Silakan unggah dokumen perbaikan melalui tombol Unggah Revisi di bawah.
                  </p>
                </div>
              )}

              {selectedBooking.notaDinasUrl ? (
                <div className="space-y-1.5 pt-1 text-xs">
                  <p className="truncate text-[11px] text-slate-600">
                    File: <span className="font-semibold text-slate-900">{selectedBooking.notaDinasFilename || 'nota-dinas.pdf'}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={selectedBooking.notaDinasUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Icon name="download" className="size-3.5" />
                      <span>Lihat / Unduh Dokumen</span>
                    </a>
                    {selectedBooking.status === 'PENDING_COMPLETION' && (
                      <button
                        type="button"
                        onClick={() => setUploadBooking(selectedBooking)}
                        className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-600 underline-offset-2 transition-colors hover:text-brand-700 hover:underline"
                      >
                        {selectedBooking.rejectedReason ? 'Unggah Dokumen Revisi' : 'Unggah Ulang'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1 text-xs">
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    {selectedBooking.status === 'PENDING_COMPLETION'
                      ? 'Trip telah selesai. Silakan unggah Nota Dinas untuk diverifikasi oleh admin KCIC.'
                      : 'Belum ada nota dinas yang dilampirkan pada pesanan ini.'}
                  </p>
                  {selectedBooking.status === 'PENDING_COMPLETION' && (
                    <button
                      type="button"
                      onClick={() => setUploadBooking(selectedBooking)}
                      className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      <Icon name="download" className="size-3.5 rotate-180" />
                      <span>Unggah Nota Dinas Sekarang</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Route details */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Pickup</span>
                <span className="font-medium text-slate-900">{selectedBooking.pickupLocation}</span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Destination</span>
                <span className="font-medium text-slate-900">{selectedBooking.destination}</span>
              </div>
            </div>

            {/* Trip Schedule & Purpose */}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-200 pb-3 text-xs">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Departure</span>
                <span className="font-medium tabular-nums text-slate-900">
                  {new Date(selectedBooking.departureAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Expected Return</span>
                <span className="font-medium tabular-nums text-slate-900">
                  {new Date(selectedBooking.expectedReturnAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Passengers</span>
                <span className="font-medium tabular-nums text-slate-900">{selectedBooking.passengerCount} Persons</span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Purpose</span>
                <span className="font-medium text-slate-900">{selectedBooking.purpose}</span>
              </div>
            </div>

            {/* Vehicle info */}
            {selectedBooking.vehicle && (
              <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Assigned Asset</span>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-mono font-semibold tabular-nums text-slate-900">
                      {selectedBooking.vehicle.plateNumber}
                    </span>
                    <span className="ml-2 text-slate-600">
                      {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                    </span>
                  </div>
                  <StatusBadge status={selectedBooking.vehicle.status} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
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
              </div>
            )}

            {/* Driver info */}
            {selectedBooking.driver && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Assigned Driver</span>
                <div className="font-semibold text-slate-900">
                  {selectedBooking.driver.user.name}
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[11px] text-slate-600">
                  <span className="inline-flex items-center gap-1 font-medium text-success-700">
                    <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-success-600" />
                    Kontak Terproteksi In-App
                  </span>
                  <Link
                    href={`/user/tracking?vehicleId=${selectedBooking.vehicle?.id || ''}`}
                    className="font-semibold text-brand-600 underline-offset-2 hover:text-brand-700 hover:underline"
                  >
                    Buka Tracking & Chat
                  </Link>
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedBooking.notes && (
              <div className="border-t border-slate-200 pt-2 text-xs text-slate-600">
                <span className="block font-medium text-slate-700">Notes:</span>
                <p className="mt-0.5 leading-relaxed">{selectedBooking.notes}</p>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        title="Cancel Reservation"
        maxWidth="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCancellingBooking(null)}
              disabled={isCancelling}
              className="min-h-11 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Keep Booking
            </button>
            <button
              type="button"
              onClick={handleCancelConfirm}
              disabled={isCancelling}
              className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
            >
              {isCancelling && <Spinner size="sm" className="text-white" />}
              Cancel Reservation
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs leading-relaxed text-slate-600">
            Are you sure you want to cancel booking #{cancellingBooking?.bookingNumber}?
          </p>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              Reason for cancellation (optional)
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Schedule changed, trip postponed"
              className="min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-xs text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
        </div>
      </Modal>

      {/* Upload Nota Dinas Modal */}
      {uploadBooking && (
        <Modal
          isOpen={Boolean(uploadBooking)}
          onClose={() => {
            if (isUploading) return;
            setUploadBooking(null);
            setUploadFile(null);
            setUploadError(null);
          }}
          title="Lampirkan Dokumen Nota Dinas"
          description={`Booking #${uploadBooking.bookingNumber} (${uploadBooking.pickupLocation} → ${uploadBooking.destination})`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {uploadError && <ErrorBanner message={uploadError} onDismiss={() => setUploadError(null)} />}

            {uploadBooking.rejectedReason ? (
              <div className="space-y-1 rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-danger-700">
                  <Icon name="close" className="size-3.5 text-danger-600" />
                  <span>Catatan Penolakan Nota Dinas Sebelumnya:</span>
                </div>
                <p className="text-[11px] font-medium leading-relaxed text-danger-700">"{uploadBooking.rejectedReason}"</p>
                <p className="text-[10px] italic text-slate-500">
                  Pastikan dokumen/foto revisi yang Anda unggah sudah jelas dan sesuai dengan catatan admin.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs font-medium leading-relaxed text-warning-700">
                Perjalanan telah selesai. Sesuai ketentuan operasional KCIC, silakan lampirkan Nota Dinas (format PDF, JPG, PNG, atau WebP, maks. 10MB) untuk diverifikasi oleh admin.
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Pilih File Dokumen / Foto Nota Dinas
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  setUploadFile(f);
                  setUploadError(null);
                }}
                className="w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-white p-2 text-xs text-slate-700 transition-colors file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:px-4 file:py-2 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-100"
              />
            </div>

            {uploadFile && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="max-w-[280px] truncate">
                  <span className="block truncate font-medium text-slate-900">{uploadFile.name}</span>
                  <span className="text-[11px] tabular-nums text-slate-500">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <span className="rounded border border-success-200 bg-success-50 px-2 py-0.5 text-[10px] font-medium uppercase text-success-700">
                  Siap Diunggah
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setUploadBooking(null);
                  setUploadFile(null);
                  setUploadError(null);
                }}
                disabled={isUploading}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleUploadNotaDinas}
                disabled={!uploadFile || isUploading}
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
              >
                {isUploading ? <Spinner size="sm" /> : <Icon name="download" className="size-3.5 rotate-180" />}
                <span>{isUploading ? 'Mengunggah...' : 'Unggah Nota Dinas'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reworked Booking Modal */}
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
        <div className="py-20 text-center text-sm text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>Loading bookings...</p>
        </div>
      }
    >
      <UserBookingsContent />
    </Suspense>
  );
}
