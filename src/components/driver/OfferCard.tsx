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

  const pct = Math.min(100, Math.max(0, (secondsRemaining / 30) * 100));

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
    <div className="bg-white border-2 border-indigo-500 rounded-lg shadow-md overflow-hidden relative animate-fadeIn">
      {/* 30s Countdown Bar */}
      <div className="w-full bg-zinc-100 h-1.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-500 ${
            secondsRemaining <= 5
              ? 'bg-rose-500'
              : secondsRemaining <= 10
              ? 'bg-amber-500'
              : 'bg-indigo-600'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="p-4 space-y-3">
        {/* Header with Countdown Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-600" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-900">
              New Trip Dispatch Offer
            </span>
          </div>

          <div
            className={`font-mono font-bold text-xs px-2 py-0.5 rounded border ${
              secondsRemaining <= 5
                ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
                : secondsRemaining <= 10
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-indigo-50 text-indigo-700 border-indigo-200'
            }`}
          >
            {secondsRemaining}s remaining
          </div>
        </div>

        {/* Route Details */}
        <div className="bg-zinc-50 border border-zinc-200 rounded p-3 space-y-2 text-xs">
          <div>
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Pickup</span>
            <span className="font-semibold text-zinc-900 text-sm">{pickup}</span>
          </div>
          <div className="pt-2 border-t border-zinc-200">
            <span className="text-[10px] uppercase font-bold text-zinc-400 block">Destination</span>
            <span className="font-semibold text-zinc-900 text-sm">{dest}</span>
          </div>
        </div>

        {/* Meta / Metrics */}
        <div className="flex items-center justify-between text-xs pt-1">
          <div className="flex items-center gap-3">
            <span className="text-zinc-600">
              👤 <strong className="text-zinc-800">{passengers}</strong> passenger(s)
            </span>
            {etaText && (
              <span className="text-indigo-800 font-mono font-semibold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                ETA: {etaText}
              </span>
            )}
          </div>
          {offer.booking?.bookingNumber && (
            <span className="text-zinc-400 font-mono text-[11px]">
              #{offer.booking.bookingNumber}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-100">
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleReject}
            className="w-full py-2 px-3 border border-zinc-300 hover:bg-zinc-50 disabled:opacity-50 text-zinc-700 rounded text-xs font-semibold cursor-pointer flex items-center justify-center gap-1.5"
          >
            {isRejecting ? <Spinner size="sm" /> : 'Decline'}
          </button>
          <button
            type="button"
            disabled={isAccepting || isRejecting}
            onClick={handleAccept}
            className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded text-xs font-semibold cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
          >
            {isAccepting ? <Spinner size="sm" /> : 'Accept Offer'}
          </button>
        </div>
      </div>
    </div>
  );
}
