'use client';

import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Spinner } from '@/components/ui/Spinner';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Plus, Search } from 'lucide-react';

interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  isActive: boolean;
  role: {
    id: string;
    code: string;
    name: string;
  };
  createdAt: string;
}

interface RoleItem {
  id: string;
  code: string;
  name: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Create User Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Reset Password Modal
  const [resettingUser, setResettingUser] = useState<UserItem | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmittingReset, setIsSubmittingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Toggle Active State
  const [togglingUser, setTogglingUser] = useState<UserItem | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const fetchUsers = async (targetPage = 1) => {
    setIsLoading(true);
    setApiError(null);
    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        limit: '10',
      });
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        const list: UserItem[] = json.data || [];
        setUsers(list);
        setTotalRecords(json.pagination?.total ?? list.length);
        setTotalPages(json.pagination?.totalPages ?? 1);
        setPage(targetPage);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to load users');
      }
    } catch {
      setApiError('Network error loading users');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch('/api/roles');
      if (res.ok) {
        const json = await res.json();
        setRoles(json.data || []);
      }
    } catch {
      // fallback
    }
  };

  useEffect(() => {
    fetchUsers(1);
    fetchRoles();
  }, []);

  const handleOpenCreate = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormPassword('');
    setFormRoleId(roles[0]?.id || '');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingCreate(true);
    setCreateError(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim().toLowerCase(),
          phone: formPhone.trim(),
          password: formPassword,
          roleId: formRoleId,
        }),
      });

      if (res.ok) {
        setIsCreateOpen(false);
        fetchUsers(1);
      } else {
        const err = await res.json();
        setCreateError(err.error?.message || 'Failed to create user');
      }
    } catch {
      setCreateError('Network error creating user');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser || newPassword.length < 8) return;
    setIsSubmittingReset(true);
    setResetError(null);

    try {
      const res = await fetch(`/api/admin/users/${resettingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });

      if (res.ok) {
        setResettingUser(null);
        setNewPassword('');
      } else {
        const err = await res.json();
        setResetError(err.error?.message || 'Failed to reset password');
      }
    } catch {
      setResetError('Network error resetting password');
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const handleToggleActiveConfirm = async () => {
    if (!togglingUser) return;
    setIsToggling(true);

    try {
      const res = await fetch(`/api/admin/users/${togglingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !togglingUser.isActive }),
      });

      if (res.ok) {
        setTogglingUser(null);
        fetchUsers(page);
      } else {
        const err = await res.json();
        setApiError(err.error?.message || 'Failed to update user status');
      }
    } catch {
      setApiError('Network error updating user');
    } finally {
      setIsToggling(false);
    }
  };

  const columns: Column<UserItem>[] = [
    {
      header: 'Pengguna',
      cell: (u) => (
        <div className="min-w-0 max-w-[14rem]">
          <span className="block truncate text-[0.8125rem] font-semibold text-slate-900">
            {u.name}
          </span>
          <span className="block truncate text-xs text-slate-500">{u.email}</span>
        </div>
      ),
    },
    {
      header: 'Telepon',
      accessorKey: 'phone',
      cell: (u) => (
        <span className="tabular-nums whitespace-nowrap text-xs text-slate-700">{u.phone}</span>
      ),
    },
    {
      header: 'Peran',
      cell: (u) => (
        <span className={`pill ${u.role.code === 'ADMIN' ? 'pill-error' : 'pill-standby'}`}>
          <span className="pill-dot" aria-hidden="true" />
          <span>{u.role.code === 'DRIVER' ? 'Driver' : u.role.code === 'ADMIN' ? 'Admin' : 'Pemesan'}</span>
        </span>
      ),
    },
    {
      header: 'Status akun',
      cell: (u) => (
        <span className={`pill ${u.isActive ? 'pill-active' : ''}`}>
          <span className="pill-dot" aria-hidden="true" />
          <span>{u.isActive ? 'Aktif' : 'Non-aktif'}</span>
        </span>
      ),
    },
    {
      header: 'Aksi',
      cell: (u) => (
        <div
          className="flex flex-wrap items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              setResettingUser(u);
              setNewPassword('');
              setResetError(null);
            }}
            className="cursor-pointer rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-2.5 py-1 text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
          >
            Reset password
          </button>

          <button
            type="button"
            onClick={() => setTogglingUser(u)}
            className={`cursor-pointer rounded-[var(--radius-full)] border px-2.5 py-1 text-[0.6875rem] font-semibold transition-opacity hover:opacity-80 ${
              u.isActive
                ? 'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-fg)]'
                : 'border-[var(--status-active-border)] bg-[var(--status-active-bg)] text-[var(--status-active-fg)]'
            }`}
          >
            {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      ),
    },
  ];
  return (
    <div className="w-full min-w-0 space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <span className="eyebrow eyebrow-accent">Akses &amp; identitas</span>
          <h1 className="page-heading mt-2">Manajemen pengguna sistem</h1>
          <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-slate-500">
            Kelola akun karyawan, hak akses peran sistem, dan kredensial login KCIC Fleet.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreate}
          className="button-primary self-start sm:self-auto"
        >
          <Plus className="size-4" strokeWidth={2.2} aria-hidden="true" />
          <span>Tambah pengguna</span>
        </button>
      </header>

      {apiError && <ErrorBanner message={apiError} onDismiss={() => setApiError(null)} />}

      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchUsers(1);
          }}
          className="flex w-full gap-2 sm:w-80"
        >
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="user-search">
              Cari pengguna
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400"
              strokeWidth={2}
              aria-hidden="true"
            />
            <input
              id="user-search"
              type="text"
              placeholder="Cari nama atau email&hellip;"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <button type="submit" className="button-secondary px-3.5 py-2 text-[0.6875rem]">
            Cari
          </button>
        </form>
      </div>

      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        emptyMessage="Tidak ada pengguna ditemukan"
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        totalRecords={totalRecords}
        onPageChange={(p) => fetchUsers(p)}
      />

      {/* Create user */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Buat akun pengguna baru"
        description="Registrasi akun internal untuk pegawai pemesan, driver, atau admin."
        maxWidth="md"
      >
        {createError && (
          <ErrorBanner
            message={createError}
            className="mb-4"
            onDismiss={() => setCreateError(null)}
          />
        )}

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <FormField label="Nama lengkap" required>
            <input
              type="text"
              required
              placeholder="Contoh: Rian Anggoro"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Alamat email" required>
              <input
                type="email"
                required
                autoComplete="off"
                placeholder="user@kcic.co.id"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </FormField>

            <FormField label="Nomor telepon" required>
              <input
                type="tel"
                required
                placeholder="081234567890"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                className="tabular-nums"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Peran sistem" required>
              <select
                required
                value={formRoleId}
                onChange={(e) => setFormRoleId(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} ({r.name})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Password awal" required hint="Minimal 8 karakter">
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
              />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={isSubmittingCreate}
              onClick={() => setIsCreateOpen(false)}
              className="button-secondary"
            >
              Batal
            </button>
            <button type="submit" disabled={isSubmittingCreate} className="button-primary">
              {isSubmittingCreate && <Spinner size="xs" />}
              <span>Buat pengguna</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal
        isOpen={Boolean(resettingUser)}
        onClose={() => setResettingUser(null)}
        title="Reset password pengguna"
        description={
          resettingUser ? `${resettingUser.name} \u00b7 ${resettingUser.email}` : ''
        }
        maxWidth="sm"
      >
        {resetError && (
          <ErrorBanner message={resetError} className="mb-4" onDismiss={() => setResetError(null)} />
        )}

        <form onSubmit={handleResetSubmit} className="space-y-4">
          <FormField label="Password baru" required hint="Minimal 8 karakter">
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </FormField>

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] pt-4">
            <button
              type="button"
              disabled={isSubmittingReset}
              onClick={() => setResettingUser(null)}
              className="button-secondary"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmittingReset || newPassword.length < 8}
              className="button-primary"
            >
              {isSubmittingReset && <Spinner size="xs" />}
              <span>Perbarui password</span>
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(togglingUser)}
        onClose={() => setTogglingUser(null)}
        onConfirm={handleToggleActiveConfirm}
        title={togglingUser?.isActive ? 'Nonaktifkan pengguna' : 'Aktifkan pengguna'}
        message={
          togglingUser?.isActive
            ? `Akun ${togglingUser?.name} akan dinonaktifkan dan tidak bisa masuk ke sistem lagi. Lanjutkan?`
            : `Akun ${togglingUser?.name} akan diaktifkan kembali. Lanjutkan?`
        }
        confirmLabel={togglingUser?.isActive ? 'Nonaktifkan' : 'Aktifkan'}
        isDestructive={togglingUser?.isActive}
        isLoading={isToggling}
      />
    </div>
  );
}
