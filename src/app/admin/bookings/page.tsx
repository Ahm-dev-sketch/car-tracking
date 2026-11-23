'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';
import { ExportReportModal } from '@/components/admin/ExportReportModal';
import {
  Check,
  CheckCircle2,
  Download,
  MapPin,
  Signal,
  TriangleAlert,
  X,
} from 'lucide-react';
import {
  saveSnapshot,
  getSnapshot,
  enqueueOfflineAction,
  processOfflineQueue,
} from '@/lib/offline-sync';

interface AdminBooking {
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
  user: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    status: string;
    homeLocation?: { id: string; name: string; code: string } | null;
    currentLocation?: { id: string; name: string; code: string } | null;
    currentOperationalLocation?: { id: string; name: string; code: string } | null;
  } | null;
  driver?: {
    id: string;
    licenseNumber: string;
    user: {
      name: string;
      phone: string;
    };
  } | null;
}

interface CandidateDriver {
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
}

interface LocationOption {
  id: string;
  name: string;
  code: string;
}

function AdminBookingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status } = useSession();

  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Filters synced with URL
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Detail Drawer
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);

  // Intervention / Candidates Modal
  const [interventionBooking, setInterventionBooking] = useState<AdminBooking | null>(null);
  const [candidates, setCandidates] = useState<CandidateDriver[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [assigningCandidateId, setAssigningCandidateId] = useState<string | null>(null);
  const [interventionError, setInterventionError] = useState<string | null>(null);

  // Cancel Confirm
  const [cancellingBooking, setCancellingBooking] = useState<AdminBooking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Approval state
  const [approvingBookingId, setApprovingBookingId] = useState<string | null>(null);

  // Reject Nota Dinas state for Admin
  const [rejectingBooking, setRejectingBooking] = useState<AdminBooking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Fleet Drivers & Available Vehicles for Assignment
  const [fleetDrivers, setFleetDrivers] = useState<any[]>([]);
  const [availableVehicles, setAvailableVehicles] = useState<any[]>([]);

  // Instant render (stale-while-revalidate): seed from last-known snapshots on mount
  // so the table fills immediately; background fetches below revalidate.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const cachedBookings = getSnapshot<AdminBooking[]>('admin_bookings');
    if (cachedBookings && cachedBookings.length > 0) setBookings(cachedBookings);
    const cachedLocations = getSnapshot<LocationOption[]>('locations_list');
    if (cachedLocations && cachedLocations.length > 0) setLocations(cachedLocations);
    const cachedDrivers = getSnapshot<any[]>('driver_list');
    if (cachedDrivers && cachedDrivers.length > 0) setFleetDrivers(cachedDrivers);
    const cachedVehicles = getSnapshot<any[]>('vehicle_list');
    if (cachedVehicles && cachedVehicles.length > 0) setAvailableVehicles(cachedVehicles);
  }, [status]);
  const [vehicleLocationFilter, setVehicleLocationFilter] = useState('');
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [selectedVehicleMap, setSelectedVehicleMap] = useState<Record<string, string>>({});

  // Reject Pending Booking state
  const [rejectingPendingBooking, setRejectingPendingBooking] = useState<AdminBooking | null>(null);
  const [rejectPendingReason, setRejectPendingReason] = useState('');
  const [isRejectingPending, setIsRejectingPending] = useState(false);
  const [rejectPendingError, setRejectPendingError] = useState<string | null>(null);

  // Export Report Excel Modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Fetch locations
  useEffect(() => {
    async function loadLocations() {
      try {
        const res = await fetch('/api/locations');
        if (res.ok) {
          const json = await res.json();
          const raw: LocationOption[] = json.data || [];
          const uniqueLocations = Array.from(
            new Map(raw.map((loc) => [loc.code || loc.name, loc])).values()
          );
          setLocations(uniqueLocations);
          await saveSnapshot('locations_list', uniqueLocations);
          return;
        }
      } catch {
        // network failure / offline → fall back to snapshot below
      }
      const cached = await getSnapshot<LocationOption[]>('locations_list');
      if (cached?.length) {
        setLocations(cached);
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
    router.replace(`/admin/bookings?${params.toString()}`);
  };

  const fetchBookings = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
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
        const list: AdminBooking[] = json.data || [];
        setBookings(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
        await saveSnapshot('admin_bookings', list);
        window.dispatchEvent(new Event('bookings:changed'));
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load bookings');
      }
    } catch {
      const cached = await getSnapshot<AdminBooking[]>('admin_bookings');
      if (cached?.length) {
        setBookings(cached);
        setTotalRecords(cached.length);
        setTotalPages(1);
        setPage(1);
        setApiError('Menampilkan data terakhir (offline)');
      } else {
        setApiError('Network error loading bookings');
      }
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

  // Re-sync offline queue when connection returns or another tab signals completion
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncAndRefetch = () => {
      processOfflineQueue().then(() => fetchBookings(page));
    };
    window.addEventListener('offline-sync:complete', syncAndRefetch);
    window.addEventListener('online', syncAndRefetch);
    return () => {
      window.removeEventListener('offline-sync:complete', syncAndRefetch);
      window.removeEventListener('online', syncAndRefetch);
    };
  }, [page]);

  const fetchAvailableVehicles = async (locId?: string) => {
    setIsLoadingVehicles(true);
    try {
      const url = `/api/vehicles?status=AVAILABLE&limit=50${locId ? `&locationId=${encodeURIComponent(locId)}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        const data = json.data || [];
        setAvailableVehicles(data);
        await saveSnapshot('vehicle_list', data);
      }
    } catch {
      const cached = await getSnapshot<any[]>('vehicle_list');
      if (cached?.length) {
        setAvailableVehicles(cached);
      }
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  // Open manual assign / candidates modal
  const handleOpenIntervention = async (b: AdminBooking) => {
    setInterventionBooking(b);
    setCandidates([]);
    setFleetDrivers([]);
    setAvailableVehicles([]);
    setSelectedVehicleMap({});
    setInterventionError(null);
    setLoadingCandidates(true);

    const initialLocation = b.operationalLocation?.id || locationFilter || '';
    setVehicleLocationFilter(initialLocation);

    let candidatesLoaded = false;
    let driversLoaded = false;
    let vehiclesLoaded = false;

    try {
      const vehicleUrl = `/api/vehicles?status=AVAILABLE&limit=50${initialLocation ? `&locationId=${encodeURIComponent(initialLocation)}` : ''}`;
      const [candRes, driverRes, vehicleRes] = await Promise.allSettled([
        fetch(`/api/admin/dispatch/${b.id}/candidates`),
        fetch(`/api/drivers?status=AVAILABLE&limit=50`),
        fetch(vehicleUrl),
      ]);

      if (candRes.status === 'fulfilled' && candRes.value.ok) {
        const json = await candRes.value.json();
        const data = json.data || [];
        setCandidates(data);
        await saveSnapshot('admin_candidates', data);
        candidatesLoaded = true;
      }

      if (driverRes.status === 'fulfilled' && driverRes.value.ok) {
        const json = await driverRes.value.json();
        const data = json.data || [];
        setFleetDrivers(data);
        await saveSnapshot('driver_list', data);
        driversLoaded = true;
      }

      if (vehicleRes.status === 'fulfilled' && vehicleRes.value.ok) {
        const json = await vehicleRes.value.json();
        const data = json.data || [];
        setAvailableVehicles(data);
        await saveSnapshot('vehicle_list', data);
        vehiclesLoaded = true;
      }
    } catch {
      // network failure / offline → fall back to snapshots below
    }

    // Show last-known availability when offline
    if (!candidatesLoaded) {
      const cached = await getSnapshot<CandidateDriver[]>('admin_candidates');
      if (cached?.length) setCandidates(cached);
    }
    if (!driversLoaded) {
      const cached = await getSnapshot<any[]>('driver_list');
      if (cached?.length) setFleetDrivers(cached);
    }
    if (!vehiclesLoaded) {
      const cached = await getSnapshot<any[]>('vehicle_list');
      if (cached?.length) setAvailableVehicles(cached);
    }

    if (!candidatesLoaded && !driversLoaded && !vehiclesLoaded) {
      setInterventionError('Menampilkan data terakhir (offline)');
    }

    setLoadingCandidates(false);
  };

  const handleManualAssign = async (driverId: string, vehicleId?: string) => {
    if (!interventionBooking) return;
    setAssigningCandidateId(driverId);
    setInterventionError(null);

    const chosenVehicle = vehicleId || selectedVehicleMap[driverId];
    const bookingId = interventionBooking.id;

    const applyOptimisticAssign = () => {
      const candidate = candidates.find((c) => c.driverId === driverId);
      const fleetDriver = fleetDrivers.find((d) => d.id === driverId);
      const driverName = candidate?.driverName || candidate?.name || fleetDriver?.user?.name;

      setBookings((prev) =>
        prev.map((bk) =>
          bk.id === bookingId
            ? {
                ...bk,
                status: 'DRIVER_ASSIGNED',
                driver: driverName
                  ? {
                      id: driverId,
                      licenseNumber: candidate?.licenseNumber || fleetDriver?.licenseNumber || '',
                      user: {
                        name: driverName,
                        phone: candidate?.phone || fleetDriver?.user?.phone || '',
                      },
                    }
                  : bk.driver,
              }
            : bk
        )
      );
    };

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await enqueueOfflineAction('ADMIN_ASSIGN_BOOKING', {
        endpoint: `/api/admin/bookings/${bookingId}/manual-assign`,
        method: 'POST',
        payload: { driverId, vehicleId: chosenVehicle },
        bookingId,
      });
      applyOptimisticAssign();
      setSuccessMessage('Penugasan disimpan offline — Menunggu Sync');
      setInterventionBooking(null);
      setAssigningCandidateId(null);
      return;
    }

    try {
      const payload: { driverId: string; vehicleId?: string } = { driverId };
      if (chosenVehicle) {
        payload.vehicleId = chosenVehicle;
      }

      const res = await fetch(`/api/admin/bookings/${bookingId}/manual-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setInterventionBooking(null);
        fetchBookings(page);
      } else {
        const err = await res.json();
        setInterventionError(err.error?.message || 'Gagal menugaskan driver');
      }
    } catch {
      await enqueueOfflineAction('ADMIN_ASSIGN_BOOKING', {
        endpoint: `/api/admin/bookings/${bookingId}/manual-assign`,
        method: 'POST',
        payload: { driverId, vehicleId: chosenVehicle },
        bookingId,
      });
      applyOptimisticAssign();
      setSuccessMessage('Penugasan disimpan offline — Menunggu Sync');
      setInterventionBooking(null);
    } finally {
      setAssigningCandidateId(null);
    }
  };

  const handleRejectPendingBooking = async () => {
    if (!rejectingPendingBooking) return;
    if (!rejectPendingReason.trim()) {
      setRejectPendingError('Alasan penolakan pesanan wajib diisi');
      return;
    }

    setIsRejectingPending(true);
    setRejectPendingError(null);

    try {
      const res = await fetch(`/api/bookings/${rejectingPendingBooking.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectPendingReason.trim() }),
      });

      if (res.ok) {
        setRejectingPendingBooking(null);
        setRejectPendingReason('');
        fetchBookings(page);
      } else {
        const err = await res.json();
        setRejectPendingError(err.error?.message || 'Gagal menolak pesanan');
      }
    } catch {
      setRejectPendingError('Terjadi kesalahan jaringan saat menolak pesanan');
    } finally {
      setIsRejectingPending(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (!cancellingBooking) return;
    setIsCancelling(true);
    try {
      const res = await fetch(`/api/bookings/${cancellingBooking.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin cancelled' }),
      });
      if (res.ok) {
        setCancellingBooking(null);
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

  const handleApproveCompletion = async (bookingId: string) => {
    setApprovingBookingId(bookingId);
    setApiError(null);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/approve-completion`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setApiError(json.error?.message || 'Gagal menyetujui penyelesaian booking');
        return;
      }
      const updated = json.data;
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
      );
      if (selectedBooking && selectedBooking.id === updated.id) {
        setSelectedBooking((prev) => (prev ? { ...prev, ...updated } : null));
      }
      setSuccessMessage(
        `Penyelesaian pemesanan #${updated.bookingNumber || bookingId} berhasil disetujui (COMPLETED).`
      );
    } catch {
      setApiError('Terjadi kesalahan jaringan saat menyetujui penyelesaian');
    } finally {
      setApprovingBookingId(null);
    }
  };

  const handleRejectCompletion = async () => {
    if (!rejectingBooking) return;
    if (!rejectReason.trim()) {
      setRejectError('Alasan penolakan nota dinas wajib diisi');
      return;
    }
    setIsRejecting(true);
    setRejectError(null);
    try {
      const res = await fetch(`/api/bookings/${rejectingBooking.id}/reject-completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRejectError(json.error?.message || 'Gagal menolak nota dinas');
        return;
      }
      const updated = json.data;
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b))
      );
      if (selectedBooking && selectedBooking.id === updated.id) {
        setSelectedBooking((prev) => (prev ? { ...prev, ...updated } : null));
      }
      setSuccessMessage(
        `Nota dinas untuk pemesanan #${rejectingBooking.bookingNumber} berhasil ditolak. Pemesan telah dinotifikasi untuk mengunggah dokumen revisi.`
      );
      setRejectingBooking(null);
      setRejectReason('');
    } catch {
      setRejectError('Terjadi kesalahan jaringan saat menolak nota dinas');
    } finally {
      setIsRejecting(false);
    }
  };

  const columns: Column<AdminBooking>[] = [
    {
      header: 'Booking',
      accessorKey: 'bookingNumber',
      cell: (b) => (
        <div className="min-w-0">
          <span className="mono-plate text-[0.8125rem] font-semibold text-slate-900">
            {b.bookingNumber}
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <span
              className={`pill ${b.serviceType === 'STANDBY' ? 'pill-warning' : 'pill-error'}`}
            >
              <span className="pill-dot" aria-hidden="true" />
              <span>{b.serviceType === 'STANDBY' ? 'Standby' : 'Drop off'}</span>
            </span>
            {b.operationalLocation && (
              <LocationBadge
                type="home"
                name={b.operationalLocation.name}
                code={b.operationalLocation.code}
              />
            )}
          </div>
        </div>
      ),
    },
    {
      header: 'Rute',
      cell: (b) => (
        <div className="max-w-[15rem] min-w-0">
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
      header: 'Pemesan',
      cell: (b) => (
        <div className="min-w-0 max-w-[11rem] text-xs">
          <div className="truncate font-medium text-slate-800">{b.user?.name}</div>
          <div className="tabular-nums truncate text-slate-500">{b.user?.phone}</div>
        </div>
      ),
    },
    {
      header: 'Armada & driver',
      cell: (b) => (
        <div className="min-w-0 space-y-1 text-xs">
          {b.vehicle ? (
            <div className="space-y-1">
              <span className="mono-plate inline-flex rounded-[var(--radius-xs)] border border-[var(--border)] bg-white px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-800">
                {b.vehicle.plateNumber}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {b.vehicle.homeLocation && (
                  <LocationBadge
                    type="home"
                    name={b.vehicle.homeLocation.name}
                    code={b.vehicle.homeLocation.code}
                  />
                )}
                {(b.vehicle.currentOperationalLocation || b.vehicle.currentLocation) && (
                  <LocationBadge
                    type="current"
                    name={(b.vehicle.currentOperationalLocation || b.vehicle.currentLocation)?.name}
                    code={(b.vehicle.currentOperationalLocation || b.vehicle.currentLocation)?.code}
                  />
                )}
              </div>
            </div>
          ) : (
            <span className="text-slate-400">Tanpa armada</span>
          )}
          {b.driver ? (
            <div className="max-w-[9.5rem] truncate text-[0.6875rem] text-slate-500">
              {b.driver.user.name}
            </div>
          ) : (
            <div className="text-[0.6875rem] text-slate-400">Tanpa driver</div>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (b) => (
        <div className="space-y-1">
          <StatusBadge status={b.status} />
          {b.status === 'PENDING_COMPLETION' && b.rejectedReason && (
            <span className="pill pill-error">
              <span className="pill-dot" aria-hidden="true" />
              <span>Nota ditolak</span>
            </span>
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
        const isIntervention = b.status === 'ADMIN_INTERVENTION' || b.status === 'PENDING';
        const canCancel = [
          'PENDING',
          'APPROVED',
          'SEARCHING_DRIVER',
          'DRIVER_NOTIFIED',
          'DRIVER_ASSIGNED',
          'NO_DRIVER_AVAILABLE',
          'ADMIN_INTERVENTION',
        ].includes(b.status);

        return (
          <div
            className="flex flex-wrap items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {isIntervention && (
              <button
                type="button"
                onClick={() => handleOpenIntervention(b)}
                className="pill pill-warning cursor-pointer transition-opacity hover:opacity-80"
              >
                <span>Tugaskan</span>
              </button>
            )}
            {b.status === 'PENDING' && (
              <button
                type="button"
                onClick={() => {
                  setRejectingPendingBooking(b);
                  setRejectPendingReason('');
                  setRejectPendingError(null);
                }}
                className="pill pill-error cursor-pointer transition-opacity hover:opacity-80"
              >
                <span>Tolak</span>
              </button>
            )}
            {b.status === 'PENDING_COMPLETION' &&
              (b.rejectedReason ? (
                <div className="flex items-center gap-1.5">
                  <span className="pill pill-error">
                    <span>Menunggu revisi</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBooking(b);
                      setRejectReason(b.rejectedReason || '');
                      setRejectError(null);
                    }}
                    className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
                  >
                    Ubah alasan
                  </button>
                </div>
              ) : b.notaDinasUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleApproveCompletion(b.id)}
                    disabled={approvingBookingId === b.id}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-full)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--status-active-fg)] transition-opacity hover:opacity-80 disabled:opacity-50"
                  >
                    {approvingBookingId === b.id ? (
                      <Spinner size="xs" />
                    ) : (
                      <Check className="size-3" strokeWidth={2.6} aria-hidden="true" />
                    )}
                    <span>Setujui</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBooking(b);
                      setRejectReason('');
                      setRejectError(null);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-[var(--radius-full)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--status-error-fg)] transition-opacity hover:opacity-80"
                  >
                    <X className="size-3" strokeWidth={2.6} aria-hidden="true" />
                    <span>Tolak</span>
                  </button>
                </>
              ) : (
                <span className="pill pill-warning">
                  <span>Menunggu nota</span>
                </span>
              ))}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-3 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
            >
              Detail
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="button-ghost min-h-0 cursor-pointer px-2 py-1 text-[0.6875rem] text-[var(--status-error-fg)]"
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
          <span className="eyebrow eyebrow-accent">Manajemen dispatch</span>
          <h1 className="page-heading mt-2">Reservasi &amp; penugasan armada</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Pantau status auto-dispatch, verifikasi dokumen nota dinas, dan penugasan manual driver.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="button-secondary self-start sm:self-auto"
        >
          <Download className="size-4" strokeWidth={2} aria-hidden="true" />
          <span>Unduh laporan</span>
        </button>
      </header>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {successMessage && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-3.5 py-2.5 text-xs text-[var(--status-active-fg)]"
        >
          <div className="flex min-w-0 items-start gap-2">
            <CheckCircle2 className="mt-px size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="leading-relaxed">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            aria-label="Tutup pesan"
            className="shrink-0 cursor-pointer rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Status tabs + hub filter */}
      <div className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="no-scrollbar -mx-0.5 flex min-w-0 items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 lg:flex-wrap lg:overflow-visible lg:pb-0">
          {(
            [
              { value: '', label: 'Semua' },
              { value: 'ADMIN_INTERVENTION', label: 'Perlu intervensi', warn: true },
              { value: 'SEARCHING_DRIVER', label: 'Mencari driver' },
              { value: 'IN_PROGRESS', label: 'Berjalan' },
              { value: 'PENDING_COMPLETION', label: 'Menunggu nota' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value || 'all'}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              aria-pressed={statusFilter === tab.value}
              className={`chip shrink-0 ${'warn' in tab && tab.warn ? 'border-[var(--status-warning-border)]' : ''}`}
            >
              {'warn' in tab && tab.warn && statusFilter !== tab.value && (
                <TriangleAlert
                  className="size-3 text-[var(--status-warning-fg)]"
                  strokeWidth={2.4}
                  aria-hidden="true"
                />
              )}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="booking-hub-filter" className="metric-label shrink-0">
              Hub
            </label>
            <select
              id="booking-hub-filter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-auto min-w-0 rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua hub</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="booking-status-filter" className="metric-label shrink-0">
              Status
            </label>
            <select
              id="booking-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto min-w-0 max-w-[11rem] rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua status</option>
              <option value="SEARCHING_DRIVER">Mencari driver</option>
              <option value="DRIVER_NOTIFIED">Driver dihubungi</option>
              <option value="DRIVER_ASSIGNED">Driver ditugaskan</option>
              <option value="DRIVER_EN_ROUTE">Menuju titik jemput</option>
              <option value="ARRIVED">Tiba di titik jemput</option>
              <option value="IN_PROGRESS">Dalam perjalanan</option>
              <option value="PENDING_COMPLETION">Menunggu approval nota</option>
              <option value="COMPLETED">Selesai</option>
              <option value="NO_DRIVER_AVAILABLE">Tidak ada driver</option>
              <option value="ADMIN_INTERVENTION">Intervensi dispatch</option>
              <option value="CANCELLED">Dibatalkan</option>
              <option value="PENDING">Menunggu admin</option>
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
            ? `${selectedBooking.user?.name} \u00b7 ${selectedBooking.user?.email}`
            : ''
        }
        footer={
          selectedBooking && (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {selectedBooking.status === 'PENDING_COMPLETION' &&
                  (selectedBooking.rejectedReason ? (
                    <>
                      <span className="pill pill-error">
                        <span className="pill-dot" aria-hidden="true" />
                        <span>Nota ditolak &mdash; menunggu revisi</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingBooking(selectedBooking);
                          setRejectReason(selectedBooking.rejectedReason || '');
                          setRejectError(null);
                        }}
                        className="button-secondary"
                      >
                        Ubah alasan
                      </button>
                    </>
                  ) : selectedBooking.notaDinasUrl ? (
                    <>
                      <button
                        type="button"
                        disabled={approvingBookingId === selectedBooking.id}
                        onClick={() => handleApproveCompletion(selectedBooking.id)}
                        className="button-primary"
                      >
                        {approvingBookingId === selectedBooking.id ? (
                          <Spinner size="xs" />
                        ) : (
                          <Check className="size-4" strokeWidth={2.6} aria-hidden="true" />
                        )}
                        <span>Selesaikan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingBooking(selectedBooking);
                          setRejectReason('');
                          setRejectError(null);
                        }}
                        className="button-danger"
                      >
                        <X className="size-4" strokeWidth={2.6} aria-hidden="true" />
                        <span>Tolak nota</span>
                      </button>
                    </>
                  ) : (
                    <span className="pill pill-warning">
                      <span className="pill-dot" aria-hidden="true" />
                      <span>Nota dinas belum diunggah</span>
                    </span>
                  ))}

                {(selectedBooking.status === 'ADMIN_INTERVENTION' ||
                  selectedBooking.status === 'PENDING') && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const b = selectedBooking;
                        setSelectedBooking(null);
                        handleOpenIntervention(b);
                      }}
                      className="button-primary"
                    >
                      Tugaskan driver
                    </button>
                    {selectedBooking.status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => {
                          const b = selectedBooking;
                          setSelectedBooking(null);
                          setRejectingPendingBooking(b);
                          setRejectPendingReason('');
                          setRejectPendingError(null);
                        }}
                        className="button-secondary text-[var(--status-error-fg)]"
                      >
                        Tolak pesanan
                      </button>
                    )}
                  </>
                )}
              </div>

              {[
                'PENDING',
                'APPROVED',
                'SEARCHING_DRIVER',
                'DRIVER_NOTIFIED',
                'DRIVER_ASSIGNED',
                'NO_DRIVER_AVAILABLE',
                'ADMIN_INTERVENTION',
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
                  Batalkan
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

            {/* Route + schedule */}
            <section className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">Rute perjalanan</span>
                <span
                  className={`pill ${selectedBooking.serviceType === 'STANDBY' ? 'pill-warning' : 'pill-error'}`}
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
            </section>

            {/* Asset + driver */}
            {(selectedBooking.vehicle || selectedBooking.driver) && (
              <section className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <span className="metric-label">Armada</span>
                  {selectedBooking.vehicle ? (
                    <>
                      <p className="mono-plate mt-1 text-sm font-semibold text-slate-900">
                        {selectedBooking.vehicle.plateNumber}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                      </p>
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
                      <p className="tabular-nums mt-0.5 text-xs text-slate-500">
                        {selectedBooking.driver.user.phone}
                      </p>
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
                <span className="eyebrow">Verifikasi nota dinas</span>
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
                      ? 'Ditolak'
                      : selectedBooking.notaDinasUrl
                        ? 'Terlampir'
                        : 'Belum dilampirkan'}
                  </span>
                </span>
              </div>

              {selectedBooking.rejectedReason && (
                <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2.5 text-xs">
                  <p className="font-semibold text-[var(--status-error-fg)]">
                    Nota dinas ditolak
                  </p>
                  <p className="mt-0.5 leading-relaxed text-[var(--status-error-fg)]/85">
                    {selectedBooking.rejectedReason}
                  </p>
                </div>
              )}

              {selectedBooking.notaDinasUrl ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs text-slate-500">
                    <span className="font-medium text-slate-800">
                      {selectedBooking.notaDinasFilename || 'nota-dinas.pdf'}
                    </span>
                  </p>
                  <a
                    href={selectedBooking.notaDinasUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="button-secondary"
                  >
                    <Download className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    <span>Lihat dokumen</span>
                  </a>
                </div>
              ) : (
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  {selectedBooking.status === 'PENDING_COMPLETION'
                    ? 'Trip telah selesai. Menunggu dokumen nota dinas diunggah oleh pemesan atau driver.'
                    : 'Belum ada nota dinas yang dilampirkan pada pesanan ini.'}
                </p>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* Manual assign / intervention */}
      {interventionBooking && (
        <Modal
          isOpen={Boolean(interventionBooking)}
          onClose={() => setInterventionBooking(null)}
          title="Penugasan driver &amp; armada"
          description={`Reservasi ${interventionBooking.bookingNumber} \u00b7 ${interventionBooking.pickupLocation} \u2192 ${interventionBooking.destination}`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {interventionError && (
              <ErrorBanner
                message={interventionError}
                onDismiss={() => setInterventionError(null)}
              />
            )}

            {loadingCandidates ? (
              <div className="flex flex-col items-center gap-2 py-12 text-xs text-slate-500">
                <Spinner size="md" className="text-[var(--kcic-red)]" />
                <p>Memuat driver armada dan status GPS&hellip;</p>
              </div>
            ) : (
              <div className="space-y-4">
                {candidates.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex size-2 shrink-0">
                        <span
                          className="live-ping absolute inset-0 rounded-full bg-[var(--status-active-fg)]"
                          aria-hidden="true"
                        />
                        <span
                          className="relative size-2 rounded-full bg-[var(--status-active-fg)]"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="eyebrow">Driver online terdekat</span>
                      <span className="tabular-nums text-[0.6875rem] font-medium text-slate-400">
                        {candidates.length}
                      </span>
                    </div>

                    <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {candidates.map((c) => {
                        const driverName = c.driverName || c.name || 'Driver';
                        const plate = c.plateNumber || c.vehiclePlateNumber || '\u2014';
                        const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
                        const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                        const isAssigning = assigningCandidateId === c.driverId;
                        const etaText = formatEta(c.etaSeconds, c.etaEstimated);

                        return (
                          <li
                            key={c.driverId}
                            className="flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-semibold text-slate-900">{driverName}</span>
                                {c.phone && (
                                  <span className="tabular-nums text-slate-500">{c.phone}</span>
                                )}
                                {etaText && (
                                  <span className="pill pill-standby">
                                    <span className="tabular-nums">ETA {etaText}</span>
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                                <span className="mono-plate rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-800">
                                  {plate}
                                </span>
                                {(c.vehicleBrand || c.vehicleModel) && (
                                  <span className="truncate">
                                    {c.vehicleBrand} {c.vehicleModel}
                                  </span>
                                )}
                                {c.seatingCapacity && (
                                  <span className="tabular-nums">{c.seatingCapacity} kursi</span>
                                )}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-1.5">
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex cursor-pointer items-center rounded-[var(--radius-full)] border border-[var(--status-active-border)] bg-[var(--status-active-bg)] px-3 py-1.5 text-[0.6875rem] font-semibold text-[var(--status-active-fg)] transition-opacity hover:opacity-80"
                                >
                                  WhatsApp
                                </a>
                              )}
                              <button
                                type="button"
                                disabled={Boolean(assigningCandidateId)}
                                onClick={() => handleManualAssign(c.driverId)}
                                className="button-primary px-3.5 py-1.5 text-[0.6875rem]"
                              >
                                {isAssigning ? <Spinner size="xs" /> : null}
                                <span>Tugaskan</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {(() => {
                  const onlineStandbyDrivers = fleetDrivers.filter(
                    (d) =>
                      d.status === 'AVAILABLE' &&
                      d.user?.isActive !== false &&
                      !candidates.some((c) => c.driverId === d.id)
                  );

                  if (candidates.length === 0 && onlineStandbyDrivers.length === 0) {
                    return (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-6 py-10 text-center">
                        <span className="icon-tile mx-auto">
                          <Signal className="size-5" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          Tidak ada driver yang sedang online
                        </p>
                        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
                          Sistem hanya menampilkan driver dengan status online (standby). Driver
                          perlu membuka dashboard aplikasi dan mengaktifkan status online agar siap
                          ditugaskan.
                        </p>
                      </div>
                    );
                  }

                  if (onlineStandbyDrivers.length === 0) return null;

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <span className="pill-dot text-[var(--status-active-fg)]" aria-hidden="true" />
                          <span className="eyebrow">Driver online standby</span>
                          <span className="tabular-nums text-[0.6875rem] font-medium text-slate-400">
                            {onlineStandbyDrivers.length}
                          </span>
                        </div>

                        <div className="flex min-w-0 items-center gap-1.5">
                          <MapPin
                            className="size-3 shrink-0 text-slate-400"
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                          <label
                            htmlFor="pool-filter"
                            className="metric-label shrink-0"
                          >
                            Pool
                          </label>
                          <select
                            id="pool-filter"
                            value={vehicleLocationFilter}
                            onChange={(e) => {
                              const newLoc = e.target.value;
                              setVehicleLocationFilter(newLoc);
                              fetchAvailableVehicles(newLoc);
                            }}
                            className="w-auto min-w-0 max-w-[11rem] rounded-full py-1 pl-3 pr-8 text-[0.6875rem] font-semibold"
                          >
                            <option value="">Semua lokasi ({availableVehicles.length})</option>
                            {Array.from(
                              new Map(locations.map((loc) => [loc.code || loc.name, loc])).values()
                            ).map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name} ({loc.code})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                        {onlineStandbyDrivers.map((d) => {
                          const isAssigning = assigningCandidateId === d.id;
                          const hasVehicle = Boolean(d.currentVehicle);
                          const chosenVehicle =
                            selectedVehicleMap[d.id] || (d.currentVehicle?.id ?? '');
                          const chosenVehicleObj = availableVehicles.find(
                            (v) => v.id === chosenVehicle
                          );

                          const isSameLocation = (
                            locA?: {
                              id?: string | null;
                              code?: string | null;
                              name?: string | null;
                            } | null,
                            locB?: {
                              id?: string | null;
                              code?: string | null;
                              name?: string | null;
                            } | null
                          ) => {
                            if (!locA || !locB) return false;
                            if (locA.id && locB.id && locA.id === locB.id) return true;
                            if (
                              locA.code &&
                              locB.code &&
                              locA.code.trim().toLowerCase() === locB.code.trim().toLowerCase()
                            )
                              return true;
                            if (
                              locA.name &&
                              locB.name &&
                              locA.name.trim().toLowerCase() === locB.name.trim().toLowerCase()
                            )
                              return true;
                            return false;
                          };

                          const isDriverLocationMismatch = Boolean(
                            interventionBooking?.operationalLocation &&
                              hasVehicle &&
                              d.currentVehicle &&
                              !isSameLocation(
                                d.currentVehicle.currentOperationalLocation,
                                interventionBooking.operationalLocation
                              ) &&
                              !isSameLocation(
                                d.currentVehicle.homeLocation,
                                interventionBooking.operationalLocation
                              )
                          );

                          const isChosenVehicleMismatch = Boolean(
                            interventionBooking?.operationalLocation &&
                              !hasVehicle &&
                              chosenVehicleObj &&
                              !isSameLocation(
                                chosenVehicleObj.currentOperationalLocation,
                                interventionBooking.operationalLocation
                              ) &&
                              !isSameLocation(
                                chosenVehicleObj.homeLocation,
                                interventionBooking.operationalLocation
                              )
                          );

                          const isBlocked =
                            isDriverLocationMismatch ||
                            isChosenVehicleMismatch ||
                            (!hasVehicle && !chosenVehicle);

                          const driverHubName =
                            d.currentVehicle?.currentOperationalLocation?.name ||
                            d.currentVehicle?.homeLocation?.name;
                          const chosenHubName =
                            chosenVehicleObj?.currentOperationalLocation?.name ||
                            chosenVehicleObj?.homeLocation?.name;

                          return (
                            <li
                              key={d.id}
                              className={`flex flex-col gap-2.5 rounded-[var(--radius-lg)] border p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                                isDriverLocationMismatch || isChosenVehicleMismatch
                                  ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)]'
                                  : 'border-[var(--border)] bg-white'
                              }`}
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-slate-900">
                                    {d.user?.name || 'Driver'}
                                  </span>
                                  {d.licenseNumber && (
                                    <span className="mono-plate text-[0.6875rem] text-slate-500">
                                      SIM {d.licenseNumber}
                                    </span>
                                  )}
                                  <span className="pill pill-active">
                                    <span className="pill-dot" aria-hidden="true" />
                                    <span>Online</span>
                                  </span>
                                  {isDriverLocationMismatch && (
                                    <span className="pill pill-error">
                                      <span>Beda lokasi &middot; {driverHubName}</span>
                                    </span>
                                  )}
                                  {isChosenVehicleMismatch && (
                                    <span className="pill pill-error">
                                      <span>Mobil di {chosenHubName}</span>
                                    </span>
                                  )}
                                </div>
                                <div className="tabular-nums truncate text-slate-500">
                                  {d.user?.phone || 'Tanpa nomor'}
                                </div>

                                {hasVehicle ? (
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="mono-plate rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 font-semibold text-slate-800">
                                      {d.currentVehicle.plateNumber}
                                    </span>
                                    <span className="truncate text-slate-500">
                                      {d.currentVehicle.brand} {d.currentVehicle.model}
                                      {driverHubName ? ` (${driverHubName})` : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 pt-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-slate-500">Pilih kendaraan</span>
                                      {isLoadingVehicles ? (
                                        <span className="flex items-center gap-1 text-slate-500">
                                          <Spinner size="xs" /> Memuat armada&hellip;
                                        </span>
                                      ) : (
                                        <select
                                          aria-label={`Pilih kendaraan untuk ${d.user?.name || 'driver'}`}
                                          value={chosenVehicle}
                                          onChange={(e) =>
                                            setSelectedVehicleMap((prev) => ({
                                              ...prev,
                                              [d.id]: e.target.value,
                                            }))
                                          }
                                          className="w-auto max-w-full rounded-full py-1 pl-3 pr-8 text-[0.6875rem] font-medium"
                                        >
                                          <option value="">
                                            Pilih armada ({availableVehicles.length} tersedia)
                                          </option>
                                          {availableVehicles.map((v) => {
                                            const hub =
                                              v.currentOperationalLocation?.name ||
                                              v.homeLocation?.name;
                                            return (
                                              <option key={v.id} value={v.id}>
                                                {v.plateNumber} ({v.brand} {v.model})
                                                {hub ? ` \u2014 ${hub}` : ''}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      )}
                                    </div>
                                    {availableVehicles.length === 0 && !isLoadingVehicles && (
                                      <span className="text-[0.6875rem] font-medium text-[var(--status-warning-fg)]">
                                        Tidak ada kendaraan tersedia
                                        {vehicleLocationFilter ? ' di lokasi ini' : ''}. Ubah filter
                                        pool di atas.
                                      </span>
                                    )}
                                  </div>
                                )}

                                {isDriverLocationMismatch && (
                                  <p className="text-[0.6875rem] font-medium leading-relaxed text-[var(--status-error-fg)]">
                                    Driver berada di {driverHubName}, berbeda dengan hub pesanan{' '}
                                    {interventionBooking?.operationalLocation?.name}.
                                  </p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={Boolean(assigningCandidateId) || isBlocked}
                                  onClick={() => handleManualAssign(d.id, chosenVehicle || undefined)}
                                  title={
                                    isDriverLocationMismatch || isChosenVehicleMismatch
                                      ? `Driver atau armada berada di lokasi berbeda dengan pesanan (${interventionBooking?.operationalLocation?.name || 'lokasi order'})`
                                      : !hasVehicle && !chosenVehicle
                                        ? 'Pilih kendaraan terlebih dahulu'
                                        : undefined
                                  }
                                  className="button-primary px-3.5 py-1.5 text-[0.6875rem]"
                                >
                                  {isAssigning ? <Spinner size="xs" /> : null}
                                  <span>Tugaskan</span>
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex items-center justify-end border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => setInterventionBooking(null)}
                className="button-secondary"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject pending booking */}
      {rejectingPendingBooking && (
        <Modal
          isOpen={Boolean(rejectingPendingBooking)}
          onClose={() => {
            if (!isRejectingPending) {
              setRejectingPendingBooking(null);
              setRejectPendingReason('');
              setRejectPendingError(null);
            }
          }}
          title="Tolak pesanan perjalanan"
          description={`Reservasi ${rejectingPendingBooking.bookingNumber} oleh ${
            rejectingPendingBooking.user?.name || 'Pemesan'
          }`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {rejectPendingError && (
              <ErrorBanner
                message={rejectPendingError}
                onDismiss={() => setRejectPendingError(null)}
              />
            )}

            <div className="rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--status-warning-fg)]">
              Berikan alasan penolakan, misalnya armada penuh, di luar jam dinas, atau keperluan
              tidak sesuai.
            </div>

            <div>
              <label
                htmlFor="rejectPendingReason"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Alasan penolakan <span className="text-[var(--kcic-red)]">*</span>
              </label>
              <textarea
                id="rejectPendingReason"
                rows={3}
                value={rejectPendingReason}
                onChange={(e) => setRejectPendingReason(e.target.value)}
                placeholder="Contoh: Seluruh armada Innova sedang digunakan dinas direksi pada jam tersebut."
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingPendingBooking(null);
                  setRejectPendingReason('');
                  setRejectPendingError(null);
                }}
                disabled={isRejectingPending}
                className="button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRejectPendingBooking}
                disabled={!rejectPendingReason.trim() || isRejectingPending}
                className="button-danger"
              >
                {isRejectingPending ? (
                  <Spinner size="xs" />
                ) : (
                  <X className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                )}
                <span>{isRejectingPending ? 'Memproses\u2026' : 'Tolak pesanan'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject nota dinas */}
      {rejectingBooking && (
        <Modal
          isOpen={Boolean(rejectingBooking)}
          onClose={() => {
            if (!isRejecting) {
              setRejectingBooking(null);
              setRejectReason('');
              setRejectError(null);
            }
          }}
          title="Tolak dokumen nota dinas"
          description={`Reservasi ${rejectingBooking.bookingNumber} \u00b7 ${rejectingBooking.pickupLocation} \u2192 ${rejectingBooking.destination}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {rejectError && (
              <ErrorBanner message={rejectError} onDismiss={() => setRejectError(null)} />
            )}

            <div className="rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--status-error-fg)]">
              Berikan alasan penolakan agar pemesan atau driver mengetahui revisi yang diperlukan,
              misalnya foto blur, dokumen salah, atau tidak terbaca.
            </div>

            <div>
              <label
                htmlFor="rejectReason"
                className="mb-1.5 block text-xs font-medium text-slate-700"
              >
                Alasan penolakan <span className="text-[var(--kcic-red)]">*</span>
              </label>
              <textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Foto nota dinas blur, nomor surat tidak terbaca. Harap foto ulang dengan jelas."
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingBooking(null);
                  setRejectReason('');
                  setRejectError(null);
                }}
                disabled={isRejecting}
                className="button-secondary"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRejectCompletion}
                disabled={!rejectReason.trim() || isRejecting}
                className="button-danger"
              >
                {isRejecting ? (
                  <Spinner size="xs" />
                ) : (
                  <X className="size-3.5" strokeWidth={2.6} aria-hidden="true" />
                )}
                <span>{isRejecting ? 'Memproses\u2026' : 'Tolak nota dinas'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        onConfirm={handleCancelConfirm}
        title="Batalkan reservasi"
        message={`Reservasi ${cancellingBooking?.bookingNumber} akan dibatalkan dan driver tidak akan ditugaskan. Lanjutkan?`}
        confirmLabel="Batalkan reservasi"
        isDestructive={true}
        isLoading={isCancelling}
      />

      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        locations={locations}
      />
    </div>
  );
}

export default function AdminBookingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat manajemen reservasi&hellip;</p>
        </div>
      }
    >
      <AdminBookingsContent />
    </Suspense>
  );
}
