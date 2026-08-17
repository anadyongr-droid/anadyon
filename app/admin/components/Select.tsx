"use client";

/**
 * A `<select>` that releases focus once a choice is made.
 *
 * The admin dialogs scroll on an outer `overflow-y-auto` container. A native
 * select keeps focus after the dropdown closes, and the wheel then goes to the
 * focused control rather than the dialog behind it — so picking an option part
 * way down a long form leaves the wheel apparently dead, and the only way back
 * is to click elsewhere first.
 *
 * Blurring after the change costs nothing, keeps keyboard use intact (the value
 * is already committed by then), and restores scrolling immediately.
 */
export default function Select({
  onChange,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      onChange={(e) => {
        onChange?.(e);
        // Deferred so the change has been applied before focus moves; blurring
        // synchronously inside the handler can swallow the event in Safari.
        const el = e.currentTarget;
        setTimeout(() => el.blur(), 0);
      }}
    >
      {children}
    </select>
  );
}
