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
          <div className="font-semibold text-zinc-900">
            {new Date(t.startedAt).toLocaleDateString([], {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          <div className="text-zinc-500">
            {new Date(t.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      header: 'Vehicle',
      cell: (t) => (
        <div className="text-xs">
          <span className="font-mono font-semibold text-zinc-900">{t.vehicle.plateNumber}</span>
          <span className="text-zinc-500 block">{t.vehicle.brand} {t.vehicle.model}</span>
        </div>
      ),
    },
    {
      header: 'Booking',
      cell: (t) =>
        t.booking ? (
          <div className="text-xs">
            <span className="font-semibold text-zinc-800">{t.booking.bookingNumber}</span>
            <span className="text-zinc-500 block truncate max-w-[150px]">{t.booking.purpose}</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-400 italic">Ad-hoc trip</span>
        ),
    },
    {
      header: 'Duration',
      cell: (t) => {
        if (!t.endedAt) return <span className="text-xs text-emerald-600 font-semibold">Active</span>;
        const diffMs = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
        const mins = Math.round(diffMs / 60000);
        return <span className="text-xs text-zinc-700">{mins} mins</span>;
      },
    },
    {
      header: 'Distance',
      cell: (t) => (
        <span className="text-xs font-mono text-zinc-700">
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
          className="px-2.5 py-1 text-xs border border-zinc-200 text-zinc-700 rounded hover:bg-zinc-50 cursor-pointer"
        >
          View
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-zinc-200">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">Trip History</h1>
        <p className="text-xs text-zinc-500 mt-0.5">Log of completed and active vehicle trips</p>
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
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">Status</span>
              <StatusBadge status={selectedTrip.status} />
            </div>

            <div className="space-y-2 pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">Timestamps</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-zinc-400 block text-[10px]">Started</span>
                  <span className="font-medium text-zinc-800">
                    {new Date(selectedTrip.startedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[10px]">Ended</span>
                  <span className="font-medium text-zinc-800">
                    {selectedTrip.endedAt ? new Date(selectedTrip.endedAt).toLocaleString() : 'In Progress'}
                  </span>
                </div>
              </div>
            </div>

            <div className="space-y-2 pb-3 border-b border-zinc-100">
              <span className="text-zinc-400 uppercase font-semibold">Coordinates</span>
              <div className="p-2.5 bg-zinc-50 rounded border border-zinc-200 font-mono text-[11px] space-y-1">
                <div>Start: {selectedTrip.startLat.toFixed(5)}, {selectedTrip.startLng.toFixed(5)}</div>
                {selectedTrip.endLat !== null && selectedTrip.endLat !== undefined && (
                  <div>End: {selectedTrip.endLat.toFixed(5)}, {selectedTrip.endLng?.toFixed(5)}</div>
                )}
              </div>
            </div>

            {selectedTrip.booking && (
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200 space-y-1">
                <span className="text-zinc-400 uppercase font-semibold block text-[10px]">
                  Linked Booking
                </span>
                <div className="font-bold text-zinc-900">{selectedTrip.booking.bookingNumber}</div>
                <div className="text-zinc-600">{selectedTrip.booking.purpose}</div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
