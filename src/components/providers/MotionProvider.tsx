'use client';

import React from 'react';
import { MotionConfig, LazyMotion, domAnimation } from 'motion/react';

/**
 * Motion context for the whole app.
 *
 * `reducedMotion="user"` makes every `m.*` transform animation honour the OS
 * reduced-motion setting. `LazyMotion strict` keeps the bundle to the
 * `domAnimation` feature set, so only the lightweight `m` proxy may be used.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
