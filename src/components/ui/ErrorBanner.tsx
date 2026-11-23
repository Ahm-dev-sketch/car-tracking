'use client';

import React from 'react';
import { X, CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';

type BannerTone = 'error' | 'warning' | 'success' | 'info';

const tones: Record<BannerTone, { wrap: string; icon: string; Icon: typeof CircleAlert }> = {
  error: {
    wrap: 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]',
    icon: 'text-[#DC2626]',
    Icon: CircleAlert,
  },
  warning: {
    wrap: 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
    icon: 'text-[#B45309]',
    Icon: TriangleAlert,
  },
  success: {
    wrap: 'border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]',
    icon: 'text-[#059669]',
    Icon: CircleCheck,
  },
  info: {
    wrap: 'border-[#BAE6FD] bg-[#F0F9FF] text-[#075985]',
    icon: 'text-[#0284C7]',
    Icon: Info,
  },
};

export function ErrorBanner({
  message,
  onDismiss,
  className = '',
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  return <Banner tone="error" message={message} onDismiss={onDismiss} className={className} />;
}

export function WarningBanner({
  message,
  onDismiss,
  className = '',
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  return <Banner tone="warning" message={message} onDismiss={onDismiss} className={className} />;
}

export function SuccessBanner({
  message,
  onDismiss,
  className = '',
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  return <Banner tone="success" message={message} onDismiss={onDismiss} className={className} />;
}

export function InfoBanner({
  message,
  onDismiss,
  className = '',
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  return <Banner tone="info" message={message} onDismiss={onDismiss} className={className} />;
}

function Banner({
  tone,
  message,
  onDismiss,
  className = '',
}: {
  tone: BannerTone;
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!message) return null;
  const { wrap, icon, Icon } = tones[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      className={`flex items-start gap-2.5 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs font-medium leading-relaxed ${wrap} ${className}`}
    >
      <Icon className={`mt-px size-4 shrink-0 ${icon}`} strokeWidth={1.9} aria-hidden="true" />
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-0.5 grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] opacity-70 transition hover:bg-black/5 hover:opacity-100"
          aria-label="Tutup pesan"
        >
          <X className="size-3.5" strokeWidth={2.2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
