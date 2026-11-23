'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataTable, Column } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { LocationBadge } from '@/components/ui/LocationBadge';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Icon } from '@/components/ui/Icon';

interface OperationalLocation {
  id: string;
  name: string;
  code: string;
}

interface VehicleItem {
  id: string;
  plateNumber: string;
  brand: string;
  model: string;
  vehicleType: string;
  seatingCapacity: number;
  transmission?: string | null;
  imageUrl?: string | null;
  status: string;
  homeLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
  currentOperationalLocation?: {
    id: string;
    name: string;
    code: string;
  } | null;
  currentDriver?: {
    id: string;
    licenseNumber: string;
    user: {
      id: string;
      name: string;
      phone: string;
    };
  } | null;
}

interface DriverOption {
  id: string;
  licenseNumber: string;
  user: {
    name: string;
  };
}

function AdminVehiclesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [locations, setLocations] = useState<OperationalLocation[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [locationFilter, setLocationFilter] = useState(
    searchParams.get('locationId') || searchParams.get('location_id') || ''
  );
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<VehicleItem | null>(null);
  const [formPlate, setFormPlate] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formType, setFormType] = useState('SEDAN');
  const [formSeats, setFormSeats] = useState(5);
  const [formTransmission, setFormTransmission] = useState('AUTOMATIC');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formStatus, setFormStatus] = useState('AVAILABLE');
  const [formLocationId, setFormLocationId] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deactivate Confirm
  const [deactivatingVehicle, setDeactivatingVehicle] = useState<VehicleItem | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Assign Driver Modal
  const [assigningVehicle, setAssigningVehicle] = useState<VehicleItem | null>(null);
  const [availableDrivers, setAvailableDrivers] = useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Load operational locations
  useEffect(() => {
    async function loadLocations() {
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
    loadLocations();
  }, []);

  const syncUrlParams = (newParams: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    router.replace(`/admin/vehicles?${params.toString()}`);
  };

  const fetchVehicles = async (targetPage = 1, isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (locationFilter) params.set('locationId', locationFilter);

      const res = await fetch(`/api/vehicles?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (!json.warning) {
          const list = json.data || json.vehicles || [];
          setVehicles(list);
          setTotalRecords(json.pagination?.total ?? list.length);
          setTotalPages(json.pagination?.totalPages ?? 1);
          setPage(targetPage);
        }
      } else if (!isSilent) {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load vehicles');
      }
    } catch {
      if (!isSilent) setApiError('Network error loading vehicles');
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles(1);
    syncUrlParams({
      search,
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [statusFilter, locationFilter]);

  // Keep vehicle pool live without manual refresh
  useEffect(() => {
    const isInteracting = isModalOpen || deactivatingVehicle || assigningVehicle;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isInteracting) {
        void fetchVehicles(page, true);
      }
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [page, isModalOpen, deactivatingVehicle, assigningVehicle, search, statusFilter, locationFilter]);

  const handleOpenAdd = () => {
    setEditingVehicle(null);
    setFormPlate('');
    setFormBrand('');
    setFormModel('');
    setFormType('SEDAN');
    setFormSeats(5);
    setFormTransmission('AUTOMATIC');
    setFormImageUrl('');
    setFormStatus('AVAILABLE');
    setFormLocationId(locationFilter || '');
    setUploadError(null);
    setIsUploadingImage(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (v: VehicleItem) => {
    setEditingVehicle(v);
    setFormPlate(v.plateNumber);
    setFormBrand(v.brand);
    setFormModel(v.model);
    setFormType(v.vehicleType);
    setFormSeats(v.seatingCapacity);
    setFormTransmission(v.transmission || 'AUTOMATIC');
    setFormImageUrl(v.imageUrl || '');
    setFormStatus(v.status);
    setFormLocationId(v.homeLocation?.id || v.currentOperationalLocation?.id || '');
    setUploadError(null);
    setIsUploadingImage(false);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected if user cleared
    e.target.value = '';

    // Validate size client-side (Max 5MB)
    const MAX_SIZE = 5 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError('Ukuran file melebihi batas maksimal 5MB.');
      return;
    }

    // Validate type client-side
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setUploadError('Format gambar harus JPG, PNG, atau WebP.');
      return;
    }

    setUploadError(null);
    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'Gagal mengupload gambar.');
      }

      const json = await res.json();
      if (json.data?.url) {
        setFormImageUrl(json.data.url);
      }
    } catch (err: any) {
      setUploadError(err.message || 'Gagal mengupload gambar.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError(null);

    const payload: any = {
      plateNumber: formPlate.trim().toUpperCase(),
      brand: formBrand.trim(),
      model: formModel.trim(),
      vehicleType: formType,
      seatingCapacity: Number(formSeats),
      transmission: formTransmission || null,
      imageUrl: formImageUrl.trim() || null,
      status: formStatus,
      homeLocationId: formLocationId || null,
      currentLocationId: formLocationId || null,
    };

    try {
      const url = editingVehicle ? `/api/vehicles/${editingVehicle.id}` : '/api/vehicles';
      const method = editingVehicle ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchVehicles(page);
      } else {
        const err = await res.json();
        setFormError(err.error?.message || 'Failed to save vehicle');
      }
    } catch {
      setFormError('Network error saving vehicle');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivatingVehicle) return;
    setIsDeactivating(true);
    try {
      const res = await fetch(`/api/vehicles/${deactivatingVehicle.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDeactivatingVehicle(null);
        fetchVehicles(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to deactivate vehicle');
      }
    } catch {
      setApiError('Network error deactivating vehicle');
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleOpenAssign = async (v: VehicleItem) => {
    setAssigningVehicle(v);
    setSelectedDriverId('');
    setAssignError(null);
    try {
      const res = await fetch('/api/drivers?limit=50');
      if (res.ok) {
        const json = await res.json();
        setAvailableDrivers(json.data || []);
      }
    } catch {
      // ignore
    }
  };

  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningVehicle || !selectedDriverId) return;
    setIsAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/admin/drivers/${selectedDriverId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: assigningVehicle.id }),
      });
      if (res.ok) {
        setAssigningVehicle(null);
        fetchVehicles(page);
      } else {
        const err = await res.json();
        setAssignError(err.error?.message || 'Failed to assign driver');
      }
    } catch {
      setAssignError('Network error assigning driver');
    } finally {
      setIsAssigning(false);
    }
  };

  const columns: Column<VehicleItem>[] = [
    {
      header: 'Plate Number',
      accessorKey: 'plateNumber',
      cell: (v) => <span className="font-mono font-semibold tabular-nums text-slate-900">{v.plateNumber}</span>,
    },
    {
      header: 'Vehicle',
      cell: (v) => (
        <div className="flex items-center gap-2.5">
          {v.imageUrl && (
            <img
              src={v.imageUrl}
              alt={`${v.brand} ${v.model}`}
              className="h-8 w-10 shrink-0 rounded border border-slate-200 bg-slate-100 object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <div>
            <span className="font-medium text-slate-900">{v.brand} {v.model}</span>
            <span className="block text-xs text-slate-500">{v.vehicleType} • <span className="tabular-nums">{v.seatingCapacity}</span> seats</span>
          </div>
        </div>
      ),
    },
    {
      header: 'Operational Hub',
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-1">
          {v.homeLocation && (
            <LocationBadge
              type="home"
              name={v.homeLocation.name}
              code={v.homeLocation.code}
            />
          )}
          {v.currentOperationalLocation && (
            <LocationBadge
              type="current"
              name={v.currentOperationalLocation.name}
              code={v.currentOperationalLocation.code}
            />
          )}
          {!v.homeLocation && !v.currentOperationalLocation && (
            <span className="text-xs italic text-slate-400">—</span>
          )}
        </div>
      ),
    },
    {
      header: 'Assigned Driver',
      cell: (v) =>
        v.currentDriver ? (
          <div>
            <span className="font-medium text-slate-900">{v.currentDriver.user.name}</span>
            <span className="block font-mono text-[11px] tabular-nums text-slate-500">{v.currentDriver.licenseNumber}</span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Unassigned</span>
        ),
    },
    {
      header: 'Status',
      cell: (v) => <StatusBadge status={v.status} />,
    },
    {
      header: 'Actions',
      cell: (v) => (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenAssign(v)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Assign
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(v)}
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Edit
          </button>
          {v.status !== 'INACTIVE' && (
            <button
              type="button"
              onClick={() => setDeactivatingVehicle(v)}
              className="cursor-pointer rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
            >
              Deactivate
            </button>
          )}
        </div>
      ),
    },
  ];

  const availableCount = vehicles.filter((v) => v.status === 'AVAILABLE').length;
  const inUseCount = vehicles.filter((v) => v.status === 'RESERVED' || v.status === 'IN_USE').length;
  const maintenanceCount = vehicles.filter((v) => v.status === 'MAINTENANCE').length;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Vehicle Inventory</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Manage fleet vehicles, specifications, and driver assignments</p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="button-primary inline-flex cursor-pointer items-center gap-1.5 self-start sm:self-auto"
        >
          <Icon name="plus" className="size-4" />
          <span>Add Vehicle</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Total Armada</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Tersedia</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{availableCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Digunakan</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{inUseCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Perawatan</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-warning-600">{maintenanceCount}</p>
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search */}
      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row">
        <form onSubmit={(e) => { e.preventDefault(); fetchVehicles(1); }} className="flex w-full gap-2 sm:w-96">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Icon name="search" className="size-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder="Search plate, brand, model..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
          <button type="submit" className="button-primary shrink-0 px-3 text-xs">
            Search
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Hub</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">All Hubs</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="IN_USE">In Use</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={vehicles}
        isLoading={isLoading}
        emptyMessage="No vehicles found"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchVehicles(p)}
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVehicle ? `Edit Vehicle: ${editingVehicle.plateNumber}` : 'Add New Vehicle'}
        maxWidth="lg"
      >
        {formError && <ErrorBanner message={formError} className="mb-4" onDismiss={() => setFormError(null)} />}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Plate Number" required>
              <input
                type="text"
                required
                placeholder="B 1234 ABC"
                value={formPlate}
                onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
                className="font-mono uppercase tabular-nums"
              />
            </FormField>

            <FormField label="Vehicle Type" required>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                <option value="SEDAN">SEDAN</option>
                <option value="SUV">SUV</option>
                <option value="MPV">MPV</option>
                <option value="VAN">VAN</option>
                <option value="TRUCK">TRUCK</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Brand" required>
              <input
                type="text"
                required
                placeholder="Toyota"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </FormField>

            <FormField label="Model" required>
              <input
                type="text"
                required
                placeholder="Innova Zenix"
                value={formModel}
                onChange={(e) => setFormModel(e.target.value)}
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Operational Hub" required>
              <select
                value={formLocationId}
                onChange={(e) => setFormLocationId(e.target.value)}
                required
              >
                <option value="">-- Pilih Hub Operasional KCIC --</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Status" required>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
              >
                <option value="AVAILABLE">AVAILABLE (Aktif di Pool)</option>
                <option value="RESERVED">RESERVED</option>
                <option value="IN_USE">IN_USE</option>
                <option value="MAINTENANCE">MAINTENANCE (Perawatan)</option>
                <option value="INACTIVE">INACTIVE (Nonaktif)</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Seats" required>
              <input
                type="number"
                min="1"
                max="50"
                required
                value={formSeats}
                onChange={(e) => setFormSeats(parseInt(e.target.value) || 1)}
                className="tabular-nums"
              />
            </FormField>

            <FormField label="Transmission">
              <select
                value={formTransmission}
                onChange={(e) => setFormTransmission(e.target.value)}
              >
                <option value="AUTOMATIC">AUTOMATIC</option>
                <option value="MANUAL">MANUAL</option>
              </select>
            </FormField>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700">Vehicle Photo</label>
              <span className="text-[11px] text-slate-400">Max 5MB (JPG, PNG, WebP)</span>
            </div>

            {uploadError && (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-danger-200 bg-danger-50 p-2 text-xs text-danger-700">
                <span>{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  className="cursor-pointer rounded p-0.5 text-danger-600 transition-colors hover:bg-danger-100"
                  aria-label="Tutup pesan galat"
                >
                  <Icon name="close" className="size-3.5" />
                </button>
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
            />

            {formImageUrl ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="h-12 w-16 flex-shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-100">
                  <img
                    src={formImageUrl}
                    alt="Vehicle preview"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" fill="%23d4d4d8" viewBox="0 0 24 24"><path fill="%2371717a" d="M5 7 7 3h10l2 4 2 3v8h-3v-2H6v2H3v-8l2-3Z"/></svg>';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs text-slate-600">{formImageUrl}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isUploadingImage ? 'Uploading...' : 'Change Photo'}
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => setFormImageUrl('')}
                      className="cursor-pointer rounded border border-danger-200 bg-white px-2 py-0.5 text-[11px] font-medium text-danger-700 transition-colors hover:bg-danger-50 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploadingImage || formSubmitting}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-600 transition-colors hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-50"
              >
                {isUploadingImage ? (
                  <>
                    <Spinner size="sm" />
                    <span>Uploading photo...</span>
                  </>
                ) : (
                  <>
                    <Icon name="download" className="size-4 text-slate-500" />
                    <span className="font-medium">Upload Vehicle Photo (Max 5MB)</span>
                  </>
                )}
              </button>
            )}

            <div className="pt-1">
              <input
                type="text"
                placeholder="Or paste image URL (https://... or /uploads/...)"
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={formSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={formSubmitting}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {formSubmitting && <Spinner size="sm" className="text-white" />}
              {editingVehicle ? 'Update Vehicle' : 'Create Vehicle'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingVehicle)}
        onClose={() => setDeactivatingVehicle(null)}
        onConfirm={handleDeactivateConfirm}
        title="Deactivate Vehicle"
        message={`Are you sure you want to deactivate vehicle ${deactivatingVehicle?.plateNumber}? It will no longer be available for trip reservations.`}
        confirmLabel="Deactivate"
        isDestructive={true}
        isLoading={isDeactivating}
      />

      {/* Assign Driver Modal */}
      <Modal
        isOpen={Boolean(assigningVehicle)}
        onClose={() => setAssigningVehicle(null)}
        title="Assign Driver"
        description={assigningVehicle ? `Assign driver to ${assigningVehicle.plateNumber}` : ''}
        maxWidth="sm"
      >
        {assignError && <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />}

        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <FormField label="Select Driver" required>
            <select
              required
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">-- Choose Driver --</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} ({d.licenseNumber})
                </option>
              ))}
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningVehicle(null)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedDriverId}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              Assign Driver
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function AdminVehiclesPage() {
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-xs text-slate-500">
          <Spinner size="md" className="mb-2" />
          <p>Loading vehicle inventory...</p>
        </div>
      }
    >
      <AdminVehiclesContent />
    </Suspense>
  );
}
