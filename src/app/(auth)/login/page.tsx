'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Car,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { signIn } from 'next-auth/react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';

const demoAccounts = [
  { label: 'User', caption: 'Penumpang', email: 'user@demo.test' },
  { label: 'Driver', caption: 'Budi · Halim', email: 'driver1@demo.test' },
  { label: 'Admin', caption: 'Operasional', email: 'admin@demo.test' },
] as const;

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    errorParam === 'MissingCSRF' || errorParam === 'CSRFError'
      ? 'Sesi autentikasi telah disegarkan. Silakan coba masuk kembali.'
      : null
  );

  // Strip the stale ?error=... query param from the address bar. No state is
  // written here: the message above is seeded on the first render instead.
  React.useEffect(() => {
    if (!errorParam) return;
    try {
      const cleanUrl = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login';
      window.history.replaceState({}, '', cleanUrl);
    } catch {
      // ignore
    }
  }, [errorParam, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await Promise.race([
        signIn('credentials', {
          redirect: false,
          email: email.trim().toLowerCase(),
          password,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Permintaan masuk melebihi batas waktu (timeout). Periksa koneksi Anda.')),
            20000
          )
        ),
      ]);

      if (!res || res.error) {
        if (res?.error === 'MissingCSRF' || res?.error === 'CSRFError') {
          setError('Sesi autentikasi telah diperbarui. Silakan coba masuk kembali.');
        } else if (res?.error === 'CredentialsSignin') {
          setError('Email atau kata sandi tidak valid. Gunakan tombol Akun Demo di bawah untuk mencoba.');
        } else {
          setError(res?.error ? `Gagal masuk: ${res.error}` : 'Email atau password salah');
        }
        return;
      }

      resetInstallDismissal();

      let target = '/user';
      try {
        const meRes = await fetch('/api/me');
        if (meRes.ok) {
          const { user } = await meRes.json();
          if (user?.role === 'ADMIN') target = '/admin';
          else if (user?.role === 'DRIVER') target = '/driver';
        }
      } catch (meErr) {
        console.error('[login] /api/me failed, using default target', meErr);
      }

      const safeCallback =
        callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') && !callbackUrl.startsWith('/login')
          ? callbackUrl
          : null;

      const destination = safeCallback || target;
      window.location.href = destination;
    } catch (err: unknown) {
      console.error('Login Error:', err);
      const msg = err instanceof Error && err.message ? err.message : 'Autentikasi gagal. Silakan coba lagi.';
      setError(
        msg.includes('Failed to construct')
          ? 'Terlalu banyak percobaan. Harap tunggu beberapa menit sebelum mencoba kembali.'
          : msg
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full rounded-[var(--radius-2xl)] bg-white p-6 shadow-[var(--shadow-md)] sm:p-8">
      <div className="mb-6 text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[var(--kcic-red-soft)] text-[#C8102E]">
          <Car className="size-5" strokeWidth={1.9} aria-hidden="true" />
        </span>
        <h1 className="text-[1.5rem] font-bold tracking-[-0.035em] text-slate-900">Masuk ke akun</h1>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          Sistem pelacakan armada dan operasional KCIC Whoosh
        </p>
      </div>

      {error && <ErrorBanner message={error} className="mb-4" onDismiss={() => setError(null)} />}

      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between px-0.5">
          <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold text-slate-600">
            <Sparkles className="size-3" strokeWidth={2} aria-hidden="true" />
            Akun demo
          </span>
          <span className="font-mono text-[0.6875rem] text-slate-400">Demo1234</span>
        </div>
        <div className="grid grid-cols-3 gap-1 rounded-[var(--radius-lg)] bg-[var(--canvas)] p-1">
          {demoAccounts.map((account) => {
            const isPicked = email === account.email;
            return (
              <button
                key={account.email}
                type="button"
                aria-pressed={isPicked}
                onClick={() => {
                  setEmail(account.email);
                  setPassword('Demo1234');
                  setError(null);
                }}
                className={`flex cursor-pointer flex-col items-center rounded-[var(--radius-md)] px-1 py-1.5 text-center transition-all ${
                  isPicked
                    ? 'bg-white text-slate-900 shadow-[var(--shadow-xs)]'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className="text-xs font-semibold">{account.label}</span>
                <span className={`mt-0.5 truncate text-[0.625rem] ${isPicked ? 'text-slate-500' : 'text-slate-400'}`}>
                  {account.caption}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3.5" aria-busy={isLoading}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-600">
            Email kerja
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.9}
              aria-hidden="true"
            />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@kcic.co.id"
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-600">
            Kata sandi
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              strokeWidth={1.9}
              aria-hidden="true"
            />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-[var(--canvas)] hover:text-slate-600"
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            >
              {showPassword ? (
                <EyeOff className="size-4" strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Eye className="size-4" strokeWidth={1.9} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <label className="flex cursor-pointer select-none items-center gap-2">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4 rounded-[4px] border-[var(--border-strong)] accent-[#C8102E]"
            />
            <span className="text-xs text-slate-600">Ingat saya</span>
          </label>
          <span className="cursor-pointer text-xs font-medium text-[#C8102E] hover:underline">
            Bantuan akses
          </span>
        </div>

        <button type="submit" disabled={isLoading} className="button-primary mt-1 w-full">
          {isLoading && <Spinner size="sm" />}
          <span>{isLoading ? 'Memverifikasi…' : 'Masuk'}</span>
          {!isLoading && <ArrowRight className="size-4" strokeWidth={2} aria-hidden="true" />}
        </button>
      </form>

      <div className="mt-5 flex items-start gap-2 border-t border-[var(--border-subtle)] pt-4">
        <ShieldCheck className="mt-px size-3.5 shrink-0 text-[#059669]" strokeWidth={2} aria-hidden="true" />
        <p className="text-[0.6875rem] leading-relaxed text-slate-500">
          Akses operasional resmi KCIC Whoosh. Terenkripsi SSL 256-bit dan diawasi Divisi Fleet
          &amp; Angkutan Dinas.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative min-h-dvh bg-[var(--canvas)] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-slate-900 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[26rem] flex-col">
        <header className="flex items-center justify-center gap-4 py-2">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="brand-mark">
              <Car className="size-4" strokeWidth={2.1} aria-hidden="true" />
            </span>
            <span className="brand-word">
              KCIC <span>Fleet</span>
            </span>
          </Link>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <div className="w-full min-w-0 max-w-[26rem]">
            <React.Suspense
              fallback={
                <div
                  role="status"
                  className="flex min-h-[26rem] flex-col items-center justify-center gap-3 rounded-[var(--radius-2xl)] bg-white text-xs text-slate-500 shadow-[var(--shadow-md)]"
                >
                  <Spinner size="md" className="text-[#C8102E]" />
                  <span>Memuat formulir…</span>
                </div>
              }
            >
              <LoginForm />
            </React.Suspense>

            <p className="mt-4 text-center text-[0.6875rem] text-slate-400">
              KCIC Fleet · Operasional Whoosh 2026
            </p>
          </div>
        </div>

        <footer className="flex flex-col items-center gap-1 border-t border-[var(--border)] py-4 text-center text-[0.6875rem] text-slate-400">
          <span>PT Kereta Cepat Indonesia China · © 2026</span>
          <span className="hidden sm:inline">Keamanan ISO 27001 · Telemetri RTK GPS</span>
        </footer>
      </div>
    </main>
  );
}
