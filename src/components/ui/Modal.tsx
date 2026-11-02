'use client';

import React, { useEffect } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}: ModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} bg-white rounded-lg shadow-xl border border-zinc-200 overflow-hidden flex flex-col max-h-[90vh]`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3.5 bg-zinc-50">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
            {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 p-1 rounded hover:bg-zinc-100 cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-5 py-3 bg-zinc-50">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
