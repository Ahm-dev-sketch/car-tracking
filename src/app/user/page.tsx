'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { IosInstallHint } from '@/components/providers/InstallPrompt';

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
    <div className="space-y-6">
      <IosInstallHint />

      {/* Welcome header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Employee Portal</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Manage vehicle reservations and live tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/user/vehicles"
            className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
          >
            <span>+ Book a Vehicle</span>
          </Link>
          <Link
            href="/user/tracking"
            className="px-3.5 py-1.5 bg-white border border-zinc-300 hover:bg-zinc-50 text-zinc-700 rounded text-xs font-medium cursor-pointer"
          >
            Live Tracking
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Booking Card */}
        <div className="p-4 bg-white border border-zinc-200 rounded-lg">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Active Booking
          </div>
          {isLoading ? (
            <div className="mt-2"><Spinner size="sm" /></div>
          ) : activeBooking ? (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-zinc-900">{activeBooking.bookingNumber}</span>
                <StatusBadge status={activeBooking.status} />
              </div>
              <div className="text-xs text-zinc-600 truncate">
                {activeBooking.pickupLocation} → {activeBooking.destination}
              </div>
              {activeBooking.vehicle && (
                <div className="text-[11px] text-zinc-500 font-mono">
                  {activeBooking.vehicle.plateNumber} ({activeBooking.vehicle.brand})
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-500">No ongoing booking</div>
          )}
        </div>

        {/* Next Trip Date Card */}
        <div className="p-4 bg-white border border-zinc-200 rounded-lg">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Next Departure
          </div>
          {isLoading ? (
            <div className="mt-2"><Spinner size="sm" /></div>
          ) : upcomingBooking ? (
            <div className="mt-2 space-y-1">
              <div className="text-sm font-bold text-zinc-900">
                {new Date(upcomingBooking.departureAt).toLocaleDateString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <div className="text-xs text-zinc-600 truncate">
                {upcomingBooking.destination}
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm text-zinc-500">None scheduled</div>
          )}
        </div>

        {/* Total Bookings Card */}
        <div className="p-4 bg-white border border-zinc-200 rounded-lg">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Recent Bookings
          </div>
          <div className="mt-2 text-2xl font-bold text-zinc-900">
            {isLoading ? <Spinner size="sm" /> : bookings.length}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Records loaded</div>
        </div>

        {/* Available Fleet Card */}
        <div className="p-4 bg-white border border-zinc-200 rounded-lg">
          <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Available Fleet
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-700">
            {isLoading ? <Spinner size="sm" /> : availableCount}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">Vehicles ready for assignment</div>
        </div>
      </div>

      {/* Recent Bookings Section */}
      <div className="bg-white border border-zinc-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-800">
            My Recent Bookings
          </h2>
          <Link
            href="/user/bookings"
            className="text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:underline"
          >
            View all →
          </Link>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-zinc-500 text-sm">
            <Spinner size="md" className="mr-2 align-middle" />
            Loading bookings...
          </div>
        ) : bookings.length === 0 ? (
          <div className="py-10 text-center text-zinc-500 text-sm">
            <p>You haven't requested any vehicle bookings yet.</p>
            <Link
              href="/user/vehicles"
              className="mt-3 inline-block px-3 py-1.5 bg-zinc-900 text-white rounded text-xs font-semibold hover:bg-zinc-800"
            >
              Browse Vehicles
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {bookings.map((booking) => (
              <div
                key={booking.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-900">{booking.bookingNumber}</span>
                    <StatusBadge status={booking.status} />
                  </div>
                  <div className="text-xs text-zinc-600">
                    <span className="font-medium text-zinc-800">{booking.pickupLocation}</span> →{' '}
                    <span className="font-medium text-zinc-800">{booking.destination}</span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Depart:{' '}
                    {new Date(booking.departureAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    • Created <RelativeTime date={booking.createdAt} />
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {booking.vehicle && ['APPROVED', 'DRIVER_ASSIGNED', 'IN_PROGRESS'].includes(booking.status) && (
                    <Link
                      href={`/user/tracking?vehicleId=${booking.vehicle.id}`}
                      className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded hover:bg-emerald-100"
                    >
                      Track
                    </Link>
                  )}
                  <Link
                    href="/user/bookings"
                    className="px-2.5 py-1 text-xs font-medium border border-zinc-200 text-zinc-700 rounded hover:bg-zinc-50"
                  >
                    Details
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
