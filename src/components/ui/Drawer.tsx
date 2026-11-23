'use client';

import React, { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialog } from './Modal';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'md' | 'lg' | 'xl';
}

/**
 * Side sheet on desktop, bottom sheet on mobile.
 * Focus trap, scroll lock and focus return all live in useDialog().
 */
export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
}: DrawerProps) {
  const dialogRef = useDialog(isOpen);
  const titleId = useId();
  const descriptionId = useId();
  const backdropPress = useRef(false);

  if (!isOpen) return null;

  const widthClasses = {
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
  };

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onPointerDown={(event) => { backdropPress.current = event.target === event.currentTarget; }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget) onClose();
        backdropPress.current = false;
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-end justify-end overflow-hidden border-0 bg-transparent p-0 text-slate-900 outline-none open:flex backdrop:bg-slate-900/35 backdrop:backdrop-blur-[2px]"
    >
      <div
        className={`flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-t-[var(--radius-2xl)] border-t border-[var(--border)] bg-white shadow-[var(--shadow-float)] transition-[transform,opacity] duration-200 ease-out starting:translate-y-8 starting:opacity-0 motion-reduce:transition-none sm:h-full sm:rounded-none sm:rounded-l-[var(--radius-2xl)] sm:border-t-0 sm:border-l sm:starting:translate-x-8 sm:starting:translate-y-0 ${widthClasses[width]}`}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-[var(--border-strong)] sm:hidden" aria-hidden="true" />

        <div className="flex shrink-0 items-start justify-between gap-4 px-5 pb-3.5 pt-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-[0.9375rem] font-semibold tracking-[-0.015em] text-slate-900"
            >
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-xs leading-relaxed text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-[var(--canvas-sunken)] hover:text-slate-700"
            aria-label="Close panel"
          >
            <X className="size-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain border-t border-[var(--border-subtle)] px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:bg-[var(--canvas)]/40 sm:px-5 sm:pb-5">
          {children}
        </div>

        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-white px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
