'use client';

import React from 'react';
import { m } from 'motion/react';

interface MotionBentoCardProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
  interactive?: boolean;
  onClick?: () => void;
}

/**
 * Bento tile with a one-shot entrance reveal (opacity + 12px rise).
 * Hover and tap feedback only when the card itself is clickable.
 */
export function MotionBentoCard({
  children,
  className = '',
  index = 0,
  interactive = false,
  onClick,
}: MotionBentoCardProps) {
  return (
    <m.div
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={interactive ? { y: -2 } : undefined}
      whileTap={interactive ? { scale: 0.99 } : undefined}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.35, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={`${className}${interactive ? ' transition-colors hover:border-slate-300' : ''}`}
    >
      {children}
    </m.div>
  );
}
