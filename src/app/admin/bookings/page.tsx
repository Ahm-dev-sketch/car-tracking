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
import { Icon } from '@/components/ui/Icon';
import { ExportReportModal } from '@/components/admin/ExportReportModal';
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
      header: 'Route',
      cell: (b) => (
        <div className="max-w-[200px]">
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
      header: 'Employee',
      cell: (b) => (
        <div className="text-xs">
          <div className="font-medium text-slate-900">{b.user?.name}</div>
          <div className="text-[11px] tabular-nums text-slate-500">{b.user?.phone}</div>
        </div>
      ),
    },
    {
      header: 'Vehicle & Driver',
      cell: (b) => (
        <div className="space-y-1 text-xs">
          {b.vehicle ? (
            <div>
              <div className="flex items-center gap-1 font-mono font-semibold tabular-nums text-slate-800">
                <span>{b.vehicle.plateNumber}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
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
            <span className="italic text-slate-400">No Vehicle</span>
          )}
          {b.driver ? (
            <div className="max-w-[120px] truncate text-[11px] text-slate-600">
              Driver: {b.driver.user.name}
            </div>
          ) : (
            <div className="text-[11px] italic text-slate-400">No Driver</div>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (b) => (
        <div className="space-y-1">
          <StatusBadge status={b.status} hasNotaDinas={Boolean(b.notaDinasUrl)} />
          {b.status === 'PENDING_COMPLETION' && b.rejectedReason && (
            <div className="inline-flex items-center gap-1 rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-danger-700">
              Nota Ditolak
            </div>
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
          <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isIntervention && (
              <button
                type="button"
                onClick={() => handleOpenIntervention(b)}
                className="cursor-pointer rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Tugaskan Driver
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
                className="cursor-pointer rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
              >
                Tolak
              </button>
            )}
            {b.status === 'PENDING_COMPLETION' && (
              b.rejectedReason ? (
                <div className="flex items-center gap-1.5">
                  <span className="rounded-lg border border-danger-200 bg-danger-50 px-2 py-1 text-[11px] font-medium text-danger-700">
                    Menunggu Revisi Pemesan
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBooking(b);
                      setRejectReason(b.rejectedReason || '');
                      setRejectError(null);
                    }}
                    className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Edit Alasan
                  </button>
                </div>
              ) : b.notaDinasUrl ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleApproveCompletion(b.id)}
                    disabled={approvingBookingId === b.id}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                  >
                    {approvingBookingId === b.id && <Spinner size="sm" className="text-white" />}
                    <span>Approve Selesai</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingBooking(b);
                      setRejectReason('');
                      setRejectError(null);
                    }}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                  >
                    <Icon name="close" className="size-3.5" />
                    <span>Tolak Nota Dinas</span>
                  </button>
                </>
              ) : (
                <span className="rounded-lg border border-warning-200 bg-warning-50 px-2.5 py-1 text-[11px] font-medium text-warning-700" title="Dokumen Nota Dinas belum diunggah oleh pemesan atau pengemudi">
                  Menunggu Nota Dinas
                </span>
              )
            )}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Details
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="cursor-pointer rounded-lg border border-transparent px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
              >
                Cancel
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const pendingCount = bookings.filter((b) => b.status === 'PENDING' || b.status === 'ADMIN_INTERVENTION').length;
  const activeCount = bookings.filter((b) =>
    ['SEARCHING_DRIVER', 'DRIVER_NOTIFIED', 'DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'].includes(b.status)
  ).length;
  // Verification-ready mirrors the nav action-required query (PENDING_COMPLETION
  // + notaDinasUrl + no rejection). The sub-count is not-yet-uploaded only, so
  // neither number can inflate the admin's actionable queue.
  const completionReadyCount = bookings.filter(
    (b) => b.status === 'PENDING_COMPLETION' && Boolean(b.notaDinasUrl) && !b.rejectedReason
  ).length;
  const completionAwaitingUploadCount = bookings.filter(
    (b) => b.status === 'PENDING_COMPLETION' && !b.notaDinasUrl
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Reservations &amp; Dispatch</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Monitor auto-dispatch states, operational locations, and admin intervention escalations
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 self-start rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 sm:self-auto"
        >
          <Icon name="download" className="size-4" />
          <span>Download Laporan Excel</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Rekaman</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Perlu Tindakan</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-warning-600">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Armada Aktif</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Siap Verifikasi</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{completionReadyCount}</p>
          {completionAwaitingUploadCount > 0 && (
            <p className="mt-1 text-[10px] font-medium tabular-nums leading-relaxed text-slate-400">
              {completionAwaitingUploadCount} menunggu upload
            </p>
          )}
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}
      {successMessage && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 p-3.5 text-xs text-success-700 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-success-600 text-white">
              <Icon name="check" className="size-3" />
            </span>
            <span className="font-medium leading-relaxed">{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="cursor-pointer rounded p-1 text-success-700 transition-colors hover:bg-success-100"
            aria-label="Tutup notifikasi"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>
      )}

      {/* Filter and quick selection bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Quick filter pills */}
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === ''
                ? 'border-brand-200 bg-brand-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ADMIN_INTERVENTION')}
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'ADMIN_INTERVENTION'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-warning-700 hover:bg-warning-50'
            }`}
          >
            <Icon name="alert" className="size-3.5 shrink-0" />
            <span>Intervention Required</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SEARCHING_DRIVER')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'SEARCHING_DRIVER'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Searching
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'IN_PROGRESS'
                ? 'border-success-200 bg-success-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING_COMPLETION')}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === 'PENDING_COMPLETION'
                ? 'border-warning-200 bg-warning-600 text-white'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            Menunggu Nota Dinas
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Operational Hub filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Hub</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">All Hubs</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status dropdown */}
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
              <option value="PENDING">Legacy Pending</option>
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
            ? `Requested by ${selectedBooking.user?.name} (${selectedBooking.user?.email})`
            : ''
        }
        footer={
          selectedBooking && (
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {selectedBooking.status === 'PENDING_COMPLETION' && (
                  selectedBooking.rejectedReason ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-1.5 text-xs font-medium text-danger-700">
                        Nota Ditolak (Menunggu Dokumen Revisi)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingBooking(selectedBooking);
                          setRejectReason(selectedBooking.rejectedReason || '');
                          setRejectError(null);
                        }}
                        className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        Ubah Alasan
                      </button>
                    </div>
                  ) : selectedBooking.notaDinasUrl ? (
                    <>
                      <button
                        type="button"
                        disabled={approvingBookingId === selectedBooking.id}
                        onClick={() => handleApproveCompletion(selectedBooking.id)}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                      >
                        {approvingBookingId === selectedBooking.id ? (
                          <Spinner size="sm" className="text-white" />
                        ) : (
                          <Icon name="check" className="size-3.5" />
                        )}
                        <span>Approve &amp; Selesaikan</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingBooking(selectedBooking);
                          setRejectReason('');
                          setRejectError(null);
                        }}
                        className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-danger-700"
                      >
                        <Icon name="close" className="size-3.5" />
                        <span>Tolak Nota Dinas</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-1.5 text-xs font-medium text-warning-700">
                        Nota Dinas Belum Diunggah
                      </span>
                    </div>
                  )
                )}
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
                      className="min-h-9 cursor-pointer rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                    >
                      Tugaskan Driver
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
                        className="min-h-9 cursor-pointer rounded-lg border border-danger-200 bg-white px-3.5 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                      >
                        Tolak Pesanan
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
                  className="min-h-9 cursor-pointer rounded-lg border border-transparent px-3.5 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
                >
                  Cancel Booking
                </button>
              )}
            </div>
          )
        }
      >
        {selectedBooking && (
          <div className="space-y-4 text-sm">
            <DispatchProgress
              status={selectedBooking.status}
              etaSeconds={selectedBooking.etaSeconds}
              etaEstimated={selectedBooking.etaEstimated}
              hasNotaDinas={Boolean(selectedBooking.notaDinasUrl)}
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
                  <LocationBadge
                    type="home"
                    name={selectedBooking.operationalLocation.name}
                    code={selectedBooking.operationalLocation.code}
                  />
                </div>
              )}
            </div>

            {/* Nota Dinas Verification Section */}
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-700">
                  <Icon name="bookings" className="size-4 text-brand-600" />
                  <span>Verifikasi Dokumen Nota Dinas</span>
                </span>
                <span
                  className={`rounded border px-2 py-0.5 text-[10px] font-medium ${
                    selectedBooking.rejectedReason
                      ? 'border-danger-200 bg-danger-50 text-danger-700'
                      : selectedBooking.notaDinasUrl
                      ? selectedBooking.status === 'PENDING_COMPLETION'
                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400'
                        : 'border-success-200 bg-success-50 text-success-700'
                      : 'border-warning-200 bg-warning-50 text-warning-700'
                  }`}
                >
                  {selectedBooking.rejectedReason
                    ? 'Ditolak (Perlu Revisi)'
                    : selectedBooking.notaDinasUrl
                    ? selectedBooking.status === 'PENDING_COMPLETION'
                      ? 'Terunggah, Menunggu Verifikasi'
                      : 'Terlampir'
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
                  <p className="text-[10px] italic text-slate-500">
                    Menunggu pemesan atau driver mengunggah ulang dokumen revisi.
                  </p>
                </div>
              )}

              {selectedBooking.notaDinasUrl ? (
                <div className="space-y-1.5 pt-1 text-xs">
                  <p className="truncate text-[11px] text-slate-600">
                    File: <span className="font-medium text-slate-900">{selectedBooking.notaDinasFilename || 'nota-dinas.pdf'}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`/api/bookings/${selectedBooking.id}/nota-dinas/download`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Icon name="download" className="size-3.5" />
                      <span>Lihat / Unduh Dokumen</span>
                    </a>
                    {selectedBooking.status === 'PENDING_COMPLETION' && (
                      selectedBooking.rejectedReason ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded border border-danger-200 bg-danger-50 px-2.5 py-1 text-xs font-medium text-danger-700">
                            Status: Nota Ditolak
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingBooking(selectedBooking);
                              setRejectReason(selectedBooking.rejectedReason || '');
                              setRejectError(null);
                            }}
                            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                          >
                            Ubah Alasan
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={approvingBookingId === selectedBooking.id}
                            onClick={() => handleApproveCompletion(selectedBooking.id)}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-brand-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                          >
                            {approvingBookingId === selectedBooking.id ? (
                              <Spinner size="sm" className="text-white" />
                            ) : (
                              <Icon name="check" className="size-3.5" />
                            )}
                            <span>Approve Selesai</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectingBooking(selectedBooking);
                              setRejectReason('');
                              setRejectError(null);
                            }}
                            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-danger-200 bg-white px-3 py-1 text-xs font-semibold text-danger-700 transition-colors hover:bg-danger-50"
                          >
                            <Icon name="close" className="size-3.5" />
                            <span>Tolak Nota</span>
                          </button>
                        </>
                      )
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-2 pt-1 text-xs">
                  <p className="text-[11px] leading-relaxed text-slate-600">
                    {selectedBooking.status === 'PENDING_COMPLETION'
                      ? 'Trip telah selesai. Menunggu dokumen Nota Dinas diunggah oleh pemesan atau driver untuk diverifikasi.'
                      : 'Belum ada nota dinas yang dilampirkan pada pesanan ini.'}
                  </p>
                </div>
              )}
            </div>

            {/* Route */}
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

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-3 border-b border-slate-200 pb-3 text-xs">
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Departure</span>
                <span className="font-medium tabular-nums text-slate-900">
                  {new Date(selectedBooking.departureAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Return</span>
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

            {/* Vehicle & Driver */}
            {selectedBooking.vehicle && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Assigned Asset</span>
                <div className="font-mono font-semibold tabular-nums text-slate-900">{selectedBooking.vehicle.plateNumber}</div>
                <div className="text-slate-600">
                  {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                </div>
              </div>
            )}

            {selectedBooking.driver && (
              <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-3 text-xs">
                <span className="block text-[10px] font-medium uppercase tracking-wider text-slate-500">Assigned Driver</span>
                <div className="font-semibold text-slate-900">{selectedBooking.driver.user.name}</div>
                <div className="tabular-nums text-slate-500">Phone: {selectedBooking.driver.user.phone}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Intervention / Candidates Manual Assign Modal */}
      {interventionBooking && (
        <Modal
          isOpen={Boolean(interventionBooking)}
          onClose={() => setInterventionBooking(null)}
          title="Penugasan Driver & Armada Kendaraan"
          description={`Penugasan untuk booking #${interventionBooking.bookingNumber} (${interventionBooking.pickupLocation} → ${interventionBooking.destination})`}
          maxWidth="2xl"
        >
          <div className="space-y-4">
            {interventionError && (
              <ErrorBanner message={interventionError} onDismiss={() => setInterventionError(null)} />
            )}

            {loadingCandidates ? (
              <div className="py-12 text-center text-xs text-slate-500">
                <Spinner size="md" className="mb-2" />
                <p>Memuat driver armada dan status GPS...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Candidate drivers ranked by GPS proximity (if online) */}
                {candidates.length > 0 && (
                  <div className="space-y-2">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success-700">
                      <span aria-hidden="true" className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success-600 opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex size-2 rounded-full bg-success-600" />
                      </span>
                      <span>Driver Online (Sinyal GPS Aktif Terdekat - <span className="tabular-nums">{candidates.length}</span>)</span>
                    </span>

                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {candidates.map((c) => {
                        const driverName = c.driverName || c.name || 'Driver';
                        const plate = c.plateNumber || c.vehiclePlateNumber || '—';
                        const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
                        const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : null;
                        const isAssigning = assigningCandidateId === c.driverId;
                        const etaText = formatEta(c.etaSeconds, c.etaEstimated);

                        return (
                          <div
                            key={c.driverId}
                            className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 text-xs sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">{driverName}</span>
                                {c.phone && <span className="tabular-nums text-slate-500">({c.phone})</span>}
                                {etaText && (
                                  <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
                                    ETA: {etaText}
                                  </span>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-slate-600">
                                <span className="font-mono font-semibold tabular-nums text-slate-800">{plate}</span>
                                {(c.vehicleBrand || c.vehicleModel) && (
                                  <span>
                                    • {c.vehicleBrand} {c.vehicleModel}
                                  </span>
                                )}
                                {c.seatingCapacity && <span>• <span className="tabular-nums">{c.seatingCapacity}</span> seats</span>}
                              </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                              {waUrl && (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                >
                                  <span>WhatsApp</span>
                                </a>
                              )}

                              <button
                                type="button"
                                disabled={Boolean(assigningCandidateId)}
                                onClick={() => handleManualAssign(c.driverId)}
                                className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
                              >
                                {isAssigning ? <Spinner size="sm" className="text-white" /> : 'Tugaskan Driver'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Other Online Standby Fleet Drivers */}
                {(() => {
                  const onlineStandbyDrivers = fleetDrivers.filter(
                    (d) =>
                      d.status === 'AVAILABLE' &&
                      d.user?.isActive !== false &&
                      !candidates.some((c) => c.driverId === d.id)
                  );

                  if (candidates.length === 0 && onlineStandbyDrivers.length === 0) {
                    return (
                      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-xs">
                        <div className="mb-1 flex justify-center">
                          <span className="flex size-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500">
                            <Icon name="signal" className="size-5" />
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">Tidak Ada Driver yang Sedang Online</p>
                        <p className="mx-auto max-w-md leading-relaxed text-slate-600">
                          Sistem hanya menampilkan driver yang sedang <strong className="font-semibold">ONLINE (Standby)</strong>. Driver harus membuka dashboard aplikasi driver dan mengaktifkan status online (<strong className="font-semibold">&apos;Go online&apos;</strong>) agar siap ditugaskan.
                        </p>
                      </div>
                    );
                  }

                  if (onlineStandbyDrivers.length === 0) {
                    return null;
                  }

                  return (
                    <div className="space-y-2">
                      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success-700">
                          <span aria-hidden="true" className="size-2 rounded-full bg-success-600" />
                          <span>Driver Online Standby (<span className="tabular-nums">{onlineStandbyDrivers.length}</span>)</span>
                        </span>

                        {/* Location filter for pool vehicles */}
                        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                          <Icon name="pin" className="size-3 text-slate-500" />
                          <span className="text-[11px] font-medium text-slate-600">Pool Kendaraan:</span>
                          <select
                            value={vehicleLocationFilter}
                            onChange={(e) => {
                              const newLoc = e.target.value;
                              setVehicleLocationFilter(newLoc);
                              fetchAvailableVehicles(newLoc);
                            }}
                            className="cursor-pointer rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
                          >
                            <option value="">Semua Lokasi ({availableVehicles.length})</option>
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

                      <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
                        {onlineStandbyDrivers.map((d) => {
                          const isAssigning = assigningCandidateId === d.id;
                          const hasVehicle = Boolean(d.currentVehicle);
                          const chosenVehicle = selectedVehicleMap[d.id] || (d.currentVehicle?.id ?? '');
                          const chosenVehicleObj = availableVehicles.find((v) => v.id === chosenVehicle);

                          const isSameLocation = (
                            locA?: { id?: string | null; code?: string | null; name?: string | null } | null,
                            locB?: { id?: string | null; code?: string | null; name?: string | null } | null
                          ) => {
                            if (!locA || !locB) return false;
                            if (locA.id && locB.id && locA.id === locB.id) return true;
                            if (locA.code && locB.code && locA.code.trim().toLowerCase() === locB.code.trim().toLowerCase()) return true;
                            if (locA.name && locB.name && locA.name.trim().toLowerCase() === locB.name.trim().toLowerCase()) return true;
                            return false;
                          };

                          const isDriverLocationMismatch = Boolean(
                            interventionBooking?.operationalLocation &&
                            hasVehicle &&
                            d.currentVehicle &&
                            !isSameLocation(d.currentVehicle.currentOperationalLocation, interventionBooking.operationalLocation) &&
                            !isSameLocation(d.currentVehicle.homeLocation, interventionBooking.operationalLocation)
                          );

                          const isChosenVehicleMismatch = Boolean(
                            interventionBooking?.operationalLocation &&
                            !hasVehicle &&
                            chosenVehicleObj &&
                            !isSameLocation(chosenVehicleObj.currentOperationalLocation, interventionBooking.operationalLocation) &&
                            !isSameLocation(chosenVehicleObj.homeLocation, interventionBooking.operationalLocation)
                          );

                          const isBlocked = isDriverLocationMismatch || isChosenVehicleMismatch || (!hasVehicle && !chosenVehicle);

                          const driverHubName = d.currentVehicle?.currentOperationalLocation?.name || d.currentVehicle?.homeLocation?.name;
                          const chosenHubName = chosenVehicleObj?.currentOperationalLocation?.name || chosenVehicleObj?.homeLocation?.name;

                          return (
                            <div
                              key={d.id}
                              className={`flex flex-col gap-3 rounded-lg border p-3 text-xs sm:flex-row sm:items-center sm:justify-between ${
                                isDriverLocationMismatch ? 'border-danger-200 bg-danger-50 opacity-80' : 'border-slate-200 bg-slate-50'
                              }`}
                            >
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-slate-900">{d.user?.name || 'Driver'}</span>
                                  {d.licenseNumber && (
                                    <span className="text-[10px] font-mono tabular-nums text-slate-500">SIM: {d.licenseNumber}</span>
                                  )}
                                  <span className="rounded border border-success-200 bg-success-50 px-1.5 py-0.5 text-[10px] font-semibold text-success-700">
                                    ONLINE
                                  </span>
                                  {isDriverLocationMismatch && (
                                    <span className="rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-700">
                                      Beda Lokasi: {driverHubName}
                                    </span>
                                  )}
                                  {isChosenVehicleMismatch && (
                                    <span className="rounded border border-danger-200 bg-danger-50 px-1.5 py-0.5 text-[10px] font-medium text-danger-700">
                                      Mobil di {chosenHubName}
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-[11px] tabular-nums text-slate-600">
                                  {d.user?.phone || 'No phone'}
                                </div>

                                {hasVehicle ? (
                                  <div className="flex items-center gap-1.5 pt-0.5">
                                    <span className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-900">
                                      {d.currentVehicle.plateNumber}
                                    </span>
                                    <span className="text-[11px] text-slate-600">
                                      {d.currentVehicle.brand} {d.currentVehicle.model}
                                      {driverHubName ? ` (${driverHubName})` : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1 pt-0.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="text-[11px] font-medium text-slate-500">Pilih Kendaraan:</span>
                                      {isLoadingVehicles ? (
                                        <span className="flex items-center gap-1 text-[10px] text-slate-500">
                                          <Spinner size="sm" className="text-slate-600" /> Memuat armada...
                                        </span>
                                      ) : (
                                        <select
                                          value={chosenVehicle}
                                          onChange={(e) =>
                                            setSelectedVehicleMap((prev) => ({
                                              ...prev,
                                              [d.id]: e.target.value,
                                            }))
                                          }
                                          className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 focus:border-brand-500 focus:outline-none"
                                        >
                                          <option value="">-- Pilih Armada ({availableVehicles.length} tersedia) --</option>
                                          {availableVehicles.map((v) => {
                                            const hub = v.currentOperationalLocation?.name || v.homeLocation?.name;
                                            return (
                                              <option key={v.id} value={v.id}>
                                                {v.plateNumber} ({v.brand} {v.model}){hub ? ` — ${hub}` : ''}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      )}
                                    </div>
                                    {availableVehicles.length === 0 && !isLoadingVehicles && (
                                      <span className="text-[10px] font-medium text-warning-700">
                                        Tidak ada kendaraan AVAILABLE {vehicleLocationFilter ? 'di lokasi ini' : ''}. Ubah filter pool di atas.
                                      </span>
                                    )}
                                  </div>
                                )}

                                {isDriverLocationMismatch && (
                                  <p className="pt-0.5 text-[10px] font-medium text-danger-700">
                                    Driver berada di {driverHubName}. Tidak dapat ditugaskan ke order {interventionBooking?.operationalLocation?.name}.
                                  </p>
                                )}
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  disabled={Boolean(assigningCandidateId) || isBlocked}
                                  onClick={() => handleManualAssign(d.id, chosenVehicle || undefined)}
                                  title={
                                    isDriverLocationMismatch || isChosenVehicleMismatch
                                      ? `Driver/armada berada di lokasi berbeda dengan pesanan (${interventionBooking?.operationalLocation?.name || 'lokasi order'})`
                                      : !hasVehicle && !chosenVehicle
                                      ? 'Pilih kendaraan terlebih dahulu'
                                      : undefined
                                  }
                                  className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {isAssigning ? <Spinner size="sm" className="text-white" /> : 'Tugaskan Driver'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="flex items-center justify-end border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setInterventionBooking(null)}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Pending Booking Modal */}
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
          title="Tolak Pesanan Perjalanan"
          description={`Pemesanan #${rejectingPendingBooking.bookingNumber} oleh ${rejectingPendingBooking.user?.name || 'User'}`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {rejectPendingError && (
              <ErrorBanner message={rejectPendingError} onDismiss={() => setRejectPendingError(null)} />
            )}

            <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs font-medium leading-relaxed text-warning-700">
              Berikan alasan penolakan pemesanan perjalanan (misal: armada penuh, di luar jam dinas, atau keperluan tidak sesuai).
            </div>

            <div>
              <label htmlFor="rejectPendingReason" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Alasan Penolakan <span className="text-brand-500">*</span>
              </label>
              <textarea
                id="rejectPendingReason"
                rows={3}
                value={rejectPendingReason}
                onChange={(e) => setRejectPendingReason(e.target.value)}
                placeholder="Contoh: Seluruh armada Innova sedang digunakan dinas direksi pada jam tersebut."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingPendingBooking(null);
                  setRejectPendingReason('');
                  setRejectPendingError(null);
                }}
                disabled={isRejectingPending}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRejectPendingBooking}
                disabled={!rejectPendingReason.trim() || isRejectingPending}
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
              >
                {isRejectingPending ? <Spinner size="sm" /> : <Icon name="close" className="size-3.5" />}
                <span>{isRejectingPending ? 'Memproses...' : 'Tolak Pesanan'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Nota Dinas Modal */}
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
          title="Tolak Dokumen Nota Dinas"
          description={`Booking #${rejectingBooking.bookingNumber} (${rejectingBooking.pickupLocation} → ${rejectingBooking.destination})`}
          maxWidth="md"
        >
          <div className="space-y-4">
            {rejectError && <ErrorBanner message={rejectError} onDismiss={() => setRejectError(null)} />}

            <div className="rounded-lg border border-danger-200 bg-danger-50 p-3 text-xs font-medium leading-relaxed text-danger-700">
              Berikan alasan penolakan dokumen Nota Dinas agar pemesan/driver mengetahui revisi yang diperlukan (misal: foto blur, salah dokumen, tidak terbaca, dll).
            </div>

            <div>
              <label htmlFor="rejectReason" className="mb-1.5 block text-xs font-semibold text-slate-700">
                Alasan Penolakan <span className="text-brand-500">*</span>
              </label>
              <textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Foto nota dinas blur, nomor surat tidak terbaca. Harap foto ulang dengan jelas."
                className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingBooking(null);
                  setRejectReason('');
                  setRejectError(null);
                }}
                disabled={isRejecting}
                className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRejectCompletion}
                disabled={!rejectReason.trim() || isRejecting}
                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-danger-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-danger-700 disabled:opacity-50"
              >
                {isRejecting ? <Spinner size="sm" /> : <Icon name="close" className="size-3.5" />}
                <span>{isRejecting ? 'Memproses...' : 'Tolak Nota Dinas'}</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        onConfirm={handleCancelConfirm}
        title="Cancel Booking"
        message={`Are you sure you want to cancel booking #${cancellingBooking?.bookingNumber}?`}
        confirmLabel="Cancel Booking"
        isDestructive={true}
        isLoading={isCancelling}
      />

      {/* Export Report Excel Modal */}
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
        <div className="py-20 text-center text-sm text-slate-500">
          <Spinner size="lg" className="mb-2" />
          <p>Loading bookings management...</p>
        </div>
      }
    >
      <AdminBookingsContent />
    </Suspense>
  );
}
