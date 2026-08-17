"use client";
import { useEffect } from "react";

/**
 * Holds the page still while a dialog is open.
 *
 * `overscroll-contain` on the dialog body stops the wheel chaining outward when
 * it reaches the end of its own scroll, which is what made a long form suddenly
 * start moving the page behind it. But that alone leaves the page free to move
 * whenever the pointer is outside the dialog — over the backdrop, or over a
 * pinned header — so the background is locked too.
 *
 * The scrollbar's width is replaced as padding. Removing `overflow` from the
 * body reclaims that space and everything behind the dialog jumps sideways by a
 * few pixels; putting it back as padding keeps the layout still.
 *
 * Counted rather than simply set and unset, so a dialog opening over another
 * does not release the lock when only the inner one closes.
 */
let openCount = 0;
let restore: (() => void) | null = null;

export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;

    if (openCount === 0) {
      const { body } = document;
      const previousOverflow = body.style.overflow;
      const previousPadding = body.style.paddingRight;
      const gap = window.innerWidth - document.documentElement.clientWidth;

      body.style.overflow = "hidden";
      if (gap > 0) body.style.paddingRight = `${gap}px`;

      restore = () => {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPadding;
      };
    }
    openCount += 1;

    return () => {
      openCount -= 1;
      if (openCount === 0 && restore) {
        restore();
        restore = null;
      }
    };
  }, [active]);
}
