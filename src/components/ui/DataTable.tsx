"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

export interface Column<T> {
  header: string;
  accessorKey?: keyof T;
  cell?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: keyof T;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

const interactiveSelector =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable], [tabindex]';

export function DataTable<T extends object>({
  columns,
  data,
  keyField = "id" as keyof T,
  isLoading = false,
  emptyMessage = "No records found",
  onRowClick,
}: DataTableProps<T>) {
  const renderCell = (column: Column<T>, row: T) =>
    column.cell
      ? column.cell(row)
      : column.accessorKey
        ? String(row[column.accessorKey] ?? "—")
        : null;

  const handleRowClick = (event: React.MouseEvent<HTMLElement>, row: T) => {
    if (
      !onRowClick ||
      event.defaultPrevented ||
      (event.target instanceof Element &&
        event.target.closest(interactiveSelector))
    )
      return;
    if (window.getSelection()?.toString()) return;
    event.currentTarget
      .querySelector<HTMLButtonElement>("[data-row-action]")
      ?.focus({ preventScroll: true });
    onRowClick(row);
  };

  const viewButton = (row: T, index: number, mobile = false) => (
    <button
      type="button"
      data-row-action
      onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        onRowClick?.(row);
      }}
      aria-label={`Lihat data ${index + 1}`}
      className={
        mobile
          ? "inline-flex min-h-9 w-full cursor-pointer items-center justify-center gap-1 rounded-[var(--radius-full)] border border-[var(--border)] bg-white px-3.5 text-xs font-medium text-slate-700 transition-colors hover:bg-[var(--canvas)]"
          : "inline-grid size-8 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-[var(--canvas)] hover:text-slate-700"
      }
    >
      {mobile && <span>Lihat detail</span>}
      <ChevronRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
    </button>
  );

  if (isLoading || data.length === 0) {
    return (
      <div
        className="w-full rounded-[var(--radius-xl)] border border-[var(--border)] bg-white px-6 py-14 text-center"
        role="status"
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && (
          <span
            className="mx-auto mb-3 block size-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--kcic-red)] motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <p className="text-xs font-medium text-slate-500">
          {isLoading ? "Memuat data…" : emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="hidden overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[0.8125rem]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--canvas)]">
                {columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={`whitespace-nowrap px-5 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-slate-500 ${column.className || ""}`}
                  >
                    {column.header}
                  </th>
                ))}
                {onRowClick && (
                  <th scope="col" className="w-12 px-2">
                    <span className="sr-only">Detail data</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((row, rowIndex) => (
                <tr
                  key={String(row[keyField] ?? rowIndex)}
                  onClick={(event) => handleRowClick(event, row)}
                  className={`border-b border-[var(--border-subtle)] transition-colors last:border-b-0 ${
                    onRowClick ? "cursor-pointer hover:bg-[var(--canvas)]" : ""
                  }`}
                >
                  {columns.map((column, index) => (
                    <td
                      key={index}
                      className={`px-5 py-3 text-slate-700 ${column.className || ""}`}
                    >
                      {renderCell(column, row)}
                    </td>
                  ))}
                  {onRowClick && (
                    <td className="px-2 py-2">{viewButton(row, rowIndex)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="grid min-w-0 gap-2.5 md:hidden" aria-label="Records">
        {data.map((row, rowIndex) => (
          <li
            key={String(row[keyField] ?? rowIndex)}
            onClick={(event) => handleRowClick(event, row)}
            className={`min-w-0 rounded-[var(--radius-xl)] border border-[var(--border)] bg-white p-4 transition-colors ${
              onRowClick ? "cursor-pointer hover:border-[var(--border-strong)]" : ""
            }`}
          >
            <dl className="min-w-0 divide-y divide-[var(--border-subtle)]">
              {columns.map((column, index) => (
                <div
                  key={index}
                  className="grid min-w-0 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] items-baseline gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <dt className="text-[0.6875rem] font-medium text-slate-400">
                    {column.header || "Value"}
                  </dt>
                  <dd className="min-w-0 text-[0.8125rem] font-medium text-slate-800 wrap-anywhere">
                    {renderCell(column, row)}
                  </dd>
                </div>
              ))}
            </dl>
            {onRowClick && (
              <div className="mt-3 border-t border-[var(--border-subtle)] pt-2.5">
                {viewButton(row, rowIndex, true)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
