'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { FormField } from '@/components/ui/FormField';
import { Pagination } from '@/components/ui/Pagination';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';

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

export default function UserVehiclesPage() {
  const router = useRouter();

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [seatsFilter, setSeatsFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Selected vehicle for details drawer
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);

  // Booking modal state
  const [bookingVehicle, setBookingVehicle] = useState<Vehicle | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Booking Form inputs
  const [pickupLocation, setPickupLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [departureAt, setDepartureAt] = useState('');
  const [expectedReturnAt, setExpectedReturnAt] = useState('');
  const [passengerCount, setPassengerCount] = useState<number>(1);
  const [purpose, setPurpose] = useState('');
  const [notes, setNotes] = useState('');

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
  }, [seatsFilter, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVehicles(1);
  };

  const handleOpenBooking = (v: Vehicle) => {
    setBookingVehicle(v);
    setPassengerCount(1);
    setBookingError(null);
    // Suggest default departure time (now + 1h, rounded)
    const now = new Date();
    now.setHours(now.getHours() + 1, 0, 0, 0);
    const returnTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const toLocalISO = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

    setDepartureAt(toLocalISO(now));
    setExpectedReturnAt(toLocalISO(returnTime));
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingVehicle) return;
    setIsSubmitting(true);
    setBookingError(null);

    const depDate = new Date(departureAt);
    const retDate = new Date(expectedReturnAt);

    if (isNaN(depDate.getTime()) || isNaN(retDate.getTime())) {
      setBookingError('Please enter valid departure and return dates');
      setIsSubmitting(false);
      return;
    }

    if (retDate <= depDate) {
      setBookingError('Expected return must be after departure time');
      setIsSubmitting(false);
      return;
    }

    if (passengerCount > bookingVehicle.seatingCapacity) {
      setBookingError(`Passenger count cannot exceed vehicle capacity (${bookingVehicle.seatingCapacity})`);
      setIsSubmitting(false);
      return;
    }

    try {
      const payload = {
        vehicleId: bookingVehicle.id,
        pickupLocation: pickupLocation.trim(),
        destination: destination.trim(),
        departureAt: depDate.toISOString(),
        expectedReturnAt: retDate.toISOString(),
        passengerCount,
        purpose: purpose.trim(),
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setBookingVehicle(null);
        router.push('/user/bookings');
      } else {
        const err = await res.json();
        setBookingError(err.error?.message || 'Failed to submit booking');
      }
    } catch {
      setBookingError('Network error submitting booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-zinc-200">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Vehicle Fleet</h1>
          <p className="text-xs text-zinc-500 mt-0.5">Explore company fleet and reserve for authorized trips</p>
        </div>
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

        <div className="flex items-center gap-2">
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
          {vehicles.map((v) => (
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
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 4h8m-4 4h4m2 4H6a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2z" />
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
                  View Details
                </button>
                <button
                  type="button"
                  disabled={v.status !== 'AVAILABLE'}
                  onClick={() => handleOpenBooking(v)}
                  className="flex-1 py-1.5 px-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Book
                </button>
              </div>
            </div>
          ))}
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
          selectedVehicle && selectedVehicle.status === 'AVAILABLE' ? (
            <button
              type="button"
              onClick={() => {
                const target = selectedVehicle;
                setSelectedVehicle(null);
                handleOpenBooking(target);
              }}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
            >
              Book this Vehicle
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

            <div className="grid grid-cols-2 gap-4 pb-3 border-b border-zinc-100">
              <div>
                <span className="text-xs text-zinc-400 uppercase">License Plate</span>
                <p className="font-mono font-semibold text-zinc-900 mt-0.5">
                  {selectedVehicle.plateNumber}
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-400 uppercase">Vehicle Type</span>
                <p className="font-semibold text-zinc-900 mt-0.5">{selectedVehicle.vehicleType}</p>
              </div>
              <div>
                <span className="text-xs text-zinc-400 uppercase">Seating Capacity</span>
                <p className="font-semibold text-zinc-900 mt-0.5">
                  {selectedVehicle.seatingCapacity} Passengers
                </p>
              </div>
              <div>
                <span className="text-xs text-zinc-400 uppercase">Transmission</span>
                <p className="font-semibold text-zinc-900 mt-0.5">
                  {selectedVehicle.transmission || 'Automatic'}
                </p>
              </div>
            </div>

            {selectedVehicle.currentDriver && (
              <div className="p-3 bg-zinc-50 rounded border border-zinc-200">
                <span className="text-xs font-semibold uppercase text-zinc-500">Assigned Driver</span>
                <div className="mt-1 font-semibold text-zinc-900">
                  {selectedVehicle.currentDriver.user.name}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  License: {selectedVehicle.currentDriver.licenseNumber}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Booking Form Modal */}
      <Modal
        isOpen={Boolean(bookingVehicle)}
        onClose={() => setBookingVehicle(null)}
        title="Book Vehicle"
        description={bookingVehicle ? `${bookingVehicle.brand} ${bookingVehicle.model} (${bookingVehicle.plateNumber})` : ''}
        maxWidth="lg"
      >
        {bookingError && <ErrorBanner message={bookingError} className="mb-4" onDismiss={() => setBookingError(null)} />}

        <form onSubmit={handleBookingSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Pickup Location" required error={undefined}>
              <input
                type="text"
                required
                placeholder="HQ Lobby, Building A"
                value={pickupLocation}
                onChange={(e) => setPickupLocation(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Destination" required error={undefined}>
              <input
                type="text"
                required
                placeholder="Client Office, Branch 2"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Departure Date & Time" required error={undefined}>
              <input
                type="datetime-local"
                required
                value={departureAt}
                onChange={(e) => setDepartureAt(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Expected Return" required error={undefined}>
              <input
                type="datetime-local"
                required
                value={expectedReturnAt}
                onChange={(e) => setExpectedReturnAt(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              label="Passengers"
              required
              hint={`Max ${bookingVehicle?.seatingCapacity || 1} people`}
            >
              <input
                type="number"
                min="1"
                max={bookingVehicle?.seatingCapacity || 10}
                required
                value={passengerCount}
                onChange={(e) => setPassengerCount(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>

            <FormField label="Trip Purpose" required>
              <input
                type="text"
                required
                placeholder="Client meeting, site audit"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
              />
            </FormField>
          </div>

          <FormField label="Additional Notes (Optional)">
            <textarea
              rows={2}
              placeholder="Special equipment, luggage, contact info"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-zinc-300 rounded focus:outline-none focus:ring-1 focus:ring-zinc-800"
            />
          </FormField>

          <div className="pt-3 border-t border-zinc-200 flex items-center justify-end gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setBookingVehicle(null)}
              className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting && <Spinner size="sm" className="text-white" />}
              Submit Reservation
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
