import React from 'react';

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

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField = 'id' as keyof T,
  isLoading = false,
  emptyMessage = 'No records found',
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="w-full border border-zinc-200 rounded-md bg-white overflow-hidden">
      <div className="sm:hidden text-[10px] uppercase font-semibold text-zinc-400 px-3 py-1 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
        <span>Table view</span>
        <span>Swipe horizontally →</span>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse min-w-[580px] sm:min-w-full">
        <thead className="bg-zinc-50 border-b border-zinc-200 text-xs font-semibold text-zinc-600 uppercase tracking-wider">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                scope="col"
                className={`py-3 px-4 ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="py-12 text-center text-zinc-500">
                <div className="inline-block animate-spin rounded-full border-2 border-zinc-400 border-t-transparent w-5 h-5 mr-2 align-middle" />
                Loading data...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-10 text-center text-zinc-500 text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, rowIdx) => {
              const rowKey = (row[keyField] as string) || String(rowIdx);
              return (
                <tr
                  key={rowKey}
                  onClick={() => onRowClick?.(row)}
                  className={`transition-colors ${
                    onRowClick ? 'cursor-pointer hover:bg-zinc-50' : 'hover:bg-zinc-50/50'
                  }`}
                >
                  {columns.map((col, colIdx) => (
                    <td
                      key={colIdx}
                      className={`py-3 px-4 text-zinc-800 ${col.className || ''}`}
                    >
                      {col.cell ? col.cell(row) : col.accessorKey ? String(row[col.accessorKey] ?? '—') : null}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
