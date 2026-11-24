'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Smooth scrolling (Lenis) wired into the GSAP ticker so ScrollTrigger and the
 * scroll position never drift apart.
 *
 * Disabled for touch/coarse pointers (native scrolling is better on mobile) and
 * for `prefers-reduced-motion: reduce`.
 */
export function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lenisRef = useRef<Lenis | null>(null);
  const isFirstRoute = useRef(true);

  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Browser scroll restoration would otherwise fight Lenis after a reload.
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis();
    lenisRef.current = lenis;

    const updateScrollTrigger = () => ScrollTrigger.update();
    const unsubscribe = lenis.on('scroll', updateScrollTrigger);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      unsubscribe();
      lenis.destroy();
      lenisRef.current = null;
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'auto';
    };
  }, []);

  // Reset the scroll position and re-measure triggers on route change.
  useEffect(() => {
    // Let the browser keep hash navigation (`#section`) intact.
    if (window.location.hash) return;

    // Keep the initial position so browser scroll restoration still works.
    if (isFirstRoute.current) {
      isFirstRoute.current = false;
      return;
    }

    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(0, { immediate: true });
    else if (typeof window !== 'undefined') window.scrollTo(0, 0);

    ScrollTrigger.refresh();
  }, [pathname]);

  return <>{children}</>;
}
