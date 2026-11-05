'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Icon } from '@/components/ui/Icon';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type StandaloneNavigator = Navigator & { standalone?: boolean };

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as StandaloneNavigator).standalone === true;
    if (isStandalone || localStorage.getItem('fleettrack_install_dismissed') === '1') return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
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
      if (choice.outcome === 'accepted') localStorage.setItem('fleettrack_install_dismissed', '1');
    } catch {
      // The browser may revoke an install prompt after it has been displayed.
    } finally {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('fleettrack_install_dismissed', '1');
  };

  if (!showPrompt || !deferredPrompt) return null;

  return (
    <aside className="install-toast bezel" aria-label="Install FleetTrack">
      <div className="bezel-core flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="brand-mark shrink-0"><Icon name="download" /></span>
            <div><h2 className="text-sm font-semibold text-zinc-900">Your fleet. One tap away.</h2><p className="mt-1 text-xs leading-relaxed text-zinc-500">Add FleetTrack to your home screen for quicker access.</p></div>
          </div>
          <button type="button" onClick={handleDismiss} className="icon-button shrink-0" aria-label="Dismiss install banner"><Icon name="close" className="size-4" /></button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleInstallClick} className="button-primary flex-1"><span>Install app</span><span className="button-icon"><Icon name="arrowUp" className="size-4" /></span></button>
          <button type="button" onClick={handleDismiss} className="button-secondary">Later</button>
        </div>
      </div>
    </aside>
  );
}

function subscribeToInstallState(onChange: () => void) {
  const standalone = window.matchMedia('(display-mode: standalone)');
  standalone.addEventListener('change', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    standalone.removeEventListener('change', onChange);
    window.removeEventListener('storage', onChange);
  };
}

function shouldShowIosHint() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window) &&
    !window.matchMedia('(display-mode: standalone)').matches &&
    (navigator as StandaloneNavigator).standalone !== true &&
    localStorage.getItem('fleettrack_ios_install_dismissed') !== '1';
}

export function IosInstallHint() {
  const eligible = useSyncExternalStore(subscribeToInstallState, shouldShowIosHint, () => false);
  const [dismissed, setDismissed] = useState(false);

  if (!eligible || dismissed) return null;

  return (
    <aside className="flex items-start justify-between gap-3 rounded-3xl bg-emerald-50 p-4 text-sm" aria-label="Add FleetTrack to your home screen">
      <div className="flex items-start gap-3">
        <span className="rounded-2xl bg-white p-2.5 text-emerald-700"><Icon name="share" /></span>
        <div className="leading-relaxed"><p className="font-semibold text-emerald-900">A place on your home screen</p><p className="mt-1 text-xs text-emerald-800">In Safari, tap Share, then choose <strong className="font-semibold">Add to Home Screen</strong> for quick access.</p></div>
      </div>
      <button type="button" onClick={() => { setDismissed(true); localStorage.setItem('fleettrack_ios_install_dismissed', '1'); }} className="icon-button shrink-0" aria-label="Dismiss iOS install tip"><Icon name="close" className="size-4" /></button>
    </aside>
  );
}
