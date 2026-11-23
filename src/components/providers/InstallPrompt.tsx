'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowUpRight, Download, Share2, X } from 'lucide-react';

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
 * Install prompt.
 *
 * Placement rule: it lives in a fixed, pointer-transparent lane that sits
 * *above* the mobile dock (`.install-toast` in globals.css). It is anchored to
 * the viewport edge, clears the bottom nav at every breakpoint, and its own
 * surface — not the page — receives pointer events. Nothing underneath can be
 * covered by the prompt itself.
 */
export function InstallPrompt() {
  const { status } = useSession();
  const prevStatusRef = useRef(status);
  const [promptAvailable, setPromptAvailable] = useState(Boolean(globalDeferredPrompt));
  const [isDismissed, setIsDismissed] = useState(isInstallDismissed());
  const [isInstalled, setIsInstalled] = useState(isAppStandalone());

  const checkState = useCallback(() => {
    setIsInstalled(isAppStandalone());
    setPromptAvailable(Boolean(globalDeferredPrompt));
    setIsDismissed(isInstallDismissed());
  }, []);

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
    <div className="install-toast" role="complementary" aria-label="Pasang aplikasi KCIC Fleet">
      <div className="flex items-start gap-3 p-3.5 pb-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] text-slate-700">
          <Download className="size-[1.125rem]" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="pill pill-active py-0 text-[0.625rem]">PWA</span>
            <span className="text-[0.625rem] text-slate-400">Akses cepat</span>
          </div>
          <h2 className="mt-1 text-[0.8125rem] font-semibold text-slate-900">Pasang KCIC Fleet</h2>
          <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-slate-500">
            Buka langsung dari layar utama. Siap dipakai saat koneksi terputus.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismissLater}
          className="-mr-1 -mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-[var(--canvas-sunken)] hover:text-slate-700"
          aria-label="Tutup saran install"
        >
          <X className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--border-subtle)] p-3">
        <button
          type="button"
          onClick={handleDismissLater}
          className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-[var(--radius-full)] px-3.5 text-xs font-medium text-slate-600 transition-colors hover:bg-[var(--canvas)]"
        >
          Nanti saja
        </button>
        <button
          type="button"
          onClick={handleInstallClick}
          className="ml-auto inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--slate-navy)] px-4 text-xs font-semibold text-white transition-colors hover:bg-[var(--charcoal)]"
        >
          <span>Install</span>
          <ArrowUpRight className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/**
 * iOS Safari "Add to Home Screen" hint.
 * Intentionally inline (not fixed): it renders in the page flow, so it can
 * never float over content or controls.
 */
export function IosInstallHint() {
  const { status } = useSession();
  const [isIosEligible, setIsIosEligible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Deferred so the effect body only knows *when* to re-check eligibility;
    // the write itself happens in a callback, not during the effect run.
    const detect = () => {
      const isIos =
        typeof navigator !== 'undefined' &&
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !('MSStream' in window);
      setIsIosEligible(isIos && !isAppStandalone());
      setDismissed(isIosDismissed());
    };
    const firstDetect = setTimeout(detect, 0);
    return () => clearTimeout(firstDetect);
  }, [status]);

  if (!isIosEligible || dismissed) return null;

  return (
    <aside
      className="card flex items-start gap-3 p-3.5"
      aria-label="Tambahkan KCIC Fleet ke layar utama"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--canvas)] text-slate-600">
        <Share2 className="size-4" strokeWidth={1.9} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <p className="font-semibold text-slate-900">Pasang di layar utama iPhone/iPad</p>
        <p className="mt-0.5 text-slate-500">
          Di Safari, ketuk <strong className="font-semibold text-slate-700">Bagikan</strong>, lalu pilih{' '}
          <strong className="font-semibold text-slate-700">Add to Home Screen</strong>.
        </p>
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
        className="-mr-1 -mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-[var(--canvas-sunken)]"
        aria-label="Tutup tip install iOS"
      >
        <X className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
      </button>
    </aside>
  );
}
