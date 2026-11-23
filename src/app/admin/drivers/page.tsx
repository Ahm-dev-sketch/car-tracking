'use client';

import React, { useState, useEffect, Suspense } from 'react';
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
import { Plus, Search } from 'lucide-react';

interface OperationalLocation {
  id: string;
  name: string;
  code: string;
}

interface DriverItem {
  id: string;
  licenseNumber: string;
  status: string;
  currentVehicleId?: string | null;
  user: {
    id: string;
    email: string;
    name: string;
    phone: string;
    isActive: boolean;
  };
  currentVehicle?: {
    id: string;
    plateNumber: string;
    brand: string;
    model: string;
    status: string;
    homeLocation?: { id: string; name: string; code: string } | null;
    currentOperationalLocation?: { id: string; name: string; code: string } | null;
  } | null;
}

function AdminDriversContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [drivers, setDrivers] = useState<DriverItem[]>([]);
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

  // Add Driver Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Edit Driver Modal
  const [editingDriver, setEditingDriver] = useState<DriverItem | null>(null);
  const [editLicense, setEditLicense] = useState('');
  const [editStatus, setEditStatus] = useState('OFFLINE');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Assign Vehicle Modal
  const [assigningDriver, setAssigningDriver] = useState<DriverItem | null>(null);
  const [availableVehicles, setAvailableVehicles] = useState<
    Array<{
      id: string;
      plateNumber: string;
      brand: string;
      model: string;
      homeLocation?: { id: string; name: string; code: string } | null;
      currentOperationalLocation?: { id: string; name: string; code: string } | null;
    }>
  >([]);
  const [assignLocationFilter, setAssignLocationFilter] = useState('');
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Unassign Confirm
  const [unassigningDriver, setUnassigningDriver] = useState<DriverItem | null>(null);
  const [isUnassigning, setIsUnassigning] = useState(false);

  // Deactivate Driver Confirm
  const [deactivatingDriver, setDeactivatingDriver] = useState<DriverItem | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Load locations
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
    router.replace(`/admin/drivers?${params.toString()}`);
  };

  const fetchDrivers = async (targetPage = 1, isSilent = false) => {
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

      const res = await fetch(`/api/drivers?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (!json.warning) {
          const list: DriverItem[] = json.data || [];
          setDrivers(list);
          setTotalRecords(json.pagination?.total ?? list.length);
          setTotalPages(json.pagination?.totalPages ?? 1);
          setPage(targetPage);
        }
      } else if (!isSilent) {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load drivers');
      }
    } catch {
      if (!isSilent) setApiError('Network error loading drivers');
    } finally {
      if (!isSilent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers(1);
    syncUrlParams({
      search,
      status: statusFilter,
      locationId: locationFilter,
    });
  }, [statusFilter, locationFilter]);

  // Keep driver statuses, assigned vehicles, and availability live without manual page refresh
  useEffect(() => {
    const isInteracting = isAddOpen || editingDriver || assigningDriver || unassigningDriver || deactivatingDriver;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isInteracting) {
        void fetchDrivers(page, true);
      }
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [page, isAddOpen, editingDriver, assigningDriver, unassigningDriver, deactivatingDriver, search, statusFilter, locationFilter]);

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAdd(true);
    setAddError(null);

    try {
      const res = await fetch('/api/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          licenseNumber: licenseNumber.trim().toUpperCase(),
          password,
        }),
      });

      if (res.ok) {
        setIsAddOpen(false);
        setName('');
        setEmail('');
        setPhone('');
        setLicenseNumber('');
        setPassword('');
        fetchDrivers(1);
      } else {
        const err = await res.json();
        setAddError(err.error?.message || 'Failed to create driver');
      }
    } catch {
      setAddError('Network error creating driver');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleEditDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDriver) return;
    setIsSubmittingEdit(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/drivers/${editingDriver.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseNumber: editLicense.trim().toUpperCase(),
          status: editStatus,
        }),
      });

      if (res.ok) {
        setEditingDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setEditError(err.error?.message || 'Failed to update driver');
      }
    } catch {
      setEditError('Network error updating driver');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const fetchAvailableVehicles = async (locId?: string) => {
    setIsLoadingVehicles(true);
    try {
      const url = `/api/vehicles?status=AVAILABLE&limit=50${locId ? `&locationId=${encodeURIComponent(locId)}` : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setAvailableVehicles(json.data || json.vehicles || []);
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const handleOpenAssign = async (d: DriverItem) => {
    setAssigningDriver(d);
    setSelectedVehicleId('');
    setAssignError(null);
    const initialLocation = locationFilter || '';
    setAssignLocationFilter(initialLocation);
    await fetchAvailableVehicles(initialLocation);
  };

  const handleAssignVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningDriver || !selectedVehicleId) return;
    setIsAssigning(true);
    setAssignError(null);

    try {
      const res = await fetch(`/api/admin/drivers/${assigningDriver.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: selectedVehicleId }),
      });

      if (res.ok) {
        setAssigningDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setAssignError(err.error?.message || 'Failed to assign vehicle');
      }
    } catch {
      setAssignError('Network error assigning vehicle');
    } finally {
      setIsAssigning(false);
    }
  };

  const handleUnassignVehicle = async () => {
    if (!unassigningDriver) return;
    setIsUnassigning(true);

    try {
      const res = await fetch(`/api/admin/drivers/${unassigningDriver.id}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Admin unassigned' }),
      });

      if (res.ok) {
        setUnassigningDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to unassign vehicle');
      }
    } catch {
      setApiError('Network error unassigning vehicle');
    } finally {
      setIsUnassigning(false);
    }
  };

  const handleDeactivateDriver = async () => {
    if (!deactivatingDriver) return;
    setIsDeactivating(true);

    try {
      const res = await fetch(`/api/drivers/${deactivatingDriver.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setDeactivatingDriver(null);
        fetchDrivers(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to deactivate driver');
      }
    } catch {
      setApiError('Network error deactivating driver');
    } finally {
      setIsDeactivating(false);
    }
  };

  const columns: Column<DriverItem>[] = [
    {
      header: 'Pengemudi',
      cell: (d) => (
        <div className="min-w-0 max-w-[13rem]">
          <span className="block truncate text-[0.8125rem] font-semibold text-slate-900">
            {d.user.name}
          </span>
          <span className="block truncate text-xs text-slate-500">{d.user.email}</span>
        </div>
      ),
    },
    {
      header: 'Telepon',
      cell: (d) => (
        <span className="tabular-nums whitespace-nowrap text-xs text-slate-700">{d.user.phone}</span>
      ),
    },
    {
      header: 'SIM',
      cell: (d) => (
        <span className="mono-plate whitespace-nowrap rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--canvas)] px-1.5 py-0.5 text-[0.6875rem] font-semibold text-slate-800">
          {d.licenseNumber}
        </span>
      ),
    },
    {
      header: 'Armada',
      cell: (d) =>
        d.currentVehicle ? (
          <div className="min-w-0 space-y-1">
            <span className="mono-plate block text-[0.6875rem] font-semibold text-slate-900">
              {d.currentVehicle.plateNumber}
            </span>
            <span className="block max-w-[9.5rem] truncate text-[0.6875rem] text-slate-500">
              {d.currentVehicle.brand} {d.currentVehicle.model}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {d.currentVehicle.homeLocation && (
                <LocationBadge
                  type="home"
                  name={d.currentVehicle.homeLocation.name}
                  code={d.currentVehicle.homeLocation.code}
                />
              )}
              {d.currentVehicle.currentOperationalLocation && (
                <LocationBadge
                  type="current"
                  name={d.currentVehicle.currentOperationalLocation.name}
                  code={d.currentVehicle.currentOperationalLocation.code}
                />
              )}
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Belum ditugaskan</span>
        ),
    },
    {
      header: 'Status',
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      header: 'Aksi',
      cell: (d) => (
        <div
          className="flex flex-wrap items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          {d.currentVehicle ? (
            <button
              type="button"
              onClick={() => setUnassigningDriver(d)}
              className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
            >
              Lepas mobil
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenAssign(d)}
              className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--slate-navy)] bg-[var(--slate-navy)] px-2.5 py-1 text-[0.6875rem] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Tugaskan
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setEditingDriver(d);
              setEditLicense(d.licenseNumber);
              setEditStatus(d.status);
              setEditError(null);
            }}
            className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
          >
            Edit
          </button>

          {d.user.isActive && (
            <button
              type="button"
              onClick={() => setDeactivatingDriver(d)}
              className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-2.5 py-1 text-[0.6875rem] font-semibold text-[var(--status-error-fg)] transition-opacity hover:opacity-80"
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
          <span className="eyebrow eyebrow-accent">Personel armada</span>
          <h1 className="page-heading mt-2">Direktori pengemudi &amp; SIM</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Kelola data pengemudi dinas KCIC, verifikasi lisensi SIM, dan penugasan armada
            kendaraan.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAddOpen(true);
            setAddError(null);
          }}
          className="button-primary self-start sm:self-auto"
        >
          <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
          <span>Tambah driver</span>
        </button>
      </header>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Search & filters */}
      <div className="card flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchDrivers(1);
          }}
          className="flex w-full gap-2 md:w-80"
        >
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="driver-search">
              Cari pengemudi
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              id="driver-search"
              type="text"
              placeholder="Cari nama, SIM, email&hellip;"
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
            <label htmlFor="driver-hub-filter" className="metric-label shrink-0">
              Hub
            </label>
            <select
              id="driver-hub-filter"
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
            <label htmlFor="driver-status-filter" className="metric-label shrink-0">
              Status
            </label>
            <select
              id="driver-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-auto min-w-0 rounded-full py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold"
            >
              <option value="">Semua status</option>
              <option value="AVAILABLE">Tersedia</option>
              <option value="ON_TRIP">On trip</option>
              <option value="OFFLINE">Offline</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={drivers}
        isLoading={isLoading}
        emptyMessage="Belum ada pengemudi terdaftar"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchDrivers(p)}
      />

      {/* Add driver */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Tambah driver baru"
        description="Registrasi akun pengemudi dinas KCIC beserta nomor SIM aktif."
        maxWidth="md"
      >
        {addError && (
          <ErrorBanner message={addError} className="mb-4" onDismiss={() => setAddError(null)} />
        )}

        <form onSubmit={handleCreateDriver} className="space-y-4">
          <FormField label="Nama lengkap" required>
            <input
              type="text"
              required
              placeholder="Contoh: Budi Santoso"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Alamat email" required>
              <input
                type="email"
                required
                autoComplete="off"
                placeholder="driver@kcic.co.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>

            <FormField label="Telepon / WhatsApp" required>
              <input
                type="tel"
                required
                placeholder="081234567890"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Nomor SIM" required>
              <input
                type="text"
                required
                placeholder="SIM-A-123456"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                className="mono-plate uppercase"
              />
            </FormField>

            <FormField label="Password awal" required hint="Minimal 8 karakter">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={isSubmittingAdd}
              onClick={() => setIsAddOpen(false)}
              className="button-secondary"
            >
              Batal
            </button>
            <button type="submit" disabled={isSubmittingAdd} className="button-primary">
              {isSubmittingAdd && <Spinner size="xs" />}
              <span>Daftarkan driver</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit driver */}
      <Modal
        isOpen={Boolean(editingDriver)}
        onClose={() => setEditingDriver(null)}
        title={editingDriver ? `Edit driver \u00b7 ${editingDriver.user.name}` : 'Edit driver'}
        description="Perbarui lisensi mengemudi dan status dinas pengemudi."
        maxWidth="sm"
      >
        {editError && (
          <ErrorBanner message={editError} className="mb-4" onDismiss={() => setEditError(null)} />
        )}

        <form onSubmit={handleEditDriver} className="space-y-4">
          <FormField label="Nomor SIM" required>
            <input
              type="text"
              required
              value={editLicense}
              onChange={(e) => setEditLicense(e.target.value.toUpperCase())}
              className="mono-plate uppercase"
            />
          </FormField>

          <FormField label="Status dinas" required>
            <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              <option value="OFFLINE">Offline</option>
              <option value="AVAILABLE">Tersedia &mdash; butuh kendaraan</option>
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={isSubmittingEdit}
              onClick={() => setEditingDriver(null)}
              className="button-secondary"
            >
              Batal
            </button>
            <button type="submit" disabled={isSubmittingEdit} className="button-primary">
              {isSubmittingEdit && <Spinner size="xs" />}
              <span>Simpan perubahan</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign vehicle */}
      <Modal
        isOpen={Boolean(assigningDriver)}
        onClose={() => setAssigningDriver(null)}
        title="Tugaskan kendaraan"
        description={
          assigningDriver
            ? `${assigningDriver.user.name} \u00b7 ${assigningDriver.user.phone}`
            : ''
        }
        maxWidth="md"
      >
        {assignError && (
          <ErrorBanner
            message={assignError}
            className="mb-4"
            onDismiss={() => setAssignError(null)}
          />
        )}

        <form onSubmit={handleAssignVehicle} className="space-y-4">
          <FormField label="Lokasi pool armada">
            <select
              value={assignLocationFilter}
              onChange={(e) => {
                const locId = e.target.value;
                setAssignLocationFilter(locId);
                fetchAvailableVehicles(locId);
                setSelectedVehicleId('');
              }}
            >
              <option value="">Semua lokasi pool</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Kendaraan tersedia" required>
            {isLoadingVehicles ? (
              <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                <Spinner size="xs" />
                <span>Memuat kendaraan pool&hellip;</span>
              </div>
            ) : availableVehicles.length === 0 ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2.5 text-xs leading-relaxed text-[var(--status-warning-fg)]">
                Tidak ada kendaraan tersedia
                {assignLocationFilter ? ' di lokasi pool ini' : ''}. Silakan pilih lokasi pool lain.
              </div>
            ) : (
              <select
                required
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">Pilih kendaraan ({availableVehicles.length} tersedia)</option>
                {availableVehicles.map((v) => {
                  const hub = v.currentOperationalLocation?.name || v.homeLocation?.name;
                  return (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} ({v.brand} {v.model}){hub ? ` \u2014 ${hub}` : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningDriver(null)}
              className="button-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedVehicleId}
              className="button-primary"
            >
              {isAssigning && <Spinner size="xs" />}
              <span>Tugaskan kendaraan</span>
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(unassigningDriver)}
        onClose={() => setUnassigningDriver(null)}
        onConfirm={handleUnassignVehicle}
        title="Lepas kendaraan"
        message={`Kendaraan ${unassigningDriver?.currentVehicle?.plateNumber} akan dilepas dari ${unassigningDriver?.user.name}. Lanjutkan?`}
        confirmLabel="Lepas kendaraan"
        isDestructive={false}
        isLoading={isUnassigning}
      />

      <ConfirmDialog
        isOpen={Boolean(deactivatingDriver)}
        onClose={() => setDeactivatingDriver(null)}
        onConfirm={handleDeactivateDriver}
        title="Nonaktifkan pengemudi"
        message={`${deactivatingDriver?.user.name} tidak akan bisa masuk atau mengoperasikan armada lagi. Lanjutkan?`}
        confirmLabel="Nonaktifkan"
        isDestructive={true}
        isLoading={isDeactivating}
      />
    </div>
  );
}

export default function AdminDriversPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-xs text-slate-500">
          <Spinner size="md" className="text-[var(--kcic-red)]" />
          <p>Memuat direktori pengemudi&hellip;</p>
        </div>
      }
    >
      <AdminDriversContent />
    </Suspense>
  );
}
