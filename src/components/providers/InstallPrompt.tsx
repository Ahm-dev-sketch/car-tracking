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
    notifySubscribers();
  });

  window.addEventListener('appinstalled', () => {
    globalDeferredPrompt = null;
    localStorage.setItem('fleettrack_app_installed', '1');
    notifySubscribers();
  });
}

export function isAppStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as StandaloneNavigator).standalone === true ||
    localStorage.getItem('fleettrack_app_installed') === '1'
  );
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
      className="install-toast toast-arrive fixed inset-x-3 bottom-24 z-50 mx-auto max-w-[430px] overflow-hidden rounded-2xl border-[3px] border-black bg-white shadow-[8px_8px_0px_0px_#000] sm:bottom-6 sm:right-6 sm:left-auto"
      aria-label="Install FleetTrack application"
      role="dialog"
    >
      {/* Top Neobrutalist Title Bar */}
      <div className="flex items-center justify-between border-b-[2.5px] border-black bg-amber-300 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-600 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-black bg-emerald-500" />
          </span>
          <span className="font-mono text-xs font-black tracking-wider text-black">
            KCIC FLEETTRACK // PWA
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-md border border-black bg-white px-1.5 py-0.5 font-mono text-[9px] font-black uppercase text-black shadow-[1px_1px_0px_0px_#000]">
            OFFICIAL
          </span>
          <button
            type="button"
            onClick={handleDismissLater}
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border-1.5 border-black bg-white text-black transition hover:bg-rose-300 active:translate-x-[1px] active:translate-y-[1px]"
            aria-label="Tutup saran install"
          >
            <Icon name="close" className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {/* App Identity & Title */}
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-black bg-emerald-400 text-black shadow-[3px_3px_0px_0px_#000]">
            <Icon name="car" className="size-6 text-black" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black leading-tight text-black">
              Pasang di Layar Utama
            </h2>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-zinc-600">
              Buka instan tanpa browser, performa lebih gegas, dan GPS live tracking armada tetap aktif di layar Anda.
            </p>
          </div>
        </div>

        {/* 3 Quick Benefit Chips */}
        <div className="mt-3.5 grid grid-cols-3 gap-2">
          <div className="rounded-xl border-2 border-black bg-[#faf9f5] p-2 text-center shadow-[2px_2px_0px_0px_#000]">
            <div className="text-base font-black">⚡</div>
            <div className="mt-0.5 text-[11px] font-black leading-tight text-black">0ms Buka</div>
            <div className="text-[9px] font-bold text-zinc-500">Tanpa browser</div>
          </div>
          <div className="rounded-xl border-2 border-black bg-[#faf9f5] p-2 text-center shadow-[2px_2px_0px_0px_#000]">
            <div className="text-base font-black">🛰️</div>
            <div className="mt-0.5 text-[11px] font-black leading-tight text-black">GPS Live</div>
            <div className="text-[9px] font-bold text-zinc-500">Akurasi tinggi</div>
          </div>
          <div className="rounded-xl border-2 border-black bg-[#faf9f5] p-2 text-center shadow-[2px_2px_0px_0px_#000]">
            <div className="text-base font-black">📱</div>
            <div className="mt-0.5 text-[11px] font-black leading-tight text-black">Full Screen</div>
            <div className="text-[9px] font-bold text-zinc-500">Bebas tab bar</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-[2.5px] border-black bg-emerald-400 px-4 py-2 text-xs sm:text-sm font-black uppercase tracking-wider text-black shadow-[3px_3px_0px_0px_#000] hover:bg-emerald-300 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
          >
            <Icon name="download" className="size-4 shrink-0 text-black stroke-[2.5]" />
            <span>Install Sekarang</span>
          </button>
          <button
            type="button"
            onClick={handleDismissLater}
            className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-black bg-zinc-100 px-3.5 py-2 text-xs font-black text-black shadow-[3px_3px_0px_0px_#000] hover:bg-zinc-200 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-all"
          >
            Nanti Saja
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
      className="relative overflow-hidden rounded-2xl border-[2.5px] border-black bg-[#faf9f5] p-4 text-sm shadow-[4px_4px_0px_0px_#000] sm:p-5"
      aria-label="Add FleetTrack to your home screen"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-2.5">
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-black bg-amber-300 px-2 py-0.5 font-mono text-[10px] font-black uppercase text-black shadow-[1.5px_1.5px_0px_0px_#000]">
            PANDUAN IOS SAFARI
          </span>
          <span className="font-mono text-xs font-bold text-zinc-600">
            Tambah ke Layar Utama
          </span>
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
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-black bg-white hover:bg-rose-200 shadow-[1.5px_1.5px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          aria-label="Dismiss iOS install tip"
        >
          <Icon name="close" className="size-3.5 text-black" />
        </button>
      </div>

      {/* Steps Grid */}
      <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-xl border-2 border-black bg-white p-3 shadow-[2px_2px_0px_0px_#000]">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-black bg-emerald-400 font-mono text-xs font-black text-black shadow-[1px_1px_0px_0px_#000]">
            1
          </div>
          <div>
            <p className="text-xs font-black text-black">Ketuk Tombol Share</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-snug text-zinc-600">
              Di toolbar Safari, ketuk tombol <strong>Share</strong> (ikon kotak dengan tanda panah ke atas).
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border-2 border-black bg-white p-3 shadow-[2px_2px_0px_0px_#000]">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border-2 border-black bg-amber-300 font-mono text-xs font-black text-black shadow-[1px_1px_0px_0px_#000]">
            2
          </div>
          <div>
            <p className="text-xs font-black text-black">Pilih Add to Home Screen</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-snug text-zinc-600">
              Pilih menu <strong>&quot;Tambah ke Layar Utama&quot;</strong> lalu konfirmasi nama aplikasi.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
