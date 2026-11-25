'use client';

import React from 'react';
import { Icon } from './Icon';
import { useTranslation } from '@/components/providers/LanguageProvider';

export function ErrorBanner({
  message,
  onDismiss,
  className = '',
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  if (!message) return null;

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 rounded-lg border border-danger-200 bg-danger-50 p-3.5 text-sm text-danger-700 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <span className="leading-snug">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-danger-700/70 transition-colors hover:bg-danger-100 hover:text-danger-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-600"
          aria-label={t.common.dismissError}
        >
          <Icon name="close" className="size-4" />
        </button>
      )}
    </div>
  );
}
