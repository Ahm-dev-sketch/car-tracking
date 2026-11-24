'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

interface SplitTextRevealProps {
  text: string;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span';
  className?: string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Word-by-word heading reveal.
 *
 * The first render (server and client) is always the plain string, so hydration
 * never mismatches. Words are masked only after mount, and only when the user
 * has not asked for reduced motion.
 */
export function SplitTextReveal({ text, as, className = '' }: SplitTextRevealProps) {
  const Tag = (as ?? 'h1') as React.ElementType;
  const containerRef = useRef<HTMLElement>(null);
  const words = text.split(/\s+/).filter(Boolean);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || prefersReducedMotion()) return;
    if (container.querySelector('[aria-hidden="true"]')) return;

    gsap.registerPlugin(ScrollTrigger);

    // Split mark-up is built here rather than in render, so the first paint
    // matches the server HTML exactly.
    container.textContent = '';
    const masked = document.createElement('span');
    masked.setAttribute('aria-hidden', 'true');
    words.forEach((word, index) => {
      const mask = document.createElement('span');
      mask.className = 'inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em]';
      const inner = document.createElement('span');
      inner.className = 'inline-block';
      inner.textContent = word;
      mask.appendChild(inner);
      masked.appendChild(mask);
      if (index < words.length - 1) masked.appendChild(document.createTextNode(' '));
    });
    container.appendChild(masked);

    const ctx = gsap.context(() => {
      gsap.fromTo(
        container.querySelectorAll('[aria-hidden="true"] > span > span'),
        { yPercent: 105, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 0.45,
          stagger: 0.03,
          ease: 'power3.out',
          scrollTrigger: { trigger: container, start: 'top 92%', once: true },
        },
      );
    }, container);

    ScrollTrigger.refresh();

    return () => {
      ctx.revert();
      container.textContent = text;
    };
    // `text` is the only real input; re-running on it rebuilds the split.
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Tag ref={containerRef} aria-label={text} className={className}>
      {text}
    </Tag>
  );
}
