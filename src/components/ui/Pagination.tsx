import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalRecords?: number;
  onPageChange: (newPage: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalRecords,
  onPageChange,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1 && !totalRecords) return null;

  return (
    <nav
      aria-label="Pagination"
      className={`flex flex-col gap-3 px-1 py-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="tabular-nums">
        {totalRecords !== undefined ? (
          <>
            <span className="font-semibold text-slate-800">{totalRecords}</span> data
          </>
        ) : (
          <>
            Halaman <span className="font-semibold text-slate-800">{page}</span> dari{' '}
            <span className="font-semibold text-slate-800">{Math.max(1, totalPages)}</span>
          </>
        )}
      </p>
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
        >
          <ChevronLeft className="size-3.5" strokeWidth={2} aria-hidden="true" />
          <span>Sebelumnya</span>
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex min-h-9 flex-1 cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)] disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none"
        >
          <span>Berikutnya</span>
          <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
