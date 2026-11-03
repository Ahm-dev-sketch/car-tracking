'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { InterventionQueue } from '@/components/admin/InterventionQueue';

interface AdminStats {
  vehicles: {
    total: number;
    available: number;
    reserved: number;
    inUse: number;
    maintenance: number;
    inactive: number;
  };
  drivers: {
    online: number;
    busy: number;
    offline: number;
  };
  bookings: {
    active: number;
    searching: number;
    unassigned: number;
    adminIntervention: number;
  };
  byLocation: Array<{
    locationId: string;
    name: string;
    code: string;
    vehicles: number;
    drivers: number;
    bookings: number;
  }>;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTripsList, setActiveTripsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      const [statsRes, tripsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/trips?status=ACTIVE&limit=5'),
      ]);

      if (statsRes.ok) {
        const json = await statsRes.json();
        setStats(json.data || null);
      }

      if (tripsRes.ok) {
        const atJson = await tripsRes.json();
        setActiveTripsList(atJson.data || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Fleet Command Center</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Operational hubs overview, auto-dispatch telemetry, and intervention queue
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/fleet"
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>🛰️ Live Fleet Map</span>
          </Link>
          <Link
            href="/admin/bookings"
            className="px-3.5 py-1.5 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-medium cursor-pointer"
          >
            Manage Bookings
          </Link>
        </div>
      </div>

      {/* ADMIN INTERVENTION QUEUE */}
      <InterventionQueue onAssigned={loadStats} />

      {/* KPI METRIC CARDS */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
          Fleet Health & Dispatch Metrics
        </h2>

        {/* Vehicles KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
              Total Fleet
            </span>
            <div className="mt-1 text-2xl font-bold text-zinc-900">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.vehicles.total}
            </div>
            <span className="text-[10px] text-zinc-500">Registered assets</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
              Available
            </span>
            <div className="mt-1 text-2xl font-bold text-emerald-700">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.vehicles.available}
            </div>
            <span className="text-[10px] text-zinc-500">Ready for dispatch</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">
              Reserved
            </span>
            <div className="mt-1 text-2xl font-bold text-amber-700">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.vehicles.reserved}
            </div>
            <span className="text-[10px] text-zinc-500">Assigned to booking</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
              In Use
            </span>
            <div className="mt-1 text-2xl font-bold text-blue-700">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.vehicles.inUse}
            </div>
            <span className="text-[10px] text-zinc-500">On active trip</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
              Maintenance
            </span>
            <div className="mt-1 text-2xl font-bold text-zinc-700">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.vehicles.maintenance}
            </div>
            <span className="text-[10px] text-zinc-500">Service workshop</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-500 block">
              Inactive
            </span>
            <div className="mt-1 text-2xl font-bold text-rose-700">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.vehicles.inactive}
            </div>
            <span className="text-[10px] text-zinc-500">Decommissioned</span>
          </div>
        </div>

        {/* Drivers & Bookings summary row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Drivers */}
          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">
              Drivers Online
            </span>
            <div className="mt-1 text-xl font-bold text-emerald-800">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.drivers.online}
            </div>
            <span className="text-[10px] text-zinc-500">GPS active</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
              Drivers Busy
            </span>
            <div className="mt-1 text-xl font-bold text-blue-800">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.drivers.busy}
            </div>
            <span className="text-[10px] text-zinc-500">On trip</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">
              Drivers Offline
            </span>
            <div className="mt-1 text-xl font-bold text-zinc-600">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.drivers.offline}
            </div>
            <span className="text-[10px] text-zinc-500">Standby</span>
          </div>

          {/* Bookings */}
          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">
              Active Trips
            </span>
            <div className="mt-1 text-xl font-bold text-indigo-800">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.bookings.active}
            </div>
            <span className="text-[10px] text-zinc-500">Assigned / En Route</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">
              Searching Driver
            </span>
            <div className="mt-1 text-xl font-bold text-amber-800">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.bookings.searching}
            </div>
            <span className="text-[10px] text-zinc-500">Auto-dispatch</span>
          </div>

          <div className="p-3 bg-white border border-zinc-200 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">
              Unassigned
            </span>
            <div className="mt-1 text-xl font-bold text-zinc-700">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.bookings.unassigned}
            </div>
            <span className="text-[10px] text-zinc-500">No driver available</span>
          </div>

          <div className="p-3 bg-white border border-orange-200 bg-orange-50/40 rounded-lg">
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-700 block">
              Intervention
            </span>
            <div className="mt-1 text-xl font-bold text-orange-900">
              {isLoading || !stats ? <Spinner size="sm" /> : stats.bookings.adminIntervention}
            </div>
            <span className="text-[10px] text-orange-800 font-medium">Needs assign</span>
          </div>
        </div>
      </div>

      {/* BY-LOCATION BREAKDOWN */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Operational Locations Breakdown
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Asset distribution and active workload partitioned by operational base
            </p>
          </div>
          <span className="text-xs text-zinc-400 font-mono">
            {stats?.byLocation.length || 0} OPERATIONAL HUBS
          </span>
        </div>

        {isLoading || !stats ? (
          <div className="py-12 text-center text-zinc-500 text-xs">
            <Spinner size="sm" className="mr-2" /> Loading operational locations...
          </div>
        ) : stats.byLocation.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-xs italic">
            No operational locations configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.byLocation.map((loc) => (
              <div
                key={loc.locationId}
                className="p-4 border border-zinc-200 rounded-lg bg-zinc-50/50 hover:bg-zinc-50 transition-colors space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                  <div className="font-bold text-sm text-zinc-900">{loc.name}</div>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-zinc-800 text-white rounded">
                    {loc.code}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 bg-white rounded border border-zinc-200">
                    <span className="text-[10px] uppercase font-bold text-zinc-400 block">Vehicles</span>
                    <span className="text-base font-bold text-zinc-900">{loc.vehicles}</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-zinc-200">
                    <span className="text-[10px] uppercase font-bold text-emerald-600 block">Drivers</span>
                    <span className="text-base font-bold text-emerald-700">{loc.drivers}</span>
                  </div>
                  <div className="p-2 bg-white rounded border border-zinc-200">
                    <span className="text-[10px] uppercase font-bold text-indigo-600 block">Trips</span>
                    <span className="text-base font-bold text-indigo-700">{loc.bookings}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <Link
                    href={`/admin/vehicles?locationId=${loc.locationId}`}
                    className="text-zinc-600 hover:text-zinc-900 font-medium"
                  >
                    Vehicles →
                  </Link>
                  <Link
                    href={`/admin/bookings?locationId=${loc.locationId}`}
                    className="text-zinc-600 hover:text-zinc-900 font-medium"
                  >
                    Bookings →
                  </Link>
                  <Link
                    href={`/admin/fleet?locationId=${loc.locationId}`}
                    className="text-zinc-600 hover:text-zinc-900 font-medium"
                  >
                    Map →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ACTIVE TRIPS PREVIEW */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
              Active Trips Broadcast ({activeTripsList.length})
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">Vehicles currently underway on live routes</p>
          </div>
          <Link
            href="/admin/fleet"
            className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:underline"
          >
            Live Tracking Map →
          </Link>
        </div>

        {activeTripsList.length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-xs italic">
            No active trips currently in progress.
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {activeTripsList.map((t) => (
              <div key={t.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                <div>
                  <div className="font-mono font-bold text-zinc-900">{t.vehicle?.plateNumber}</div>
                  <div className="text-zinc-600">
                    {t.booking ? `${t.booking.pickupLocation} → ${t.booking.destination}` : 'Ad-hoc trip'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-zinc-800">
                    Driver: {t.driver?.user?.name || 'Assigned Driver'}
                  </div>
                  <div className="text-zinc-400 text-[11px]">
                    Started <RelativeTime date={t.startedAt} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
