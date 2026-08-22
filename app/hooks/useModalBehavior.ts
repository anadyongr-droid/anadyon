"use client";

import { useEffect, useRef } from "react";

type DialogEntry = {
  token: symbol;
  close: () => void;
  element: () => HTMLElement | null;
};

const dialogs: DialogEntry[] = [];
let restorePage: (() => void) | null = null;

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function lockPage() {
  const { body } = document;
  const scrollY = window.scrollY;
  const previous = {
    overflow: body.style.overflow,
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };
  const scrollbarGap = window.innerWidth - document.documentElement.clientWidth;

  // Fixed positioning is needed on iOS Safari, where overflow:hidden alone
  // still lets the document move behind a wheel or touch-scrollable dialog.
  body.style.overflow = "hidden";
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
  if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;

  restorePage = () => {
    body.style.overflow = previous.overflow;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.width = previous.width;
    body.style.paddingRight = previous.paddingRight;
    window.scrollTo(0, scrollY);
  };
}

function onKeyDown(event: KeyboardEvent) {
  const current = dialogs.at(-1);
  if (!current) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    current.close();
    return;
  }

  if (event.key !== "Tab") return;
  const dialog = current.element();
  if (!dialog) return;
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
  if (focusable.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Shared behaviour for every application dialog: lock the page behind it,
 * contain keyboard focus and close only the top-most dialog on Escape.
 */
export function useModalBehavior<T extends HTMLElement>(onClose: () => void, active = true) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const token = Symbol("dialog");
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const entry: DialogEntry = {
      token,
      close: () => closeRef.current(),
      element: () => dialogRef.current,
    };

    if (dialogs.length === 0) {
      lockPage();
      document.addEventListener("keydown", onKeyDown, true);
    }
    dialogs.push(entry);
    const focusFrame = requestAnimationFrame(() => dialogRef.current?.focus());

    return () => {
      cancelAnimationFrame(focusFrame);
      const index = dialogs.findIndex((dialog) => dialog.token === token);
      if (index >= 0) dialogs.splice(index, 1);

      if (dialogs.length === 0) {
        document.removeEventListener("keydown", onKeyDown, true);
        restorePage?.();
        restorePage = null;
      }
      requestAnimationFrame(() => previousFocus?.focus());
    };
  }, [active]);

  return dialogRef;
}
