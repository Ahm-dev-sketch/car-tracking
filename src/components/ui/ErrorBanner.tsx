'use client';

import React from 'react';
import { Icon } from './Icon';

export function ErrorBanner({
  message,
  onDismiss,
  className = '',
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 p-4 bg-rose-200 text-black border-[2.5px] border-black rounded-xl text-sm font-semibold shadow-[4px_4px_0px_0px_#000] ${className}`}
    >
      <div className="flex items-center gap-2.5">
        <svg
          className="w-5 h-5 shrink-0 text-black"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="leading-snug">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex min-h-8 min-w-8 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] hover:bg-zinc-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none cursor-pointer"
          aria-label="Dismiss error"
        >
          <Icon name="close" className="size-4" />
        </button>
      )}
    </div>
  );
}
