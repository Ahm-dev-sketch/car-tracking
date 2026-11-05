'use client';

import React, { useState, useEffect } from 'react';
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
    <div className="rounded-xl border-[3px] border-black bg-white overflow-hidden shadow-[6px_6px_0px_0px_#000]">
      {/* 60s Countdown Bar */}
      <div className="w-full bg-zinc-200 border-b-2 border-black h-3 overflow-hidden" role="progressbar" aria-label="Time remaining to respond" aria-valuemin={0} aria-valuemax={maxSec} aria-valuenow={Math.min(secondsRemaining, maxSec)}>
        <div
          className={`h-full origin-left transition-transform duration-500 ease-out border-r-2 border-black ${
            secondsRemaining <= 10
              ? 'bg-rose-500'
              : secondsRemaining <= 20
              ? 'bg-amber-400'
              : 'bg-emerald-500'
          }`}
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Header with Countdown Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 border border-black bg-emerald-500" />
            </span>
            <span className="text-sm font-black uppercase tracking-wider text-black">
              Tawaran Perjalanan Baru
            </span>
          </div>

          <div
            className={`font-mono font-black text-xs px-2.5 py-1 rounded-lg border-2 border-black shadow-[2px_2px_0px_0px_#000] ${
              secondsRemaining <= 5
                ? 'bg-rose-300 text-black animate-pulse'
                : secondsRemaining <= 10
                ? 'bg-amber-300 text-black'
                : 'bg-emerald-300 text-black'
            }`}
          >
            {secondsRemaining}s remaining
          </div>
        </div>

        {/* Route Details */}
        <div className="bg-amber-50/60 rounded-xl border-2 border-black p-4 space-y-3 text-sm shadow-[2px_2px_0px_0px_#000]">
          <div>
            <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500 block">Titik Jemput</span>
            <span className="font-extrabold text-black text-base">{pickup}</span>
          </div>
          <div className="pt-2 border-t-2 border-dashed border-black/20">
            <span className="text-[10px] uppercase font-black tracking-wider text-zinc-500 block">Tujuan</span>
            <span className="font-extrabold text-black text-base">{dest}</span>
          </div>
        </div>

        {/* Meta / Metrics */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1">
          <div className="flex items-center gap-3">
            <span className="text-zinc-700 font-bold">
              <strong className="text-black font-black text-sm">{passengers}</strong> penumpang
            </span>
            {etaText && (
              <span className="text-black font-mono font-black bg-amber-300 px-2.5 py-0.5 rounded-md border-1.5 border-black shadow-[1.5px_1.5px_0px_0px_#000]">
                ETA: {etaText}
              </span>
            )}
          </div>
          {offer.booking?.bookingNumber && (
            <span className="text-zinc-600 font-mono font-black text-[11px]">
              #{offer.booking.bookingNumber}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2 border-t-2 border-black/15">
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleReject}
            className="w-full inline-flex items-center justify-center rounded-xl border-2 border-black bg-rose-200 hover:bg-rose-300 text-black font-extrabold py-3 text-sm shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
          >
            {isRejecting ? <Spinner size="sm" className="text-black" /> : 'Tolak Tawaran'}
          </button>
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleAccept}
            className="w-full inline-flex items-center justify-center rounded-xl border-2 border-black bg-emerald-400 hover:bg-emerald-300 text-black font-extrabold py-3 text-sm shadow-[3px_3px_0px_0px_#000] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all disabled:opacity-50 cursor-pointer"
          >
            {isAccepting ? <Spinner size="sm" className="text-black" /> : 'Terima Tawaran'}
          </button>
        </div>
      </div>
    </div>
  );
}
