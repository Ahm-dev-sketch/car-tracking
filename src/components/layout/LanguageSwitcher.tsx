'use client';

import React from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';
import type { Locale } from '@/lib/i18n';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({ compact = false, className = '' }: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useTranslation();

  const options: readonly { code: Locale; label: string; aria: string }[] = [
    { code: 'id', label: 'ID', aria: t.common.switchToId },
    { code: 'en', label: 'EN', aria: t.common.switchToEn },
  ];

  return (
    <div
      role="group"
      aria-label={t.common.languageSwitchAria}
      className={`inline-flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 ${className}`}
    >
      {options.map((opt) => {
        const active = locale === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => setLocale(opt.code)}
            aria-label={opt.aria}
            aria-pressed={active}
            className={`inline-flex h-full cursor-pointer items-center justify-center rounded-md px-2 text-xs font-semibold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
              compact ? 'min-w-7 px-1.5 text-[11px]' : 'min-w-8 px-2'
            } ${
              active
                ? 'bg-brand-600 text-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]'
                : 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
