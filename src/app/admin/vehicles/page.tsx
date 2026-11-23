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
import { Car, Plus, Search, X } from 'lucide-react';

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
      header: 'Nomor polisi',
      accessorKey: 'plateNumber',
      cell: (v) => <span className="mono-plate font-semibold text-slate-900">{v.plateNumber}</span>,
    },
    {
      header: 'Kendaraan',
      cell: (v) => (
        <div className="flex items-center gap-2.5">
          {v.imageUrl && (
            <img
              src={v.imageUrl}
              alt={`${v.brand} ${v.model}`}
              className="h-8 w-10 shrink-0 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--canvas)] object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <div className="min-w-0">
            <span className="block truncate font-medium text-slate-800">
              {v.brand} {v.model}
            </span>
            <span className="block text-[0.6875rem] text-slate-500">
              {v.vehicleType} · {v.seatingCapacity} kursi
            </span>
          </div>
        </div>
      ),
    },
    {
      header: 'Hub operasional',
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
      header: 'Pengemudi',
      cell: (v) =>
        v.currentDriver ? (
          <div className="min-w-0">
            <span className="block truncate font-medium text-slate-800">{v.currentDriver.user.name}</span>
            <span className="mono-plate block text-[0.625rem] text-slate-500">
              {v.currentDriver.licenseNumber}
            </span>
          </div>
        ) : (
          <span className="text-xs italic text-slate-400">Belum ditugaskan</span>
        ),
    },
    {
      header: 'Status',
      cell: (v) => <StatusBadge status={v.status} />,
    },
    {
      header: '',
      cell: (v) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => handleOpenAssign(v)}
            className="cursor-pointer rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
          >
            Tugaskan
          </button>
          <button
            type="button"
            onClick={() => handleOpenEdit(v)}
            className="cursor-pointer rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
          >
            Edit
          </button>
          {v.status !== 'INACTIVE' && (
            <button
              type="button"
              onClick={() => setDeactivatingVehicle(v)}
              className="cursor-pointer rounded-full border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--status-error-fg)] transition-colors hover:bg-[var(--status-error-border)]/40"
            >
              Nonaktifkan
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">Inventaris armada</span>
          <h1 className="page-heading mt-2">Armada kendaraan KCIC</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Kelola spesifikasi mobil dinas, alokasi pool operasional stasiun, dan status pengemudi.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="button-primary self-start sm:self-auto"
        >
          <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
          <span>Tambah mobil</span>
        </button>
      </header>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Search & filters */}
      <div className="card flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchVehicles(1);
          }}
          className="flex w-full gap-2 md:w-80"
        >
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="vehicle-search">
              Cari armada
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              id="vehicle-search"
              type="text"
              placeholder="Cari plat, merek, tipe…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <button type="submit" className="button-secondary px-3.5 py-2 text-[0.6875rem]">
            Cari
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="vehicle-hub-filter" className="metric-label shrink-0">
              Hub
            </label>
            <select
              id="vehicle-hub-filter"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-auto min-w-0 rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua hub</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <label htmlFor="vehicle-status-filter" className="metric-label shrink-0">
              Status
            </label>
            <select
              id="vehicle-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto min-w-0 rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua status</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="IN_USE">In use</option>
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
        emptyMessage="Belum ada kendaraan terdaftar"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchVehicles(p)}
      />

      {/* Add / edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingVehicle ? `Edit kendaraan ${editingVehicle.plateNumber}` : 'Tambah armada baru'}
        description="Kelola spesifikasi teknis dan ketersediaan kendaraan operasional KCIC."
        maxWidth="lg"
      >
        {formError && (
          <ErrorBanner message={formError} className="mb-4" onDismiss={() => setFormError(null)} />
        )}

        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nomor polisi (plat)" required>
              <input
                type="text"
                required
                placeholder="B 1234 ABC"
                value={formPlate}
                onChange={(e) => setFormPlate(e.target.value.toUpperCase())}
                className="mono-plate uppercase"
              />
            </FormField>

            <FormField label="Tipe kendaraan" required>
              <select value={formType} onChange={(e) => setFormType(e.target.value)}>
                <option value="SEDAN">Sedan</option>
                <option value="SUV">SUV</option>
                <option value="MPV">MPV</option>
                <option value="VAN">Van</option>
                <option value="TRUCK">Truck</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Merek" required>
              <input
                type="text"
                required
                placeholder="Toyota"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </FormField>

            <FormField label="Model / seri" required>
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
            <FormField label="Pool operasional hub" required>
              <select
                value={formLocationId}
                onChange={(e) => setFormLocationId(e.target.value)}
                required
              >
                <option value="">Pilih hub operasional KCIC</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Status armada" required>
              <select value={formStatus} onChange={(e) => setFormStatus(e.target.value)}>
                <option value="AVAILABLE">Available — tersedia di pool</option>
                <option value="RESERVED">Reserved — telah dipesan</option>
                <option value="IN_USE">In use — sedang berjalan</option>
                <option value="MAINTENANCE">Maintenance — perawatan</option>
                <option value="INACTIVE">Inactive — nonaktif</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Kapasitas penumpang" required>
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

            <FormField label="Transmisi">
              <select
                value={formTransmission}
                onChange={(e) => setFormTransmission(e.target.value)}
              >
                <option value="AUTOMATIC">Automatic</option>
                <option value="MANUAL">Manual</option>
              </select>
            </FormField>
          </div>

          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-700">Foto kendaraan</span>
              <span className="text-[0.625rem] text-slate-400">Maksimal 5MB (JPG, PNG, WebP)</span>
            </div>

            {uploadError && (
              <div className="flex items-start justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2.5 text-[0.6875rem] text-[var(--status-error-fg)]">
                <span className="min-w-0 leading-relaxed">{uploadError}</span>
                <button
                  type="button"
                  onClick={() => setUploadError(null)}
                  aria-label="Tutup pesan"
                  className="shrink-0 cursor-pointer opacity-70 hover:opacity-100"
                >
                  <X className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
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
              <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] p-3">
                <div className="h-12 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-white">
                  <img
                    src={formImageUrl}
                    alt="Pratinjau kendaraan"
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" fill="%23d4d4d8" viewBox="0 0 24 24"><path fill="%2371717a" d="M5 7 7 3h10l2 4 2 3v8h-3v-2H6v2H3v-8l2-3Z"/></svg>';
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mono-plate truncate text-[0.625rem] text-slate-500">{formImageUrl}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => fileInputRef.current?.click()}
                      className="cursor-pointer rounded-full border border-[var(--border)] bg-white px-2.5 py-1 text-[0.625rem] font-semibold text-slate-700 transition-colors hover:border-[var(--border-strong)]"
                    >
                      {isUploadingImage ? 'Mengunggah…' : 'Ganti foto'}
                    </button>
                    <button
                      type="button"
                      disabled={isUploadingImage || formSubmitting}
                      onClick={() => setFormImageUrl('')}
                      className="cursor-pointer rounded-full border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2.5 py-1 text-[0.625rem] font-semibold text-[var(--status-error-fg)]"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploadingImage || formSubmitting}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--canvas)] px-4 py-6 text-xs text-slate-600 transition-colors hover:border-slate-400 hover:bg-[var(--canvas-sunken)]"
              >
                {isUploadingImage ? (
                  <>
                    <Spinner size="sm" />
                    <span>Mengunggah foto kendaraan…</span>
                  </>
                ) : (
                  <>
                    <Car className="size-6 text-slate-400" strokeWidth={1.7} aria-hidden="true" />
                    <span className="font-semibold text-slate-800">Unggah foto kendaraan</span>
                    <span className="text-[0.625rem] text-slate-400">
                      Klik untuk memilih file gambar (maks. 5MB)
                    </span>
                  </>
                )}
              </button>
            )}

            <div className="pt-1">
              <label htmlFor="vehicle-image-url" className="sr-only">
                URL gambar kendaraan
              </label>
              <input
                id="vehicle-image-url"
                type="text"
                placeholder="Atau tempel URL gambar (https://…)"
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                className="mono-plate"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={formSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="button-secondary"
            >
              Batal
            </button>
            <button type="submit" disabled={formSubmitting} className="button-primary">
              {formSubmitting && <Spinner size="sm" className="text-white" />}
              <span>{editingVehicle ? 'Perbarui kendaraan' : 'Simpan kendaraan'}</span>
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deactivatingVehicle)}
        onClose={() => setDeactivatingVehicle(null)}
        onConfirm={handleDeactivateConfirm}
        title="Nonaktifkan kendaraan"
        message={`Apakah Anda yakin ingin menonaktifkan kendaraan ${deactivatingVehicle?.plateNumber}? Mobil ini tidak akan dapat dipilih untuk pesanan dinas.`}
        confirmLabel="Nonaktifkan"
        isDestructive={true}
        isLoading={isDeactivating}
      />

      {/* Assign driver */}
      <Modal
        isOpen={Boolean(assigningVehicle)}
        onClose={() => setAssigningVehicle(null)}
        title="Tugaskan pengemudi"
        description={
          assigningVehicle
            ? `Tugaskan driver tetap untuk ${assigningVehicle.plateNumber} (${assigningVehicle.brand} ${assigningVehicle.model})`
            : ''
        }
        maxWidth="sm"
      >
        {assignError && (
          <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />
        )}

        <form onSubmit={handleAssignSubmit} className="space-y-4">
          <FormField label="Pilih pengemudi" required>
            <select
              required
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
            >
              <option value="">Pilih pengemudi</option>
              {availableDrivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.user.name} ({d.licenseNumber})
                </option>
              ))}
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningVehicle(null)}
              className="button-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedDriverId}
              className="button-primary"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              <span>Tugaskan driver</span>
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
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat inventaris kendaraan…</p>
        </div>
      }
    >
      <AdminVehiclesContent />
    </Suspense>
  );
}
