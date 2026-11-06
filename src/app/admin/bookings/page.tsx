'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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

  // Export Report Excel Modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Fetch locations
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
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load bookings');
      }
    } catch {
      setApiError('Network error loading bookings');
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

  // Open manual assign / candidates modal
  const handleOpenIntervention = async (b: AdminBooking) => {
    setInterventionBooking(b);
    setCandidates([]);
    setInterventionError(null);
    setLoadingCandidates(true);
    try {
      const res = await fetch(`/api/admin/dispatch/${b.id}/candidates`);
      if (res.ok) {
        const json = await res.json();
        setCandidates(json.data || []);
      } else {
        const err = await res.json();
        setInterventionError(err.error?.message || 'Failed to load eligible candidates');
      }
    } catch {
      setInterventionError('Network error loading eligible candidates');
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleManualAssign = async (driverId: string) => {
    if (!interventionBooking) return;
    setAssigningCandidateId(driverId);
    setInterventionError(null);

    try {
      const res = await fetch(`/api/admin/bookings/${interventionBooking.id}/manual-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId }),
      });

      if (res.ok) {
        setInterventionBooking(null);
        fetchBookings(page);
      } else {
        const err = await res.json();
        setInterventionError(err.error?.message || 'Failed to assign candidate driver');
      }
    } catch {
      setInterventionError('Network error assigning driver');
    } finally {
      setAssigningCandidateId(null);
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
      header: 'Employee',
      cell: (b) => (
        <div className="text-xs">
          <div className="font-medium text-zinc-800">{b.user?.name}</div>
          <div className="text-zinc-500 text-[11px]">{b.user?.phone}</div>
        </div>
      ),
    },
    {
      header: 'Vehicle & Driver',
      cell: (b) => (
        <div className="text-xs space-y-0.5">
          {b.vehicle ? (
            <div>
              <div className="flex items-center gap-1 font-mono font-semibold text-zinc-800">
                <span>{b.vehicle.plateNumber}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
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
            <span className="text-zinc-400 italic">No Vehicle</span>
          )}
          {b.driver ? (
            <div className="text-[11px] text-zinc-600 truncate max-w-[120px]">
              Driver: {b.driver.user.name}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 italic">No Driver</div>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (b) => (
        <div className="space-y-1">
          <StatusBadge status={b.status} />
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
          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isIntervention && (
              <button
                type="button"
                onClick={() => handleOpenIntervention(b)}
                className="px-2.5 py-1 text-xs font-black bg-amber-400 hover:bg-amber-500 text-zinc-950 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer"
              >
                Assign
              </button>
            )}
            {b.status === 'PENDING_COMPLETION' && (
              <>
                <button
                  type="button"
                  onClick={() => handleApproveCompletion(b.id)}
                  disabled={approvingBookingId === b.id}
                  className="px-2.5 py-1 text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
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
                  className="px-2.5 py-1 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Tolak Nota</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setSelectedBooking(b)}
              className="px-2.5 py-1 text-xs font-black border-2 border-black text-zinc-900 bg-white rounded-lg hover:bg-zinc-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
            >
              Details
            </button>
            {canCancel && (
              <button
                type="button"
                onClick={() => setCancellingBooking(b)}
                className="px-2.5 py-1 text-xs font-black text-rose-700 bg-rose-50 border-2 border-black rounded-lg hover:bg-rose-100 shadow-[2px_2px_0px_0px_#000] cursor-pointer"
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b-2 border-black/10">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-950">Reservations & Dispatch</h1>
          <p className="text-xs font-medium text-zinc-600 mt-0.5">
            Monitor auto-dispatch states, operational locations, and admin intervention escalations
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsExportModalOpen(true)}
          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg border-2 border-black text-xs font-black shadow-[2px_2px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1.5 self-start sm:self-auto transition-transform active:translate-y-0.5"
        >
          <Icon name="download" className="size-4" />
          <span>Download Laporan Excel</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and quick selection bar */}
      <div className="surface p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick filter pills */}
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`px-3 py-1 text-xs rounded-lg font-black border-2 border-black cursor-pointer transition ${
              statusFilter === ''
                ? 'bg-zinc-950 text-white shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-zinc-900 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('ADMIN_INTERVENTION')}
            className={`px-3 py-1 text-xs rounded-lg font-black border-2 border-black cursor-pointer transition inline-flex items-center gap-1.5 ${
              statusFilter === 'ADMIN_INTERVENTION'
                ? 'bg-amber-400 text-zinc-950 shadow-[2px_2px_0px_0px_#000]'
                : 'bg-amber-100 text-zinc-950 shadow-[1px_1px_0px_0px_#000] hover:bg-amber-200'
            }`}
          >
            <Icon name="alert" className="size-3.5 shrink-0 text-amber-950" />
            <span>Intervention Required</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('SEARCHING_DRIVER')}
            className={`px-3 py-1 text-xs rounded-lg font-black border-2 border-black cursor-pointer transition ${
              statusFilter === 'SEARCHING_DRIVER'
                ? 'bg-amber-300 text-zinc-950 shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-zinc-800 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
            }`}
          >
            Searching
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('IN_PROGRESS')}
            className={`px-3 py-1 text-xs rounded-lg font-black border-2 border-black cursor-pointer transition ${
              statusFilter === 'IN_PROGRESS'
                ? 'bg-emerald-300 text-zinc-950 shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-zinc-800 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('PENDING_COMPLETION')}
            className={`px-3 py-1 text-xs rounded-lg font-black border-2 border-black cursor-pointer transition ${
              statusFilter === 'PENDING_COMPLETION'
                ? 'bg-amber-300 text-zinc-950 shadow-[2px_2px_0px_0px_#000]'
                : 'bg-white text-zinc-800 shadow-[1px_1px_0px_0px_#000] hover:bg-zinc-100'
            }`}
          >
            Menunggu Approval Nota
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Operational Hub filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">Hub:</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="px-2.5 py-1 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
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
            <span className="text-xs font-black uppercase tracking-wider text-zinc-600">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-900 shadow-[2px_2px_0px_0px_#000] focus:outline-none"
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
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {selectedBooking.status === 'PENDING_COMPLETION' && (
                  <>
                    <button
                      type="button"
                      disabled={approvingBookingId === selectedBooking.id}
                      onClick={() => handleApproveCompletion(selectedBooking.id)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {approvingBookingId === selectedBooking.id ? (
                        <Spinner size="sm" className="text-white" />
                      ) : (
                        <Icon name="check" className="size-3.5" />
                      )}
                      <span>Approve & Selesaikan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingBooking(selectedBooking);
                        setRejectReason('');
                        setRejectError(null);
                      }}
                      className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold border-2 border-black shadow-[2px_2px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <Icon name="close" className="size-3.5" />
                      <span>Tolak Nota Dinas</span>
                    </button>
                  </>
                )}
                {(selectedBooking.status === 'ADMIN_INTERVENTION' ||
                  selectedBooking.status === 'PENDING') && (
                  <button
                    type="button"
                    onClick={() => {
                      const b = selectedBooking;
                      setSelectedBooking(null);
                      handleOpenIntervention(b);
                    }}
                    className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Candidate Drivers & Assign
                  </button>
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
                  className="px-3.5 py-2 text-rose-700 border border-rose-200 rounded hover:bg-rose-50 text-xs font-medium cursor-pointer"
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
                  <LocationBadge
                    type="home"
                    name={selectedBooking.operationalLocation.name}
                    code={selectedBooking.operationalLocation.code}
                  />
                </div>
              )}
            </div>

            {/* Nota Dinas Verification Section */}
            <div className="p-3 bg-amber-50/70 border-2 border-black rounded-xl space-y-2 shadow-[2px_2px_0px_0px_#000]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-zinc-900 flex items-center gap-1.5">
                  <Icon name="check" className="size-4 text-emerald-600" />
                  <span>Verifikasi Dokumen Nota Dinas</span>
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
                  <p className="text-[10px] text-zinc-500 italic">
                    Menunggu pemesan atau driver mengunggah ulang dokumen revisi.
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
                      <>
                        <button
                          type="button"
                          disabled={approvingBookingId === selectedBooking.id}
                          onClick={() => handleApproveCompletion(selectedBooking.id)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-black border border-black shadow-[1.5px_1.5px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1 disabled:opacity-50"
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
                          className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-black border border-black shadow-[1.5px_1.5px_0px_0px_#000] cursor-pointer inline-flex items-center gap-1"
                        >
                          <Icon name="close" className="size-3.5" />
                          <span>Tolak Nota</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-xs space-y-2 pt-1">
                  <p className="text-[11px] text-zinc-600">
                    {selectedBooking.status === 'PENDING_COMPLETION'
                      ? 'Trip telah selesai. Menunggu dokumen Nota Dinas diunggah oleh pemesan atau driver untuk diverifikasi.'
                      : 'Belum ada nota dinas yang dilampirkan pada pesanan ini.'}
                  </p>
                </div>
              )}
            </div>

            {/* Route */}
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

            {/* Schedule */}
            <div className="grid grid-cols-2 gap-3 text-xs pb-3 border-b border-zinc-100">
              <div>
                <span className="text-zinc-500 uppercase font-semibold text-[10px] block">Departure</span>
                <span className="font-medium text-zinc-800">
                  {new Date(selectedBooking.departureAt).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-zinc-500 uppercase font-semibold text-[10px] block">Return</span>
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

            {/* Vehicle & Driver */}
            {selectedBooking.vehicle && (
              <div className="p-3 bg-white border border-zinc-200 rounded-lg text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">Assigned Asset</span>
                <div className="font-mono font-bold text-zinc-900">{selectedBooking.vehicle.plateNumber}</div>
                <div className="text-zinc-600">
                  {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                </div>
              </div>
            )}

            {selectedBooking.driver && (
              <div className="p-3 bg-white border border-zinc-200 rounded-lg text-xs space-y-1">
                <span className="text-[10px] font-bold uppercase text-zinc-400 block">Assigned Driver</span>
                <div className="font-semibold text-zinc-900">{selectedBooking.driver.user.name}</div>
                <div className="text-zinc-500">Phone: {selectedBooking.driver.user.phone}</div>
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
          title="Manual Driver Assignment"
          description={`Intervention for booking #${interventionBooking.bookingNumber} (${interventionBooking.pickupLocation} → ${interventionBooking.destination})`}
          maxWidth="xl"
        >
          <div className="space-y-4">
            {interventionError && (
              <ErrorBanner message={interventionError} onDismiss={() => setInterventionError(null)} />
            )}

            {loadingCandidates ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                <Spinner size="md" className="mb-2" />
                <p>Loading candidate drivers reporting GPS at this location...</p>
              </div>
            ) : candidates.length === 0 ? (
              <div className="p-8 bg-zinc-50 border border-dashed border-zinc-300 rounded text-center text-xs text-zinc-500">
                No active eligible drivers found online for this location.
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600 block">
                  Candidate Drivers Ranked by Proximity ({candidates.length})
                </span>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
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
                        className="p-3 bg-white border border-zinc-200 hover:border-zinc-300 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-zinc-900">{driverName}</span>
                            {c.phone && <span className="text-zinc-500">({c.phone})</span>}
                            {etaText && (
                              <span className="font-mono text-[10px] font-semibold text-indigo-800 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200">
                                ETA: {etaText}
                              </span>
                            )}
                          </div>

                          <div className="text-zinc-600 flex items-center gap-2">
                            <span className="font-mono font-semibold text-zinc-800">{plate}</span>
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
                              className="px-2.5 py-1.5 border border-emerald-300 text-emerald-700 hover:bg-emerald-50 rounded text-xs font-semibold inline-flex items-center gap-1"
                            >
                              <span>WhatsApp</span>
                            </a>
                          )}

                          <button
                            type="button"
                            disabled={Boolean(assigningCandidateId)}
                            onClick={() => handleManualAssign(c.driverId)}
                            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
                          >
                            {isAssigning ? <Spinner size="sm" /> : 'Assign'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setInterventionBooking(null)}
                className="px-4 py-1.5 border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-medium cursor-pointer"
              >
                Close
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

            <div className="p-3 bg-rose-50 border-2 border-black rounded-lg text-xs font-medium text-rose-950">
              Berikan alasan penolakan dokumen Nota Dinas agar pemesan/driver mengetahui revisi yang diperlukan (misal: foto blur, salah dokumen, tidak terbaca, dll).
            </div>

            <div>
              <label htmlFor="rejectReason" className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                Alasan Penolakan <span className="text-[#be123c]">*</span>
              </label>
              <textarea
                id="rejectReason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Foto nota dinas blur, nomor surat tidak terbaca. Harap foto ulang dengan jelas."
                className="w-full p-2.5 text-xs font-medium border-2 border-black rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  setRejectingBooking(null);
                  setRejectReason('');
                  setRejectError(null);
                }}
                disabled={isRejecting}
                className="px-3.5 py-1.5 text-xs font-bold border-2 border-black rounded-lg bg-white text-zinc-700 hover:bg-zinc-100 cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleRejectCompletion}
                disabled={!rejectReason.trim() || isRejecting}
                className="px-4 py-1.5 text-xs font-black rounded-lg border-2 border-black bg-rose-600 text-white shadow-[2px_2px_0px_0px_#000] hover:bg-rose-700 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
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
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <p>Loading bookings management...</p>
        </div>
      }
    >
      <AdminBookingsContent />
    </Suspense>
  );
}
