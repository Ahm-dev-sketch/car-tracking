'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';

type Phase = 'hidden' | 'in' | 'out';

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export function LaunchSplash() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('hidden');

  useEffect(() => {
    if (!isStandalone()) return;
    setPhase('in');
    const fadeOut = window.setTimeout(() => setPhase('out'), 900);
    const unmount = window.setTimeout(() => setPhase('hidden'), 1500);
    return () => {
      window.clearTimeout(fadeOut);
      window.clearTimeout(unmount);
    };
  }, []);

  if (phase === 'hidden') return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] grid place-items-center bg-white motion-reduce:transition-none ${
        phase === 'out'
          ? 'pointer-events-none opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-150'
          : 'opacity-100 animate-[launch-splash-pop_350ms_ease-out]'
      }`}
    >
      <style>{`@keyframes launch-splash-pop{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>

      <div className="flex flex-col items-center gap-5 px-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static icon, no optimizer needed */}
        <img
          src="/icons/icon.svg"
          alt="KCIC Fleet"
          width={64}
          height={64}
          className="size-16 rounded-2xl drop-shadow-md"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="h-0.5 w-9 rounded-full bg-brand-600" />
          <div className="text-xl font-semibold tracking-tight text-slate-900">KCIC Fleet</div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.32em] text-slate-400">
            {t.auth.brandTagline}
          </div>
        </div>
      </div>
    </div>
  );
}
