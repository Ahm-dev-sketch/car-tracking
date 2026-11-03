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
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-zinc-800 text-white shrink-0 ${className}`}
      >
        <span className="text-[9px] uppercase tracking-wider text-zinc-300">Home</span>
        <span className="truncate max-w-[120px]">{display}</span>
      </span>
    );
  }

  return (
    <span
      title={`Current Location: ${display}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border border-zinc-400 text-zinc-700 bg-white shrink-0 ${className}`}
    >
      <span className="text-[9px] uppercase tracking-wider text-zinc-400">Cur</span>
      <span className="truncate max-w-[120px]">{display}</span>
    </span>
  );
}
