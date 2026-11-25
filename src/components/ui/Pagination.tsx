'use client';

import React from 'react';
import { useTranslation } from '@/components/providers/LanguageProvider';
import { Icon } from './Icon';

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
  const { t, format } = useTranslation();
  if (totalPages <= 1 && !totalRecords) return null;

  const safeTotalPages = Math.max(1, totalPages);
  const navButton =
    'inline-flex min-h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white sm:flex-none';

  return (
    <nav aria-label={t.table.paginationAria} className={`flex flex-col gap-3 px-1 py-5 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <p>
        {totalRecords !== undefined ? (
          <>{t.table.totalRecordsPrefix} <strong className="font-semibold tabular-nums text-slate-900">{totalRecords}</strong> {t.table.totalRecordsSuffix}</>
        ) : (
          <>{t.table.pagePrefix} <strong className="font-semibold tabular-nums text-slate-900">{page}</strong> {t.table.of} <strong className="font-semibold tabular-nums text-slate-900">{safeTotalPages}</strong></>
        )}
      </p>
      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:gap-2.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={navButton}
        >
          <Icon name="chevronLeft" className="hidden size-4 shrink-0 min-[360px]:block" />
          {t.table.previous}
        </button>
        <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-xs font-medium tabular-nums text-slate-700" aria-live="polite" aria-atomic="true" aria-label={format(t.table.pageAria, { page, total: safeTotalPages })}>
          {page} <span className="mx-0.5 text-slate-400" aria-hidden="true">/</span> {safeTotalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={navButton}
        >
          {t.table.next}
          <Icon name="chevronRight" className="hidden size-4 shrink-0 min-[360px]:block" />
        </button>
      </div>
    </nav>
  );
}
