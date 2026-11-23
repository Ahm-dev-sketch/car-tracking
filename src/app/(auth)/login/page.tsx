'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import { Icon as LoginIcon } from '@/components/ui/Icon';
import { VehicleTracking3D } from '@/components/ui/VehicleTracking3D';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');
  const errorParam = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    'min-h-12 w-full rounded-lg border border-slate-200 bg-white py-3 pl-11 pr-4 text-[15px] text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15';

  return (
    <div className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-8">
      <div className="mb-7">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <span className="h-3 w-0.5 rounded-full bg-brand-500" aria-hidden="true" />
          Workplace mobility
        </span>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Welcome back.</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">Sign in to book your next ride and keep every journey in view.</p>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          className="mb-6"
          onDismiss={() => setError(null)}
        />
      )}

      {/* Quick Demo Fill Buttons */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
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
            className="flex cursor-pointer flex-col items-start justify-center rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <span className="text-xs font-semibold text-slate-900">User</span>
            <span className="text-[10px] text-slate-400">Penumpang</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('driver1@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className="flex cursor-pointer flex-col items-start justify-center rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <span className="text-xs font-semibold text-slate-900">Driver</span>
            <span className="text-[10px] text-slate-400">Budi (Halim)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className="flex cursor-pointer flex-col items-start justify-center rounded-md border border-slate-200 bg-white px-2.5 py-2 text-left transition-colors hover:border-slate-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <span className="text-xs font-semibold text-slate-900">Admin</span>
            <span className="text-[10px] text-slate-400">Operasional</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-semibold text-slate-700">Work email</label>
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
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-semibold text-slate-700">Password</label>
          <div className="relative">
            <LoginIcon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Demo1234"
              className={fieldClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-2 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 active:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        >
          {isLoading && <Spinner size="sm" className="text-white" />}
          {isLoading ? 'Signing in...' : 'Sign in'}
          {!isLoading && <LoginIcon name="arrow" className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </button>
      </form>

      <div className="mt-7 flex items-start gap-2.5 border-t border-slate-200 pt-5">
        <LoginIcon name="shield" className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-500">Your workplace account is managed by fleet administration. Contact your administrator if you need access.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col overflow-hidden bg-slate-50 px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-slate-900 sm:px-10 lg:px-14">
      {/* Geometric grid backdrop — quiet, no glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.55] [background-image:linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,#000_35%,transparent_78%)]"
      />
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-brand-500 text-white">
            <LoginIcon name="route" className="size-5" />
          </div>
          <span className="text-base font-semibold tracking-tight text-slate-900">KCIC <span className="font-bold text-brand-500">Fleet</span></span>
        </div>
        <span className="hidden items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 sm:flex">
          <span className="size-1.5 rounded-full bg-brand-500" aria-hidden="true" />
          Workplace mobility
        </span>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16 xl:gap-24">
        <aside className="hidden min-w-0 flex-col lg:flex">
          <span className="inline-flex items-center gap-2 self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span className="h-3 w-0.5 rounded-full bg-brand-500" aria-hidden="true" />
            KCIC Fleet Operations
          </span>
          <h2 className="mt-5 max-w-xl text-[clamp(2.25rem,3.8vw,3.5rem)] font-semibold leading-[1.08] tracking-tight text-slate-900">
            A smoother route
            <br />
            through your workday.
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-slate-500">From the first booking to the last mile. Your vehicles, trips, and team, moving together.</p>
          <figure className="mt-8">
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <VehicleTracking3D />
            </div>
            <figcaption className="mt-4 flex items-center justify-between gap-4 px-1 text-xs text-slate-500">
              <span className="font-medium">KCIC Fleet. Every journey.</span>
              <span className="flex items-center gap-2 text-slate-600">
                <span className="relative size-2 rounded-full bg-success-600 status-ping" aria-hidden="true" />
                Connected mobility
              </span>
            </figcaption>
          </figure>
        </aside>

        <div className="mx-auto w-full min-w-0 max-w-md lg:max-w-[26rem]">
          <Suspense fallback={
            <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
              <Spinner size="lg" className="text-slate-400" />
              Preparing your sign-in...
            </div>
          }>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs text-slate-400 lg:hidden">KCIC Fleet. Every journey.</p>
        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-600">
        <span>KCIC Fleet &middot; Operational Mobility.</span>
        <span className="hidden sm:block">For your team. For the road ahead.</span>
      </footer>
    </main>
  );
}
