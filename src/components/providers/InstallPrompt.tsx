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
    <aside
      className="install-toast fixed inset-x-4 bottom-24 z-50 mx-auto max-w-md rounded-2xl border-[2.5px] border-black bg-white p-5 shadow-[6px_6px_0px_0px_#000] sm:bottom-8 sm:right-8 sm:left-auto"
      aria-label="Install KCIC Fleet application"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border-2 border-black bg-amber-300 shadow-[2px_2px_0px_0px_#000]">
              <Icon name="download" className="size-5 text-black" />
            </span>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="rounded border border-black bg-emerald-200 px-1.5 py-0.2 text-[9px] font-black uppercase text-black">
                  App PWA
                </span>
                <span className="text-[10px] font-bold text-zinc-500">Fast Access</span>
              </div>
              <h2 className="mt-0.5 text-base font-black text-black">
                Install KCIC Fleet
              </h2>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-zinc-600">
                Akses cepat dari layar utama HP/laptop tanpa buka browser. Offline-ready & notifikasi realtime.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissLater}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-1.5 border-black bg-zinc-100 hover:bg-zinc-200"
            aria-label="Tutup saran install"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-400 px-4 py-2 text-sm font-black text-black shadow-[3px_3px_0px_0px_#000] hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
          >
            <span>Install Sekarang</span>
            <Icon name="arrowUp" className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleDismissLater}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-black bg-zinc-100 px-4 py-2 text-sm font-black text-black shadow-[3px_3px_0px_0px_#000] hover:bg-zinc-200 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all"
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
    setIsIosEligible(isIos && !standalone);
    setDismissed(isIosDismissed());
  }, [status]);

  if (!isIosEligible || dismissed) return null;

  return (
    <aside
      className="flex items-start justify-between gap-3 rounded-2xl border-2 border-black bg-emerald-100 p-4 text-sm shadow-[3px_3px_0px_0px_#000]"
      aria-label="Add KCIC Fleet to your home screen"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000]">
          <Icon name="share" className="size-5" />
        </span>
        <div className="leading-relaxed">
          <p className="font-black text-black">Pasang di Layar Utama iPhone/iPad</p>
          <p className="mt-1 text-xs font-semibold text-emerald-950">
            Di browser Safari, ketuk tombol <strong>Share</strong> (ikon kotak tanda panah ke atas), lalu pilih{' '}
            <strong className="underline">Add to Home Screen (Tambah ke Layar Utama)</strong>.
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
        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-1.5 border-black bg-white hover:bg-zinc-100 shadow-[1px_1px_0px_0px_#000]"
        aria-label="Dismiss iOS install tip"
      >
        <Icon name="close" className="size-4" />
      </button>
    </aside>
  );
}
