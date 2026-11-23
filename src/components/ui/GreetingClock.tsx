'use client';

import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock, Moon, Sun, Sunrise } from 'lucide-react';

interface GreetingClockProps {
  userName?: string | null;
  roleLabel?: string;
  variant?: 'banner' | 'navbar' | 'compact';
  className?: string;
}

const DAYS_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function getGreetingInfo(date: Date) {
  const hour = date.getHours();
  if (hour >= 4 && hour < 11) {
    return { text: 'Selamat pagi', Icon: Sunrise };
  }
  if (hour >= 11 && hour < 15) {
    return { text: 'Selamat siang', Icon: Sun };
  }
  if (hour >= 15 && hour < 18) {
    return { text: 'Selamat sore', Icon: Sun };
  }
  return { text: 'Selamat malam', Icon: Moon };
}

function pad(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

export function GreetingClock({
  userName,
  roleLabel,
  variant = 'banner',
  className = '',
}: GreetingClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // First tick is queued rather than written straight into the effect body,
    // so the effect only starts the timer and every state write comes from a
    // callback.
    const firstTick = setTimeout(() => setNow(new Date()), 0);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(firstTick);
      clearInterval(timer);
    };
  }, []);

  if (!now) {
    if (variant === 'navbar') {
      return (
        <div className={`hidden h-9 w-36 items-center rounded-[var(--radius-md)] border border-[var(--border)] px-3 lg:flex ${className}`}>
          <span className="skeleton skeleton-text h-2 w-full" />
        </div>
      );
    }
    if (variant === 'compact') {
      return (
        <div className={`flex items-center gap-2 ${className}`}>
          <span className="skeleton h-6 w-28 rounded-full" />
          <span className="skeleton h-6 w-24 rounded-full" />
        </div>
      );
    }
    return (
      <div className={`card p-4 ${className}`}>
        <div className="flex items-center gap-3">
          <span className="skeleton size-10 rounded-[var(--radius-md)]" />
          <div className="flex-1 space-y-2">
            <span className="skeleton skeleton-text block h-2 w-20" />
            <span className="skeleton skeleton-text block h-3 w-36" />
          </div>
        </div>
      </div>
    );
  }

  const { text: greetingText, Icon: GreetingIcon } = getGreetingInfo(now);
  const dayName = DAYS_ID[now.getDay()];
  const dateFormatted = `${dayName}, ${now.getDate()} ${MONTHS_ID[now.getMonth()]} ${now.getFullYear()}`;
  const timeFormatted = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} WIB`;

  if (variant === 'navbar') {
    return (
      <div
        className={`hidden items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-white px-2.5 py-1.5 lg:flex ${className}`}
        title={`${dateFormatted} — ${timeFormatted}`}
      >
        <Clock className="size-3.5 shrink-0 text-slate-400" strokeWidth={1.9} aria-hidden="true" />
        <span className="font-mono text-[0.6875rem] font-medium tabular-nums text-slate-700">
          {timeFormatted}
        </span>
        <span className="size-1 rounded-full bg-[#059669]" aria-hidden="true" />
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <span className="pill bg-white">
          <GreetingIcon className="size-3 shrink-0 text-[#B45309]" strokeWidth={2} aria-hidden="true" />
          <span>
            {greetingText}
            {userName ? `, ${userName.split(/\s+/)[0]}` : ''}
          </span>
        </span>
        <span className="pill bg-white">
          <Clock className="size-3 shrink-0 text-slate-400" strokeWidth={2} aria-hidden="true" />
          <span className="font-mono tabular-nums">{timeFormatted}</span>
        </span>
      </div>
    );
  }

  return (
    <section
      className={`card flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`}
      aria-label="Sapaan dan waktu saat ini"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--canvas)] text-[#B45309]">
          <GreetingIcon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-slate-500">
            <span>{greetingText}</span>
            {roleLabel && (
              <>
                <span className="text-slate-300" aria-hidden="true">·</span>
                <span className="truncate uppercase tracking-[0.06em] text-slate-400">
                  {roleLabel}
                </span>
              </>
            )}
          </p>
          <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.015em] text-slate-900">
            {userName || 'Selamat datang'}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="pill">
          <span className="pill-dot" style={{ color: 'var(--status-active-fg)' }} aria-hidden="true" />
          <span className="font-mono tabular-nums text-slate-700">{timeFormatted}</span>
        </span>
        <span className="pill">
          <CalendarDays className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
          <span className="text-slate-600">{dateFormatted}</span>
        </span>
      </div>
    </section>
  );
}
