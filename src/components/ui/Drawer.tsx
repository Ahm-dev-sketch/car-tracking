'use client';

import React, { useId, useRef } from 'react';
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
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-end justify-end overflow-hidden border-0 bg-transparent p-0 pt-[max(1rem,env(safe-area-inset-top))] text-black outline-none open:flex backdrop:bg-black/50 sm:p-0"
    >
      <div className={`flex max-h-full min-h-0 w-full flex-col rounded-t-2xl sm:rounded-none border-t-[3px] sm:border-t-0 sm:border-l-[3px] border-black bg-white shadow-[-6px_0px_0px_0px_#000] transition-[transform,opacity] duration-200 ease-out starting:translate-y-6 sm:starting:translate-x-8 sm:starting:translate-y-0 motion-reduce:transition-none sm:h-full ${widthClasses[width]}`}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div className="mx-auto mb-1 mt-2 h-1.5 w-12 shrink-0 rounded-full bg-black sm:hidden" aria-hidden="true" />
          <div className="flex shrink-0 items-center justify-between gap-4 border-b-[2.5px] border-black bg-amber-100/60 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-extrabold tracking-tight text-black">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-xs font-semibold text-zinc-700 leading-relaxed">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-black bg-rose-200 text-black shadow-[2px_2px_0px_0px_#000] transition-all hover:bg-rose-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              aria-label="Close panel"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
          {footer && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t-[2.5px] border-black bg-zinc-50 px-5 py-4 sm:px-6">
              {footer}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
