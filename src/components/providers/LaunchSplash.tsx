'use client';

import { useEffect, useState } from 'react';
import { Route } from 'lucide-react';

/**
 * LaunchSplash — lightweight initial splash overlay for PWA launch.
 * Automatically hides after initial client hydration and paint.
 */
export function LaunchSplash() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 350);
    const removeTimer = setTimeout(() => setVisible(false), 650);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--canvas)] transition-opacity duration-300 ${
        fading ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-[#C8102E] text-white shadow-[0_8px_24px_-8px_rgba(200,16,46,0.5)]">
          <Route className="size-6" strokeWidth={2.1} />
        </div>
        <div className="brand-word mt-1 text-lg">KCIC <span>Fleet</span></div>
        <div className="text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Operasional Whoosh
        </div>
      </div>
    </div>
  );
}
