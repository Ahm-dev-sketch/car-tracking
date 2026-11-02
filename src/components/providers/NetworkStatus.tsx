'use client';

import React, { useState, useEffect } from 'react';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [hasChanged, setHasChanged] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setHasChanged(true);
      setDismissed(false);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setHasChanged(true);
      setDismissed(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auto-dismiss "Back online" toast after 4s
  useEffect(() => {
    if (isOnline && hasChanged && !dismissed) {
      const timer = setTimeout(() => {
        setHasChanged(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, hasChanged, dismissed]);

  // Never render if dismissed or if online and never went offline
  if (dismissed || (isOnline && !hasChanged)) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[max(0.5rem,env(safe-area-inset-top))] inset-x-0 z-50 flex justify-center px-4 pointer-events-none transition-all duration-300"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full shadow-lg border text-xs font-semibold backdrop-blur-md transition-all ${
          !isOnline
            ? 'bg-rose-600/95 text-white border-rose-700 shadow-rose-950/20'
            : 'bg-emerald-600/95 text-white border-emerald-700 shadow-emerald-950/20'
        }`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          {!isOnline ? (
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
          ) : (
            <>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </>
          )}
        </span>
        <span>
          {!isOnline
            ? 'Connection lost — updates paused'
            : 'Back online'}
        </span>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 p-1 hover:bg-white/20 rounded-full text-white/80 hover:text-white cursor-pointer transition-colors"
          aria-label="Dismiss network notice"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
