'use client';

import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { getOfflineQueueCount, processOfflineQueue } from '@/lib/offline-sync';

function subscribeToNetwork(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const readOnline = () => navigator.onLine;
const readOnlineOnServer = () => true;

export function NetworkStatus() {
  const isOnline = useSyncExternalStore(subscribeToNetwork, readOnline, readOnlineOnServer);
  const [hasChanged, setHasChanged] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(() => {
    try {
      setPendingCount(getOfflineQueueCount());
    } catch {
      setPendingCount(0);
    }
  }, []);

  useEffect(() => {
    // Queued so the effect itself only subscribes; the first read lands in a
    // callback rather than synchronously in the effect body.
    const firstRead = setTimeout(refreshPending, 0);

    const handleOnline = () => {
      setHasChanged(true);
      setDismissed(false);
      refreshPending();
      // Auto-drain any queued offline actions the moment connectivity returns.
      void processOfflineQueue().catch(() => {});
    };

    const handleOffline = () => {
      setHasChanged(true);
      setDismissed(false);
      refreshPending();
    };

    const handleSyncComplete = () => {
      refreshPending();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-sync:complete', handleSyncComplete);

    return () => {
      clearTimeout(firstRead);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-sync:complete', handleSyncComplete);
    };
  }, [refreshPending]);

  // Auto-dismiss "Back online" toast after 4s
  useEffect(() => {
    if (isOnline && hasChanged && !dismissed) {
      const timer = setTimeout(() => {
        setHasChanged(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, hasChanged, dismissed]);

  const pending = pendingCount > 0;

  // Never render if dismissed or if online and never went offline (and nothing pending)
  if (dismissed || (isOnline && !hasChanged && !pending)) {
    return null;
  }

  const message = !isOnline
    ? pending
      ? `Mode offline · ${pendingCount} data menunggu`
      : 'Koneksi terputus — pembaruan dijeda'
    : pending
      ? `Menyinkronkan ${pendingCount} data tertunda…`
      : 'Kembali online';

  const StatusIcon = isOnline ? Wifi : WifiOff;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[var(--layer-toast)] flex justify-center px-4"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2 rounded-[var(--radius-full)] border py-1.5 pl-2.5 pr-1 text-xs font-medium shadow-[var(--shadow-lg)] backdrop-blur-sm ${
          !isOnline
            ? 'border-[#FECACA] bg-[#FEF2F2]/95 text-[#991B1B]'
            : 'border-[#A7F3D0] bg-[#ECFDF5]/95 text-[#065F46]'
        }`}
      >
        <span className="relative flex size-4 shrink-0 items-center justify-center">
          <StatusIcon className="size-3.5" strokeWidth={2} aria-hidden="true" />
          {isOnline && pending && (
            <span className="live-ping absolute inset-0 rounded-full bg-[#059669]/30" aria-hidden="true" />
          )}
        </span>
        <span className="tabular-nums">{message}</span>
        {isOnline && pending && (
          <button
            type="button"
            onClick={() => void processOfflineQueue().catch(() => {})}
            className="ml-0.5 inline-flex min-h-7 cursor-pointer items-center gap-1 rounded-[var(--radius-full)] px-2 font-semibold transition-colors hover:bg-black/5"
          >
            <RefreshCw className="size-3" strokeWidth={2.2} aria-hidden="true" />
            <span>Sync</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="grid size-7 cursor-pointer place-items-center rounded-full opacity-60 transition-opacity hover:bg-black/5 hover:opacity-100"
          aria-label="Tutup pemberitahuan jaringan"
        >
          <X className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
