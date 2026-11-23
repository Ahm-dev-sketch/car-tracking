import React from 'react';
import { Building, MapPin, Satellite } from 'lucide-react';

export interface LocationBadgeProps {
  type: 'home' | 'current';
  name?: string | null;
  code?: string | null;
  className?: string;
}

export function LocationBadge({ type, name, code, className = '' }: LocationBadgeProps) {
  if (!name && !code) return null;

  const display = code ? `${name || ''} (${code})` : name || '';
  const isHome = type === 'home';

  return (
    <span
      title={`${isHome ? 'Home base' : 'Lokasi saat ini'}: ${display}`}
      className={`pill ${isHome ? 'border-[#FDE68A] bg-[#FFFBEB] text-[#B45309]' : 'border-[var(--border)] bg-white text-slate-600'} ${className}`}
    >
      {isHome ? (
        <Building className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      ) : (
        <MapPin className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      )}
      <span className="max-w-[9.5rem]" title={display}>
        {display}
      </span>
    </span>
  );
}

export function SatelliteBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`pill ${className}`}>
      <Satellite className="size-3 shrink-0" strokeWidth={2} aria-hidden="true" />
      <span>RTK</span>
    </span>
  );
}
