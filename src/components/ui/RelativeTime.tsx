'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { formatMessage, getDictionary, type Locale } from '@/lib/i18n';

function formatRelative(date: Date | string | number, locale: Locale): string {
  const dict = getDictionary(locale);
  const time = new Date(date).getTime();
  if (isNaN(time)) return dict.common.noDataDash;

  const diffSeconds = Math.round((Date.now() - time) / 1000);
  if (diffSeconds < 5) return dict.time.justNow;
  if (diffSeconds < 60) return formatMessage(dict.time.secondsAgo, { n: diffSeconds });
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return formatMessage(dict.time.minutesAgo, { n: diffMinutes });
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return formatMessage(dict.time.hoursAgo, { n: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return formatMessage(dict.time.daysAgo, { n: diffDays });
}

export function RelativeTime({ date, className = '' }: { date: Date | string | number | null | undefined; className?: string }) {
  const { locale, t } = useTranslation();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [date]);

  if (!date) return <span className={className}>{t.common.noDataDash}</span>;

  return (
    <time
      dateTime={new Date(date).toISOString()}
      title={new Date(date).toLocaleString(locale === 'id' ? 'id-ID' : 'en-US')}
      className={`text-xs tabular-nums text-slate-500 ${className}`}
    >
      {formatRelative(date, locale)}
    </time>
  );
}
