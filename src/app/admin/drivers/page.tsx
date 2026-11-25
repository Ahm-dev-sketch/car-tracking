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
import { Icon } from '@/components/ui/Icon';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { translateStatus } from '@/lib/i18n';

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
  const { locale, t, format } = useTranslation();
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
        setApiError(err.error?.message || t.adminPages.drivers.failedLoad);
      }
    } catch {
      if (!isSilent) setApiError(t.adminPages.drivers.networkLoadError);
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
        setAddError(err.error?.message || t.adminPages.drivers.failedCreate);
      }
    } catch {
      setAddError(t.common.networkError);
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
        setEditError(err.error?.message || t.adminPages.drivers.failedUpdate);
      }
    } catch {
      setEditError(t.common.networkError);
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
        setAssignError(err.error?.message || t.adminPages.drivers.failedAssign);
      }
    } catch {
      setAssignError(t.common.networkError);
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
        setApiError(err.error?.message || t.adminPages.drivers.failedUnassign);
      }
    } catch {
      setApiError(t.adminPages.drivers.networkUnassignError);
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
        setApiError(err.error?.message || t.adminPages.drivers.failedDeactivate);
      }
    } catch {
      setApiError(t.adminPages.drivers.networkDeactivateError);
    } finally {
      setIsDeactivating(false);
    }
  };

  const columns: Column<DriverItem>[] = [
    {
      header: t.adminPages.drivers.colName,
      cell: (d) => (
        <div>
          <span className="font-medium text-slate-900">{d.user.name}</span>
          <span className="block text-xs text-slate-500">{d.user.email}</span>
        </div>
      ),
    },
    {
      header: t.adminPages.drivers.colPhone,
      cell: (d) => <span className="font-mono text-xs tabular-nums text-slate-700">{d.user.phone}</span>,
    },
    {
      header: t.adminPages.drivers.colLicense,
      cell: (d) => <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">{d.licenseNumber}</span>,
    },
    {
      header: t.adminPages.drivers.colVehicleAssigned,
      cell: (d) =>
        d.currentVehicle ? (
          <div>
            <span className="font-mono text-xs font-semibold tabular-nums text-slate-900">
              {d.currentVehicle.plateNumber}
            </span>
            <span className="block text-[11px] text-slate-500">
              {d.currentVehicle.brand} {d.currentVehicle.model}
            </span>
            <div className="mt-1 flex flex-wrap items-center gap-1">
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
          <span className="text-xs italic text-slate-400">{t.adminPages.drivers.unassignedLabel}</span>
        ),
    },
    {
      header: t.adminPages.drivers.colStatus,
      cell: (d) => <StatusBadge status={d.status} />,
    },
    {
      header: t.adminPages.drivers.colActions,
      cell: (d) => (
        <div className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {d.currentVehicle ? (
            <button
              type="button"
              onClick={() => setUnassigningDriver(d)}
              className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              {t.adminPages.drivers.unassignBtn}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => handleOpenAssign(d)}
              className="cursor-pointer rounded-lg bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
            >
              {t.adminPages.drivers.assignBtn}
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
            className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            {t.adminPages.drivers.editBtn}
          </button>

          {d.user.isActive && (
            <button
              type="button"
              onClick={() => setDeactivatingDriver(d)}
              className="cursor-pointer rounded-lg border border-danger-200 bg-white px-2.5 py-1 text-xs font-medium text-danger-700 transition-colors hover:bg-danger-50"
            >
              {t.adminPages.drivers.deactivateBtn}
            </button>
          )}
        </div>
      ),
    },
  ];

  const availableCount = drivers.filter((d) => d.status === 'AVAILABLE').length;
  const onTripCount = drivers.filter((d) => d.status === 'ON_TRIP').length;
  const offlineCount = drivers.filter((d) => d.status === 'OFFLINE').length;

  return (
    <div className="space-y-6">
      <div className="mb-7 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t.adminPages.drivers.heading}</h1>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{t.adminPages.drivers.description}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAddOpen(true);
            setAddError(null);
          }}
          className="button-primary inline-flex cursor-pointer items-center gap-1.5 self-start sm:self-auto"
        >
          <Icon name="plus" className="size-4" />
          <span>{t.adminPages.drivers.addDriverBtn}</span>
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.drivers.statTotal}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{totalRecords}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.drivers.statAvailable}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-success-600">{availableCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.drivers.statOnTrip}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-brand-600">{onTripCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.drivers.statOffline}</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-500">{offlineCount}</p>
        </div>
      </div>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      {/* Filter and Search */}
      <div className="flex flex-col items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row">
        <form onSubmit={(e) => { e.preventDefault(); fetchDrivers(1); }} className="flex w-full gap-2 sm:w-96">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
              <Icon name="search" className="size-4 text-slate-400" />
            </span>
            <input
              type="text"
              placeholder={t.adminPages.drivers.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-xs font-medium text-slate-900 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            />
          </div>
          <button type="submit" className="button-primary shrink-0 px-3 text-xs">
            {t.adminPages.drivers.searchBtn}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.drivers.hubLabel}</span>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.drivers.allHubsOption}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{t.adminPages.drivers.statusLabel}</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-800 transition-colors focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-500/15"
            >
              <option value="">{t.adminPages.drivers.allStatusesOption}</option>
              <option value="AVAILABLE">{translateStatus(locale, 'AVAILABLE')}</option>
              <option value="ON_TRIP">{translateStatus(locale, 'ON_TRIP')}</option>
              <option value="OFFLINE">{translateStatus(locale, 'OFFLINE')}</option>
            </select>
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={drivers}
        isLoading={isLoading}
        emptyMessage={t.adminPages.drivers.emptyMessage}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchDrivers(p)}
      />

      {/* Add Driver Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={t.adminPages.drivers.addModalTitle}
        maxWidth="md"
      >
        {addError && <ErrorBanner message={addError} className="mb-4" onDismiss={() => setAddError(null)} />}

        <form onSubmit={handleCreateDriver} className="space-y-4">
          <FormField label={t.adminPages.drivers.fullNameLabel} required>
            <input
              type="text"
              required
              placeholder={t.adminPages.drivers.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.drivers.emailLabel} required>
              <input
                type="email"
                required
                placeholder={t.adminPages.drivers.emailPlaceholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>

            <FormField label={t.adminPages.drivers.phoneLabel} required>
              <input
                type="tel"
                required
                placeholder={t.adminPages.drivers.phonePlaceholder}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t.adminPages.drivers.licenseLabel} required>
              <input
                type="text"
                required
                placeholder={t.adminPages.drivers.licensePlaceholder}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value.toUpperCase())}
                className="font-mono uppercase tabular-nums"
              />
            </FormField>

            <FormField label={t.adminPages.drivers.passwordLabel} required hint={t.adminPages.drivers.passwordHint}>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isSubmittingAdd}
              onClick={() => setIsAddOpen(false)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmittingAdd}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isSubmittingAdd && <Spinner size="sm" className="text-white" />}
              {t.adminPages.drivers.createDriverBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Driver Modal */}
      <Modal
        isOpen={Boolean(editingDriver)}
        onClose={() => setEditingDriver(null)}
        title={editingDriver ? format(t.adminPages.drivers.editModalTitle, { name: editingDriver.user.name }) : ''}
        maxWidth="sm"
      >
        {editError && <ErrorBanner message={editError} className="mb-4" onDismiss={() => setEditError(null)} />}

        <form onSubmit={handleEditDriver} className="space-y-4">
          <FormField label={t.adminPages.drivers.licenseLabel} required>
            <input
              type="text"
              required
              value={editLicense}
              onChange={(e) => setEditLicense(e.target.value.toUpperCase())}
              className="font-mono uppercase tabular-nums"
            />
          </FormField>

          <FormField label={t.adminPages.drivers.dutyStatusLabel} required>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
            >
              <option value="OFFLINE">{t.adminPages.drivers.offlineOption}</option>
              <option value="AVAILABLE">{t.adminPages.drivers.availableOption}</option>
            </select>
          </FormField>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isSubmittingEdit}
              onClick={() => setEditingDriver(null)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isSubmittingEdit && <Spinner size="sm" className="text-white" />}
              {t.adminPages.drivers.saveChangesBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Assign Vehicle Modal */}
      <Modal
        isOpen={Boolean(assigningDriver)}
        onClose={() => setAssigningDriver(null)}
        title={t.adminPages.drivers.assignModalTitle}
        description={assigningDriver ? `${assigningDriver.user.name} (${assigningDriver.user.phone})` : ''}
        maxWidth="md"
      >
        {assignError && <ErrorBanner message={assignError} className="mb-4" onDismiss={() => setAssignError(null)} />}

        <form onSubmit={handleAssignVehicle} className="space-y-4">
          <FormField label={t.adminPages.drivers.poolFilterLabel}>
            <select
              value={assignLocationFilter}
              onChange={(e) => {
                const locId = e.target.value;
                setAssignLocationFilter(locId);
                fetchAvailableVehicles(locId);
                setSelectedVehicleId('');
              }}
            >
              <option value="">{t.adminPages.drivers.allPoolsOption}</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </FormField>

          <FormField label={t.adminPages.drivers.availableVehiclesLabel} required>
            {isLoadingVehicles ? (
              <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
                <Spinner size="sm" className="text-slate-600" />
                <span>{t.adminPages.drivers.loadingPoolVehicles}</span>
              </div>
            ) : availableVehicles.length === 0 ? (
              <div className="rounded-lg border border-warning-200 bg-warning-50 p-3 text-xs leading-relaxed text-warning-700">
                {assignLocationFilter ? t.adminPages.drivers.noPoolVehiclesLoc : t.adminPages.drivers.noPoolVehiclesAny}
              </div>
            ) : (
              <select
                required
                value={selectedVehicleId}
                onChange={(e) => setSelectedVehicleId(e.target.value)}
              >
                <option value="">{format(t.adminPages.drivers.chooseVehicleOption, { count: availableVehicles.length })}</option>
                {availableVehicles.map((v) => {
                  const hub = v.currentOperationalLocation?.name || v.homeLocation?.name;
                  return (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} ({v.brand} {v.model}){hub ? ` — ${hub}` : ''}
                    </option>
                  );
                })}
              </select>
            )}
          </FormField>

          <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
            <button
              type="button"
              disabled={isAssigning}
              onClick={() => setAssigningDriver(null)}
              className="min-h-9 cursor-pointer rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {t.common.cancel}
            </button>
            <button
              type="submit"
              disabled={isAssigning || !selectedVehicleId}
              className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
            >
              {isAssigning && <Spinner size="sm" className="text-white" />}
              {t.adminPages.drivers.assignVehicleBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* Unassign Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(unassigningDriver)}
        onClose={() => setUnassigningDriver(null)}
        onConfirm={handleUnassignVehicle}
        title={t.adminPages.drivers.unassignModalTitle}
        message={format(t.adminPages.drivers.unassignModalMessage, { name: unassigningDriver?.user.name || '' })}
        confirmLabel={t.adminPages.drivers.unassignConfirmBtn}
        isDestructive={false}
        isLoading={isUnassigning}
      />

      {/* Deactivate Driver Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deactivatingDriver)}
        onClose={() => setDeactivatingDriver(null)}
        onConfirm={handleDeactivateDriver}
        title={t.adminPages.drivers.deactivateModalTitle}
        message={format(t.adminPages.drivers.deactivateModalMessage, { name: deactivatingDriver?.user.name || '' })}
        confirmLabel={t.adminPages.drivers.deactivateConfirmBtn}
        isDestructive={true}
        isLoading={isDeactivating}
      />
    </div>
  );
}

export default function AdminDriversPage() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="py-24 text-center text-xs text-slate-500">
          <Spinner size="md" className="mb-2" />
          <p>{t.adminPages.drivers.loadingSuspense}</p>
        </div>
      }
    >
      <AdminDriversContent />
    </Suspense>
  );
}
