"use client";

import React from "react";

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
      className={`inline-flex min-h-9 min-w-9 cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-black bg-amber-300 text-xs font-extrabold text-black shadow-[2px_2px_0px_0px_#000] transition-all hover:bg-amber-400 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus-visible:outline-2 focus-visible:outline-black ${mobile ? "w-full py-2.5 px-4" : "p-1.5"}`}
    >
      {mobile && <span>View record</span>}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12h14m-5-5 5 5-5 5" />
      </svg>
    </button>
  );

  if (isLoading || data.length === 0) {
    return (
      <div
        className="w-full rounded-xl border-[2.5px] border-black bg-white p-8 text-center sm:p-12 shadow-[5px_5px_0px_0px_#000]"
        role="status"
        aria-live="polite"
        aria-busy={isLoading}
      >
        {isLoading && (
          <span
            className="mx-auto mb-4 block size-7 animate-spin rounded-full border-3 border-zinc-200 border-t-black motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        <p className="text-sm font-bold text-zinc-800">
          {isLoading ? "Loading data..." : emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0">
      <div className="hidden rounded-xl border-[2.5px] border-black bg-white shadow-[5px_5px_0px_0px_#000] overflow-hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b-[2.5px] border-black bg-emerald-100 text-xs font-black uppercase tracking-wider text-black">
              <tr>
                {columns.map((column, index) => (
                  <th
                    key={index}
                    scope="col"
                    className={`px-5 py-3.5 ${column.className || ""}`}
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
            <tbody className="divide-y-2 divide-black/10">
              {data.map((row, rowIndex) => (
                <tr
                  key={String(row[keyField] ?? rowIndex)}
                  onClick={(event) => handleRowClick(event, row)}
                  className={`hover:bg-amber-100/50 transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((column, index) => (
                    <td
                      key={index}
                      className={`px-5 py-3.5 text-black font-medium ${column.className || ""}`}
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

      <ul className="grid min-w-0 gap-4 md:hidden" aria-label="Records">
        {data.map((row, rowIndex) => (
          <li
            key={String(row[keyField] ?? rowIndex)}
            onClick={(event) => handleRowClick(event, row)}
            className={`min-w-0 rounded-xl border-[2.5px] border-black bg-white p-4 shadow-[4px_4px_0px_0px_#000] ${onRowClick ? "cursor-pointer" : ""}`}
          >
            <div className="min-w-0">
              <dl className="min-w-0 divide-y-2 divide-black/10">
                {columns.map((column, index) => (
                  <div key={index} className="grid min-w-0 gap-1.5 py-3 first:pt-0 last:pb-0">
                    <dt className="text-[11px] font-black uppercase tracking-wider text-zinc-600">
                      {column.header || "Value"}
                    </dt>
                    <dd className="min-w-0 text-sm font-semibold text-black wrap-anywhere">
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
