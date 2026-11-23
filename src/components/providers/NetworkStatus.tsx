'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { getOfflineQueueCount, processOfflineQueue } from '@/lib/offline-sync';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
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
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);
    refreshPending();

    const handleOnline = () => {
      setIsOnline(true);
      setHasChanged(true);
      setDismissed(false);
      refreshPending();
      // Auto-drain any queued offline actions the moment connectivity returns.
      void processOfflineQueue().catch(() => {});
    };

    const handleOffline = () => {
      setIsOnline(false);
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
    ? (pending ? `Mode Offline • ${pendingCount} data menunggu dikirim` : 'Connection lost — updates paused')
    : (pending ? `Menyinkronkan ${pendingCount} data tertunda ke server...` : 'Back online');

  const tone = !isOnline
    ? 'border-warning-200 bg-warning-50 text-warning-700'
    : 'border-success-200 bg-success-50 text-success-700';

  const dotTone = !isOnline ? 'bg-warning-600' : 'bg-success-600';

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-[var(--layer-toast)] flex justify-center px-3"
    >
      <div
        className={`pointer-events-auto flex max-w-full items-center gap-2.5 rounded-full border py-1.5 pl-3 pr-1.5 text-xs font-medium ${tone}`}
      >
        <span className="relative inline-flex size-2 shrink-0 rounded-full" aria-hidden="true">
          <span className={`absolute inset-0 rounded-full ${dotTone}`} />
          {isOnline && <span className={`absolute inset-0 rounded-full ${dotTone} status-ping`} />}
        </span>

        <Icon name={!isOnline ? 'wifi' : 'check'} className="size-3.5 shrink-0" />

        <span className="min-w-0 truncate tabular-nums">{message}</span>

        {isOnline && pending && (
          <button
            type="button"
            onClick={() => void processOfflineQueue().catch(() => {})}
            className="flex min-h-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-success-600 px-3 font-semibold text-white transition-colors hover:bg-success-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Sync Sekarang
          </button>
        )}

        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={`flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
            !isOnline
              ? 'text-warning-700/60 hover:bg-warning-100 hover:text-warning-700'
              : 'text-success-700/60 hover:bg-success-100 hover:text-success-700'
          }`}
          aria-label="Dismiss network notice"
        >
          <Icon name="close" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
