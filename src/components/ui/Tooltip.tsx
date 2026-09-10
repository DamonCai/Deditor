import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** One overlay for HTML controls and SVG indicators, with no native title delay.
 * Delegation keeps large mind maps free of per-icon state and listeners. */
export default function Tooltip() {
  const id = useId();
  const [target, setTarget] = useState<Element | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let keyboard = true;
    const show = (event: Event) => {
      const pointer = event as PointerEvent;
      if (pointer.pointerType === "touch" || pointer.buttons || (event.type === "focusin" && !keyboard)) return;
      const element = event.target instanceof Element
        ? event.target.closest("[data-tooltip]") : null;
      setTarget(element?.getAttribute("data-tooltip") ? element : null);
    };
    const leave = (event: PointerEvent | FocusEvent) => {
      const element = event.target instanceof Element
        ? event.target.closest("[data-tooltip]") : null;
      if (element && event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return;
      setTarget(null);
    };
    const hide = () => setTarget(null);
    const pointerDown = () => { keyboard = false; hide(); };
    const keyDown = () => { keyboard = true; hide(); };
    document.addEventListener("pointerover", show, true);
    document.addEventListener("pointerout", leave, true);
    document.addEventListener("focusin", show, true);
    document.addEventListener("focusout", leave, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("wheel", hide, { passive: true });
    window.addEventListener("blur", hide);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerover", show, true);
      document.removeEventListener("pointerout", leave, true);
      document.removeEventListener("focusin", show, true);
      document.removeEventListener("focusout", leave, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("wheel", hide);
      window.removeEventListener("blur", hide);
      window.removeEventListener("resize", hide);
    };
  }, []);

  useLayoutEffect(() => {
    const tooltip = panel.current;
    if (!target || !tooltip) return;
    const anchor = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(anchor.left + (anchor.width - box.width) / 2, window.innerWidth - box.width - 8))}px`;
    tooltip.style.top = `${Math.max(8, anchor.bottom + 6 + box.height <= window.innerHeight - 8
      ? anchor.bottom + 6 : anchor.top - box.height - 6)}px`;
    const description = target.getAttribute("aria-describedby");
    target.setAttribute("aria-describedby", [description, id].filter(Boolean).join(" "));
    // A keyboard command or an async document update can remove the hovered icon.
    const observer = new MutationObserver(() => {
      if (!target.isConnected || target.closest('[hidden], [aria-hidden="true"]') || !target.getClientRects().length ||
        target.getAttribute("data-tooltip") !== tooltip.textContent)
        setTarget(null);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "style", "class", "data-tooltip"] });
    return () => {
      observer.disconnect();
      const remaining = (target.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(value => value && value !== id).join(" ");
      if (remaining) target.setAttribute("aria-describedby", remaining);
      else target.removeAttribute("aria-describedby");
    };
  }, [target, id]);

  return target ? createPortal(
    <div ref={panel} id={id} role="tooltip" className="deditor-tooltip">
      {target.getAttribute("data-tooltip")}
    </div>, document.body,
  ) : null;
}
