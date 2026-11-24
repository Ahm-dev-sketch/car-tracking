"use client";

import React, { useId, useLayoutEffect, useRef } from "react";
import { Icon } from "./Icon";

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

  // A fixed body also prevents background scrolling on mobile Safari.
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

// Shared by Modal and Drawer so overlapping dialogs own a single scroll lock.
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
      const wasTop = openDialogs.at(-1) === dialog;
      const index = openDialogs.indexOf(dialog);
      const previousFocus = returnFocus.get(dialog);
      const next = openDialogs[index + 1];
      // Preserve the original trigger when a lower dialog closes first.
      if (next && dialog.contains(returnFocus.get(next) ?? null)) {
        returnFocus.set(next, previousFocus ?? null);
      }
      if (index !== -1) openDialogs.splice(index, 1);
      returnFocus.delete(dialog);
      dialog.close();
      if (openDialogs.length === 0) {
        restoreScroll?.();
        restoreScroll = undefined;
      }
      const top = openDialogs.at(-1);
      if (
        wasTop &&
        previousFocus?.isConnected &&
        !previousFocus.closest("[inert], dialog:not([open])") &&
        (!top || top.contains(previousFocus))
      ) {
        previousFocus.focus({ preventScroll: true });
      }
      if (top && !top.contains(document.activeElement)) focusDialog(top);
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
    sm: "sm:max-w-sm",
    md: "sm:max-w-md",
    lg: "sm:max-w-lg",
    xl: "sm:max-w-xl",
    "2xl": "sm:max-w-2xl",
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
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-center justify-end overflow-hidden border-0 bg-transparent p-0 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-slate-900 outline-none open:flex backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px] sm:justify-center sm:p-6 sm:pt-[max(1.5rem,env(safe-area-inset-top))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div
        className={`relative flex max-h-[90vh] min-h-0 w-[calc(100%_-_2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg transition-[transform,opacity] duration-200 ease-out starting:translate-y-4 starting:opacity-0 motion-reduce:transition-none sm:max-h-[90dvh] sm:w-full ${maxWidthClasses[maxWidth]}`}
      >
        {/* KCIC identity accent line */}
        <div className="h-0.5 w-full shrink-0 bg-brand-500" aria-hidden="true" />
        <div
          className="mx-auto mb-1 mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden"
          aria-hidden="true"
        />

        {/* Zone 1 — header */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="min-w-0">
            <h2
              id={titleId}
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              {title}
            </h2>
            {description && (
              <p
                id={descriptionId}
                className="mt-1 text-xs leading-relaxed text-slate-500"
              >
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-1 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            aria-label="Close dialog"
          >
            <Icon name="close" className="size-4" />
          </button>
        </div>

        {/* Zone 2 — scrollable body */}
        <div
          data-lenis-prevent
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-6 py-5"
        >
          {children}
        </div>

        {/* Zone 3 — footer */}
        {footer && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </dialog>
  );
}
