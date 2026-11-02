import React from 'react';

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
    <div
      className={`border border-dashed border-zinc-300 rounded-lg p-8 text-center flex flex-col items-center justify-center bg-zinc-50/50 ${className}`}
    >
      {icon ? (
        <div className="mb-3 text-zinc-400">{icon}</div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
        </div>
      )}
      <h4 className="text-sm font-semibold text-zinc-800">{title}</h4>
      {description && <p className="text-xs text-zinc-500 mt-1 max-w-sm">{description}</p>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-4 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded text-xs font-semibold cursor-pointer"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
