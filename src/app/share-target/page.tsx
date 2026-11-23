'use client';

import { useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import { looksLikeGoogleMapsUrl } from '@/lib/google-maps-url';

export default function ShareTargetPage() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const candidates = [params.get('url'), params.get('text'), params.get('title')];
      const destination = candidates.find(
        (candidate): candidate is string =>
          typeof candidate === 'string' && looksLikeGoogleMapsUrl(candidate),
      );

      if (destination) {
        sessionStorage.setItem('kcic_share_destination', destination);
        window.location.replace('/user/vehicles');
      } else {
        window.location.replace('/');
      }
    } catch {
      window.location.replace('/');
    }
  }, []);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-slate-50 px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white px-6 py-8 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600">
            <Icon name="share" className="size-4 text-white" />
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-900">
            KCIC FLEET
          </span>
        </div>

        <div className="h-px w-full bg-slate-200" />

        <Spinner size="lg" className="text-brand-600" />
        <p className="text-sm font-medium text-slate-600">Opening…</p>
      </div>
    </div>
  );
}
