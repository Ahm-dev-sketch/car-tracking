import React from 'react';

export interface LocationBadgeProps {
  type: 'home' | 'current';
  name?: string | null;
  code?: string | null;
  className?: string;
}

export function LocationBadge({ type, name, code, className = '' }: LocationBadgeProps) {
  if (!name && !code) return null;

  const display = code ? `${name || ''} (${code})` : name || '';

  if (type === 'home') {
    return (
      <span
        title={`Home Base: ${display}`}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border-2 border-black bg-amber-300 text-black shadow-[2px_2px_0px_0px_#000] shrink-0 ${className}`}
      >
        <span className="text-[9px] uppercase font-extrabold tracking-wider bg-black text-white px-1 py-0.2 rounded-xs">Home</span>
        <span className="truncate max-w-[120px]">{display}</span>
      </span>
    );
  }

  return (
    <span
      title={`Current Location: ${display}`}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wide border-2 border-black bg-white text-black shadow-[2px_2px_0px_0px_#000] shrink-0 ${className}`}
    >
      <span className="text-[9px] uppercase font-extrabold tracking-wider bg-zinc-200 border border-black text-black px-1 py-0.2 rounded-xs">Cur</span>
      <span className="truncate max-w-[120px]">{display}</span>
    </span>
  );
}
