'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import { Icon as LoginIcon } from '@/components/ui/Icon';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';

/** KCIC Halim–Tegalluar corridor, eastbound node order. */
const CORRIDOR_NODES = ['Halim', 'Karawang', 'Padalarang', 'Tegalluar'];

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Clean up any stale ?error=... query param from browser bar on load
  React.useEffect(() => {
    if (errorParam) {
      if (errorParam === 'MissingCSRF' || errorParam === 'CSRFError') {
        setError('Sesi autentikasi telah disegarkan. Silakan coba masuk kembali.');
      }
      try {
        const cleanUrl = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login';
        window.history.replaceState({}, '', cleanUrl);
      } catch {
        // ignore
      }
    }
  }, [errorParam, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[login] submit start', { email, callbackUrl });
    setError(null);
    setIsLoading(true);

    try {
      // Timeout guard: a hung signIn() must not leave the button frozen forever
      const res = await Promise.race([
        signIn('credentials', {
          redirect: false,
          email: email.trim().toLowerCase(),
          password,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Login request timed out. Check your connection and try again.')),
            20000
          )
        ),
      ]);
      console.log('[login] auth response received', res);

      if (!res || res.error) {
        if (res?.error === 'MissingCSRF' || res?.error === 'CSRFError') {
          setError('Sesi autentikasi telah diperbarui. Silakan coba masuk kembali.');
        } else if (res?.error === 'CredentialsSignin') {
          setError('Email atau password salah. Jika ingin mencoba, Anda dapat mengklik tombol Akun Demo di atas.');
        } else {
          setError(res?.error ? `Gagal masuk: ${res.error}` : 'Email atau password salah');
        }
        return;
      }

      // Reset install dismissal state so the prompt is ready to offer on new session
      resetInstallDismissal();

      // Resolve target by role
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

      // searchParams.get() already decodes; only accept same-origin paths (no open redirect)
      const safeCallback =
        callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') && !callbackUrl.startsWith('/login')
          ? callbackUrl
          : null;

      const destination = safeCallback || target;
      console.log('[login] redirecting to', destination);
      // Hard redirect: guarantees the fresh auth cookie is sent on the next request,
      // so middleware cannot miss the session (router.push could race it)
      window.location.href = destination;
    } catch (err: unknown) {
      console.error('Login Error:', err);
      const msg = err instanceof Error && err.message ? err.message : 'Authentication failed. Please try again.';
      // next-auth beta throws "Failed to construct 'URL'" when the server answers 429 (rate limit)
      setError(
        msg.includes('Failed to construct')
          ? 'Too many attempts. Please wait a few minutes and try again.'
          : msg
      );
    } finally {
      // Never leave the form stuck in "Signing in..."
      setIsLoading(false);
    }
  };

  const fieldClass =
    'min-h-12 w-full rounded-lg border border-slate-200 bg-white py-3 pl-11 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15';

  const isUserDemo = email === 'user@demo.test';
  const isDriverDemo = email === 'driver1@demo.test';
  const isAdminDemo = email === 'admin@demo.test';

  const demoClass = (active: boolean) =>
    `flex cursor-pointer flex-col items-start justify-center rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
      active
        ? 'border-brand-500 bg-brand-50'
        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
    }`;

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-7">
      <div className="mb-6">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <span className="h-3 w-0.5 rounded-full bg-brand-500" aria-hidden="true" />
          KCIC FLEET OPERATIONS
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Masuk ke Sistem</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Masuk untuk memesan perjalanan dan memantau operasional armada KCIC.
        </p>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          className="mb-6"
          onDismiss={() => setError(null)}
        />
      )}

      {/* Quick Demo Fill Buttons */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Akun Demo Siap Pakai
          </span>
          <span className="font-mono text-[10px] font-medium text-slate-400">
            Demo1234
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setEmail('user@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className={demoClass(isUserDemo)}
          >
            <span className="text-xs font-semibold text-slate-900">User</span>
            <span className="text-[10px] text-slate-500">Penumpang</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('driver1@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className={demoClass(isDriverDemo)}
          >
            <span className="text-xs font-semibold text-slate-900">Driver</span>
            <span className="text-[10px] text-slate-500">Budi (Halim)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className={demoClass(isAdminDemo)}
          >
            <span className="text-xs font-semibold text-slate-900">Admin</span>
            <span className="text-[10px] text-slate-500">Operasional</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">Email Kantor</label>
          <div className="relative">
            <LoginIcon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@demo.test"
              className={`${fieldClass} pr-4`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">Kata Sandi</label>
          <div className="relative">
            <LoginIcon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Demo1234"
              className={`${fieldClass} pr-11`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <LoginIcon name={showPassword ? 'eyeOff' : 'eye'} className="size-4" />
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-2 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {isLoading && <Spinner size="sm" className="text-white" />}
          {isLoading ? 'Sedang masuk…' : 'Masuk'}
          {!isLoading && <LoginIcon name="arrow" className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>

      <div className="mt-6 flex items-start gap-2.5 border-t border-slate-200 pt-5">
        <LoginIcon name="shield" className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-500">
          Akun perusahaan Anda dikelola oleh administrasi armada. Hubungi administrator jika membutuhkan akses.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-[84rem] flex-1 flex-col px-5 py-6 sm:px-8 lg:px-12">
        <header className="flex w-full shrink-0 items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
              <LoginIcon name="route" className="size-5" />
            </div>
            <span className="truncate text-base font-semibold tracking-tight text-slate-900">
              KCIC <span className="font-bold text-brand-500">Fleet</span>
            </span>
          </div>
          <span className="hidden shrink-0 items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 sm:flex">
            <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
            Operasional Armada
          </span>
        </header>

        <div className="grid min-h-0 w-full flex-1 gap-8 py-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch lg:gap-10">
          {/* LEFT — always-charcoal brand showcase (mode-independent) */}
          <aside className="relative hidden min-w-0 flex-col overflow-hidden rounded-2xl bg-slate-950 p-7 lg:flex xl:p-9">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,#000_18%,transparent_72%)]"
            />
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-0.5 bg-brand-500" />

            <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-6">
              <div>
                <span className="inline-flex items-center gap-2 self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-[#94a3b8]">
                  <span className="h-3 w-0.5 rounded-full bg-brand-500" aria-hidden="true" />
                  KCIC FLEET OPERATIONS
                </span>
                <p className="mt-4 max-w-[22ch] text-[clamp(1.6rem,2.4vw,2.1rem)] font-semibold leading-[1.14] tracking-tight text-[#f8fafc]">
                  Operasional armada lebih cepat dan terukur.
                </p>
                <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#94a3b8]">
                  Dari booking pertama hingga kilometer terakhir — kendaraan, perjalanan, dan tim bergerak bersama.
                </p>
              </div>

              {/* Corridor status strip */}
              <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#94a3b8]">
                    Koridor Halim–Tegalluar
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium tabular-nums text-[#94a3b8]">
                    <span className="relative flex size-1.5">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand-500 opacity-70 motion-reduce:animate-none" />
                      <span className="relative inline-flex size-1.5 rounded-full bg-brand-500" />
                    </span>
                    Sistem Pemantauan Aktif
                  </span>
                </div>

                <div className="relative mt-5">
                  <div aria-hidden="true" className="absolute inset-x-[12.5%] top-1 h-px bg-white/15" />
                  <div aria-hidden="true" className="absolute left-[12.5%] top-1 h-px w-[50%] bg-brand-500" />
                  <div className="relative grid grid-cols-4 gap-1">
                    {CORRIDOR_NODES.map((node, index) => {
                      const reached = index < 3;
                      return (
                        <div key={node} className="flex min-w-0 flex-col items-center gap-1.5">
                          <span className={`size-2 rounded-full ${reached ? 'bg-brand-500' : 'bg-white/25'}`} />
                          <span className="w-full truncate text-center text-[10px] font-medium leading-tight text-[#94a3b8]">
                            {node}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bento highlight cards */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500">
                    <LoginIcon name="satellite" className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[#f8fafc]">Telemetri Langsung &amp; Dispatch</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                    Pelacakan GPS real-time dengan penugasan driver otomatis.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500">
                    <LoginIcon name="users" className="size-4" />
                  </span>
                  <p className="mt-3 text-sm font-semibold text-[#f8fafc]">Integrasi Operasional</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">
                    Booking digital, Nota Dinas, dan akses multi-peran Admin, Driver, Penumpang.
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* RIGHT — crisp white Bento login card */}
          <section className="flex min-w-0 items-center justify-center">
            <div className="w-full max-w-md">
              <Suspense fallback={
                <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
                  <Spinner size="lg" className="text-slate-400" />
                  Menyiapkan halaman masuk…
                </div>
              }>
                <LoginForm />
              </Suspense>
              <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">
                KCIC Fleet &middot; Mobilitas Operasional.
              </p>
            </div>
          </section>
        </div>

        <footer className="flex w-full shrink-0 items-center justify-between gap-4 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
          <span>KCIC Fleet &middot; Mobilitas Operasional.</span>
          <span className="hidden sm:block">Untuk tim Anda. Untuk setiap perjalanan.</span>
        </footer>
      </div>
    </main>
  );
}
