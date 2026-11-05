'use client';

import React from 'react';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      description={message}
      maxWidth="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="button-secondary inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center rounded-xl border-2 border-black bg-white px-5 py-2.5 text-sm font-bold text-black shadow-[3px_3px_0px_0px_#000] transition-all hover:bg-amber-100 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
            className={`inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-black px-5 py-2.5 text-sm font-extrabold text-black shadow-[3px_3px_0px_0px_#000] transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none ${
              isDestructive
                ? 'bg-rose-400 hover:bg-rose-500 text-black'
                : 'bg-emerald-400 hover:bg-emerald-500 text-black'
            }`}
          >
            {isLoading && <Spinner size="sm" className="text-black" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className={`flex size-12 items-center justify-center rounded-xl border-2 border-black shadow-[3px_3px_0px_0px_#000] ${isDestructive ? 'bg-rose-300 text-black' : 'bg-emerald-300 text-black'}`} aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {isDestructive ? <><path d="M12 8v5m0 3h.01" /><circle cx="12" cy="12" r="9" /></> : <><path d="m8 12 2.5 2.5L16 9" /><circle cx="12" cy="12" r="9" /></>}
        </svg>
      </div>
    </Modal>
  );
}
