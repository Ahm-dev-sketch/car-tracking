'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Drawer } from '@/components/ui/Drawer';

interface TripItem {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  startLat: number;
  startLng: number;
  endLat?: number | null;
  endLng?: number | null;
  distanceMeters?: number | null;
  vehicle: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  };
  booking?: {
    id: string;
    bookingNumber: string;
    purpose: string;
  } | null;
}

export default function DriverTripHistoryPage() {
  const [trips, setTrips] = useState<TripItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTrip, setSelectedTrip] = useState<TripItem | null>(null);

  const fetchTrips = async (targetPage = 1) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trips?page=${targetPage}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        const list: TripItem[] = json.data || [];
        setTrips(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setError(err.error?.message || 'Failed to load trip history');
      }
    } catch {
      setError('Network error loading trips');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips(1);
  }, []);

  const columns: Column<TripItem>[] = [
    {
      header: 'Date & Time',
      cell: (t) => (
        <div className="text-xs">
          <div className="font-semibold text-slate-900 tabular-nums">
            {new Date(t.startedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div className="text-slate-500 tabular-nums">
            {new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Vehicle',
      cell: (t) => (
        <div className="text-xs">
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {t.vehicle.plateNumber}
          </span>
          <span className="block text-slate-500">{t.vehicle.brand} {t.vehicle.model}</span>
        </div>
      ),
    },
    {
      header: 'Booking',
      cell: (t) =>
        t.booking ? (
          <div className="text-xs">
            <span className="font-semibold text-slate-800 tabular-nums">{t.booking.bookingNumber}</span>
            <span className="block max-w-[150px] truncate text-slate-500">{t.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Ad-hoc trip</span>
        ),
    },
    {
      header: 'Duration',
      cell: (t) => {
        if (!t.endedAt)
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700">
              <span className="relative inline-flex size-1.5 shrink-0 rounded-full" aria-hidden="true">
                <span className="absolute inset-0 rounded-full bg-brand-600" />
                <span className="absolute inset-0 rounded-full bg-brand-600 status-ping" />
              </span>
              Active
            </span>
          );
        const diffMs = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
        const mins = Math.round(diffMs / 60000);
        return <span className="text-xs text-slate-700 tabular-nums">{mins} mins</span>;
      },
    },
    {
      header: 'Distance',
      cell: (t) => (
        <span className="font-mono text-xs text-slate-700 tabular-nums">
          {t.distanceMeters !== null && t.distanceMeters !== undefined
            ? `${(t.distanceMeters / 1000).toFixed(1)} km`
            : '—'}
        </span>
      ),
    },
    {
      header: 'Status',
      cell: (t) => <StatusBadge status={t.status} />,
    },
    {
      header: 'Actions',
      cell: (t) => (
        <button
          type="button"
          onClick={() => setSelectedTrip(t)}
          className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">KCIC Fleet / Driver log</p>
          <h1 className="page-heading mt-2">Trip history.</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500">
            Log of completed and active vehicle trips
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <DataTable
        columns={columns}
        data={trips}
        isLoading={isLoading}
        emptyMessage="No trip records found"
        onRowClick={(t) => setSelectedTrip(t)}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchTrips(p)}
      />

      {/* Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedTrip)}
        onClose={() => setSelectedTrip(null)}
        title="Trip Record"
        description={selectedTrip ? `Vehicle: ${selectedTrip.vehicle.plateNumber}` : ''}
      >
        {selectedTrip && (
          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Status
              </span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Timestamps
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="block text-[10px] text-slate-400">Started</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {new Date(selectedTrip.startedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-slate-400">Ended</span>
                  <span className="font-medium text-slate-800 tabular-nums">
                    {selectedTrip.endedAt ? new Date(selectedTrip.endedAt).toLocaleString() : 'In Progress'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-b border-slate-100 pb-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Coordinates
              </span>
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] text-slate-600 tabular-nums">
                <div>Start: {selectedTrip.startLat.toFixed(5)}, {selectedTrip.startLng.toFixed(5)}</div>
                {selectedTrip.endLat !== null && selectedTrip.endLat !== undefined && (
                  <div>End: {selectedTrip.endLat.toFixed(5)}, {selectedTrip.endLng?.toFixed(5)}</div>
                )}
              </div>
            </div>

            {selectedTrip.booking && (
              <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Linked booking
                </span>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {selectedTrip.booking.bookingNumber}
                </div>
                <div className="text-slate-600">{selectedTrip.booking.purpose}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
