'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { IosInstallHint } from '@/components/providers/InstallPrompt';
import { Icon as OverviewIcon } from '@/components/ui/Icon';

interface Booking {
  id: string;
  bookingNumber: string;
  pickupLocation: string;
  destination: string;
  departureAt: string;
  expectedReturnAt: string;
  passengerCount: number;
  purpose: string;
  status: string;
  createdAt: string;
  vehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
  } | null;
  driver?: {
    id: string;
    user: {
      name: string;
      phone: string;
    };
  } | null;
}


const primaryAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-400 px-5 py-2.5 text-sm font-black text-black shadow-[3px_3px_0px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all outline-none';
const secondaryAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] hover:bg-amber-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all outline-none';

export default function UserOverviewPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availableCount, setAvailableCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [bookingsRes, vehiclesRes] = await Promise.all([
          fetch('/api/bookings?limit=5'),
          fetch('/api/vehicles?status=AVAILABLE&limit=1'),
        ]);

        if (bookingsRes.ok) {
          const bJson = await bookingsRes.json();
          setBookings(bJson.data || []);
        }

        if (vehiclesRes.ok) {
          const vJson = await vehiclesRes.json();
          setAvailableCount(vJson.pagination?.total ?? 0);
        }
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const activeBooking = bookings.find((b) =>
    [
      'SEARCHING_DRIVER',
      'DRIVER_NOTIFIED',
      'DRIVER_ASSIGNED',
      'DRIVER_EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'APPROVED',
    ].includes(b.status)
  );

  const upcomingBooking = bookings
    .filter((b) => new Date(b.departureAt) > new Date() && b.status !== 'CANCELLED' && b.status !== 'REJECTED')
    .sort((a, b) => new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime())[0];

  return (
    <div className="min-w-0 space-y-7 pb-[max(1rem,env(safe-area-inset-bottom))] text-black sm:space-y-9">
      <IosInstallHint />

      <header className="page-intro flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div><span className="eyebrow">FleetTrack / Your workspace</span></div>
          <h1 className="page-heading mt-2 text-3xl font-black tracking-tight sm:text-4xl">Let’s get you moving.</h1>
          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-zinc-600">Your journeys, without the back and forth.</p>
        </div>
        <div className="flex flex-col gap-2.5 min-[380px]:flex-row sm:shrink-0">
          <Link href="/user/vehicles" className={primaryAction}>
            <OverviewIcon name="plus" className="h-[18px] w-[18px]" />
            Book a vehicle
          </Link>
          <Link href="/user/tracking" className={secondaryAction}>
            <OverviewIcon name="tracking" className="h-[18px] w-[18px]" />
            Live tracking
          </Link>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-5">
        <section aria-labelledby="active-booking-heading" aria-busy={isLoading} className="min-w-0">
          <div className="flex h-full flex-col rounded-2xl border-[3px] border-black bg-white p-5 sm:p-7 shadow-[6px_6px_0px_0px_#000]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span className="eyebrow">In focus</span>
                <h2 id="active-booking-heading" className="mt-2 text-xl font-extrabold tracking-tight sm:text-2xl">Your active booking</h2>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border-2 border-black bg-emerald-300 text-black shadow-[2px_2px_0px_0px_#000]">
                <OverviewIcon name="route" />
              </div>
            </div>

            {isLoading ? (
              <div role="status" className="flex min-h-72 flex-1 flex-col items-center justify-center gap-4 text-sm font-bold text-zinc-600">
                <Spinner size="md" className="text-black" />
                Finding your latest journey...
              </div>
            ) : activeBooking ? (
              <div className="mt-6 flex flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="break-all font-mono font-black text-xs tracking-wide text-black bg-zinc-100 border border-black px-2 py-0.5 rounded-md">{activeBooking.bookingNumber}</span>
                  <StatusBadge status={activeBooking.status} />
                </div>

                <div className="relative my-6 space-y-6 pl-8">
                  <span aria-hidden="true" className="absolute bottom-5 left-[7px] top-4 border-l-2 border-dashed border-black" />
                  <div className="relative">
                    <span aria-hidden="true" className="absolute -left-8 top-1 flex h-4 w-4 items-center justify-center rounded-md border-2 border-black bg-white"><span className="h-1.5 w-1.5 rounded-full bg-black" /></span>
                    <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Pickup</p>
                    <p className="mt-1 break-words text-base font-bold leading-snug text-black">{activeBooking.pickupLocation}</p>
                  </div>
                  <div className="relative">
                    <span aria-hidden="true" className="absolute -left-8 top-1 flex h-4 w-4 items-center justify-center rounded-md border-2 border-black bg-emerald-400"><span className="h-1.5 w-1.5 rounded-full bg-black" /></span>
                    <p className="text-[11px] font-black uppercase tracking-wider text-zinc-500">Destination</p>
                    <p className="mt-1 break-words text-xl font-extrabold leading-snug tracking-tight text-black sm:text-2xl">{activeBooking.destination}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 rounded-xl border-2 border-black bg-amber-50/70 p-3.5 shadow-[2px_2px_0px_0px_#000]">
                  <OverviewIcon name="car" className="h-6 w-6 shrink-0 text-black" />
                  <div className="min-w-0">
                    {activeBooking.vehicle ? (
                      <>
                        <p className="break-words text-sm font-extrabold text-black">{activeBooking.vehicle.brand} {activeBooking.vehicle.model}</p>
                        <p className="mt-0.5 break-words font-mono font-bold text-xs text-zinc-700">{activeBooking.vehicle.plateNumber}</p>
                      </>
                    ) : (
                      <p className="text-sm font-semibold text-zinc-700">Vehicle assignment pending</p>
                    )}
                    {activeBooking.driver && <p className="mt-1 break-words text-xs font-bold text-zinc-800">Driver &middot; {activeBooking.driver.user.name}</p>}
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 text-xs font-semibold text-zinc-600">
                  <OverviewIcon name="calendar" className="h-4 w-4 shrink-0 text-black" />
                  <span>Departure &middot; <time dateTime={activeBooking.departureAt}>{new Date(activeBooking.departureAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span>
                </div>

                <div className="mt-auto flex flex-col gap-2.5 pt-6 min-[380px]:flex-row">
                  <Link href="/user/bookings" className={`${secondaryAction} flex-1`}>
                    View booking
                    <OverviewIcon name="arrow" className="h-4 w-4" />
                  </Link>
                  {activeBooking.vehicle && ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(activeBooking.status) && (
                    <Link href={`/user/tracking?vehicleId=${activeBooking.vehicle.id}`} className={`${primaryAction} flex-1`}>
                      <OverviewIcon name="tracking" className="h-4 w-4" />
                      Track vehicle
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-start justify-center py-7 sm:py-9">
                <svg viewBox="0 0 240 84" fill="none" className="mb-5 h-20 w-full max-w-60 text-black" aria-hidden="true">
                  <path d="M18 59h57a17 17 0 0 0 17-17V32a17 17 0 0 1 17-17h39a17 17 0 0 1 17 17v10a17 17 0 0 0 17 17h39" stroke="currentColor" strokeOpacity=".2" strokeWidth="12" />
                  <path d="M18 59h57a17 17 0 0 0 17-17V32a17 17 0 0 1 17-17h39a17 17 0 0 1 17 17v10a17 17 0 0 0 17 17h39" stroke="currentColor" strokeWidth="2.5" strokeDasharray="4 6" />
                  <circle cx="18" cy="59" r="6" fill="#fef08a" stroke="currentColor" strokeWidth="2.5" />
                  <circle cx="221" cy="59" r="6" fill="#10b981" stroke="currentColor" strokeWidth="2.5" />
                </svg>
                <h3 className="text-2xl font-black leading-tight tracking-tight sm:text-3xl">A clear road ahead.</h3>
                <p className="mt-2 max-w-sm text-sm font-semibold leading-relaxed text-zinc-600">No active booking right now. Find a vehicle for your next work trip when you’re ready.</p>
                <Link href="/user/vehicles" className={`${primaryAction} mt-6`}>
                  Book a vehicle
                  <OverviewIcon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        <div className="grid min-w-0 gap-4 lg:gap-5">
          <section aria-labelledby="next-departure-heading" className="min-w-0">
            <div className="h-full rounded-2xl border-[2.5px] border-black bg-white p-5 sm:p-6 shadow-[5px_5px_0px_0px_#000]">
              <div className="flex items-center justify-between gap-3">
                <h2 id="next-departure-heading" className="text-xs font-black uppercase tracking-wider text-zinc-600">Next departure</h2>
                <OverviewIcon name="calendar" className="h-5 w-5 text-black" />
              </div>
              {isLoading ? (
                <div role="status" className="flex min-h-28 items-center gap-3 text-sm font-bold text-zinc-600"><Spinner size="sm" className="text-black" />Checking your schedule...</div>
              ) : upcomingBooking ? (
                <div className="mt-5">
                  <time dateTime={upcomingBooking.departureAt} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-3xl font-black tracking-tight text-black">{new Date(upcomingBooking.departureAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                    <span className="text-sm font-mono font-bold text-zinc-700 bg-amber-200 border border-black px-2 py-0.5 rounded-md">{new Date(upcomingBooking.departureAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </time>
                  <p className="mt-3 flex items-start gap-2 text-sm font-bold text-black"><OverviewIcon name="arrow" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><span className="break-words">{upcomingBooking.destination}</span></p>
                </div>
              ) : (
                <div className="mt-5">
                  <p className="text-xl font-extrabold tracking-tight text-black">Nothing scheduled yet.</p>
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-zinc-600">Your next departure will appear here once you book.</p>
                </div>
              )}
            </div>
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
            <section aria-labelledby="fleet-heading" className="min-w-0 rounded-2xl border-[2.5px] border-black bg-white p-5 sm:p-6 shadow-[4px_4px_0px_0px_#000]">
              <OverviewIcon name="car" className="mb-4 h-6 w-6 text-black" />
              <h2 id="fleet-heading" className="text-xs font-black uppercase tracking-wider text-zinc-600">Available fleet</h2>
              <div className="metric-value mt-2 text-4xl font-black tracking-tight text-emerald-700">{isLoading ? <Spinner size="sm" className="text-black" /> : availableCount}</div>
              <p className="mt-2 text-xs font-semibold text-zinc-600">Vehicles ready for assignment</p>
            </section>
            <section aria-labelledby="recent-count-heading" className="min-w-0 rounded-2xl border-[2.5px] border-black bg-white p-5 sm:p-6 shadow-[4px_4px_0px_0px_#000]">
              <OverviewIcon name="bookings" className="mb-4 h-6 w-6 text-black" />
              <h2 id="recent-count-heading" className="text-xs font-black uppercase tracking-wider text-zinc-600">Recent bookings</h2>
              <div className="metric-value mt-2 text-4xl font-black tracking-tight text-black">{isLoading ? <Spinner size="sm" className="text-black" /> : bookings.length}</div>
              <p className="mt-2 text-xs font-semibold text-zinc-600">In your latest activity</p>
            </section>
          </div>
        </div>
      </div>

      <section aria-labelledby="recent-bookings-heading" className="min-w-0">
        <div className="rounded-2xl border-[3px] border-black bg-white px-5 py-5 sm:px-7 sm:py-6 shadow-[6px_6px_0px_0px_#000]">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <div>
              <span className="eyebrow">Your journey log</span>
              <h2 id="recent-bookings-heading" className="mt-2 text-xl font-extrabold tracking-tight text-black">Recent bookings</h2>
            </div>
            <Link href="/user/bookings" className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-black bg-amber-300 px-3.5 py-1 text-xs font-black text-black shadow-[2px_2px_0px_0px_#000] hover:bg-amber-400 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">
              View all
              <OverviewIcon name="arrow" className="h-4 w-4" />
            </Link>
          </div>

          {isLoading ? (
            <div role="status" className="flex flex-col items-center justify-center gap-4 py-16 text-sm font-bold text-zinc-600">
              <Spinner size="md" className="text-black" />
              Loading your recent bookings...
            </div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center sm:py-16">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border-2 border-black bg-amber-200 text-black shadow-[3px_3px_0px_0px_#000]"><OverviewIcon name="bookings" className="h-6 w-6" /></div>
              <h3 className="text-lg font-black tracking-tight text-black">Your first journey starts here.</h3>
              <p className="mt-2 max-w-sm text-sm font-semibold leading-relaxed text-zinc-600">You haven’t requested any vehicle bookings yet. Browse the fleet to find your next ride.</p>
              <Link href="/user/vehicles" className={`${secondaryAction} mt-6`}>Browse vehicles<OverviewIcon name="arrow" className="h-4 w-4" /></Link>
            </div>
          ) : (
            <ul className="mt-5 divide-y-2 divide-black/10">
              {bookings.map((booking) => (
                <li key={booking.id} className="flex min-w-0 flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center sm:gap-6">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-amber-100 text-black shadow-[2px_2px_0px_0px_#000] min-[380px]:flex"><OverviewIcon name="route" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <span className="break-all font-mono font-black text-xs text-black bg-zinc-100 border border-black px-1.5 py-0.5 rounded">{booking.bookingNumber}</span>
                        <StatusBadge status={booking.status} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold leading-relaxed text-black">
                        <span className="wrap-anywhere">{booking.pickupLocation}</span>
                        <OverviewIcon name="arrow" className="h-3.5 w-3.5 shrink-0 text-black" />
                        <span className="wrap-anywhere underline decoration-emerald-500 decoration-2">{booking.destination}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-zinc-600">
                        <span>Depart <time dateTime={booking.departureAt}>{new Date(booking.departureAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></span>
                        <span>Created <RelativeTime date={booking.createdAt} /></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 min-[380px]:pl-14 sm:pl-0">
                    {booking.vehicle && ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(booking.status) && (
                      <Link href={`/user/tracking?vehicleId=${booking.vehicle.id}`} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-emerald-400 px-3 py-1.5 text-xs font-black text-black shadow-[2px_2px_0px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">
                        <OverviewIcon name="tracking" className="h-4 w-4" />
                        Track
                      </Link>
                    )}
                    <Link href="/user/bookings" className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border-2 border-black bg-white px-3 py-1.5 text-xs font-bold text-black shadow-[2px_2px_0px_0px_#000] hover:bg-amber-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all">
                      Details
                      <OverviewIcon name="arrow" className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
