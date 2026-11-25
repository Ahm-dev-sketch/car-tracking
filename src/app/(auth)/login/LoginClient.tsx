'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { Spinner } from '@/components/ui/Spinner';
import { Icon as LoginIcon } from '@/components/ui/Icon';
import { SplitTextReveal } from '@/components/ui/SplitTextReveal';
import { resetInstallDismissal } from '@/components/providers/InstallPrompt';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher';
import { useTranslation } from '@/components/providers/LanguageProvider';

interface LoginClientProps {
  showDemoAccounts: boolean;
}

function LoginForm({ showDemoAccounts }: LoginClientProps) {
  const { locale, t } = useTranslation();
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
        setError(t.auth.csrfError);
      }
      try {
        const cleanUrl = callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login';
        window.history.replaceState({}, '', cleanUrl);
      } catch {
        // ignore
      }
    }
  }, [errorParam, callbackUrl, t.auth.csrfError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
            () => reject(new Error(t.auth.timeoutError)),
            20000
          )
        ),
      ]);

      if (!res || res.error) {
        if (res?.error === 'MissingCSRF' || res?.error === 'CSRFError') {
          setError(t.auth.csrfError);
        } else if (res?.error === 'CredentialsSignin') {
          setError(
            showDemoAccounts ? t.auth.invalidCredentialsDemo : t.auth.invalidCredentialsProd
          );
        } else {
          setError(res?.error ? `${t.auth.loginFailedPrefix} ${res.error}` : t.auth.invalidCredentials);
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
      // Hard redirect: guarantees the fresh auth cookie is sent on the next request,
      // so middleware cannot miss the session (router.push could race it)
      window.location.href = destination;
    } catch (err: unknown) {
      console.error('Login Error:', err);
      const msg = err instanceof Error && err.message ? err.message : t.auth.loginError;
      // next-auth beta throws "Failed to construct 'URL'" when the server answers 429 (rate limit)
      setError(
        msg.includes('Failed to construct') ? t.auth.rateLimited : msg
      );
    } finally {
      // Never leave the form stuck in "Signing in..."
      setIsLoading(false);
    }
  };

  const fieldClass =
    'h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10';

  const isUserDemo = email === 'user@demo.test';
  const isDriverDemo = email === 'driver1@demo.test';
  const isAdminDemo = email === 'admin@demo.test';

  const demoClass = (active: boolean) =>
    `flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
      active
        ? 'border-[#C8102E] bg-white'
        : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white'
    }`;

  return (
    <div className="w-full">
      {/* Brand lockup + Language Switcher */}
      <div className="mb-10 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt="KCIC Fleet"
            width={40}
            height={40}
            className="size-10 shrink-0 rounded-xl shadow-xs"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-base font-bold tracking-tight text-slate-900">KCIC Fleet</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
              {t.auth.brandTagline}
            </span>
          </span>
        </div>
        <LanguageSwitcher compact />
      </div>

      {/* Two-tone headline */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t.auth.heroEyebrow}</p>
        <h1
          className="mt-3 text-3xl font-bold leading-[1.15] tracking-tight sm:text-4xl"
          aria-label={`${t.auth.heroLine1} ${t.auth.heroLine2}`}
        >
          <span className="block text-slate-900" aria-hidden="true">
            <SplitTextReveal key={`${locale}-l1`} as="span" text={t.auth.heroLine1} />
          </span>
          <span className="block text-[#C8102E]" aria-hidden="true">
            <SplitTextReveal key={`${locale}-l2`} as="span" text={t.auth.heroLine2} />
          </span>
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-slate-500">
          {t.auth.heroSubtitle}
        </p>
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
          <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-700">{t.auth.emailLabel}</label>
          <div className="relative">
            <LoginIcon name="mail" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={showDemoAccounts ? 'user@demo.test' : t.auth.emailPlaceholder}
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-700">{t.auth.passwordLabel}</label>
          <div className="relative">
            <LoginIcon name="lock" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={showDemoAccounts ? 'Demo1234' : t.auth.passwordPlaceholder}
              className={`${fieldClass} pr-10`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t.auth.hidePasswordAria : t.auth.showPasswordAria}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <LoginIcon name={showPassword ? 'eyeOff' : 'eye'} className="size-4" />
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#C8102E] px-5 text-sm font-medium text-[#FFFFFF] transition-colors hover:bg-[#A60D26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading && <Spinner size="sm" className="text-[#FFFFFF]" />}
          {isLoading ? t.auth.submitting : t.auth.submitButton}
        </button>
      </form>

      {/* Demo switcher: only rendered when demo mode is explicitly active */}
      {showDemoAccounts && (
        <div className="mt-8 border-t border-slate-100 pt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{t.auth.demoHeader}</span>
            <span className="font-mono text-[11px] tabular-nums text-slate-400">{t.auth.demoPasswordHint}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                setEmail('user@demo.test');
                setPassword('Demo1234');
                setError(null);
              }}
              aria-pressed={isUserDemo}
              className={demoClass(isUserDemo)}
            >
              <span className={`size-1.5 rounded-full ${isUserDemo ? 'bg-[#C8102E]' : 'bg-slate-300'}`} aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-900">{t.auth.demoRoles.user}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('driver1@demo.test');
                setPassword('Demo1234');
                setError(null);
              }}
              aria-pressed={isDriverDemo}
              className={demoClass(isDriverDemo)}
            >
              <span className={`size-1.5 rounded-full ${isDriverDemo ? 'bg-[#C8102E]' : 'bg-slate-300'}`} aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-900">{t.auth.demoRoles.driver}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setEmail('admin@demo.test');
                setPassword('Demo1234');
                setError(null);
              }}
              aria-pressed={isAdminDemo}
              className={demoClass(isAdminDemo)}
            >
              <span className={`size-1.5 rounded-full ${isAdminDemo ? 'bg-[#C8102E]' : 'bg-slate-300'}`} aria-hidden="true" />
              <span className="text-xs font-semibold text-slate-900">{t.auth.demoRoles.admin}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LoginClient({ showDemoAccounts }: LoginClientProps) {
  const { t } = useTranslation();

  return (
    <main className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-2">
      {/* LEFT — light login canvas, borderless form */}
      <section className="flex min-w-0 flex-col justify-center bg-white px-8 py-10 pb-24 text-slate-900 sm:px-14 lg:px-20 lg:pb-10">
        <div className="mx-auto my-auto w-full max-w-md shrink-0">
          <Suspense
            fallback={
              <div
                role="status"
                className="flex min-h-[22rem] flex-col items-center justify-center gap-3 text-sm text-slate-500"
              >
                <Spinner size="lg" className="text-slate-400" />
                {t.auth.loadingPage}
              </div>
            }
          >
            <LoginForm showDemoAccounts={showDemoAccounts} />
          </Suspense>
        </div>
      </section>

      {/* RIGHT — full-bleed industrial charcoal panel */}
      <aside className="relative hidden min-w-0 flex-col justify-between overflow-hidden bg-[#0F172A] px-14 py-12 text-[#F8FAFC] lg:flex xl:px-20">
        {/* rail */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-[#C8102E] via-[#C8102E]/40 to-transparent"
        />

        {/* top status */}
        <div className="relative flex shrink-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-[#C8102E] animate-pulse motion-reduce:animate-none"
          />
          <span className="text-xs font-medium tracking-wide text-[#64748B]">{t.auth.asideStatus}</span>
        </div>

        {/* center typographic focus */}
        <div className="relative flex flex-1 items-center py-12">
          <div className="max-w-lg">
            <p className="text-4xl font-bold leading-[1.15] tracking-tight text-[#F8FAFC] xl:text-[42px]">
              {t.auth.asideHeadline}
            </p>
            <p className="mt-5 text-sm leading-relaxed text-[#94A3B8] xl:text-base">
              {t.auth.asideBody}
            </p>
          </div>
        </div>

        {/* bottom hairline telemetry strip */}
        <div className="relative flex shrink-0 items-center justify-between gap-6 border-t border-white/10 pt-5 text-xs text-[#64748B]">
          <span className="min-w-0 leading-relaxed">{t.auth.corridorTag}</span>
          <span className="shrink-0 uppercase tracking-[0.14em] tabular-nums text-[#94A3B8]">{t.auth.fleetOpsTag}</span>
        </div>
      </aside>
    </main>
  );
}
