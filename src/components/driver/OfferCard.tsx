'use client';

import React, { useState, useEffect } from 'react';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
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

  const isUrgent = secondsRemaining <= 5;
  const isWarming = secondsRemaining <= 10;
  const isAttention = secondsRemaining <= 20;
  const isCalm = !isUrgent && !isWarming && !isAttention;

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
    <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Leading urgency rule: crimson / amber / red as the window closes */}
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-[3px] ${
          isUrgent ? 'bg-danger-600' : isCalm ? 'bg-brand-600' : 'bg-warning-600'
        }`}
      />

      {/* 60 second countdown rail */}
      <div
        className="h-1 w-full bg-slate-100"
        role="progressbar"
        aria-label="Time remaining to respond"
        aria-valuemin={0}
        aria-valuemax={maxSec}
        aria-valuenow={Math.min(secondsRemaining, maxSec)}
      >
        <div
          className={`h-full origin-left transition-transform duration-500 ease-out ${
            isUrgent ? 'bg-danger-600' : isCalm ? 'bg-brand-600' : 'bg-warning-600'
          }`}
          style={{ transform: `scaleX(${Math.min(1, pct / 100)})` }}
        />
      </div>

      <div className="space-y-4 p-4 pl-5 sm:p-5 sm:pl-6">
        {/* Header: label + countdown */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex size-2 shrink-0 rounded-full" aria-hidden="true">
              <span className="absolute inset-0 rounded-full bg-brand-600" />
              <span className="absolute inset-0 rounded-full bg-brand-600 status-ping" />
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Tawaran perjalanan
            </span>
          </div>

          <div
            className={`flex items-baseline gap-1 rounded-lg border px-2.5 py-1 ${
              isUrgent
                ? 'border-danger-200 bg-danger-50 text-danger-700'
                : isCalm
                ? 'border-brand-200 bg-brand-50 text-brand-700'
                : 'border-warning-200 bg-warning-50 text-warning-700'
            }`}
          >
            <span className="font-mono text-2xl font-semibold leading-none tabular-nums">
              {secondsRemaining}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">detik</span>
          </div>
        </div>

        {/* Route: muted pickup, prominent destination */}
        <div className="space-y-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50/70">
          <div className="px-3.5 py-2.5">
            <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              Jemput
            </span>
            <span className="wrap-anywhere block text-xs font-medium leading-snug text-slate-600">
              {pickup}
            </span>
          </div>
          <div className="flex items-start gap-2 border-t border-slate-200 bg-white px-3.5 py-2.5">
            <Icon name="arrow" className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            <div className="min-w-0">
              <span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Tujuan
              </span>
              <span className="wrap-anywhere block text-sm font-semibold leading-snug tracking-tight text-slate-900">
                {dest}
              </span>
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
              <Icon name="users" className="size-3.5 text-slate-400" />
              <span className="font-mono font-semibold tabular-nums text-slate-900">{passengers}</span>
              <span>penumpang</span>
            </span>
            {etaText && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                <Icon name="clock" className="size-3.5 text-slate-400" />
                <span className="font-mono tabular-nums">{etaText}</span>
              </span>
            )}
          </div>
          {offer.booking?.bookingNumber && (
            <span className="font-mono text-[11px] font-medium tabular-nums text-slate-400">
              #{offer.booking.bookingNumber}
            </span>
          )}
        </div>

        {/* Actions — 44px+ touch targets */}
        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleReject}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRejecting ? <Spinner size="sm" /> : 'Tolak'}
          </button>
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleAccept}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAccepting ? <Spinner size="sm" /> : <Icon name="check" className="size-4" />}
            <span>Terima</span>
          </button>
        </div>
      </div>
    </article>
  );
}
