"use client";

import React, { useId, useLayoutEffect, useRef } from "react";

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
      className="fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-center justify-end overflow-hidden border-0 bg-transparent p-0 pt-[max(1rem,env(safe-area-inset-top))] text-black outline-none open:flex backdrop:bg-black/50 sm:justify-center sm:p-6 sm:pt-[max(1.5rem,env(safe-area-inset-top))] sm:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
    >
      <div
        className={`flex max-h-full min-h-0 w-full flex-col rounded-t-2xl sm:rounded-2xl border-t-[3px] sm:border-[3px] border-black bg-white shadow-[8px_8px_0px_0px_#000] transition-[transform,opacity] duration-200 ease-out starting:translate-y-4 starting:opacity-0 motion-reduce:transition-none sm:max-h-[90dvh] ${maxWidthClasses[maxWidth]}`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white pb-[env(safe-area-inset-bottom)] sm:pb-0">
          <div
            className="mx-auto mb-1 mt-2 h-1.5 w-12 shrink-0 rounded-full bg-black sm:hidden"
            aria-hidden="true"
          />
          <div className="flex shrink-0 items-center justify-between gap-4 border-b-[2.5px] border-black bg-amber-100/60 px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <h2
                id={titleId}
                className="text-xl font-extrabold tracking-tight text-black"
              >
                {title}
              </h2>
              {description && (
                <p
                  id={descriptionId}
                  className="mt-1 text-xs font-semibold text-zinc-700 leading-relaxed"
                >
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border-2 border-black bg-rose-200 text-black shadow-[2px_2px_0px_0px_#000] transition-all hover:bg-rose-300 active:translate-x-[1px] active:translate-y-[1px] active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
              aria-label="Close dialog"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="m7 7 10 10M17 7 7 17" />
              </svg>
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
            {children}
          </div>
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
