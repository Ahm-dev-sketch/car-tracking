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

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError('Invalid email or password');
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

  return (
    <div className="w-full rounded-2xl border-[3px] border-black bg-white p-6 sm:p-9 shadow-[8px_8px_0px_0px_#000]">
      <div className="mb-7">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-rose-200 text-black shadow-[3px_3px_0px_0px_#000]">
          <LoginIcon name="route" className="h-6 w-6 text-rose-900" />
        </div>
        <span className="eyebrow">Your workday, connected</span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-black sm:text-4xl">Welcome back.</h1>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-zinc-600">Sign in to book your next ride and keep every journey in view.</p>
      </div>

      {error && (
        <ErrorBanner
          message={error}
          className="mb-6"
          onDismiss={() => setError(null)}
        />
      )}

      {/* Quick Demo Fill Buttons */}
      <div className="mb-6 rounded-xl border-2 border-black bg-amber-50 p-3.5 shadow-[2px_2px_0px_0px_#000]">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-700">
            Akun Demo Siap Pakai:
          </span>
          <span className="text-[10px] font-bold text-zinc-500">
            Password: Demo1234
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              setEmail('user@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-black bg-white py-1.5 px-1 text-center shadow-[1.5px_1.5px_0px_0px_#000] hover:bg-amber-200 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            <span className="text-xs font-black text-black">User</span>
            <span className="text-[10px] font-bold text-zinc-500">Penumpang</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('driver1@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-black bg-white py-1.5 px-1 text-center shadow-[1.5px_1.5px_0px_0px_#000] hover:bg-rose-200 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            <span className="text-xs font-black text-black">Driver</span>
            <span className="text-[10px] font-bold text-zinc-500">Budi (Halim)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@demo.test');
              setPassword('Demo1234');
              setError(null);
            }}
            className="flex flex-col items-center justify-center rounded-lg border-2 border-black bg-white py-1.5 px-1 text-center shadow-[1.5px_1.5px_0px_0px_#000] hover:bg-amber-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
          >
            <span className="text-xs font-black text-black">Admin</span>
            <span className="text-[10px] font-bold text-zinc-500">Operasional</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs font-black uppercase tracking-wider text-black">Work email</label>
          <div className="relative">
            <LoginIcon name="mail" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black" />
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
              className="min-h-12 w-full rounded-xl border-2 border-black bg-white py-3 pl-12 pr-4 text-base font-semibold text-black outline-none placeholder:text-zinc-500 shadow-[3px_3px_0px_0px_#000] focus:shadow-[4px_4px_0px_0px_#be123c] transition-all"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-black uppercase tracking-wider text-black">Password</label>
          <div className="relative">
            <LoginIcon name="lock" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-black" />
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Demo1234"
              className="min-h-12 w-full rounded-xl border-2 border-black bg-white py-3 pl-12 pr-4 text-base font-semibold text-black outline-none placeholder:text-zinc-500 shadow-[3px_3px_0px_0px_#000] focus:shadow-[4px_4px_0px_0px_#be123c] transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-[2.5px] border-black bg-[#be123c] px-6 py-3.5 text-base font-black text-white shadow-[4px_4px_0px_0px_#000] hover:bg-[#e11d48] hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_#000] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading && <Spinner size="sm" className="text-white" />}
          {isLoading ? 'Signing in...' : 'Sign in'}
          {!isLoading && <LoginIcon name="arrow" className="h-4 w-4 text-white" />}
        </button>
      </form>

      <div className="mt-7 flex items-start gap-2.5 border-t-2 border-black/15 pt-5">
        <LoginIcon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-black" />
        <p className="text-xs font-medium leading-relaxed text-zinc-600">Your workplace account is managed by fleet administration. Contact your administrator if you need access.</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-[#faf9f5] px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-black sm:px-10 lg:px-14">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-black bg-rose-200 text-black shadow-[2px_2px_0px_0px_#000]">
            <LoginIcon name="route" className="h-6 w-6 text-rose-900" />
          </div>
          <span className="text-xl font-black tracking-tight text-black">KCIC Fleet<span className="text-rose-700">.</span></span>
        </div>
        <span className="hidden text-[11px] font-black uppercase tracking-wider text-black bg-amber-300 border-1.5 border-black px-2.5 py-0.5 rounded-md shadow-[1.5px_1.5px_0px_0px_#000] sm:block">Workplace mobility</span>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16 xl:gap-24">
        <aside className="hidden min-w-0 flex-col lg:flex">
          <div><span className="eyebrow">A little less logistics</span></div>
          <h2 className="mt-5 max-w-xl text-[clamp(2.5rem,4.2vw,4.25rem)] font-black leading-[1.08] tracking-tight text-black">A smoother route<br />through your workday.</h2>
          <p className="mt-5 max-w-sm text-base font-semibold leading-relaxed text-zinc-600">From the first booking to the last mile. Your vehicles, trips, and team, moving together.</p>
          <figure className="mt-8">
            <VehicleTracking3D />
            <figcaption className="mt-4 flex items-center justify-between gap-4 px-1 text-xs font-bold text-black">
              <span>KCIC Fleet. Every journey.</span>
              <span className="flex items-center gap-2 text-black"><span className="h-2 w-2 rounded-full border border-black bg-emerald-500" />Connected mobility</span>
            </figcaption>
          </figure>
        </aside>

        <div className="mx-auto w-full min-w-0 max-w-md lg:max-w-[28rem]">
          <Suspense fallback={
            <div role="status" className="flex min-h-96 flex-col items-center justify-center gap-4 rounded-2xl border-[3px] border-black bg-white p-8 text-sm font-bold text-black shadow-[6px_6px_0px_0px_#000]">
              <Spinner size="lg" className="text-black" />
              Preparing your sign-in...
            </div>
          }>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs font-bold text-black lg:hidden">KCIC Fleet. Every journey.</p>
        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 text-xs font-semibold leading-relaxed text-zinc-600">
        <span>KCIC Fleet &middot; Operational Mobility.</span>
        <span className="hidden sm:block">For your team. For the road ahead.</span>
      </footer>
    </main>
  );
}
