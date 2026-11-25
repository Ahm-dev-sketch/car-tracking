'use client';

import React from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { Icon } from './Icon';

export interface LocationBadgeProps {
  type: 'home' | 'current';
  name?: string | null;
  code?: string | null;
  className?: string;
}

export function LocationBadge({ type, name, code, className = '' }: LocationBadgeProps) {
  const { t, format } = useTranslation();
  if (!name && !code) return null;

  const display = code ? `${name || ''} (${code})` : name || '';

  if (type === 'home') {
    return (
      <span
        title={format(t.common.homeTooltip, { name: display })}
        className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 ${className}`}
      >
        <Icon name="home" className="size-3 shrink-0" />
        <span className="shrink-0 rounded-full bg-brand-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-brand-700">
          {t.common.homeShort}
        </span>
        <span className="min-w-0 truncate tabular-nums">{display}</span>
      </span>
    );
  }

  return (
    <span
      title={format(t.common.currentTooltip, { name: display })}
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full border border-info-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-info-700 ${className}`}
    >
      <Icon name="pin" className="size-3 shrink-0 text-slate-400" />
      <span className="shrink-0 rounded-full bg-info-100 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-info-600">
        {t.common.currentShort}
      </span>
      <span className="min-w-0 truncate tabular-nums">{display}</span>
    </span>
  );
}
