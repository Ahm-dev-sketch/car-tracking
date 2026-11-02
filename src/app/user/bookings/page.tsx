'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { Modal } from '@/components/ui/Modal';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

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
  createdAt: string;
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    vehicleType: string;
    status: string;
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

export default function UserBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
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
  const [availableVehicles, setAvailableVehicles] = useState<Array<{ id: string; plateNumber: string; brand: string; model: string; seatingCapacity: number }>>([]);
  const [createVehicleId, setCreateVehicleId] = useState('');
  const [createPickup, setCreatePickup] = useState('');
  const [createDest, setCreateDest] = useState('');
  const [createDeparture, setCreateDeparture] = useState('');
  const [createReturn, setCreateReturn] = useState('');
  const [createPassengers, setCreatePassengers] = useState(1);
  const [createPurpose, setCreatePurpose] = useState('');
  const [createNotes, setCreateNotes] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

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
        const list: Booking[] = json.data || [];
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

  const handleOpenCreateModal = async () => {
    setCreateError(null);
    setIsCreateOpen(true);
    // Suggest default dates
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const returnTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setCreateDeparture(toLocalISO(now));
    setCreateReturn(toLocalISO(returnTime));

    // Load available vehicles for dropdown
    try {
      const res = await fetch('/api/vehicles?status=AVAILABLE&limit=50');
      if (res.ok) {
        const json = await res.json();
        setAvailableVehicles(json.data || []);
      }
    } catch {
      // ignore
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCreate(true);
    setCreateError(null);

    const depDate = new Date(createDeparture);
    const retDate = new Date(createReturn);

    if (retDate <= depDate) {
      setCreateError('Return time must be after departure time');
      setIsSubmittingCreate(false);
      return;
    }

    try {
      const payload = {
        vehicleId: createVehicleId || undefined,
        pickupLocation: createPickup.trim(),
        destination: createDest.trim(),
        departureAt: depDate.toISOString(),
        expectedReturnAt: retDate.toISOString(),
        passengerCount: createPassengers,
        purpose: createPurpose.trim(),
        notes: createNotes.trim() || undefined,
      };

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        fetchBookings(1);
      } else {
        const err = await res.json();
        setCreateError(err.error?.message || 'Failed to create booking');
      }
    } catch {
      setCreateError('Network error creating booking');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

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

  const columns: Column<Booking>[] = [
    {
      header: 'Booking #',
      accessorKey: 'bookingNumber',
      cell: (b) => <span className="font-semibold text-zinc-900">{b.bookingNumber}</span>,
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
      cell: (b) => <StatusBadge status={b.status} />,
    },
    {
      header: 'Actions',
      cell: (b) => {
        const canCancel = ['PENDING', 'APPROVED', 'DRIVER_ASSIGNED'].includes(b.status);
        const canTrack =
          Boolean(b.vehicle) &&
          ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(b.status);

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
          onClick={handleOpenCreateModal}
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>+ New Reservation</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter */}
      <div className="bg-white p-3 rounded-lg border border-zinc-200 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-zinc-500">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="DRIVER_ASSIGNED">Driver Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={bookings}
        isLoading={isLoading}
        emptyMessage="No bookings found"
        onRowClick={(b) => setSelectedBooking(b)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchBookings(p)}
      />

      {/* Detail Drawer */}
      <Drawer
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={selectedBooking ? selectedBooking.bookingNumber : 'Booking'}
        description={selectedBooking ? `Purpose: ${selectedBooking.purpose}` : ''}
        footer={
          selectedBooking && ['PENDING', 'APPROVED', 'DRIVER_ASSIGNED'].includes(selectedBooking.status) ? (
            <button
              type="button"
              onClick={() => {
                const target = selectedBooking;
                setSelectedBooking(null);
                setCancellingBooking(target);
              }}
              className="px-3 py-1.5 border border-rose-300 text-rose-700 bg-white hover:bg-rose-50 rounded text-xs font-semibold cursor-pointer"
            >
              Cancel Reservation
            </button>
          ) : null
        }
      >
        {selectedBooking && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="font-semibold uppercase text-zinc-500">Status</span>
              <StatusBadge status={selectedBooking.status} />
            </div>

            <div className="space-y-3 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-zinc-400 uppercase font-semibold">Route</span>
                <p className="font-medium text-zinc-900 mt-0.5">
                  {selectedBooking.pickupLocation} → {selectedBooking.destination}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
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

            {/* Vehicle / Driver Assignment */}
            <div className="space-y-3">
              <span className="font-semibold uppercase text-zinc-500 block">Fleet Assignment</span>
              {selectedBooking.vehicle ? (
                <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1">
                  <div className="font-bold text-zinc-900">
                    {selectedBooking.vehicle.brand} {selectedBooking.vehicle.model}
                  </div>
                  <div className="font-mono text-zinc-600">{selectedBooking.vehicle.plateNumber}</div>
                </div>
              ) : (
                <p className="text-zinc-500 italic">No vehicle assigned yet.</p>
              )}

              {selectedBooking.driver?.user && (
                <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1">
                  <div className="text-[11px] text-zinc-400 uppercase font-semibold">Driver</div>
                  <div className="font-bold text-zinc-900">{selectedBooking.driver.user.name}</div>
                  {selectedBooking.driver.user.phone && selectedBooking.driver.user.phone !== 'REDACTED' && (
                    <div className="text-emerald-700">
                      <a
                        href={`https://wa.me/${selectedBooking.driver.user.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline font-medium"
                      >
                        WhatsApp: {selectedBooking.driver.user.phone}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(cancellingBooking)}
        onClose={() => setCancellingBooking(null)}
        onConfirm={handleCancelConfirm}
        title="Cancel Reservation"
        message={`Are you sure you want to cancel booking ${cancellingBooking?.bookingNumber}? This action cannot be reversed.`}
        confirmLabel="Yes, Cancel Booking"
        isDestructive={true}
        isLoading={isCancelling}
      />

      {/* Standalone New Booking Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Vehicle Reservation"
        maxWidth="lg"
      >
        {createError && <ErrorBanner message={createError} className="mb-4" onDismiss={() => setCreateError(null)} />}

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <FormField label="Assigned Vehicle (Optional)">
            <select
              value={createVehicleId}
              onChange={(e) => setCreateVehicleId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-800"
            >
              <option value="">Let Administrator Assign</option>
              {availableVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} ({v.plateNumber}) - {v.seatingCapacity} seats
                </option>
              ))}
            </select>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Pickup Location" required>
              <input
                type="text"
                required
                placeholder="HQ Lobby, Building A"
                value={createPickup}
                onChange={(e) => setCreatePickup(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Destination" required>
              <input
                type="text"
                required
                placeholder="Client Office, South Jakarta"
                value={createDest}
                onChange={(e) => setCreateDest(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Departure Date & Time" required>
              <input
                type="datetime-local"
                required
                value={createDeparture}
                onChange={(e) => setCreateDeparture(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Expected Return" required>
              <input
                type="datetime-local"
                required
                value={createReturn}
                onChange={(e) => setCreateReturn(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Passenger Count" required>
              <input
                type="number"
                min="1"
                max="50"
                required
                value={createPassengers}
                onChange={(e) => setCreatePassengers(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Trip Purpose" required>
              <input
                type="text"
                required
                placeholder="Client Meeting / Site Inspection"
                value={createPurpose}
                onChange={(e) => setCreatePurpose(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <FormField label="Notes / Special Instructions (Optional)">
            <textarea
              rows={2}
              placeholder="Additional baggage, flight number, contact info"
              value={createNotes}
              onChange={(e) => setCreateNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmittingCreate}
              onClick={() => setIsCreateOpen(false)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCreate}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmittingCreate && <Spinner size="sm" className="text-white" />}
              Submit Reservation
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
