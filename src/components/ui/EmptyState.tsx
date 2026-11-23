import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Empty state. Reference treatment: generous white panel, one soft icon tile,
 * a short title, restrained copy, single primary action.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-[var(--radius-xl)] border border-[var(--border)] bg-white px-6 py-12 text-center ${className}`}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--canvas)] text-slate-400">
        {icon || <Inbox className="size-5" strokeWidth={1.75} aria-hidden="true" />}
      </span>
      <h3 className="text-sm font-semibold tracking-[-0.01em] text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-slate-500">{description}</p>
      )}
      {action && (
        <button type="button" onClick={action.onClick} className="button-primary mt-5">
          {action.label}
        </button>
      )}
    </div>
  );
}
