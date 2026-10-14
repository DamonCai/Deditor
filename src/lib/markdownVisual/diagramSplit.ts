import { tStatic } from "../i18n";

/** A view-only split ratio: resizing never changes Markdown or its history. */
export function diagramSplit(body: HTMLElement) {
  const separator = document.createElement("div");
  separator.className = "md-diagram-divider";
  separator.tabIndex = 0;
  separator.setAttribute("role", "separator");
  separator.setAttribute("aria-orientation", "vertical");
  separator.setAttribute("aria-label", tStatic("md.diagramResize"));
  separator.setAttribute("aria-valuemin", "20");
  separator.setAttribute("aria-valuemax", "80");
  let ratio = 50, enabled = false, pointer: number | null = null;
  const resize = (value: number) => {
    ratio = Math.max(20, Math.min(80, value));
    body.style.setProperty("--md-diagram-source-width", `${ratio}fr`);
    body.style.setProperty("--md-diagram-preview-width", `${100 - ratio}fr`);
    separator.setAttribute("aria-valuenow", String(Math.round(ratio)));
  };
  const finish = () => {
    const id = pointer; pointer = null;
    body.classList.remove("md-diagram-resizing");
    if (id !== null && separator.hasPointerCapture?.(id)) separator.releasePointerCapture(id);
  };
  separator.onpointerdown = event => {
    if (!enabled || event.button !== 0 || pointer !== null) return;
    event.preventDefault(); event.stopPropagation();
    pointer = event.pointerId;
    separator.setPointerCapture?.(pointer);
    separator.focus({ preventScroll: true });
    body.classList.add("md-diagram-resizing");
  };
  separator.onpointermove = event => {
    if (!enabled || event.pointerId !== pointer) return;
    const bounds = body.getBoundingClientRect();
    if (bounds.width > 0) resize((event.clientX - bounds.left) / bounds.width * 100);
  };
  separator.onpointerup = separator.onpointercancel = event => {
    if (event.pointerId === pointer) finish();
  };
  separator.onlostpointercapture = finish;
  separator.onkeydown = event => {
    if (!enabled) return;
    const step = event.shiftKey ? 10 : 2;
    const next = event.key === "ArrowLeft" ? ratio - step : event.key === "ArrowRight" ? ratio + step
      : event.key === "Home" ? 20 : event.key === "End" ? 80 : null;
    if (next === null) return;
    event.preventDefault(); event.stopPropagation(); resize(next);
  };
  separator.ondblclick = event => {
    if (!enabled) return;
    event.preventDefault(); resize(50);
  };
  resize(50);
  return {
    separator,
    setEnabled(value: boolean) {
      enabled = value; separator.hidden = !value;
      if (!value) finish();
    },
    destroy: finish,
  };
}
