'use client';

import { useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
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
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--canvas)] text-slate-500"
    >
      <Spinner size="lg" className="text-[#C8102E]" />
      <p className="text-xs font-medium">Membuka tautan…</p>
    </div>
  );
}
