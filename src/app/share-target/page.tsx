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
    <div className="min-h-screen flex flex-col items-center justify-center gap-2 text-slate-600">
      <Spinner size="lg" />
      <p className="text-sm">Opening…</p>
    </div>
  );
}
