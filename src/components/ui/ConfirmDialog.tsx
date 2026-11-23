'use client';

import React from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
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
            className="button-secondary flex-1 sm:flex-none"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
            className={`${isDestructive ? 'button-danger' : 'button-primary'} flex-1 sm:flex-none`}
          >
            {isLoading && <Spinner size="sm" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex justify-center pb-1 pt-2">
        <span
          className={`grid size-12 place-items-center rounded-full border ${
            isDestructive
              ? 'border-[#FECACA] bg-[#FEF2F2] text-[#DC2626]'
              : 'border-[#A7F3D0] bg-[#ECFDF5] text-[#059669]'
          }`}
          aria-hidden="true"
        >
          {isDestructive ? (
            <CircleAlert className="size-6" strokeWidth={1.75} />
          ) : (
            <CircleCheck className="size-6" strokeWidth={1.75} />
          )}
        </span>
      </div>
    </Modal>
  );
}
