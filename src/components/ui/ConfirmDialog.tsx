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
      maxWidth="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-3.5 py-1.5 border border-zinc-300 rounded text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-3.5 py-1.5 rounded text-xs font-semibold text-white cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-zinc-900 hover:bg-zinc-800'
            }`}
          >
            {isLoading && <Spinner size="sm" className="text-white" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-zinc-600 leading-relaxed">{message}</p>
    </Modal>
  );
}
