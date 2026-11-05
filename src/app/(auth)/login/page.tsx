'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import { Icon as LoginIcon } from '@/components/ui/Icon';


function RouteArtwork() {
  return (
    <svg viewBox="0 0 560 340" fill="none" className="h-auto w-full" aria-hidden="true">
      <rect x="1" y="1" width="558" height="338" rx="30" fill="#EDF3EE" />
      <g stroke="#DCE7DE" strokeWidth="1.2">
        <path d="M0 80h170l78 78h312M0 246h132l58-58h370M86 0v125l95 95v120M367 0v102l-67 67v171M488 0v340" />
        <path d="M0 32h205l75 75h280M0 300h165l65-65h330M32 0v147l95 95v98M423 0v120l-65 65v155" />
      </g>
      <g fill="#E3ECE4">
        <rect x="103" y="35" width="55" height="29" rx="8" />
        <rect x="383" y="35" width="27" height="50" rx="8" />
        <rect x="447" y="258" width="27" height="47" rx="8" />
        <rect x="48" y="263" width="59" height="23" rx="8" />
        <path d="M205 270h67v38h-98z" />
      </g>
      <path d="M112 119h64a36 36 0 0 1 36 36v29a36 36 0 0 0 36 36h111a36 36 0 0 0 36-36v-62" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
      <path d="M112 119h64a36 36 0 0 1 36 36v29a36 36 0 0 0 36 36h111a36 36 0 0 0 36-36v-62" stroke="#397963" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="112" cy="119" r="19" fill="#EDF3EE" stroke="#C8DACD" />
      <circle cx="112" cy="119" r="9" fill="white" stroke="#397963" strokeWidth="1.5" />
      <circle cx="112" cy="119" r="3" fill="#397963" />
      <circle cx="395" cy="116" r="23" fill="#397963" fillOpacity=".08" />
      <path d="M395 128s12-11 12-19a12 12 0 1 0-24 0c0 8 12 19 12 19Z" fill="white" stroke="#397963" strokeWidth="1.5" />
      <circle cx="395" cy="109" r="4" stroke="#397963" strokeWidth="1.5" />
      <g transform="translate(294 220) rotate(90)">
        <rect x="-16" y="-35" width="38" height="76" rx="13" fill="#1F3C30" fillOpacity=".09" />
        <path d="M-18-19h-3v13h3m36-13h3v13h-3M-18 17h-3v12h3m36-12h3v12h-3" stroke="#253E33" strokeWidth="3" strokeLinecap="round" />
        <rect x="-17" y="-38" width="34" height="76" rx="12" fill="white" stroke="#9AB6A4" strokeWidth="1.2" />
        <path d="m-12-15 2-10h20l2 10-2 5h-20zM-12 17l2 10h20l2-10-2-5h-20z" fill="#739886" />
        <path d="M-12-6v14m24-14v14M-9-34H9M-10 33h20" stroke="#A7BFAF" strokeWidth="1.2" />
        <path d="M-15-30v5m30-5v5" stroke="#DEE8DD" strokeWidth="2" strokeLinecap="round" />
      </g>
      <path d="m466 67 5-15 5 15-5-3-5 3Z" stroke="#7B9B88" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M466 76h10" stroke="#A3BBAA" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await signIn('credentials', {
        redirect: false,
        email: email.trim().toLowerCase(),
        password,
      });

      if (!res || res.error) {
        setError('Invalid email or password');
        setIsLoading(false);
        return;
      }

      // Fetch user role to route appropriately
      const meRes = await fetch('/api/me');
      if (meRes.ok) {
        const { user } = await meRes.json();
        if (callbackUrl && !callbackUrl.startsWith('/login')) {
          router.push(callbackUrl);
        } else if (user?.role === 'ADMIN') {
          router.push('/admin');
        } else if (user?.role === 'DRIVER') {
          router.push('/driver');
        } else {
          router.push('/user');
        }
      } else {
        router.push('/user');
      }
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Authentication failed. Please try again.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border-[3px] border-black bg-white p-6 sm:p-9 shadow-[8px_8px_0px_0px_#000]">
      <div className="mb-7">
        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border-2 border-black bg-emerald-300 text-black shadow-[3px_3px_0px_0px_#000]">
          <LoginIcon name="route" className="h-6 w-6" />
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
              placeholder="you@company.com"
              className="min-h-12 w-full rounded-xl border-2 border-black bg-white py-3 pl-12 pr-4 text-base font-semibold text-black outline-none placeholder:text-zinc-500 shadow-[3px_3px_0px_0px_#000] focus:shadow-[4px_4px_0px_0px_#059669] transition-all"
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
              placeholder="Enter your password"
              className="min-h-12 w-full rounded-xl border-2 border-black bg-white py-3 pl-12 pr-4 text-base font-semibold text-black outline-none placeholder:text-zinc-500 shadow-[3px_3px_0px_0px_#000] focus:shadow-[4px_4px_0px_0px_#059669] transition-all"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="group mt-3 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-[2.5px] border-black bg-emerald-400 px-6 py-3.5 text-base font-black text-black shadow-[4px_4px_0px_0px_#000] hover:bg-emerald-300 hover:shadow-[5px_5px_0px_0px_#000] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0px_0px_#000] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoading && <Spinner size="sm" className="text-black" />}
          {isLoading ? 'Signing in...' : 'Sign in'}
          {!isLoading && <LoginIcon name="arrow" className="h-4 w-4" />}
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-black bg-emerald-400 text-black shadow-[2px_2px_0px_0px_#000]">
            <LoginIcon name="route" className="h-6 w-6" />
          </div>
          <span className="text-xl font-black tracking-tight text-black">FleetTrack<span className="text-emerald-700">.</span></span>
        </div>
        <span className="hidden text-[11px] font-black uppercase tracking-wider text-black bg-amber-300 border-1.5 border-black px-2.5 py-0.5 rounded-md shadow-[1.5px_1.5px_0px_0px_#000] sm:block">Workplace mobility</span>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-12 py-10 sm:py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16 xl:gap-24">
        <aside className="hidden min-w-0 flex-col lg:flex">
          <div><span className="eyebrow">A little less logistics</span></div>
          <h2 className="mt-5 max-w-xl text-[clamp(2.5rem,4.2vw,4.25rem)] font-black leading-[1.08] tracking-tight text-black">A smoother route<br />through your workday.</h2>
          <p className="mt-5 max-w-sm text-base font-semibold leading-relaxed text-zinc-600">From the first booking to the last mile. Your vehicles, trips, and team, moving together.</p>
          <figure className="mt-10">
            <div className="overflow-hidden rounded-2xl border-[3px] border-black bg-[#edf3ee] p-3 shadow-[6px_6px_0px_0px_#000]">
              <RouteArtwork />
            </div>
            <figcaption className="mt-4 flex items-center justify-between gap-4 px-1 text-xs font-bold text-black">
              <span>One fleet. Every journey.</span>
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
          <p className="mt-6 text-center text-xs font-bold text-black lg:hidden">One fleet. Every journey.</p>
        </div>
      </div>

      <footer className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 text-xs font-semibold leading-relaxed text-zinc-600">
        <span>FleetTrack &middot; Your workplace, in motion.</span>
        <span className="hidden sm:block">For your team. For the road ahead.</span>
      </footer>
    </main>
  );
}
