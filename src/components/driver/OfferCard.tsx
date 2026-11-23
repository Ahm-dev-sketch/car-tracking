'use client';

import React, { useState, useEffect } from 'react';
import { Clock, Timer, Users } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { formatEta } from '@/components/booking/DispatchProgress';

export interface DriverOffer {
  id: string;
  bookingId: string;
  attemptNo?: number;
  status?: string;
  sentAt?: string;
  expiresAt: string;
  etaSeconds?: number | null;
  etaEstimated?: boolean;
  pickupLocation?: string;
  destination?: string;
  passengerCount?: number;
  booking?: {
    id: string;
    bookingNumber?: string;
    pickupLocation: string;
    destination: string;
    passengerCount: number;
    purpose?: string;
    notes?: string | null;
  } | null;
}

export interface OfferCardProps {
  offer: DriverOffer;
  onAccept: (offerId: string) => Promise<void>;
  onReject: (offerId: string) => Promise<void>;
  onExpire: (offerId: string) => void;
}

export function OfferCard({ offer, onAccept, onReject, onExpire }: OfferCardProps) {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(() => {
    const expiresMs = new Date(offer.expiresAt).getTime();
    return Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
  });

  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    const updateCountdown = () => {
      const expiresMs = new Date(offer.expiresAt).getTime();
      const diff = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
      setSecondsRemaining(diff);

      if (diff <= 0) {
        onExpire(offer.id);
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 500);
    return () => clearInterval(timer);
  }, [offer.id, offer.expiresAt, onExpire]);

  if (secondsRemaining <= 0) {
    return null;
  }

  const pickup = offer.pickupLocation || offer.booking?.pickupLocation || 'Pickup Location';
  const dest = offer.destination || offer.booking?.destination || 'Destination';
  const passengers = offer.passengerCount || offer.booking?.passengerCount || 1;
  const etaText = formatEta(offer.etaSeconds, offer.etaEstimated);

  const maxSec = 60;
  const pct = Math.min(100, Math.max(0, (secondsRemaining / maxSec) * 100));

  const urgent = secondsRemaining <= 10;
  const soon = secondsRemaining <= 20;

  const handleAccept = async () => {
    setIsAccepting(true);
    try {
      await onAccept(offer.id);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await onReject(offer.id);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-sm)]">
      {/* Countdown bar */}
      <div
        className="h-1 w-full overflow-hidden bg-[var(--border-subtle)]"
        role="progressbar"
        aria-label="Sisa waktu merespons tawaran"
        aria-valuemin={0}
        aria-valuemax={maxSec}
        aria-valuenow={Math.min(secondsRemaining, maxSec)}
      >
        <div
          className={`h-full origin-left transition-transform duration-500 ease-out ${
            urgent
              ? 'bg-[var(--status-error-fg)]'
              : soon
                ? 'bg-[var(--status-warning-fg)]'
                : 'bg-[var(--status-active-fg)]'
          }`}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>

      <div className="space-y-3.5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex size-2 shrink-0">
              <span className="live-ping absolute inset-0 rounded-full bg-[var(--status-active-fg)]" aria-hidden="true" />
              <span className="relative size-2 rounded-full bg-[var(--status-active-fg)]" aria-hidden="true" />
            </span>
            <span className="truncate text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Tawaran perjalanan baru
            </span>
          </div>

          <span
            className={`mono-plate shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums ${
              urgent
                ? 'animate-pulse bg-[var(--status-error-bg)] text-[var(--status-error-fg)]'
                : soon
                  ? 'bg-[var(--status-warning-bg)] text-[var(--status-warning-fg)]'
                  : 'bg-[var(--canvas)] text-slate-600'
            }`}
          >
            {secondsRemaining}s
          </span>
        </div>

        <div className="route-stepper">
          <div className="route-point" data-kind="pickup">
            <p className="route-label">Titik jemput</p>
            <p className="route-value truncate">{pickup}</p>
          </div>
          <div className="route-point" data-kind="destination">
            <p className="route-label">Tujuan</p>
            <p className="route-value truncate">{dest}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium text-slate-600">
              <Users className="size-3" strokeWidth={2} aria-hidden="true" />
              <strong className="font-semibold tabular-nums text-slate-900">{passengers}</strong>
              penumpang
            </span>
            {etaText && (
              <span className="pill pill-warning">
                <Timer className="size-2.5" strokeWidth={2.4} aria-hidden="true" />
                <span>ETA {etaText}</span>
              </span>
            )}
          </div>
          {offer.booking?.bookingNumber && (
            <span className="mono-plate inline-flex items-center gap-1 text-[0.625rem] text-slate-400">
              <Clock className="size-2.5" strokeWidth={2.2} aria-hidden="true" />#{offer.booking.bookingNumber}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleReject}
            className="button-secondary py-2.5"
          >
            {isRejecting ? <Spinner size="sm" /> : 'Tolak'}
          </button>
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleAccept}
            className="button-primary py-2.5"
          >
            {isAccepting ? <Spinner size="sm" className="text-white" /> : 'Terima'}
          </button>
        </div>
      </div>
    </article>
  );
}
