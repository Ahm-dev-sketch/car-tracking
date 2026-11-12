'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);

  // Instant render (stale-while-revalidate): seed from last-known snapshot on mount
  // so the screen fills immediately; the background fetch below then revalidates.
  useEffect(() => {
    const cachedLocations = getSnapshot<LocationOption[]>('locations_list');
    if (cachedLocations && cachedLocations.length > 0) setLocations(cachedLocations);
    const cachedBookings = getSnapshot<Booking[]>('user_bookings');
    if (cachedBookings && cachedBookings.length > 0) setBookings(cachedBookings);
  }, []);
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
  }, []);

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
          <span className="font-semibold text-zinc-900">{b.bookingNumber}</span>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            <span
              className={`text-[9px] font-black uppercase px-1.5 py-0.2 rounded border ${
                b.serviceType === 'STANDBY'
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-rose-100 text-rose-900 border-rose-300'
              }`}
            >
              {b.serviceType === 'STANDBY' ? 'Standby' : 'Drop Off'}
            </span>
            {b.operationalLocation && (
              <span className="text-[10px] text-zinc-500 font-medium">
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
          <div className="font-medium text-zinc-800 truncate">{b.pickupLocation}</div>
          <div className="text-xs text-zinc-500 truncate">→ {b.destination}</div>
        </div>
      ),
    },
    {
      header: 'Departure',
      cell: (b) => (
        <div className="text-xs">
          <div>
            {new Date(b.departureAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div className="text-zinc-500">
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
            <div className="font-mono text-xs font-semibold">{b.vehicle.plateNumber}</div>
            <div className="text-[11px] text-zinc-500">{b.vehicle.brand}</div>
          </div>
        ) : (
          <span className="text-xs text-zinc-400 italic">Unassigned</span>
        ),
    },
    {
      header: 'Status',
      cell: (b) => (
        <div className="space-y-1">
          {b.status === 'OFFLINE_PENDING' ? (
            <span className="inline-flex max-w-full items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider uppercase border-2 border-black shadow-[2px_2px_0px_0px_#000] bg-amber-300 text-black">
              MENUNGGU SYNC (OFFLINE)
            </span>
          ) : (
            <StatusBadge status={b.status} />
          )}
          {b.etaSeconds !== undefined && b.etaSeconds !== null && (
            <div className="text-[10px] font-mono text-indigo-700">
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
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {canTrack && b.vehicle && (
              <Link
                href={`/user/tracking?vehicleId=${b.vehicle.id}`}
                className="px-2 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
              >
                Track
              </Link>
            )}
            {b.status === 'PENDING_COMPLETION' && (
              <button
                type="button"
                onClick={() => setUploadBooking(b)}
                className={`px-2.5 py-1 text-xs font-black rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer ${
                  b.rejectedReason
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-[#be123c] hover:bg-[#9f1239] text-white'
                }`}
              >
                {b.rejectedReason ? 'Revisi Nota' : b.notaDinasUrl ? 'Ganti Nota' : 'Upload Nota'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="px-2 py-1 text-xs font-medium border border-zinc-200 text-zinc-700 rounded hover:bg-zinc-50 cursor-pointer"
            >
              Details
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="px-2 py-1 text-xs font-medium text-rose-700 border border-rose-200 rounded hover:bg-rose-50 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">My Bookings</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Track your trip reservations and assignments</p>
        </div>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>+ New Reservation</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filters */}
      <div className="bg-white p-3 rounded-lg border border-zinc-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Location filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-500">Location:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-2.5 py-1 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
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
            <span className="text-xs font-semibold text-zinc-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="">All Statuses</option>
              <option value="SEARCHING_DRIVER">Searching Driver</option>
              <option value="DRIVER_NOTIFIED">Driver Notified</option>
              <option value="DRIVER_ASSIGNED">Driver Assigned</option>
              <option value="DRIVER_EN_ROUTE">Driver En Route</option>
              <option value="ARRIVED">Arrived</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="PENDING_COMPLETION">Menunggu Approval Nota</option>
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
            <div className="flex items-center justify-between w-full">
              {['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(
                selectedBooking.status
              ) &&
                selectedBooking.vehicle && (
                  <Link
                    href={`/user/tracking?vehicleId=${selectedBooking.vehicle.id}`}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold"
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
                  className={`px-3.5 py-2 text-white rounded text-xs font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1.5 ${
                    selectedBooking.rejectedReason
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-[#be123c] hover:bg-[#9f1239]'
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
                  className="px-3.5 py-2 text-rose-700 border border-rose-200 rounded hover:bg-rose-50 text-xs font-medium cursor-pointer"
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
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Jenis Layanan</span>
                <span
                  className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[11px] font-black border ${
                    selectedBooking.serviceType === 'STANDBY'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : 'bg-rose-100 text-rose-900 border-rose-300'
                  }`}
                >
                  {selectedBooking.serviceType === 'STANDBY'
                    ? 'Standby (Operasional Seharian)'
                    : 'Drop Off (Sekali Jalan)'}
                </span>
              </div>
              {selectedBooking.operationalLocation && (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 block">Hub Operasional</span>
                  <span className="font-bold text-zinc-800">
                    {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
                  </span>
                </div>
              )}
            </div>

            {/* Nota Dinas Section */}
            <div className="p-3 bg-amber-50/70 border-2 border-black rounded-xl space-y-2 shadow-[2px_2px_0px_0px_#000]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                  <Icon name="check" className="size-4 text-emerald-600" />
                  <span>Dokumen Nota Dinas</span>
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                    selectedBooking.rejectedReason
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : selectedBooking.notaDinasUrl
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-amber-100 text-amber-800 border-amber-300'
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
                <div className="p-2.5 bg-rose-50 border-2 border-rose-300 rounded-lg text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-rose-800">
                    <Icon name="close" className="size-3.5 text-rose-600" />
                    <span>Nota Dinas Ditolak Admin</span>
                  </div>
                  <p className="text-[11px] text-rose-700">
                    <span className="font-semibold">Alasan:</span> {selectedBooking.rejectedReason}
                  </p>
                  <p className="text-[10px] text-zinc-600">
                    Silakan unggah dokumen perbaikan melalui tombol Unggah Revisi di bawah.
                  </p>
                </div>
              )}

              {selectedBooking.notaDinasUrl ? (
                <div className="space-y-1.5 pt-1 text-xs">
                  <p className="text-[11px] text-zinc-600 truncate">
                    File: <span className="font-semibold text-zinc-900">{selectedBooking.notaDinasFilename || 'nota-dinas.pdf'}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={selectedBooking.notaDinasUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-white hover:bg-zinc-100 text-zinc-800 rounded text-xs font-bold border border-black shadow-[1.5px_1.5px_0px_0px_#000] inline-flex items-center gap-1"
                    >
                      <Icon name="download" className="size-3.5" />
                      <span>Lihat / Unduh Dokumen</span>
                    </a>
                    {selectedBooking.status === 'PENDING_COMPLETION' && (
                      <button
                        type="button"
                        onClick={() => setUploadBooking(selectedBooking)}
                        className="px-2.5 py-1 text-xs font-bold text-[#be123c] hover:underline cursor-pointer"
                      >
                        {selectedBooking.rejectedReason ? 'Unggah Dokumen Revisi' : 'Unggah Ulang'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs space-y-2 pt-1">
                  <p className="text-[11px] text-zinc-600">
                    {selectedBooking.status === 'PENDING_COMPLETION'
                      ? 'Trip telah selesai. Silakan unggah Nota Dinas untuk diverifikasi oleh admin KCIC.'
                      : 'Belum ada nota dinas yang dilampirkan pada pesanan ini.'}
                  </p>
                  {selectedBooking.status === 'PENDING_COMPLETION' && (
                    <button
                      type="button"
                      onClick={() => setUploadBooking(selectedBooking)}
                      className="px-3 py-1.5 bg-[#be123c] hover:bg-[#9f1239] text-white rounded text-xs font-bold border border-black shadow-[1.5px_1.5px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1"
                    >
                      <Icon name="download" className="size-3.5 rotate-180" />
                      <span>Unggah Nota Dinas Sekarang</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Route details */}
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-2 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Pickup</span>
                <span className="font-medium text-zinc-800">{selectedBooking.pickupLocation}</span>
              </div>
              <div className="pt-2 border-t border-zinc-200">
                <span className="text-[10px] uppercase font-bold text-zinc-400 block">Destination</span>
                <span className="font-medium text-zinc-800">{selectedBooking.destination}</span>
              </div>
            </div>

            {/* Trip Schedule & Purpose */}
            <div className="grid grid-cols-2 gap-3 text-xs pb-3 border-b border-zinc-100">
              <div>
                <span className="text-zinc-500 uppercase font-semibold text-[10px] block">Departure</span>
                <span className="font-medium text-zinc-800">
                  {new Date(selectedBooking.departureAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 uppercase font-semibold text-[10px] block">Expected Return</span>
                <span className="font-medium text-zinc-800">
                  {new Date(selectedBooking.expectedReturnAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 uppercase font-semibold text-[10px] block">Passengers</span>
                <span className="font-medium text-zinc-800">{selectedBooking.passengerCount} Persons</span>
              </div>
              <div>
                <span className="text-zinc-500 uppercase font-semibold text-[10px] block">Purpose</span>
                <span className="font-medium text-zinc-800">{selectedBooking.purpose}</span>
              </div>
            </div>

            {/* Vehicle info */}
            {selectedBooking.vehicle && (
              <div className="p-3 bg-white border border-zinc-200 rounded-lg text-xs space-y-1.5">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">Assigned Asset</span>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-zinc-900">
                      {selectedBooking.vehicle.plateNumber}
                    </span>
                    <span className="text-zinc-600 ml-2">
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
              <div className="p-3 bg-white border border-zinc-200 rounded-lg text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">Assigned Driver</span>
                <div className="font-semibold text-zinc-900">
                  {selectedBooking.driver.user.name}
                </div>
                <div className="text-[11px] text-zinc-600 flex items-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                    <span className="size-1.5 rounded-full bg-emerald-500 inline-block" />
                    Kontak Terproteksi In-App
                  </span>
                  <Link
                    href={`/user/tracking?vehicleId=${selectedBooking.vehicle?.id || ''}`}
                    className="text-[#be123c] hover:underline font-bold"
                  >
                    Buka Tracking & Chat
                  </Link>
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedBooking.notes && (
              <div className="text-xs text-zinc-600 pt-2 border-t border-zinc-100">
                <span className="font-semibold text-zinc-700 block">Notes:</span>
                <p className="mt-0.5">{selectedBooking.notes}</p>
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
              className="min-h-[44px] px-4 py-2 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
            >
              Keep Booking
            </button>
            <button
              type="button"
              onClick={handleCancelConfirm}
              disabled={isCancelling}
              className="min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {isCancelling && <Spinner size="sm" className="text-white" />}
              Cancel Reservation
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-zinc-600">
            Are you sure you want to cancel booking #{cancellingBooking?.bookingNumber}?
          </p>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-700 block mb-1">
              Reason for cancellation (optional)
            </label>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Schedule changed, trip postponed"
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
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
              <div className="p-3 bg-rose-50 border-2 border-rose-300 rounded-lg text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-rose-800">
                  <Icon name="close" className="size-3.5 text-rose-600" />
                  <span>Catatan Penolakan Nota Dinas Sebelumnya:</span>
                </div>
                <p className="text-[11px] text-rose-950 font-medium">"{uploadBooking.rejectedReason}"</p>
                <p className="text-[10px] text-zinc-600 italic">
                  Pastikan dokumen/foto revisi yang Anda unggah sudah jelas dan sesuai dengan catatan admin.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 border-2 border-black rounded-lg text-xs font-medium text-amber-950">
                Perjalanan telah selesai. Sesuai ketentuan operasional KCIC, silakan lampirkan Nota Dinas (format PDF, JPG, PNG, atau WebP, maks. 10MB) untuk diverifikasi oleh admin.
              </div>
            )}

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
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
                className="w-full text-xs file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-2 file:border-black file:text-xs file:font-black file:bg-zinc-100 hover:file:bg-zinc-200 file:cursor-pointer border-2 border-dashed border-zinc-300 p-2 rounded-lg"
              />
            </div>

            {uploadFile && (
              <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-xs flex items-center justify-between">
                <div className="truncate max-w-[280px]">
                  <span className="font-bold text-zinc-900 block truncate">{uploadFile.name}</span>
                  <span className="text-[11px] text-zinc-500">{(uploadFile.size / 1024 / 1024).toFixed(2)} MB</span>
                </div>
                <span className="text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  Siap Diunggah
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  setUploadBooking(null);
                  setUploadFile(null);
                  setUploadError(null);
                }}
                disabled={isUploading}
                className="px-3.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-700 hover:bg-zinc-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleUploadNotaDinas}
                disabled={!uploadFile || isUploading}
                className="px-4 py-1.5 text-xs font-black rounded-lg border-2 border-black bg-[#be123c] text-white shadow-[2px_2px_0px_0px_#000] hover:bg-[#9f1239] disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
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
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <p>Loading bookings...</p>
        </div>
      }
    >
      <UserBookingsContent />
    </Suspense>
  );
}
