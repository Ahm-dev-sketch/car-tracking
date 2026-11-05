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
    return { text: 'Selamat Pagi', icon: 'sun' as const, bg: 'bg-amber-300' };
  }
  if (hour >= 11 && hour < 15) {
    return { text: 'Selamat Siang', icon: 'sun' as const, bg: 'bg-yellow-300' };
  }
  if (hour >= 15 && hour < 18) {
    return { text: 'Selamat Sore', icon: 'sun' as const, bg: 'bg-orange-300' };
  }
  return { text: 'Selamat Malam', icon: 'moon' as const, bg: 'bg-indigo-200' };
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
        <div className={`hidden md:flex items-center gap-2 rounded-xl border-2 border-black bg-amber-100 px-3 py-1.5 shadow-[2px_2px_0px_0px_#000] text-xs font-black ${className}`}>
          <Icon name="clock" className="size-3.5" />
          <span>Memuat waktu...</span>
        </div>
      );
    }
    return (
      <div className={`rounded-2xl border-2.5 border-black bg-amber-100 p-4 shadow-[4px_4px_0px_0px_#000] animate-pulse ${className}`}>
        <div className="h-6 w-48 bg-amber-200 rounded"></div>
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
        className={`hidden lg:inline-flex items-center gap-2.5 rounded-xl border-2 border-black bg-white px-3 py-1.5 text-xs font-black text-black shadow-[2px_2px_0px_0px_#000] ${className}`}
        title={`${dateFormatted} - ${timeFormatted}`}
      >
        <span className={`inline-flex items-center justify-center size-6 rounded-lg border-1.5 border-black ${greetingBg}`}>
          <Icon name={greetingIcon} className="size-3.5 text-black" />
        </span>
        <span className="font-extrabold">{greetingText}</span>
        <span className="text-zinc-400 font-normal">|</span>
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-black tracking-tight text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md border border-black">
          <span className="size-1.5 rounded-full bg-emerald-600 animate-ping inline-block" />
          {timeFormatted}
        </span>
      </div>
    );
  }

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`inline-flex flex-wrap items-center gap-2 text-xs font-black ${className}`}>
        <span className={`inline-flex items-center gap-1.5 rounded-lg border-2 border-black ${greetingBg} px-2.5 py-1 shadow-[2px_2px_0px_0px_#000]`}>
          <Icon name={greetingIcon} className="size-3.5" />
          {greetingText}{userName ? `, ${userName}` : ''}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-lg border-2 border-black bg-white px-2.5 py-1 shadow-[2px_2px_0px_0px_#000] font-mono">
          <Icon name="clock" className="size-3.5 text-emerald-700" />
          {timeFormatted}
        </span>
      </div>
    );
  }

  // Banner variant (Default prominent hero card)
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2.5 border-black bg-gradient-to-r from-amber-200 via-amber-100 to-emerald-100 p-4 sm:p-5 shadow-[4px_4px_0px_0px_#000] text-black ${className}`}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Greeting + User */}
        <div className="flex items-center gap-3">
          <div className={`grid size-12 shrink-0 place-items-center rounded-xl border-2 border-black ${greetingBg} shadow-[2.5px_2.5px_0px_0px_#000]`}>
            <Icon name={greetingIcon} className="size-6 text-black" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-black bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black shadow-[1.5px_1.5px_0px_0px_#000]">
                {roleLabel || 'KCIC Fleet'}
              </span>
              <span className="text-xs font-extrabold text-zinc-600">{greetingText}</span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-black sm:text-2xl mt-0.5">
              {greetingText}{userName ? `, ${userName}` : ''}!
            </h2>
          </div>
        </div>

        {/* Right: Detailed Clock + Date */}
        <div className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1.5">
          <div className="inline-flex items-center gap-2 rounded-xl border-2 border-black bg-white px-3 py-1.5 shadow-[2.5px_2.5px_0px_0px_#000]">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600 border border-black"></span>
            </span>
            <span className="font-mono text-base font-black tracking-tight text-black sm:text-lg">
              {timeFormatted}
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-lg border border-black bg-amber-50 px-2.5 py-1 text-xs font-extrabold text-zinc-800 shadow-[1.5px_1.5px_0px_0px_#000]">
            <Icon name="calendar" className="size-3.5 text-zinc-700" />
            <span>{dateFormatted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
