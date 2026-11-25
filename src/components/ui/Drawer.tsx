'use client';

import React, { useId, useRef } from 'react';
import { useDialog } from './Modal';
import { Icon } from './Icon';
import { useTranslation } from '@/components/providers/LanguageProvider';

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
  const { t } = useTranslation();
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
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-end justify-end overflow-hidden border-0 bg-transparent p-0 pt-[max(1rem,env(safe-area-inset-top))] text-slate-900 outline-none open:flex backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px] sm:p-0"
    >
      <div className={`flex max-h-full min-h-0 w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.12)] transition-[transform,opacity] duration-200 ease-out starting:translate-y-6 sm:starting:translate-x-8 sm:starting:translate-y-0 motion-reduce:transition-none sm:h-full sm:rounded-none ${widthClasses[width]}`}>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div className="h-0.5 w-full shrink-0 bg-brand-500" aria-hidden="true" />
          <div className="mx-auto mb-1 mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" aria-hidden="true" />
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900">{title}</h2>
              {description && <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              aria-label={t.common.closePanel}
            >
              <Icon name="close" className="size-4" />
            </button>
          </div>
          <div data-lenis-prevent className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">{children}</div>
          {footer && (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:px-6">
              {footer}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
