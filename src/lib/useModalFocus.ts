import { useEffect, useRef } from "react";

const stack: HTMLElement[] = [];
function topPanel() {
  return stack.reduce<HTMLElement | undefined>(
    (top, panel) =>
      !top ||
      Number(getComputedStyle(panel.parentElement!).zIndex) >=
        Number(getComputedStyle(top.parentElement!).zIndex)
        ? panel
        : top,
    undefined,
  );
}
const selectors =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]';

/** Keep keyboard focus in the topmost dialog and restore its invoker on close. */
export function useModalFocus(
  open: boolean,
  onClose: () => void,
  identity?: unknown,
) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    stack.push(panel);
    const focusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(selectors)).filter(
        (el) =>
          !el.closest('[hidden], [aria-hidden="true"]') &&
          getComputedStyle(el).display !== "none",
      );
    if (topPanel() === panel) (focusable()[0] ?? panel).focus();
    const onKey = (event: KeyboardEvent) => {
      if (topPanel() !== panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const items = focusable();
        const current = items.indexOf(document.activeElement as HTMLElement);
        if (
          !items.length ||
          current < 0 ||
          (event.shiftKey ? current === 0 : current === items.length - 1)
        ) {
          event.preventDefault();
          (items[event.shiftKey ? items.length - 1 : 0] ?? panel).focus();
        }
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (topPanel() === panel && !panel.contains(event.target as Node)) {
        (focusable()[0] ?? panel).focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocus);
    return () => {
      stack.splice(stack.indexOf(panel), 1);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, identity]);
  return ref;
}
