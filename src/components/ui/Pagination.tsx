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
    <div
      className={`flex items-center justify-between gap-4 py-3 px-1 text-sm text-zinc-600 ${className}`}
    >
      <div>
        {totalRecords !== undefined ? (
          <span>
            Total: <strong className="font-semibold text-zinc-800">{totalRecords}</strong> records
          </span>
        ) : (
          <span>
            Page <strong className="font-semibold text-zinc-800">{page}</strong> of{' '}
            <strong className="font-semibold text-zinc-800">{Math.max(1, totalPages)}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-h-[44px] px-3.5 py-2 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
        >
          Previous
        </button>

        <span className="text-xs text-zinc-500 font-mono px-1">
          {page} / {Math.max(1, totalPages)}
        </span>

        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="min-h-[44px] px-3.5 py-2 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 active:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center"
        >
          Next
        </button>
      </div>
    </div>
  );
}
