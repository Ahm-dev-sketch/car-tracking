'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';

interface VehicleLocation {
  id: string;
  name: string;
  code: string;
}

interface Vehicle {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: string;
  seatingCapacity: number;
  transmission?: string | null;
  imageUrl?: string | null;
  status: string;
  homeLocation?: VehicleLocation | null;
  currentLocation?: VehicleLocation | null;
  currentOperationalLocation?: VehicleLocation | null;
  currentDriver?: {
    id: string;
    licenseNumber: string;
    status: string;
    user: {
      id: string;
      name: string;
      phone: string;
    };
  } | null;
}

function UserVehiclesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);

  // Filters synced with URL
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [seatsFilter, setSeatsFilter] = useState(searchParams.get('seats') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );

  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Selected vehicle for details drawer
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Booking modal state
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);

  // Fetch operational locations for filter
  useEffect(() => {
    async function fetchLocations() {
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
    fetchLocations();
  }, []);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/user/vehicles?${params.toString()}`);
  };

  const fetchVehicles = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '12',
      });
      if (search.trim()) params.set('search', search.trim());
      if (seatsFilter) params.set('seats', seatsFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list = json.data || json.vehicles || [];
        setVehicles(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load vehicles');
      }
    } catch {
      setApiError('Network error loading vehicles');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles(1);
    syncUrlParams({
      search: search.trim(),
      seats: seatsFilter,
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [seatsFilter, statusFilter, locationFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVehicles(1);
    syncUrlParams({
      search: search.trim(),
      seats: seatsFilter,
      status: statusFilter,
      locationId: locationFilter,
    });
  };

  const handleOpenBooking = (v?: Vehicle) => {
    setBookingVehicle(v || null);
    setIsBookingOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Vehicle Fleet</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Explore corporate fleet and reserve for authorized trips
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenBooking()}
          className="px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer inline-flex items-center gap-1.5"
        >
          <span>+ New Reservation</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-lg border border-zinc-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Search by plate number, brand, model..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {/* Operational Location Filter */}
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name} ({loc.code})
              </option>
            ))}
          </select>

          {/* Seats Filter */}
          <select
            value={seatsFilter}
            onChange={(e) => setSeatsFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Capacities</option>
            <option value="4">4+ Seats</option>
            <option value="5">5+ Seats</option>
            <option value="7">7+ Seats</option>
            <option value="10">10+ Seats</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-zinc-300 rounded bg-white text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-800"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="RESERVED">Reserved</option>
            <option value="IN_USE">In Use</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Grid of Vehicles */}
      {isLoading ? (
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <div>Loading fleet catalog...</div>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="p-12 text-center bg-white border border-dashed border-zinc-300 rounded-lg text-zinc-500 text-sm">
          No vehicles match the selected criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {vehicles.map((v) => {
            const currentLoc = v.currentLocation || v.currentOperationalLocation;
            return (
              <div
                key={v.id}
                className="bg-white border border-zinc-200 rounded-lg overflow-hidden flex flex-col justify-between hover:border-zinc-300 transition-colors"
              >
                <div>
                  {/* Image placeholder / thumbnail */}
                  <div className="h-36 bg-zinc-100 flex items-center justify-center relative overflow-hidden border-b border-zinc-100">
                    {v.imageUrl ? (
                      <img
                        src={v.imageUrl}
                        alt={`${v.brand} ${v.model}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-zinc-400 flex flex-col items-center">
                        <svg className="w-10 h-10 stroke-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8 7h8m-8 4h8m-4 4h4m2 4H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z"
                          />
                        </svg>
                        <span className="text-[10px] uppercase font-mono mt-1">{v.vehicleType}</span>
                      </div>
                    )}
                    <div className="absolute top-2 right-2">
                      <StatusBadge status={v.status} />
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <h3 className="font-bold text-sm text-zinc-900 leading-tight">
                          {v.brand} {v.model}
                        </h3>
                        <div className="text-xs font-mono font-semibold text-zinc-600 mt-0.5">
                          {v.plateNumber}
                        </div>
                      </div>
                    </div>

                    {/* Operational Locations Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {v.homeLocation && (
                        <LocationBadge
                          type="home"
                          name={v.homeLocation.name}
                          code={v.homeLocation.code}
                        />
                      )}
                      {currentLoc && (
                        <LocationBadge
                          type="current"
                          name={currentLoc.name}
                          code={currentLoc.code}
                        />
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100 text-xs text-zinc-600">
                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase">Capacity</span>
                        <span className="font-medium">{v.seatingCapacity} seats</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[10px] uppercase">Gearbox</span>
                        <span className="font-medium">{v.transmission || 'Automatic'}</span>
                      </div>
                    </div>

                    {v.currentDriver?.user && (
                      <div className="pt-2 border-t border-zinc-100 text-[11px] text-zinc-500 truncate">
                        Driver: <span className="font-medium text-zinc-800">{v.currentDriver.user.name}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="p-3 bg-zinc-50 border-t border-zinc-100 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVehicle(v)}
                    className="flex-1 py-1.5 px-2 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBooking(v)}
                    className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
                  >
                    Reserve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchVehicles(p)}
      />

      {/* Vehicle Details Drawer */}
      <Drawer
        isOpen={Boolean(selectedVehicle)}
        onClose={() => setSelectedVehicle(null)}
        title={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Vehicle'}
        description={selectedVehicle?.plateNumber}
        footer={
          selectedVehicle ? (
            <button
              type="button"
              onClick={() => {
                const target = selectedVehicle;
                setSelectedVehicle(null);
                handleOpenBooking(target);
              }}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
            >
              Reserve this Vehicle
            </button>
          ) : null
        }
      >
        {selectedVehicle && (
          <div className="space-y-4 text-sm">
            {selectedVehicle.imageUrl && (
              <img
                src={selectedVehicle.imageUrl}
                alt={selectedVehicle.brand}
                className="w-full h-48 object-cover rounded border border-zinc-200"
              />
            )}

            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <span className="text-xs font-semibold uppercase text-zinc-500">Status</span>
              <StatusBadge status={selectedVehicle.status} />
            </div>

            {/* Locations in Drawer */}
            <div className="space-y-2 pb-3 border-b border-zinc-100 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Home Base:</span>
                {selectedVehicle.homeLocation ? (
                  <LocationBadge
                    type="home"
                    name={selectedVehicle.homeLocation.name}
                    code={selectedVehicle.homeLocation.code}
                  />
                ) : (
                  <span className="text-zinc-400">Not assigned</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 font-medium">Current Location:</span>
                {(selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation) ? (
                  <LocationBadge
                    type="current"
                    name={(selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation)?.name}
                    code={(selectedVehicle.currentLocation || selectedVehicle.currentOperationalLocation)?.code}
                  />
                ) : (
                  <span className="text-zinc-400">Not assigned</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-xs font-semibold uppercase text-zinc-500 block">Type</span>
                <span className="font-medium text-zinc-800">{selectedVehicle.vehicleType}</span>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase text-zinc-500 block">Capacity</span>
                <span className="font-medium text-zinc-800">
                  {selectedVehicle.seatingCapacity} Passengers
                </span>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase text-zinc-500 block">Transmission</span>
                <span className="font-medium text-zinc-800">
                  {selectedVehicle.transmission || 'Automatic'}
                </span>
              </div>
              <div>
                <span className="text-xs font-semibold uppercase text-zinc-500 block">Plate</span>
                <span className="font-mono font-medium text-zinc-800">
                  {selectedVehicle.plateNumber}
                </span>
              </div>
            </div>

            {selectedVehicle.currentDriver?.user && (
              <div className="pt-2">
                <span className="text-xs font-semibold uppercase text-zinc-500 block">Assigned Driver</span>
                <div className="mt-1">
                  <div className="font-medium text-zinc-800">{selectedVehicle.currentDriver.user.name}</div>
                  <div className="text-xs text-zinc-500">{selectedVehicle.currentDriver.user.phone}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Unified Reworked Booking Modal */}
      <BookingModal
        isOpen={isBookingOpen}
        onClose={() => {
          setIsBookingOpen(false);
          setBookingVehicle(null);
        }}
        onSuccess={() => {
          fetchVehicles(page);
        }}
        initialVehiclePreference={
          bookingVehicle
            ? {
                id: bookingVehicle.id,
                plateNumber: bookingVehicle.plateNumber,
                brand: bookingVehicle.brand,
                model: bookingVehicle.model,
                vehicleType: bookingVehicle.vehicleType,
                seatingCapacity: bookingVehicle.seatingCapacity,
                status: bookingVehicle.status,
                homeLocationId: bookingVehicle.homeLocation?.id,
                currentLocationId: (bookingVehicle.currentLocation || bookingVehicle.currentOperationalLocation)?.id,
              }
            : null
        }
        initialLocationId={locationFilter || undefined}
      />
    </div>
  );
}

export default function UserVehiclesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-zinc-500 text-sm">
          <Spinner size="lg" className="mb-2" />
          <p>Loading fleet...</p>
        </div>
      }
    >
      <UserVehiclesContent />
    </Suspense>
  );
}
