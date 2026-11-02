'use client';

import React from 'react';

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
      className={`flex items-start justify-between gap-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-sm ${className}`}
    >
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 shrink-0 text-rose-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span>{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-rose-500 hover:text-rose-700 text-xs font-semibold p-0.5 rounded cursor-pointer"
          aria-label="Dismiss error"
        >
          ✕
        </button>
      )}
    </div>
  );
}
