"use client";

import React from "react";
import { Icon } from "./Icon";

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
      aria-label={`View record ${index + 1}`}
      className={`inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${mobile ? "w-full py-2.5 px-4" : "p-1.5"}`}
    >
      {mobile && <span>View record</span>}
      <Icon name="arrow" className="size-4" />
    </button>
  );

  if (isLoading || data.length === 0) {
    return (
      <div
        className="w-full rounded-xl border border-slate-200 bg-white p-8 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-12"
        role="status"
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && (
          <span
            className="mx-auto mb-4 block size-7 animate-spin rounded-full border-2 border-slate-200 border-t-slate-900 motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-medium text-slate-500">
          {isLoading ? "Loading data..." : emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 tabular-nums">
      <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={`whitespace-nowrap px-5 py-3 ${column.className || ""}`}
                  >
                    {column.header}
                  </th>
                ))}
                {onRowClick && (
                  <th scope="col" className="w-16 px-3">
                    <span className="sr-only">Record details</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row, rowIndex) => (
                <tr
                  key={String(row[keyField] ?? rowIndex)}
                  onClick={(event) => handleRowClick(event, row)}
                  className={`transition-colors hover:bg-slate-50 ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((column, index) => (
                    <td
                      key={index}
                      className={`px-5 py-3.5 align-middle text-slate-700 ${column.className || ""}`}
                    >
                      {renderCell(column, row)}
                    </td>
                  ))}
                  {onRowClick && (
                    <td className="px-3 py-2.5">{viewButton(row, rowIndex)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="grid min-w-0 gap-3 md:hidden" aria-label="Records">
        {data.map((row, rowIndex) => (
          <li
            key={String(row[keyField] ?? rowIndex)}
            onClick={(event) => handleRowClick(event, row)}
            className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors ${onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}`}
          >
            <div className="min-w-0">
              <dl className="min-w-0 divide-y divide-slate-100">
                {columns.map((column, index) => (
                  <div key={index} className="grid min-w-0 gap-1 py-2.5 first:pt-0 last:pb-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      {column.header || "Value"}
                    </dt>
                    <dd className="min-w-0 text-sm font-medium text-slate-800 wrap-anywhere">
                      {renderCell(column, row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            {onRowClick && (
              <div className="pt-3">
                {viewButton(row, rowIndex, true)}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
