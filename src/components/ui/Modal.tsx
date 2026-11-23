"use client";

import React, { useId, useLayoutEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const openDialogs: HTMLDialogElement[] = [];
const returnFocus = new WeakMap<HTMLDialogElement, HTMLElement | null>();
let restoreScroll: (() => void) | undefined;

function lockScroll() {
  const { body, documentElement } = document;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;
  const paddingRight = window.getComputedStyle(body).paddingRight;
  const properties = [
    "position",
    "top",
    "left",
    "width",
    "overflow",
    "padding-right",
  ];
  const bodyStyles = properties.map((property) => [
    property,
    body.style.getPropertyValue(property),
    body.style.getPropertyPriority(property),
  ]);
  const htmlOverflow = documentElement.style.getPropertyValue("overflow");
  const htmlOverflowPriority =
    documentElement.style.getPropertyPriority("overflow");

  body.style.setProperty("position", "fixed");
  body.style.setProperty("top", `-${scrollY}px`);
  body.style.setProperty("left", `-${scrollX}px`);
  body.style.setProperty("width", "100%");
  body.style.setProperty("overflow", "hidden");
  if (scrollbarWidth > 0) {
    body.style.setProperty(
      "padding-right",
      `calc(${paddingRight} + ${scrollbarWidth}px)`,
    );
  }
  documentElement.style.setProperty("overflow", "hidden");

  return () => {
    bodyStyles.forEach(([property, value, priority]) => {
      if (value) body.style.setProperty(property, value, priority);
      else body.style.removeProperty(property);
    });
    if (htmlOverflow)
      documentElement.style.setProperty(
        "overflow",
        htmlOverflow,
        htmlOverflowPriority,
      );
    else documentElement.style.removeProperty("overflow");
    window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
  };
}

function focusableElements(dialog: HTMLDialogElement) {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'a[href], area[href], button, input, select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable="false"]), audio[controls], video[controls]',
    ),
  )
    .filter(
      (element) =>
        element.tabIndex >= 0 &&
        !element.matches(":disabled") &&
        !element.closest("[inert]") &&
        element.getClientRects().length > 0 &&
        window.getComputedStyle(element).visibility !== "hidden",
    )
    .sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
}

function focusDialog(dialog: HTMLDialogElement) {
  (focusableElements(dialog)[0] ?? dialog).focus({ preventScroll: true });
}

export function useDialog(isOpen: boolean) {
  const ref = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!isOpen || !dialog) return;

    returnFocus.set(
      dialog,
      document.activeElement instanceof HTMLElement ? document.activeElement : null,
    );
    dialog.showModal();
    if (openDialogs.length === 0) restoreScroll = lockScroll();
    openDialogs.push(dialog);
    focusDialog(dialog);

    const containFocus = () => {
      if (
        openDialogs.at(-1) === dialog &&
        !dialog.contains(document.activeElement)
      )
        focusDialog(dialog);
    };
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || openDialogs.at(-1) !== dialog) return;
      const elements = focusableElements(dialog);
      const first = elements[0];
      const last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !elements.includes(document.activeElement as HTMLElement))
      ) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", containFocus);
    dialog.addEventListener("keydown", handleTab);

    return () => {
      document.removeEventListener("focusin", containFocus);
      dialog.removeEventListener("keydown", handleTab);
      const index = openDialogs.indexOf(dialog);
      if (index >= 0) openDialogs.splice(index, 1);
      dialog.close();
      if (openDialogs.length === 0 && restoreScroll) {
        restoreScroll();
        restoreScroll = undefined;
      }
      returnFocus.get(dialog)?.focus({ preventScroll: true });
      returnFocus.delete(dialog);
    };
  }, [isOpen]);

  return ref;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "md",
}: ModalProps) {
  const dialogRef = useDialog(isOpen);
  const titleId = useId();
  const descriptionId = useId();
  const backdropPress = useRef(false);

  if (!isOpen) return null;

  const maxWidthClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
    "2xl": "max-w-2xl",
  };

  return (
    <dialog
      ref={dialogRef}
      tabIndex={-1}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget)
          onClose();
        backdropPress.current = false;
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-center justify-center overflow-y-auto border-0 bg-transparent p-4 text-slate-900 outline-none open:flex backdrop:bg-slate-900/35 backdrop:backdrop-blur-[2px]"
    >
      <div
        className={`my-auto flex max-h-[calc(100dvh-2rem)] min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--border)] bg-white shadow-[var(--shadow-float)] transition-[transform,opacity] duration-200 ease-out starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none ${maxWidthClasses[maxWidth]}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-white/95 px-5 py-4 backdrop-blur-sm sm:px-6">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-[0.9375rem] font-semibold tracking-[-0.015em] text-slate-900"
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="mt-0.5 text-xs leading-relaxed text-slate-500"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 -mt-1 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 transition-colors hover:bg-[var(--canvas-sunken)] hover:text-slate-700"
              aria-label="Close dialog"
            >
              <X className="size-4" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>
        </div>
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--canvas)] px-5 py-3.5 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
