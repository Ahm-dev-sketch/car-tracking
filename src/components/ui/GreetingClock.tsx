'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from './Icon';

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
    return { text: 'Selamat Pagi', icon: 'sun' as const, bg: 'bg-warning-50 text-warning-600' };
  }
  if (hour >= 11 && hour < 15) {
    return { text: 'Selamat Siang', icon: 'sun' as const, bg: 'bg-warning-50 text-warning-600' };
  }
  if (hour >= 15 && hour < 18) {
    return { text: 'Selamat Sore', icon: 'sun' as const, bg: 'bg-warning-50 text-warning-600' };
  }
  return { text: 'Selamat Malam', icon: 'moon' as const, bg: 'bg-info-100 text-info-600' };
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
    setNow(new Date());
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // SSR fallback
  if (!now) {
    if (variant === 'navbar') {
      return (
        <div className={`hidden md:flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-400 ${className}`}>
          <Icon name="clock" className="size-3.5" />
          <span className="tabular-nums">Memuat waktu...</span>
        </div>
      );
    }
    return (
      <div className={`rounded-xl border border-slate-200 bg-white p-4 ${className}`}>
        <div className="skeleton h-6 w-48" />
      </div>
    );
  }

  const { text: greetingText, icon: greetingIcon, bg: greetingBg } = getGreetingInfo(now);
  const dayName = DAYS_ID[now.getDay()];
  const dateNum = now.getDate();
  const monthName = MONTHS_ID[now.getMonth()];
  const year = now.getFullYear();
  const dateFormatted = `${dayName}, ${dateNum} ${monthName} ${year}`;
  const timeFormatted = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} WIB`;

  // Navbar variant
  if (variant === 'navbar') {
    return (
      <div
        className={`hidden lg:inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 ${className}`}
        title={`${dateFormatted} - ${timeFormatted}`}
      >
        <span className={`inline-flex size-5 items-center justify-center rounded-md ${greetingBg}`}>
          <Icon name={greetingIcon} className="size-3" />
        </span>
        <span className="font-medium">{greetingText}</span>
        <span className="h-3 w-px bg-slate-200" aria-hidden="true" />
        <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums text-slate-700">
          <span className="relative inline-flex size-1.5 shrink-0 rounded-full bg-success-600 status-ping" aria-hidden="true" />
          {timeFormatted}
        </span>
      </div>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`inline-flex flex-wrap items-center gap-2 text-xs ${className}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 font-medium ${greetingBg}`}>
          <Icon name={greetingIcon} className="size-3.5" />
          {greetingText}{userName ? `, ${userName}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono font-medium tabular-nums text-slate-700">
          <Icon name="clock" className="size-3.5 text-slate-400" />
          {timeFormatted}
        </span>
      </div>
    );
  }

  // Banner variant (Default prominent hero card)
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5 ${className}`}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Greeting + User */}
        <div className="flex items-center gap-3">
          <div className={`grid size-11 shrink-0 place-items-center rounded-lg ${greetingBg}`}>
            <Icon name={greetingIcon} className="size-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {roleLabel || 'KCIC Fleet'}
              </span>
              <span className="text-xs font-medium text-slate-400">{greetingText}</span>
            </div>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {greetingText}{userName ? `, ${userName}` : ''}!
            </h2>
          </div>
        </div>

        {/* Right: Detailed Clock + Date */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <span className="relative flex size-2">
              <span className="relative inline-flex size-2 rounded-full bg-success-600 status-ping" />
            </span>
            <span className="font-mono text-base font-semibold tabular-nums tracking-tight text-slate-900 sm:text-lg">
              {timeFormatted}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <Icon name="calendar" className="size-3.5 text-slate-400" />
            <span className="tabular-nums">{dateFormatted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
