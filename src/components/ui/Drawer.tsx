'use client';

import React, { useEffect } from 'react';

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

  const widthClasses = {
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-xl',
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-y-0 right-0 flex pl-0 sm:pl-10 max-w-full">
        <div
          className={`w-screen max-w-full ${widthClasses[width]} bg-white border-l border-zinc-200 shadow-2xl flex flex-col pt-[env(safe-area-inset-top)] pb-[max(0.75rem,env(safe-area-inset-bottom))]`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 bg-zinc-50">
            <div>
              <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
              {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center text-zinc-400 hover:text-zinc-700 p-2 rounded hover:bg-zinc-100 cursor-pointer"
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-4">{children}</div>

          {footer && (
            <div className="border-t border-zinc-200 px-5 py-3.5 bg-zinc-50 flex items-center justify-end gap-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
