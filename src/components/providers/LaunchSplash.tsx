'use client';

import { useEffect, useState } from 'react';

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
      className={`fixed inset-0 z-[100] grid place-items-center bg-[#faf9f5] motion-reduce:animate-none ${
        phase === 'out'
          ? 'pointer-events-none opacity-0 transition-opacity duration-300 ease-out motion-reduce:duration-150'
          : 'opacity-100 animate-[launch-splash-pop_350ms_ease-out]'
      }`}
    >
      <style>{`@keyframes launch-splash-pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}`}</style>
      <div className="flex flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- static icon, no optimizer needed */}
        <img
          src="/icons/icon.svg"
          alt=""
          width={80}
          height={80}
          className="h-20 w-20 rounded border-2 border-black"
        />
        <div className="text-3xl font-black tracking-tight text-black">KCIC Fleet</div>
        <div className="text-xs font-bold uppercase tracking-[0.3em] text-rose-700">
          Workplace Mobility
        </div>
      </div>
    </div>
  );
}