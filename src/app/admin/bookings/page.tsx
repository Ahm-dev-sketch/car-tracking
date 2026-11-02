'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

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
  createdAt: string;
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

interface DriverOption {
  id: string;
  licenseNumber: string;
  user: {
    name: string;
  };
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Detail Drawer
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null);

  // Reject Modal
  const [rejectingBooking, setRejectingBooking] = useState<AdminBooking | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  // Assign Driver Modal
  const [assigningBooking, setAssigningBooking] = useState<AdminBooking | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Cancel Confirm
  const [cancellingBooking, setCancellingBooking] = useState<AdminBooking | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Approve State
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const fetchBookings = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (statusFilter) params.set('status', statusFilter);

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
  }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setApprovingId(id);
    setApiError(null);
    try {
      const res = await fetch(`/api/bookings/${id}/approve`, {
        method: 'POST',
      });
      if (res.ok) {
        fetchBookings(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to approve booking');
      }
    } catch {
      setApiError('Network error approving booking');
    } finally {
      setApprovingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingBooking || !rejectReason.trim()) return;
    setIsRejecting(true);
    setRejectError(null);

    try {
      const res = await fetch(`/api/bookings/${rejectingBooking.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setRejectingBooking(null);
        setRejectReason('');
        fetchBookings(page);
      } else {
        const err = await res.json();
        setRejectError(err.error?.message || 'Failed to reject booking');
      }
    } catch {
      setRejectError('Network error rejecting booking');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleOpenAssign = async (b: AdminBooking) => {
    setAssigningBooking(b);
    setSelectedDriverId('');
    setAssignError(null);
    try {
      const res = await fetch('/api/drivers?limit=50');
      if (res.ok) {
        const json = await res.json();
        setAvailableDrivers(json.data || []);
      }
    } catch {
      // ignore
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningBooking || !selectedDriverId) return;
    setIsAssigning(true);
    setAssignError(null);

    try {
      const res = await fetch(`/api/bookings/${assigningBooking.id}/assign-driver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId: selectedDriverId }),
      });
      if (res.ok) {
        setAssigningBooking(null);
        fetchBookings(page);
      } else {
        const err = await res.json();
        setAssignError(err.error?.message || 'Failed to assign driver');
      }
    } catch {
      setAssignError('Network error assigning driver');
    } finally {
      setIsAssigning(false);
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

  const columns: Column<AdminBooking>[] = [
    {
      header: 'Booking #',
      cell: (b) => (
        <div>
          <span className="font-semibold text-zinc-900">{b.bookingNumber}</span>
          <span className="text-zinc-500 block text-[11px]">{b.user.name}</span>
        </div>
      ),
    },
    {
      header: 'Route & Timing',
      cell: (b) => (
        <div className="max-w-[200px] text-xs">
          <div className="font-medium text-zinc-800 truncate">{b.pickupLocation} → {b.destination}</div>
          <div className="text-zinc-500">
            {new Date(b.departureAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Vehicle / Driver',
      cell: (b) => (
        <div className="text-xs">
          {b.vehicle ? (
            <div className="font-mono font-medium text-zinc-900">{b.vehicle.plateNumber}</div>
          ) : (
            <span className="text-zinc-400 italic">No vehicle</span>
          )}
          {b.driver ? (
            <div className="text-[11px] text-zinc-600">Driver: {b.driver.user.name}</div>
          ) : (
            <span className="text-[11px] text-zinc-400">Driver unassigned</span>
          )}
        </div>
      ),
    },
    {
      header: 'Status',
      cell: (b) => <StatusBadge status={b.status} />,
    },
    {
      header: 'Actions',
      cell: (b) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {b.status === 'PENDING' && (
            <>
              <button
                type="button"
                disabled={approvingId === b.id}
                onClick={() => handleApprove(b.id)}
                className="px-2 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
              >
                {approvingId === b.id && <Spinner size="sm" className="text-white" />}
                Approve
              </button>
              <button
                type="button"
                onClick={() => {
                  setRejectingBooking(b);
                  setRejectReason('');
                  setRejectError(null);
                }}
                className="px-2 py-1 text-xs font-medium border border-rose-200 text-rose-700 rounded hover:bg-rose-50 cursor-pointer"
              >
                Reject
              </button>
            </>
          )}

          {b.status === 'APPROVED' && (
            <button
              type="button"
              onClick={() => handleOpenAssign(b)}
              className="px-2 py-1 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded cursor-pointer"
            >
              Assign Driver
            </button>
          )}

          {['PENDING', 'APPROVED', 'DRIVER_ASSIGNED'].includes(b.status) && (
            <button
              type="button"
              onClick={() => setCancellingBooking(b)}
              className="px-2 py-1 text-xs font-medium text-zinc-600 border border-zinc-200 rounded hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="button"
            onClick={() => setSelectedBooking(b)}
            className="px-2 py-1 text-xs font-medium text-zinc-700 border border-zinc-200 rounded hover:bg-zinc-50 cursor-pointer"
          >
            Details
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-zinc-200">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Reservations & Dispatches</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Approve, dispatch drivers, and manage corporate vehicle bookings</p>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search */}
      <div className="bg-white p-3 rounded-lg border border-zinc-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="DRIVER_ASSIGNED">DRIVER_ASSIGNED</option>
            <option value="IN_PROGRESS">IN_PROGRESS</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="CANCELLED">CANCELLED</option>
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        emptyMessage="No reservations match the filter"
        onRowClick={(b) => setSelectedBooking(b)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchBookings(p)}
      />

      {/* Reject Modal */}
      <Modal
        isOpen={Boolean(rejectingBooking)}
        onClose={() => setRejectingBooking(null)}
        title="Reject Booking Request"
        description={rejectingBooking?.bookingNumber}
        maxWidth="sm"
      >
        {rejectError && <ErrorBanner message={rejectError} className="mb-4" onDismiss={() => setRejectError(null)} />}

        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <FormField label="Rejection Reason" required>
            <textarea
              required
              rows={3}
              placeholder="e.g. No vehicles available at requested time, unauthorized trip"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isRejecting}
              onClick={() => setRejectingBooking(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isRejecting || !rejectReason.trim()}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isRejecting && <Spinner size="sm" className="text-white" />}
              Confirm Rejection
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Driver Modal */}
      <Modal
        isOpen={Boolean(assigningBooking)}
        onClose={() => setAssigningBooking(null)}
        title="Assign Driver to Booking"
        description={assigningBooking?.bookingNumber}
        maxWidth="sm"
      >
        {assignError && <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />}

        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <FormField label="Select Driver" required>
            <select
              required
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="">-- Choose Driver --</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} ({d.licenseNumber})
                </option>
              ))}
            </select>
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningBooking(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedDriverId}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              Assign Driver
            </button>
          </div>
        </form>
      </Modal>

      {/* Cancel Confirm Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        onConfirm={handleCancelConfirm}
        title="Cancel Booking"
        message={`Are you sure you want to cancel booking ${cancellingBooking?.bookingNumber}?`}
        confirmLabel="Cancel Booking"
        isDestructive={true}
        isLoading={isCancelling}
      />

      {/* Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={selectedBooking ? selectedBooking.bookingNumber : ''}
        description={selectedBooking ? `Requester: ${selectedBooking.user.name}` : ''}
      >
        {selectedBooking && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">Status</span>
              <StatusBadge status={selectedBooking.status} />
            </div>

            <div className="space-y-3 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-zinc-400 uppercase font-semibold">Requester</span>
                <p className="font-medium text-zinc-900 mt-0.5">
                  {selectedBooking.user.name} ({selectedBooking.user.email})
                </p>
                <p className="text-zinc-500 font-mono mt-0.5">{selectedBooking.user.phone}</p>
              </div>

              <div>
                <span className="text-zinc-400 uppercase font-semibold">Purpose</span>
                <p className="font-medium text-zinc-800 mt-0.5">{selectedBooking.purpose}</p>
              </div>

              <div>
                <span className="text-zinc-400 uppercase font-semibold">Route</span>
                <p className="font-medium text-zinc-800 mt-0.5">
                  {selectedBooking.pickupLocation} → {selectedBooking.destination}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-zinc-400 uppercase font-semibold">Departure</span>
                  <p className="font-medium text-zinc-800 mt-0.5">
                    {new Date(selectedBooking.departureAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-400 uppercase font-semibold">Return</span>
                  <p className="font-medium text-zinc-800 mt-0.5">
                    {new Date(selectedBooking.expectedReturnAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <span className="text-zinc-400 uppercase font-semibold">Passengers</span>
                <p className="font-medium text-zinc-800 mt-0.5">{selectedBooking.passengerCount} persons</p>
              </div>

              {selectedBooking.notes && (
                <div>
                  <span className="text-zinc-400 uppercase font-semibold">Notes</span>
                  <p className="text-zinc-700 mt-0.5">{selectedBooking.notes}</p>
                </div>
              )}
            </div>

            {/* Vehicle & Driver */}
            <div className="space-y-2">
              <span className="text-zinc-400 uppercase font-semibold block">Asset Assignment</span>
              {selectedBooking.vehicle && (
                <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                  <div className="font-mono font-bold text-zinc-900">{selectedBooking.vehicle.plateNumber}</div>
                  <div className="text-zinc-600">{selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}</div>
                </div>
              )}
              {selectedBooking.driver && (
                <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                  <div className="font-bold text-zinc-900">{selectedBooking.driver.user.name}</div>
                  <div className="text-zinc-500 font-mono">License: {selectedBooking.driver.licenseNumber}</div>
                  <div className="text-zinc-500 font-mono">Phone: {selectedBooking.driver.user.phone}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
