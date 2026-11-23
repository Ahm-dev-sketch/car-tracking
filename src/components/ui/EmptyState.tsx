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
    <div className={`rounded-xl border-[2.5px] border-black bg-white p-2 shadow-[5px_5px_0px_0px_#000] ${className}`}>
      <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-black bg-amber-50/40 px-6 py-12 text-center sm:py-16">
        <div className="mb-5 flex size-14 items-center justify-center rounded-xl border-2 border-black bg-emerald-300 text-black shadow-[3px_3px_0px_0px_#000]" aria-hidden="true">
          {icon || (
            <svg className="size-7" fill="none" viewBox="0 0 32 32" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 9.5h16a2.5 2.5 0 0 1 2.5 2.5v12a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 24V12A2.5 2.5 0 0 1 8 9.5Z" />
              <path d="M11 9.5V7a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2.5M5.5 17.5h7l1.5 3h4l1.5-3h7" />
            </svg>
          )}
        </div>
        <h4 className="text-lg font-extrabold tracking-tight text-black">{title}</h4>
        {description && <p className="mt-2 max-w-sm text-sm font-medium leading-relaxed text-zinc-700">{description}</p>}
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="mt-6 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border-2 border-black bg-emerald-400 px-6 py-2.5 text-sm font-extrabold text-black shadow-[3px_3px_0px_0px_#000] transition-all hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
