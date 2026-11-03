'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Drawer } from '@/components/ui/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';
import { DispatchProgress, formatEta } from '@/components/booking/DispatchProgress';

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
    router.replace(`/user/bookings?${params.toString()}`);
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
    syncUrlParams({
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [statusFilter, locationFilter]);

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
      cell: (b) => (
        <div>
          <span className="font-semibold text-zinc-900">{b.bookingNumber}</span>
          {b.operationalLocation && (
            <div className="text-[11px] text-zinc-500 font-medium">
              {b.operationalLocation.name} ({b.operationalLocation.code})
            </div>
          )}
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

            {/* Operational Location */}
            {selectedBooking.operationalLocation && (
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100 text-xs">
                <span className="font-semibold uppercase text-zinc-500">Operational Hub</span>
                <span className="font-medium text-zinc-800">
                  {selectedBooking.operationalLocation.name} ({selectedBooking.operationalLocation.code})
                </span>
              </div>
            )}

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
                <div className="text-zinc-500 flex items-center gap-2">
                  <span>Phone: {selectedBooking.driver.user.phone}</span>
                  {selectedBooking.driver.user.phone && (
                    <a
                      href={`https://wa.me/${selectedBooking.driver.user.phone.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 hover:text-emerald-700 font-semibold underline"
                    >
                      WhatsApp
                    </a>
                  )}
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
