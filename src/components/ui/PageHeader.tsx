import React from "react";

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
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`mb-7 flex min-w-0 flex-col gap-5 pb-2 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-6 ${className}`}
    >
      <div className="min-w-0">
        <h1 className="page-heading text-3xl font-extrabold leading-tight tracking-tight text-black sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-relaxed text-zinc-600">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:shrink-0 [&_button]:min-h-11 [&_button]:rounded-xl [&_button]:border-2 [&_button]:border-black [&_button]:px-5 [&_button]:text-sm [&_button]:font-extrabold [&_button]:shadow-[3px_3px_0px_0px_#000] [&_button]:active:translate-x-[1px] [&_button]:active:translate-y-[1px] [&_button]:active:shadow-none [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center [&_a]:justify-center [&_a]:rounded-xl [&_a]:border-2 [&_a]:border-black [&_a]:px-5 [&_a]:text-sm [&_a]:font-extrabold [&_a]:shadow-[3px_3px_0px_0px_#000] [&_a]:active:translate-x-[1px] [&_a]:active:translate-y-[1px] [&_a]:active:shadow-none">
          {actions}
        </div>
      )}
    </div>
  );
}
