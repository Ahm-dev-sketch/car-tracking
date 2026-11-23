'use client';

import { useState, useEffect } from 'react';

function formatRelative(date: Date | string | number): string {
  const time = new Date(date).getTime();
  if (isNaN(time)) return '—';

  const diffSeconds = Math.round((Date.now() - time) / 1000);
  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function RelativeTime({ date, className = '' }: { date: Date | string | number | null | undefined; className?: string }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 5000);
    return () => clearInterval(interval);
  }, [date]);

  if (!date) return <span className={className}>—</span>;

  return (
    <time
      dateTime={new Date(date).toISOString()}
      title={new Date(date).toLocaleString()}
      className={`text-xs text-zinc-500 ${className}`}
    >
      {formatRelative(date)}
    </time>
  );
}
