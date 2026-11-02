import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b border-zinc-200 mb-6 ${className}`}
    >
      <div>
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="text-xs text-zinc-500 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
