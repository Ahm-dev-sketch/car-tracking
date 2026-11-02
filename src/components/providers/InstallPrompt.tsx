'use client';

import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check standalone mode
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (isStandalone) {
      return;
    }

    // Check dismissal history
    if (localStorage.getItem('fleettrack_install_dismissed') === '1') {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    const handleAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      localStorage.setItem('fleettrack_install_dismissed', '1');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        localStorage.setItem('fleettrack_install_dismissed', '1');
      }
    } catch {
      // ignore
    } finally {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('fleettrack_install_dismissed', '1');
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex justify-center pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="pointer-events-auto w-full max-w-md bg-white border border-zinc-200 shadow-2xl rounded-xl p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 text-white flex items-center justify-center font-mono font-bold text-sm shrink-0 shadow-xs">
              F
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 leading-tight">
                Add FleetTrack to your home screen
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Install for fullscreen telemetry and instant trip tracking
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-md hover:bg-zinc-100 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
            aria-label="Dismiss install banner"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 min-h-[44px] px-4 py-2 bg-zinc-900 hover:bg-zinc-800 active:bg-black text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>Install</span>
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="min-h-[44px] px-4 py-2 border border-zinc-200 hover:bg-zinc-50 active:bg-zinc-100 text-zinc-700 text-xs font-medium rounded-lg cursor-pointer"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * iOS-specific one-time hint card for home screens (User + Driver).
 * Shown only on iOS Safari when not already standalone and not dismissed.
 */
export function IosInstallHint() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if running on iOS (iPhone, iPad, iPod)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;

    // Check if already installed / standalone
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    // Check dismissal history in localStorage
    const isDismissed = localStorage.getItem('fleettrack_ios_install_dismissed') === '1';

    if (isIOS && !isStandalone && !isDismissed) {
      setShowHint(true);
    }
  }, []);

  const handleDismiss = () => {
    setShowHint(false);
    localStorage.setItem('fleettrack_ios_install_dismissed', '1');
  };

  if (!showHint) {
    return null;
  }

  return (
    <div className="bg-zinc-900 text-white border border-zinc-800 rounded-lg p-3.5 shadow-sm flex items-start justify-between gap-3 text-xs animate-in fade-in duration-200">
      <div className="flex items-start gap-2.5">
        <div className="p-1.5 bg-zinc-800 rounded text-sky-400 shrink-0 mt-0.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </div>
        <div className="leading-relaxed">
          <span className="font-bold block text-zinc-100">Add FleetTrack to Home Screen</span>
          <span className="text-zinc-300">
            Tap{' '}
            <span className="inline-flex items-center text-sky-400 font-semibold">
              Share
              <svg className="w-3.5 h-3.5 mx-0.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </span>{' '}
            in Safari, then choose <strong className="text-zinc-100">Add to Home Screen</strong> for full-screen tracking.
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-white p-2 rounded hover:bg-zinc-800 cursor-pointer shrink-0"
        aria-label="Dismiss iOS install tip"
      >
        ✕
      </button>
    </div>
  );
}
