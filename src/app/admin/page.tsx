'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { InterventionQueue } from '@/components/admin/InterventionQueue';
import { Icon } from '@/components/ui/Icon';
import { GreetingClock } from '@/components/ui/GreetingClock';

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

interface ActiveTripPreview {
  id: string;
  startedAt: string;
  vehicle?: { plateNumber: string } | null;
  booking?: { pickupLocation: string; destination: string } | null;
  driver?: { user?: { name: string } | null } | null;
}

export default function AdminOverviewPage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [activeTripsList, setActiveTripsList] = useState<ActiveTripPreview[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadStats = async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
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
      if (isInitial) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStats(true);
    const interval = setInterval(() => loadStats(false), 20000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-w-0 space-y-6 text-zinc-900 sm:space-y-8">
      <GreetingClock userName={session?.user?.name} roleLabel="Operations Admin" />

      <header className="page-intro">
        <div>
          <p className="eyebrow">FleetTrack / Operations overview</p>
          <h1 className="page-heading mt-2">Fleet at a glance</h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-500">A clear view of your vehicles, people, and journeys. Ready for the decisions ahead.</p>
        </div>
        <div className="flex flex-col gap-2 min-[380px]:flex-row sm:flex-wrap sm:justify-end">
          <Link href="/admin/fleet" className="button-primary">
            <Icon name="pin" />Live fleet map
          </Link>
          <Link href="/admin/bookings" className="button-secondary">
            <Icon name="calendar" />Manage bookings
          </Link>
        </div>
      </header>

      <section aria-label="Fleet overview metrics" className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-5">
        {[
          { label: 'Available fleet', value: stats?.vehicles.available, caption: 'Ready for dispatch', icon: 'car' as const, accent: true },
          { label: 'Active trips', value: stats?.bookings.active, caption: 'Assigned / en route', icon: 'route' as const, accent: false },
          { label: 'Online drivers', value: stats?.drivers.online, caption: 'GPS active', icon: 'users' as const, accent: false },
        ].map((metric) => (
          <div key={metric.label} className="surface flex flex-col justify-between p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-600">{metric.label}</h2>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-emerald-300 text-zinc-950 shadow-[2px_2px_0px_0px_#000]"><Icon name={metric.icon} /></span>
            </div>
            <div className={`metric-value mt-4 text-4xl font-black ${metric.accent ? 'text-emerald-700' : 'text-zinc-950'}`}>
              {isLoading || !stats ? <Spinner size="md" /> : metric.value}
            </div>
            <p className="mt-2 text-xs font-semibold text-zinc-600">{metric.caption}</p>
          </div>
        ))}
      </section>

      <InterventionQueue onAssigned={loadStats} />

      <section aria-labelledby="fleet-health-heading" className="surface px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">The operational picture</p>
            <h2 id="fleet-health-heading" className="section-title mt-2">Fleet health & dispatch</h2>
          </div>
          <p className="flex items-center gap-2 text-xs font-semibold text-zinc-600"><Icon name="clock" className="h-4 w-4" />Refreshes every 20 seconds</p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-5 sm:grid-cols-3 xl:grid-cols-5 xl:gap-x-8">
          {[
            { label: 'Total fleet', value: stats?.vehicles.total, caption: 'Registered assets', attention: false },
            { label: 'Reserved', value: stats?.vehicles.reserved, caption: 'Assigned to a booking', attention: false },
            { label: 'In use', value: stats?.vehicles.inUse, caption: 'On an active trip', attention: false },
            { label: 'Maintenance', value: stats?.vehicles.maintenance, caption: 'Service workshop', attention: false },
            { label: 'Inactive', value: stats?.vehicles.inactive, caption: 'Decommissioned', attention: false },
            { label: 'Busy drivers', value: stats?.drivers.busy, caption: 'On a trip', attention: false },
            { label: 'Offline drivers', value: stats?.drivers.offline, caption: 'On standby', attention: false },
            { label: 'Searching for a driver', value: stats?.bookings.searching, caption: 'Auto-dispatch', attention: false },
            { label: 'Unassigned bookings', value: stats?.bookings.unassigned, caption: 'No driver available', attention: false },
            { label: 'Intervention', value: stats?.bookings.adminIntervention, caption: 'Needs assignment', attention: true },
          ].map((metric) => (
            <div key={metric.label} className="min-w-0 border-t-2 border-black/10 py-4">
              <dt className={`min-h-10 text-xs font-bold leading-relaxed ${metric.attention ? 'text-amber-800' : 'text-zinc-600'}`}>{metric.label}</dt>
              <dd className={`mt-1 text-2xl font-black tracking-tight tabular-nums ${metric.attention ? 'text-amber-800' : 'text-zinc-950'}`}>
                {isLoading || !stats ? <Spinner size="sm" /> : metric.value}
              </dd>
              <dd className={`mt-1 text-xs font-medium ${metric.attention ? 'text-amber-800' : 'text-zinc-500'}`}>{metric.caption}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="active-trips-heading" className="surface px-5 py-6 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">On the road</p>
            <h2 id="active-trips-heading" className="section-title mt-2">Active trips <span className="ml-2 rounded-md border-2 border-black bg-zinc-100 px-2 py-0.5 text-xs font-black text-zinc-900 shadow-[1px_1px_0px_0px_#000]">{activeTripsList.length} shown</span></h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-600">Vehicles currently underway on live routes.</p>
          </div>
          <Link href="/admin/fleet" className="button-secondary">
            Live tracking map<Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>

        {activeTripsList.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            {isLoading ? (
              <div role="status" className="flex items-center gap-3 text-sm font-bold text-zinc-600"><Spinner size="md" />Loading active trips...</div>
            ) : (
              <>
                <span className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-emerald-200 text-zinc-950 shadow-[2px_2px_0px_0px_#000]"><Icon name="route" /></span>
                <p className="text-base font-black text-zinc-900">No trips underway right now.</p>
                <p className="max-w-sm text-xs font-medium leading-relaxed text-zinc-600">Active journeys will appear here as drivers start their trips.</p>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-5 divide-y-2 divide-black/10">
            {activeTripsList.map((t) => (
              <li key={t.id} className="flex min-w-0 flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-amber-200 text-zinc-950 shadow-[2px_2px_0px_0px_#000]"><Icon name="car" /></span>
                  <div className="min-w-0">
                    <p className="wrap-anywhere font-mono text-sm font-black text-zinc-950">{t.vehicle?.plateNumber}</p>
                    <p className="mt-1 wrap-anywhere text-sm font-medium leading-relaxed text-zinc-700">{t.booking ? `${t.booking.pickupLocation} → ${t.booking.destination}` : 'Ad-hoc trip'}</p>
                  </div>
                </div>
                <div className="min-w-0 pl-14 sm:max-w-[45%] sm:pl-0 sm:text-right">
                  <p className="wrap-anywhere text-sm font-bold text-zinc-800">Driver: {t.driver?.user?.name || 'Assigned driver'}</p>
                  <p className="mt-1 text-xs font-medium leading-relaxed text-zinc-500">Started <RelativeTime date={t.startedAt} /></p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="locations-heading" className="surface min-w-0 space-y-6 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Across your network</p>
            <h2 id="locations-heading" className="section-title mt-2">Operational locations</h2>
            <p className="mt-2 text-sm font-medium leading-relaxed text-zinc-600">Fleet distribution and active workload at each base.</p>
          </div>
          <span className="rounded-md border-2 border-black bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-900 shadow-[1px_1px_0px_0px_#000]">{stats?.byLocation.length || 0} operational hubs</span>
        </div>

        {isLoading || !stats ? (
          <div role="status" className="flex items-center justify-center gap-3 py-12 text-sm font-bold text-zinc-600"><Spinner size="md" />Loading operational locations...</div>
        ) : stats.byLocation.length === 0 ? (
          <div className="rounded-2xl border-2 border-black bg-zinc-50 px-5 py-10 text-center shadow-[3px_3px_0px_0px_#000]">
            <Icon name="pin" className="mx-auto mb-4 h-6 w-6 text-emerald-800" />
            <p className="text-base font-black text-zinc-900">No operational locations configured.</p>
            <p className="mt-2 text-xs font-medium leading-relaxed text-zinc-600">Your base-by-base fleet overview will appear here when locations are available.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {stats.byLocation.map((loc) => (
              <article key={loc.locationId} className="min-w-0 rounded-2xl border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_#000]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="wrap-anywhere text-base font-black tracking-tight text-zinc-950">{loc.name}</h3>
                  <span className="shrink-0 rounded-md border-2 border-black bg-emerald-200 px-2.5 py-1 font-mono text-xs font-black text-zinc-950 shadow-[1px_1px_0px_0px_#000]">{loc.code}</span>
                </div>
                <dl className="my-5 grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-black bg-zinc-50 p-2 text-center"><dt className="text-[10px] font-black uppercase text-zinc-500">Vehicles</dt><dd className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{loc.vehicles}</dd></div>
                  <div className="rounded-lg border border-black bg-emerald-50 p-2 text-center"><dt className="text-[10px] font-black uppercase text-emerald-800">Drivers</dt><dd className="mt-1 text-2xl font-black tabular-nums text-emerald-800">{loc.drivers}</dd></div>
                  <div className="rounded-lg border border-black bg-zinc-50 p-2 text-center"><dt className="text-[10px] font-black uppercase text-zinc-500">Trips</dt><dd className="mt-1 text-2xl font-black tabular-nums text-zinc-900">{loc.bookings}</dd></div>
                </dl>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t-2 border-black/10 pt-3">
                  <Link href={`/admin/vehicles?locationId=${loc.locationId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black bg-zinc-100 px-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-200 shadow-[1px_1px_0px_0px_#000]">Vehicles<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                  <Link href={`/admin/bookings?locationId=${loc.locationId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black bg-zinc-100 px-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-200 shadow-[1px_1px_0px_0px_#000]">Bookings<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                  <Link href={`/admin/fleet?locationId=${loc.locationId}`} className="inline-flex min-h-9 items-center gap-1 rounded-md border border-black bg-zinc-100 px-2.5 text-xs font-bold text-zinc-900 hover:bg-zinc-200 shadow-[1px_1px_0px_0px_#000]">Map<Icon name="arrow" className="h-3.5 w-3.5" /></Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
