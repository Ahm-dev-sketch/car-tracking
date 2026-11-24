import React from "react";
import { SplitTextReveal } from "./SplitTextReveal";

interface PageHeaderProps {
  title: string;
  /** Plain-text version of `title` for word-by-word reveals (defaults to `title`). */
  revealText?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  revealText,
  description,
  actions,
  className = "",
}: PageHeaderProps) {
  return (
    <div
      className={`mb-7 flex min-w-0 flex-col gap-5 pb-2 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6 ${className}`}
    >
      <div className="min-w-0">
        <SplitTextReveal
          as="h1"
          text={revealText ?? title}
          className="page-heading text-3xl leading-tight tracking-tight text-slate-900 sm:text-4xl"
        />
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:shrink-0 [&_a]:inline-flex [&_a]:min-h-10 [&_a]:items-center [&_a]:justify-center [&_a]:rounded-lg [&_a]:border [&_a]:border-slate-200 [&_a]:px-4 [&_a]:text-sm [&_a]:font-semibold [&_a]:transition-colors [&_button]:min-h-10 [&_button]:rounded-lg [&_button]:border [&_button]:border-slate-200 [&_button]:px-4 [&_button]:text-sm [&_button]:font-semibold [&_button]:transition-colors hover:[&_a]:bg-slate-50 hover:[&_button]:bg-slate-50">
          {actions}
        </div>
      )}
    </div>
  );
}
