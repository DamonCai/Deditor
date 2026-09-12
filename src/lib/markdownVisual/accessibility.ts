import type { EditorView } from "@milkdown/kit/prose/view";
import { tStatic } from "../i18n";
/** Add keyboard semantics to the upstream list labels without changing node data. */
export function installMarkdownAccessibility(view: EditorView) {
  const attribute = (element: HTMLElement, name: string, value: string) => {
    if (element.getAttribute(name) !== value) element.setAttribute(name, value);
  };
  const update = () => {
    view.dom.querySelectorAll<HTMLElement>(".handle[data-show]").forEach(handle => {
      const hidden = !view.editable || handle.dataset.show === "false";
      if (handle.inert !== hidden) handle.inert = hidden;
      attribute(handle, "aria-hidden", String(hidden));
    });
    view.dom.querySelectorAll<HTMLElement>(".milkdown-list-item-block .label-wrapper").forEach(label => {
      const checkbox = label.querySelector(".checked, .unchecked");
      if (!checkbox) return;
      attribute(label, "role", "checkbox");
      const tabIndex = view.editable ? 0 : -1;
      if (label.tabIndex !== tabIndex) label.tabIndex = tabIndex;
      attribute(label, "aria-checked", String(checkbox.classList.contains("checked")));
      attribute(label, "aria-readonly", String(!view.editable));
      attribute(label, "aria-label", label.parentElement?.querySelector("[data-content-dom]")?.textContent ?? tStatic("md.tasklist"));
    });
  };
  const onKey = (event: KeyboardEvent) => {
    const label = (event.target as HTMLElement).closest<HTMLElement>('.label-wrapper[role="checkbox"]');
    if (!label || !view.editable || ![" ", "Enter"].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  };
  const observer = new MutationObserver(update); observer.observe(view.dom, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-show"] });
  view.dom.addEventListener("keydown", onKey, true); view.dom.addEventListener("deditor-editable-change", update); update();
  return () => { observer.disconnect(); view.dom.removeEventListener("keydown", onKey, true); view.dom.removeEventListener("deditor-editable-change", update); };
}
export function tableIcon(label: string, operation: "plus" | "minus" | "left" | "center" | "right") {
  const line = operation === "plus" ? "M8 2v12M2 8h12" : operation === "minus" ? "M2 8h12" : operation === "left" ? "M2 3h12M2 6h8M2 9h12M2 12h8" : operation === "right" ? "M2 3h12M6 6h8M2 9h12M6 12h8" : "M2 3h12M4 6h8M2 9h12M4 12h8";
  return `<svg role="img" aria-label="${label}" viewBox="0 0 16 16" width="16" height="16"><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
}
