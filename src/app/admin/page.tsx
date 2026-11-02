'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';

interface StatsData {
  totalVehicles: number;
  availableVehicles: number;
  inUseVehicles: number;
  activeTrips: number;
  pendingBookings: number;
  activeDrivers: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<StatsData>({
    totalVehicles: 0,
    availableVehicles: 0,
    inUseVehicles: 0,
    activeTrips: 0,
    pendingBookings: 0,
    activeDrivers: 0,
  });
  const [pendingList, setPendingList] = useState<any[]>([]);
  const [activeTripsList, setActiveTripsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setIsLoading(true);
      try {
        const [
          allVehiclesRes,
          availableVehiclesRes,
          inUseVehiclesRes,
          activeTripsRes,
          pendingBookingsRes,
          activeDriversRes,
        ] = await Promise.all([
          fetch('/api/vehicles?limit=1'),
          fetch('/api/vehicles?status=AVAILABLE&limit=1'),
          fetch('/api/vehicles?status=IN_USE&limit=1'),
          fetch('/api/trips?status=ACTIVE&limit=5'),
          fetch('/api/bookings?status=PENDING&limit=5'),
          fetch('/api/drivers?status=AVAILABLE&limit=1'),
        ]);

        const totalVehicles = allVehiclesRes.ok ? (await allVehiclesRes.json()).pagination?.total ?? 0 : 0;
        const availableVehicles = availableVehiclesRes.ok ? (await availableVehiclesRes.json()).pagination?.total ?? 0 : 0;
        const inUseVehicles = inUseVehiclesRes.ok ? (await inUseVehiclesRes.json()).pagination?.total ?? 0 : 0;
        
        let activeTripsCount = 0;
        if (activeTripsRes.ok) {
          const atJson = await activeTripsRes.json();
          activeTripsCount = atJson.pagination?.total ?? (atJson.data?.length || 0);
          setActiveTripsList(atJson.data || []);
        }

        let pendingBookingsCount = 0;
        if (pendingBookingsRes.ok) {
          const pbJson = await pendingBookingsRes.json();
          pendingBookingsCount = pbJson.pagination?.total ?? (pbJson.data?.length || 0);
          setPendingList(pbJson.data || []);
        }

        const activeDrivers = activeDriversRes.ok ? (await activeDriversRes.json()).pagination?.total ?? 0 : 0;

        setStats({
          totalVehicles,
          availableVehicles,
          inUseVehicles,
          activeTrips: activeTripsCount,
          pendingBookings: pendingBookingsCount,
          activeDrivers,
        });
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Fleet Administration</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Fleet operations metrics, active tracking, and dispatch control</p>
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
            Review Bookings
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 bg-white border border-zinc-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block">Total Fleet</span>
          <div className="mt-1 text-2xl font-bold text-zinc-900">
            {isLoading ? <Spinner size="sm" /> : stats.totalVehicles}
          </div>
          <span className="text-[10px] text-zinc-500">Vehicles registered</span>
        </div>

        <div className="p-3.5 bg-white border border-zinc-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Available</span>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {isLoading ? <Spinner size="sm" /> : stats.availableVehicles}
          </div>
          <span className="text-[10px] text-zinc-500">Ready for trips</span>
        </div>

        <div className="p-3.5 bg-white border border-zinc-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">In Use</span>
          <div className="mt-1 text-2xl font-bold text-blue-700">
            {isLoading ? <Spinner size="sm" /> : stats.inUseVehicles}
          </div>
          <span className="text-[10px] text-zinc-500">Currently dispatched</span>
        </div>

        <div className="p-3.5 bg-white border border-zinc-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Active Trips</span>
          <div className="mt-1 text-2xl font-bold text-indigo-700">
            {isLoading ? <Spinner size="sm" /> : stats.activeTrips}
          </div>
          <span className="text-[10px] text-zinc-500">Realtime tracking</span>
        </div>

        <div className="p-3.5 bg-white border border-zinc-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Pending</span>
          <div className="mt-1 text-2xl font-bold text-amber-700">
            {isLoading ? <Spinner size="sm" /> : stats.pendingBookings}
          </div>
          <span className="text-[10px] text-zinc-500">Awaiting approval</span>
        </div>

        <div className="p-3.5 bg-white border border-zinc-200 rounded-lg">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">Active Drivers</span>
          <div className="mt-1 text-2xl font-bold text-zinc-900">
            {isLoading ? <Spinner size="sm" /> : stats.activeDrivers}
          </div>
          <span className="text-[10px] text-zinc-500">Ready for duty</span>
        </div>
      </div>

      {/* Two Column Layout: Pending Approvals & Live Trips */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Bookings Queue */}
        <div className="bg-white border border-zinc-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Pending Approvals ({stats.pendingBookings})
              </h2>
              <Link
                href="/admin/bookings?status=PENDING"
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:underline"
              >
                View all →
              </Link>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                <Spinner size="sm" className="mr-2" /> Loading pending requests...
              </div>
            ) : pendingList.length === 0 ? (
              <div className="py-10 text-center text-zinc-400 text-xs italic">
                No pending booking requests requiring approval.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {pendingList.map((b) => (
                  <div key={b.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-semibold text-zinc-900">{b.bookingNumber}</div>
                      <div className="text-zinc-600 truncate max-w-[200px]">
                        {b.pickupLocation} → {b.destination}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {b.passengerCount} pax • By {b.user?.name || b.user?.email}
                      </div>
                    </div>
                    <Link
                      href="/admin/bookings"
                      className="px-2.5 py-1 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white rounded"
                    >
                      Review
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live Trips Telemetry */}
        <div className="bg-white border border-zinc-200 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-800">
                Ongoing Trips ({stats.activeTrips})
              </h2>
              <Link
                href="/admin/fleet"
                className="text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:underline"
              >
                Fleet map →
              </Link>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-zinc-500 text-xs">
                <Spinner size="sm" className="mr-2" /> Loading active trips...
              </div>
            ) : activeTripsList.length === 0 ? (
              <div className="py-10 text-center text-zinc-400 text-xs italic">
                No active vehicle trips currently in progress.
              </div>
            ) : (
              <div className="divide-y divide-zinc-100">
                {activeTripsList.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-mono font-bold text-zinc-900">{t.vehicle.plateNumber}</div>
                      <div className="text-zinc-600">
                        Driver: <strong className="text-zinc-800">{t.driver.user.name}</strong>
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        Started <RelativeTime date={t.startedAt} />
                      </div>
                    </div>
                    <Link
                      href="/admin/fleet"
                      className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
                    >
                      Track
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
