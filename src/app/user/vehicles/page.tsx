'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Drawer } from '@/components/ui/Drawer';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { BookingModal, LocationOption } from '@/components/booking/BookingModal';
import { Icon } from '@/components/ui/Icon';

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

  // Memoize to avoid creating a new object reference on every render,
  // which would re-trigger BookingModal's initialization useEffect.
  const memoizedVehiclePref = useMemo(() => {
    if (!bookingVehicle) return null;
    return {
      id: bookingVehicle.id,
      plateNumber: bookingVehicle.plateNumber,
      brand: bookingVehicle.brand,
      model: bookingVehicle.model,
      vehicleType: bookingVehicle.vehicleType,
      seatingCapacity: bookingVehicle.seatingCapacity,
      status: bookingVehicle.status,
      homeLocationId: bookingVehicle.homeLocation?.id,
      currentLocationId: (bookingVehicle.currentLocation || bookingVehicle.currentOperationalLocation)?.id,
    };
  }, [bookingVehicle]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-intro">
        <div>
          <span className="eyebrow mb-3">A ride for your workday</span>
          <h1 className="page-heading">Find your next ride.</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            Choose a vehicle. Make room for your next journey.
          </p>
        </div>
        <button
          type="button"
          onClick={() => handleOpenBooking()}
          className="button-primary self-start"
        >
          <Icon name="plus" className="size-4" /><span>New reservation</span>
        </button>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search Bar */}
      <div className="surface p-5 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="min-w-0 flex-1 flex items-center gap-2">
          <input
            type="text"
            placeholder="Search vehicles..."
                        aria-label="Search by plate number, brand or model"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
          />
          <button
            type="submit"
            className="button-secondary"
          >
            Search
          </button>
        </form>

        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2 xl:flex xl:flex-wrap">
          {/* Operational Location Filter */}
          <select
            aria-label="Filter by operational location"
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
            aria-label="Filter by seating capacity"
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
            aria-label="Filter by availability"
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
        <div className="surface p-8 sm:p-12 text-center text-zinc-500 text-sm">
          No vehicles match the selected criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {vehicles.map((v) => {
            const currentLoc = v.currentLocation || v.currentOperationalLocation;
            return (
              <div
                key={v.id}
                className="bezel flex flex-col justify-between"
              >
                <div className="bezel-core overflow-hidden flex-1">
                  {/* Image placeholder / thumbnail */}
                  <div className="h-48 sm:h-44 bg-zinc-50 flex items-center justify-center relative overflow-hidden">
                    {v.imageUrl ? (
                      <img
                        src={v.imageUrl}
                        alt={`${v.brand} ${v.model}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-zinc-400 flex flex-col items-center">
                        <svg viewBox="0 0 200 88" className="mb-2 h-24 w-48 text-emerald-800" fill="none" aria-hidden="true">
                          <ellipse cx="100" cy="73" rx="79" ry="5" fill="currentColor" opacity=".05" />
                          <path d="m29 49 19-5 20-22h57l28 23 24 6 7 17H18l2-13 9-6Z" fill="#e5eee8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                          <path d="m56 44 17-16h25v16H56Zm49-16h17l20 16h-37V28Z" fill="white" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
                          <path d="M28 53h14m117 0h17M102 48v13m7-12h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                          <circle cx="52" cy="65" r="12" fill="#f4f7f5" stroke="currentColor" strokeWidth="1.2" /><circle cx="52" cy="65" r="5" stroke="currentColor" strokeWidth="1.2" />
                          <circle cx="151" cy="65" r="12" fill="#f4f7f5" stroke="currentColor" strokeWidth="1.2" /><circle cx="151" cy="65" r="5" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                        <span className="text-[10px] uppercase font-mono mt-1">{v.vehicleType}</span>
                      </div>
                    )}
                    <div className="absolute top-4 right-4">
                      <StatusBadge status={v.status} />
                    </div>
                  </div>

                  <div className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <h3 className="font-semibold text-xl tracking-tight text-zinc-900 leading-tight">
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
                <div className="px-4 pb-4 pt-3 bg-white rounded-b-[1.625rem] flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedVehicle(v)}
                    className="button-secondary flex-1"
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenBooking(v)}
                    className="button-primary flex-1"
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
        initialVehiclePreference={memoizedVehiclePref}
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
