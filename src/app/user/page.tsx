'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import {
  ArrowRight,
  CalendarDays,
  Car,
  ChevronRight,
  ClipboardList,
  Clock,
  MessageSquare,
  Phone,
  Radar,
  Route,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { IosInstallHint } from '@/components/providers/InstallPrompt';
import { GreetingClock } from '@/components/ui/GreetingClock';
import { selectNextDeparture } from '@/lib/booking-status';

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

const stations = [
  { name: 'Halim', code: 'KM 0', slug: 'HALIM', active: true },
  { name: 'Karawang', code: 'KM 42', slug: 'KARAWANG', active: false },
  { name: 'Padalarang', code: 'KM 95', slug: 'PADALARANG', active: false },
  { name: 'Tegalluar', code: 'KM 142', slug: 'TEGALLUAR', active: false },
];

export default function UserOverviewPage() {
  const { data: session, status } = useSession();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [availableCount, setAvailableCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'ongoing'>('all');

  useEffect(() => {
    if (status !== 'authenticated') return;
    async function loadData() {
      setIsLoading(true);
      try {
        const [bookingsRes, vehiclesRes] = await Promise.all([
          fetch('/api/bookings?limit=8'),
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

  const displayedBookings = activeTab === 'ongoing'
    ? bookings.filter((b) => !['COMPLETED', 'CANCELLED', 'REJECTED'].includes(b.status))
    : bookings;

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-5 pb-[max(1rem,env(safe-area-inset-bottom))] text-slate-900">
      <IosInstallHint />

      <GreetingClock userName={session?.user?.name} roleLabel="Penumpang dinas" />

      {/* Primary action — reference "search / book" affordance, calm and bordered */}
      <section aria-label="Buat pesanan armada">
        <Link
          href="/user/vehicles"
          className="group flex items-center gap-3 rounded-[var(--radius-xl)] bg-white p-3 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
        >
          <span className="icon-tile-accent">
            <Car className="size-[1.125rem]" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-semibold text-slate-900">
              Pesan armada dinas
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              Pilih kendaraan, titik jemput, dan jadwal keberangkatan
            </span>
          </span>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--slate-navy)] text-white transition-transform group-hover:translate-x-0.5">
            <ArrowRight className="size-4" strokeWidth={2.1} aria-hidden="true" />
          </span>
        </Link>
      </section>

      {/* Station filter chips — reference horizontally scrolling pill row */}
      <section aria-label="Filter stasiun" className="-mx-1">
        <div className="chip-rail flex items-center gap-2 px-1 pb-1">
          <span className="shrink-0 pl-0.5 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
            Stasiun
          </span>
          {stations.map((station) => (
            <Link
              key={station.slug}
              href={`/user/vehicles?station=${station.slug}`}
              className="chip"
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${station.active ? 'bg-[#C8102E]' : 'bg-slate-300'}`}
                aria-hidden="true"
              />
              <span>{station.name}</span>
              <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-slate-400">{station.code}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Service categories — 2×2 quiet tiles */}
      <section aria-labelledby="service-categories-heading">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 id="service-categories-heading" className="section-title">
            Kategori kendaraan
          </h2>
          <span className="text-[0.6875rem] text-slate-400">
            <span className="font-semibold tabular-nums text-slate-600">{availableCount}</span> unit siap
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            { label: 'VIP Executive', caption: 'Innova Zenix · Camry', href: '/user/vehicles?category=VIP', Icon: Star },
            { label: 'Operasional Staf', caption: 'Avanza · Xpander', href: '/user/vehicles?category=STAFF', Icon: Users },
            { label: 'Dipo & Lintasan', caption: 'Hilux 4×4 · HiAce', href: '/user/vehicles?category=LOGISTIC', Icon: Route },
            { label: 'Siaga 24 Jam', caption: 'Standby pool', href: '/user/vehicles?category=STANDBY', Icon: Clock },
          ].map(({ label, caption, href, Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex min-w-0 flex-col rounded-[var(--radius-xl)] bg-white p-3.5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]"
            >
              <span className="icon-tile mb-2.5 transition-colors group-hover:bg-[var(--kcic-red-soft)] group-hover:text-[#C8102E]">
                <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="truncate text-xs font-semibold text-slate-900">{label}</span>
              <span className="mt-0.5 truncate text-[0.6875rem] text-slate-400">{caption}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Active booking — reference "in focus" card */}
      {activeBooking && (
        <section
          aria-labelledby="active-trip-heading"
          className="overflow-hidden rounded-[var(--radius-xl)] bg-white shadow-[var(--shadow-sm)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="relative flex size-2 shrink-0">
                <span className="live-ping absolute inset-0 rounded-full bg-[#059669]/50" aria-hidden="true" />
                <span className="relative size-2 rounded-full bg-[#059669]" aria-hidden="true" />
              </span>
              <h2 id="active-trip-heading" className="truncate text-[0.8125rem] font-semibold text-slate-900">
                Perjalanan berlangsung
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="mono-plate rounded-[var(--radius-sm)] bg-[var(--canvas)] px-2 py-0.5 text-[0.6875rem] font-medium text-slate-600">
                {activeBooking.bookingNumber}
              </span>
              <StatusBadge status={activeBooking.status} />
            </div>
          </div>

          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div className="route-stepper">
              <div className="route-point" data-kind="pickup">
                <p className="route-label">Titik jemput</p>
                <p className="route-value">{activeBooking.pickupLocation}</p>
              </div>
              <div className="route-point" data-kind="destination">
                <p className="route-label">Destinasi</p>
                <p className="route-value">{activeBooking.destination}</p>
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-white text-xs font-semibold text-slate-700">
                    {activeBooking.driver ? activeBooking.driver.user.name.charAt(0) : 'D'}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {activeBooking.driver ? activeBooking.driver.user.name : 'Driver ditugaskan'}
                    </p>
                    <p className="mono-plate mt-0.5 truncate text-[0.6875rem] text-slate-500">
                      {activeBooking.vehicle?.plateNumber || 'Armada Whoosh'}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {activeBooking.driver && (
                    <a
                      href={`tel:${activeBooking.driver.user.phone}`}
                      className="grid size-8 place-items-center rounded-full border border-[var(--border)] bg-white text-slate-500 transition-colors hover:border-[var(--kcic-red)] hover:text-[#C8102E]"
                      aria-label="Telepon driver"
                    >
                      <Phone className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
                    </a>
                  )}
                  <Link
                    href={`/user/tracking?vehicleId=${activeBooking.vehicle?.id || ''}`}
                    className="grid size-8 place-items-center rounded-full border border-[var(--border)] bg-white text-slate-500 transition-colors hover:border-[var(--kcic-red)] hover:text-[#C8102E]"
                    aria-label="Hubungi driver"
                  >
                    <MessageSquare className="size-3.5" strokeWidth={1.9} aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div className="mt-3 flex gap-2">
                {activeBooking.vehicle && (
                  <Link href={`/user/tracking?vehicleId=${activeBooking.vehicle.id}`} className="button-primary flex-1">
                    <Radar className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    <span>Lacak</span>
                  </Link>
                )}
                <Link href="/user/bookings" className="button-secondary">
                  Rincian
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Next departure strip */}
      {!activeBooking && upcomingBooking && (
        <section className="flex items-center gap-3 rounded-[var(--radius-xl)] bg-white p-3.5 shadow-[var(--shadow-sm)]">
          <span className="icon-tile">
            <CalendarDays className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Keberangkatan berikutnya
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-900">
              {upcomingBooking.pickupLocation} → {upcomingBooking.destination}
            </p>
          </div>
          <time
            dateTime={upcomingBooking.departureAt}
            className="shrink-0 text-[0.6875rem] font-medium tabular-nums text-slate-500"
          >
            {new Date(upcomingBooking.departureAt).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </section>
      )}

      {/* Orders list — reference list rows with segmented filter */}
      <section
        aria-labelledby="orders-history-heading"
        className="overflow-hidden rounded-[var(--radius-xl)] bg-white shadow-[var(--shadow-sm)]"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
          <div className="min-w-0">
            <h2 id="orders-history-heading" className="section-title">
              Riwayat perjalanan
            </h2>
            <p className="mt-0.5 text-[0.6875rem] text-slate-400">Permohonan mobil dinas Anda</p>
          </div>
          <div className="segmented" role="tablist" aria-label="Filter riwayat">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              className="cursor-pointer"
            >
              Semua
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'ongoing'}
              onClick={() => setActiveTab('ongoing')}
              className="cursor-pointer"
            >
              Berjalan
            </button>
          </div>
        </div>

        {isLoading ? (
          <div role="status" className="flex flex-col items-center justify-center gap-2.5 py-12 text-xs text-slate-500">
            <Spinner size="md" className="text-[#C8102E]" />
            <span>Memuat riwayat…</span>
          </div>
        ) : displayedBookings.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-12 text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-slate-400">
              <ClipboardList className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h3 className="text-[0.8125rem] font-semibold text-slate-900">Belum ada riwayat</h3>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">
              Pesanan armada Anda akan tercatat rapi di sini.
            </p>
            <Link href="/user/vehicles" className="button-primary mt-4">
              <span>Ajukan pesanan</span>
              <ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <ul>
            {displayedBookings.map((b) => (
              <li key={b.id} className="list-row items-start">
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--canvas)] text-slate-500">
                  <Route className="size-4" strokeWidth={1.8} aria-hidden="true" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mono-plate text-[0.6875rem] font-medium text-slate-500">
                      {b.bookingNumber}
                    </span>
                    <StatusBadge status={b.status} />
                  </div>

                  <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-semibold text-slate-900">
                    <span className="truncate">{b.pickupLocation}</span>
                    <ChevronRight className="size-3 shrink-0 text-slate-300" strokeWidth={2.4} aria-hidden="true" />
                    <span className="truncate">{b.destination}</span>
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.6875rem] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" strokeWidth={2} aria-hidden="true" />
                      <time dateTime={b.departureAt} className="tabular-nums">
                        {new Date(b.departureAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </span>
                    {b.vehicle && (
                      <span className="mono-plate truncate">
                        {b.vehicle.brand} {b.vehicle.model}
                      </span>
                    )}
                    <RelativeTime date={b.createdAt} />
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5 self-center">
                  {b.vehicle && ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(b.status) && (
                    <Link
                      href={`/user/tracking?vehicleId=${b.vehicle.id}`}
                      className="grid size-8 place-items-center rounded-full bg-[var(--kcic-red-soft)] text-[#C8102E] transition-colors hover:bg-[#FBE3E7]"
                      aria-label="Lacak armada"
                    >
                      <Radar className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    </Link>
                  )}
                  <Link
                    href="/user/bookings"
                    className="grid size-8 place-items-center rounded-full border border-[var(--border)] bg-white text-slate-400 transition-colors hover:border-[var(--border-strong)] hover:text-slate-700"
                    aria-label="Lihat rincian"
                  >
                    <ChevronRight className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex items-center justify-center gap-1.5 pt-1 text-[0.625rem] text-slate-400">
        <ShieldCheck className="size-3" strokeWidth={2} aria-hidden="true" />
        Data perjalanan terenkripsi · KCIC Fleet
      </p>
    </div>
  );
}
