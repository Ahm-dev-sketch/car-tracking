import React from 'react';

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
    <nav aria-label="Pagination" className={`flex flex-col gap-4 px-1 py-5 text-sm font-semibold text-black sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p>
        {totalRecords !== undefined ? (
          <>Total: <strong className="font-extrabold tabular-nums text-black">{totalRecords}</strong> records</>
        ) : (
          <>Page <strong className="font-extrabold tabular-nums text-black">{page}</strong> of <strong className="font-extrabold tabular-nums text-black">{Math.max(1, totalPages)}</strong></>
        )}
      </p>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-black bg-white px-4 py-2 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] transition-all hover:bg-amber-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-5"
        >
          <svg className="hidden size-4 shrink-0 min-[360px]:block" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m11.5 5-5 5 5 5" /></svg>
          Previous
        </button>
        <span className="shrink-0 rounded-lg border-2 border-black bg-amber-300 px-3 py-1 font-mono text-xs font-bold text-black shadow-[2px_2px_0px_0px_#000]" aria-live="polite" aria-atomic="true" aria-label={`Page ${page} of ${Math.max(1, totalPages)}`}>
          {page} <span className="mx-1 text-black" aria-hidden="true">/</span> {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex min-h-10 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-black bg-emerald-400 px-4 py-2 text-sm font-extrabold text-black shadow-[3px_3px_0px_0px_#000] transition-all hover:bg-emerald-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:px-5"
        >
          Next
          <svg className="hidden size-4 shrink-0 min-[360px]:block" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m8.5 5 5 5-5 5" /></svg>
        </button>
      </div>
    </nav>
  );
}
