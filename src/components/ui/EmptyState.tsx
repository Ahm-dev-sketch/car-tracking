import React from 'react';
import { Icon } from './Icon';

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

export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-6 py-12 text-center sm:py-16">
        <div className="mb-5 flex size-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400" aria-hidden="true">
          {icon || <Icon name="inbox" className="size-5" />}
        </div>
        <h4 className="text-base font-semibold tracking-tight text-slate-900">{title}</h4>
        {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{description}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-6 inline-flex min-h-10 cursor-pointer items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
