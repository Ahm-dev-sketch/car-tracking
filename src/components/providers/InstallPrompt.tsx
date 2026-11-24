'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { Icon } from '@/components/ui/Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type StandaloneNavigator = Navigator & { standalone?: boolean };

// Cooldown between "Later" dismissals during ordinary browsing (3 minutes)
const DISMISS_COOLDOWN_MS = 3 * 60 * 1000;

// Module-level global store so beforeinstallprompt event is NEVER lost across navigations or auth changes
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptSubscribers = new Set<() => void>();

function notifySubscribers() {
  promptSubscribers.forEach((cb) => {
    try {
      cb();
    } catch {
      // ignore
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    globalDeferredPrompt = event as BeforeInstallPromptEvent;
    // If browser fires beforeinstallprompt, the app is not currently installed (or was uninstalled).
    try {
      localStorage.removeItem('fleettrack_app_installed');
    } catch {
      // ignore
    }
    notifySubscribers();
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    try {
      localStorage.setItem('fleettrack_app_installed', '1');
    } catch {
      // ignore
    }
    notifySubscribers();
  });
}

export function isAppStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // True standalone mode check (app opened as installed PWA window)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as StandaloneNavigator).standalone === true;

  if (isStandalone) {
    return true;
  }

  // If running inside browser tab and beforeinstallprompt is ready, app is not installed
  if (globalDeferredPrompt) {
    try {
      localStorage.removeItem('fleettrack_app_installed');
    } catch {
      // ignore
    }
    return false;
  }

  return false;
}

/**
 * Resets any "Later" dismiss state so the install prompt can reappear immediately.
 * Called automatically on login, logout, and when navigating between auth states.
 */
export function resetInstallDismissal() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('fleettrack_install_dismissed_at');
    sessionStorage.removeItem('fleettrack_ios_dismissed_at');
    localStorage.removeItem('fleettrack_install_dismissed');
    localStorage.removeItem('fleettrack_ios_install_dismissed');
    if (!window.matchMedia('(display-mode: standalone)').matches) {
      localStorage.removeItem('fleettrack_app_installed');
    }
    window.dispatchEvent(new CustomEvent('fleettrack:reset-install'));
  } catch {
    // ignore storage restrictions
  }
}

export function isInstallDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const dismissedAt = sessionStorage.getItem('fleettrack_install_dismissed_at');
    if (!dismissedAt) return false;
    const elapsed = Date.now() - Number(dismissedAt);
    if (elapsed > DISMISS_COOLDOWN_MS) {
      sessionStorage.removeItem('fleettrack_install_dismissed_at');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isIosDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const dismissedAt = sessionStorage.getItem('fleettrack_ios_dismissed_at');
    if (!dismissedAt) return false;
    const elapsed = Date.now() - Number(dismissedAt);
    if (elapsed > DISMISS_COOLDOWN_MS) {
      sessionStorage.removeItem('fleettrack_ios_dismissed_at');
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Floating Install Prompt Banner
 * Appears on first visit, every re-login, on logout, and after "Later" cooldown.
 */
export function InstallPrompt() {
  const { status } = useSession();
  const prevStatusRef = useRef(status);
  const [promptAvailable, setPromptAvailable] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const checkState = useCallback(() => {
    setIsInstalled(isAppStandalone());
    setPromptAvailable(Boolean(globalDeferredPrompt));
    setIsDismissed(isInstallDismissed());
  }, []);

  // Resolve client-only state after mount so the server-rendered HTML (all false)
  // matches the client's first render and hydration does not mismatch. Deferred via
  // a zero-delay timeout so setState does not run synchronously in the effect body.
  useEffect(() => {
    const id = window.setTimeout(checkState, 0);
    return () => window.clearTimeout(id);
  }, [checkState]);

  // Listen to session status changes (Login & Logout trigger reset)
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      // When transitioning from unauthenticated -> authenticated (login)
      // OR authenticated -> unauthenticated (logout), reset dismiss
      resetInstallDismissal();
      checkState();
    }
  }, [status, checkState]);

  // Subscribe to module prompt changes and custom reset events
  useEffect(() => {
    promptSubscribers.add(checkState);

    const handleCustomReset = () => {
      checkState();
    };

    window.addEventListener('fleettrack:reset-install', handleCustomReset);
    window.addEventListener('storage', handleCustomReset);

    // Periodic check to clear cooldown
    const interval = setInterval(checkState, 15000);

    return () => {
      promptSubscribers.delete(checkState);
      window.removeEventListener('fleettrack:reset-install', handleCustomReset);
      window.removeEventListener('storage', handleCustomReset);
      clearInterval(interval);
    };
  }, [checkState]);

  const handleInstallClick = async () => {
    if (!globalDeferredPrompt) return;
    try {
      await globalDeferredPrompt.prompt();
      const choice = await globalDeferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        localStorage.setItem('fleettrack_app_installed', '1');
        setIsInstalled(true);
      }
    } catch {
      // Prompt could be revoked by browser
    } finally {
      globalDeferredPrompt = null;
      setPromptAvailable(false);
    }
  };

  const handleDismissLater = () => {
    try {
      sessionStorage.setItem('fleettrack_install_dismissed_at', String(Date.now()));
    } catch {
      // ignore
    }
    setIsDismissed(true);
  };

  // If already running in standalone PWA or marked installed, never show
  if (isInstalled) return null;

  // Show if prompt is available and not currently dismissed in cooldown
  if (!promptAvailable || isDismissed) return null;

  return (
    <aside
      className="install-toast overflow-hidden rounded-2xl border border-slate-200 bg-white"
      aria-label="Install KCIC Fleet application"
    >
      {/* KCIC accent rule */}
      <div className="h-0.5 w-full bg-brand-600" aria-hidden="true" />
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
              <Icon name="download" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                Aplikasi PWA
              </p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                Pasang KCIC Fleet
              </h2>
              <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
                Akses cepat dari layar utama HP/laptop tanpa buka browser. Offline-ready &amp; notifikasi realtime.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissLater}
            className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            aria-label="Tutup saran install"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            <span>Install Sekarang</span>
            <Icon name="download" className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleDismissLater}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Nanti saja
          </button>
        </div>
      </div>
    </aside>
  );
}

/**
 * iOS Safari Add to Home Screen Hint
 * Reappears after cooldown, reset on login & logout.
 */
export function IosInstallHint() {
  const { status } = useSession();
  const [isIosEligible, setIsIosEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isIos =
      typeof navigator !== 'undefined' &&
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !('MSStream' in window);
    const standalone = isAppStandalone();
    const id = window.setTimeout(() => {
      setIsIosEligible(isIos && !standalone);
      setDismissed(isIosDismissed());
    }, 0);
    return () => window.clearTimeout(id);
  }, [status]);

  if (!isIosEligible || dismissed) return null;

  return (
    <aside
      className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm"
      aria-label="Add KCIC Fleet to your home screen"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700">
          <Icon name="share" className="size-4" />
        </span>
        <div className="leading-relaxed">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Tip instalasi iOS</p>
          <p className="mt-1 text-sm font-semibold tracking-tight text-slate-900">Pasang di Layar Utama iPhone/iPad</p>
          <p className="mt-1 text-xs font-medium leading-relaxed text-slate-500">
            Di browser Safari, ketuk tombol <strong className="font-semibold text-slate-700">Share</strong> (ikon kotak tanda panah ke atas), lalu pilih{' '}
            <strong className="font-semibold text-slate-700 underline decoration-brand-300 underline-offset-2">Add to Home Screen (Tambah ke Layar Utama)</strong>.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            sessionStorage.setItem('fleettrack_ios_dismissed_at', String(Date.now()));
          } catch {
            // ignore
          }
        }}
        className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
        aria-label="Dismiss iOS install tip"
      >
        <Icon name="close" className="size-4" />
      </button>
    </aside>
  );
}
