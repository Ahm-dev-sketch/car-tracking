'use client';

import React from 'react';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { Icon } from './Icon';

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
            className="button-secondary inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
            className={`inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 sm:flex-none ${
              isDestructive
                ? 'border-danger-600 bg-danger-600 hover:bg-danger-700 focus-visible:outline-danger-700'
                : 'border-slate-900 bg-slate-900 hover:bg-slate-800 focus-visible:outline-slate-900'
            }`}
          >
            {isLoading && <Spinner size="sm" className="text-white" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div
        className={`flex size-11 items-center justify-center rounded-full border ${
          isDestructive
            ? 'border-danger-200 bg-danger-50 text-danger-600'
            : 'border-warning-200 bg-warning-50 text-warning-600'
        }`}
        aria-hidden="true"
      >
        <Icon name={isDestructive ? 'alert' : 'check'} className="size-5" />
      </div>
    </Modal>
  );
}
