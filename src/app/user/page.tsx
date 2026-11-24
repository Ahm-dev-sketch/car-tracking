'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { IosInstallHint } from '@/components/providers/InstallPrompt';
import { Icon as OverviewIcon } from '@/components/ui/Icon';
import { GreetingClock } from '@/components/ui/GreetingClock';
import { selectNextDeparture } from '@/lib/booking-status';
import { MotionBentoCard } from '@/components/ui/MotionBentoCard';

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


const primaryAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';
const secondaryAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900';

export default function UserOverviewPage() {
  const { data: session, status } = useSession();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availableCount, setAvailableCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (status !== 'authenticated') return;
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
  }, [status]);

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

  const upcomingBooking = selectNextDeparture(bookings);

  return (
    <div className="min-w-0 space-y-6 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900 sm:space-y-8">
      <IosInstallHint />

      <GreetingClock userName={session?.user?.name} roleLabel="Passenger" />

      <header className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">KCIC Fleet / Passenger workspace</p>
          <h1 className="page-heading mt-2">Let&rsquo;s get you moving.</h1>
          <p className="mt-3 max-w-md text-sm font-medium leading-relaxed text-slate-500">
            Your journeys, without the back and forth.
          </p>
        </div>
        <div className="flex flex-col gap-2 min-[380px]:flex-row sm:shrink-0">
          <Link href="/user/vehicles" className={primaryAction}>
            <OverviewIcon name="plus" className="h-[18px] w-[18px]" />
            Pesan kendaraan
          </Link>
          <Link href="/user/tracking" className={secondaryAction}>
            <OverviewIcon name="tracking" className="h-[18px] w-[18px]" />
            Lacak langsung
          </Link>
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 items-stretch gap-3.5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-4">
        {/* Active booking */}
        <section aria-labelledby="active-booking-heading" aria-busy={isLoading} className="min-w-0">
          <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  In focus
                </p>
                <h2
                  id="active-booking-heading"
                  className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900"
                >
                  Booking aktif Anda
                </h2>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-600">
                <OverviewIcon name="route" />
              </div>
            </div>

            {isLoading ? (
              <div
                role="status"
                className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 text-sm font-medium text-slate-500"
              >
                <Spinner size="md" />
                Finding your latest journey...
              </div>
            ) : activeBooking ? (
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-slate-700 tabular-nums">
                    {activeBooking.bookingNumber}
                  </span>
                  <StatusBadge status={activeBooking.status} />
                </div>

                {/* Route spine */}
                <div className="relative my-5 space-y-5 pl-7">
                  <span
                    aria-hidden="true"
                    className="absolute bottom-2 left-[5px] top-2.5 border-l border-dashed border-slate-300"
                  />
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-7 top-1.5 size-2.5 rounded-full bg-slate-300 ring-2 ring-white"
                    />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Jemput
                    </p>
                    <p className="mt-1 wrap-anywhere text-sm font-medium leading-snug text-slate-600">
                      {activeBooking.pickupLocation}
                    </p>
                  </div>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -left-7 top-1.5 size-2.5 rounded-full bg-brand-600 ring-2 ring-white"
                    />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Tujuan
                    </p>
                    <p className="mt-1 wrap-anywhere text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">
                      {activeBooking.destination}
                    </p>
                  </div>
                </div>

                {/* Assigned vehicle */}
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                  <OverviewIcon name="car" className="size-5 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    {activeBooking.vehicle ? (
                      <>
                        <p className="wrap-anywhere text-sm font-semibold text-slate-900">
                          {activeBooking.vehicle.brand} {activeBooking.vehicle.model}
                        </p>
                        <p className="mt-0.5 font-mono text-xs font-medium text-slate-500 tabular-nums">
                          {activeBooking.vehicle.plateNumber}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-medium text-slate-500">Vehicle assignment pending</p>
                    )}
                    {activeBooking.driver && (
                      <p className="mt-1 wrap-anywhere text-xs font-medium text-slate-600">
                        Driver &middot; {activeBooking.driver.user.name}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-500">
                  <OverviewIcon name="calendar" className="size-4 shrink-0 text-slate-400" />
                  <span>
                    Departure &middot;{' '}
                    <time dateTime={activeBooking.departureAt} className="tabular-nums">
                      {new Date(activeBooking.departureAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                  </span>
                </div>

                <div className="mt-auto flex flex-col gap-2 pt-6 min-[380px]:flex-row">
                  <Link href="/user/bookings" className={`${secondaryAction} flex-1`}>
                    Lihat booking
                    <OverviewIcon name="arrow" className="h-4 w-4" />
                  </Link>
                  {activeBooking.vehicle &&
                    ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(activeBooking.status) && (
                      <Link
                        href={`/user/tracking?vehicleId=${activeBooking.vehicle.id}`}
                        className={`${primaryAction} flex-1`}
                      >
                        <OverviewIcon name="tracking" className="h-4 w-4" />
                        Lacak kendaraan
                      </Link>
                    )}
                </div>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-start justify-center px-6 py-10">
                <div className="mb-5 flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                  <OverviewIcon name="route" className="size-6" />
                </div>
                <h3 className="text-xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-2xl">
                  A clear road ahead.
                </h3>
                <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-slate-500">
                  Tidak ada booking aktif saat ini. Temukan kendaraan untuk perjalanan kerja Anda berikutnya.
                </p>
                <Link href="/user/vehicles" className={`${primaryAction} mt-6`}>
                  Pesan kendaraan
                  <OverviewIcon name="arrow" className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* Side column */}
        <div className="grid min-w-0 content-start gap-3.5 lg:gap-4">
          <section aria-labelledby="next-departure-heading" className="min-w-0">
            <MotionBentoCard index={1} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <h2
                  id="next-departure-heading"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                >
                  Next departure
                </h2>
                <OverviewIcon name="calendar" className="size-4 text-slate-400" />
              </div>
              {isLoading ? (
                <div
                  role="status"
                  className="flex min-h-28 items-center gap-2.5 px-4 text-sm font-medium text-slate-500"
                >
                  <Spinner size="sm" />
                  Checking your schedule...
                </div>
              ) : upcomingBooking ? (
                <div className="px-4 py-4">
                  <time
                    dateTime={upcomingBooking.departureAt}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  >
                    <span className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">
                      {new Date(upcomingBooking.departureAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                      {new Date(upcomingBooking.departureAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </time>
                  <p className="mt-3 flex items-start gap-2 text-sm font-medium text-slate-700">
                    <OverviewIcon name="arrow" className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    <span className="wrap-anywhere">{upcomingBooking.destination}</span>
                  </p>
                </div>
              ) : (
                <div className="px-4 py-4">
                  <p className="text-base font-semibold tracking-tight text-slate-900">
                    No upcoming trips scheduled.
                  </p>
                  <p className="mt-1.5 text-xs font-medium leading-relaxed text-slate-500">
                    Departure berikutnya akan muncul di sini setelah Anda memesan.
                  </p>
                </div>
              )}
            </MotionBentoCard>
          </section>

          <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 lg:gap-4">
            <section aria-labelledby="fleet-heading" className="min-w-0">
              <MotionBentoCard
                index={2}
                className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
              >
              <div className="flex items-center justify-between">
                <h2
                  id="fleet-heading"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                >
                  Available fleet
                </h2>
                <OverviewIcon name="car" className="size-4 text-slate-400" />
              </div>
              <div className="mt-2.5 font-mono text-3xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
                {isLoading ? <Spinner size="sm" /> : availableCount}
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-500">Vehicles ready for assignment</p>
              </MotionBentoCard>
            </section>
            <section aria-labelledby="recent-count-heading" className="min-w-0">
              <MotionBentoCard
                index={3}
                className="min-w-0 rounded-xl border border-slate-200 bg-white p-4"
              >
              <div className="flex items-center justify-between">
                <h2
                  id="recent-count-heading"
                  className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                >
                  Recent bookings
                </h2>
                <OverviewIcon name="bookings" className="size-4 text-slate-400" />
              </div>
              <div className="mt-2.5 font-mono text-3xl font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
                {isLoading ? <Spinner size="sm" /> : bookings.length}
              </div>
              <p className="mt-2 text-[11px] font-medium text-slate-500">In your latest activity</p>
              </MotionBentoCard>
            </section>
          </div>
        </div>
      </div>

      {/* Recent bookings */}
      <section aria-labelledby="recent-bookings-heading" className="min-w-0">
        <MotionBentoCard index={4} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Your journey log
              </p>
              <h2
                id="recent-bookings-heading"
                className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900"
              >
                Recent bookings
              </h2>
            </div>
            <Link
              href="/user/bookings"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Lihat semua
              <OverviewIcon name="arrow" className="h-3.5 w-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <div
              role="status"
              className="flex flex-col items-center justify-center gap-3 py-14 text-sm font-medium text-slate-500"
            >
              <Spinner size="md" />
              Loading your recent bookings...
            </div>
          ) : bookings.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center sm:py-16">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400">
                <OverviewIcon name="bookings" className="size-6" />
              </div>
              <h3 className="text-base font-semibold tracking-tight text-slate-900">
                Your first journey starts here.
              </h3>
              <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-slate-500">
                Anda belum pernah meminta booking kendaraan. Telusuri armada untuk perjalanan berikutnya.
              </p>
              <Link href="/user/vehicles" className={`${secondaryAction} mt-6`}>
                Browse vehicles
                <OverviewIcon name="arrow" className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex min-w-0 flex-col justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-6 sm:px-6"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="hidden size-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400 min-[380px]:flex">
                      <OverviewIcon name="route" className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                        <span className="wrap-anywhere rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-700 tabular-nums">
                          {booking.bookingNumber}
                        </span>
                        <StatusBadge status={booking.status} />
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-relaxed">
                        <span className="wrap-anywhere font-medium text-slate-500">
                          {booking.pickupLocation}
                        </span>
                        <OverviewIcon name="arrow" className="size-3.5 shrink-0 text-slate-300" />
                        <span className="wrap-anywhere font-semibold text-slate-900">
                          {booking.destination}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-slate-400">
                        <span>
                          Depart{' '}
                          <time dateTime={booking.departureAt} className="tabular-nums">
                            {new Date(booking.departureAt).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                        </span>
                        <span>
                          Created <RelativeTime date={booking.createdAt} />
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pl-0">
                    {booking.vehicle &&
                      ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(booking.status) && (
                        <Link
                          href={`/user/tracking?vehicleId=${booking.vehicle.id}`}
                          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                        >
                          <OverviewIcon name="tracking" className="h-3.5 w-3.5" />
                          Lacak
                        </Link>
                      )}
                    <Link
                      href="/user/bookings"
                      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
                    >
                      Detail
                      <OverviewIcon name="arrow" className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </MotionBentoCard>
      </section>
    </div>
  );
}
