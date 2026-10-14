import { tStatic } from "../i18n";

/** Keep the live node view/editor intact while the browser's top layer escapes
 * the article's scroll and container-query boundaries. Nothing enters Markdown. */
export function diagramOverview(dom: HTMLElement, bar: HTMLElement, body: HTMLElement, preview: HTMLElement) {
  const dialog = document.createElement("dialog");
  dialog.className = "md-diagram-overview";
  dialog.setAttribute("aria-label", tStatic("md.diagramOverview"));
  const controls = document.createElement("div"); controls.className = "md-diagram-zoom"; controls.hidden = true;
  controls.setAttribute("role", "group"); controls.setAttribute("aria-label", tStatic("md.diagramZoom"));
  const makeButton = (label: string, text = label) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "deditor-btn";
    button.dataset.variant = "ghost"; button.dataset.size = "sm"; button.textContent = text;
    button.setAttribute("aria-label", label); button.title = label; return button;
  };
  const button = makeButton(tStatic("md.diagramOverview")); button.classList.add("md-diagram-overview-toggle");
  const minus = makeButton(tStatic("md.diagramZoomOut"), "−");
  const percent = makeButton(tStatic("md.diagramActualSize"), "100%");
  const plus = makeButton(tStatic("md.diagramZoomIn"), "+");
  const fit = makeButton(tStatic("md.diagramFit"));
  controls.append(minus, percent, plus, fit);
  let open = false, disposed = false, zoom = 1, fitting = true, frame = 0;
  let svg: SVGSVGElement | null = null, savedStyle: string | null = null;
  let natural = { width: 0, height: 0 };
  let hostHeight = "", hostScroll: HTMLElement | null = null, scrollTop = 0;
  let resizeObserver: ResizeObserver | undefined, mutationObserver: MutationObserver | undefined;
  const releaseSvg = () => {
    if (svg) { if (savedStyle === null) svg.removeAttribute("style"); else svg.setAttribute("style", savedStyle); }
    svg = null; savedStyle = null;
  };
  const dimensions = (element: SVGSVGElement) => {
    const box = element.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);
    if (box?.length === 4 && box[2] > 0 && box[3] > 0) return { width: box[2], height: box[3] };
    const rect = element.getBoundingClientRect();
    return { width: parseFloat(element.getAttribute("width") ?? "") || rect.width,
      height: parseFloat(element.getAttribute("height") ?? "") || rect.height };
  };
  const update = () => {
    frame = 0; if (!open || disposed) return;
    const next = preview.querySelector<SVGSVGElement>(":scope > :is(.mermaid-diagram, .plantuml-diagram):not(.error) > svg");
    if (next !== svg) { releaseSvg(); svg = next; if (svg) { savedStyle = svg.getAttribute("style"); natural = dimensions(svg); } }
    const enabled = !!svg && !preview.hidden && natural.width > 0 && natural.height > 0;
    for (const control of [minus, percent, plus, fit]) control.disabled = !enabled;
    if (!enabled) return;
    if (fitting) zoom = Math.min(1, Math.max(1, preview.clientWidth - 32) / natural.width, Math.max(1, preview.clientHeight - 32) / natural.height);
    svg!.style.setProperty("width", `${natural.width * zoom}px`, "important");
    svg!.style.setProperty("height", `${natural.height * zoom}px`, "important");
    svg!.style.setProperty("max-width", "none", "important");
    percent.textContent = `${Math.round(zoom * 1000) / 10}%`;
    minus.disabled = zoom <= .01; plus.disabled = zoom >= 4;
    fit.setAttribute("aria-pressed", String(fitting));
  };
  const refresh = () => { if (open && !frame) frame = requestAnimationFrame(update); };
  const setZoom = (value: number) => {
    if (!open || preview.hidden || !svg) return;
    const old = zoom, x = preview.scrollLeft + preview.clientWidth / 2, y = preview.scrollTop + preview.clientHeight / 2;
    fitting = false; zoom = Math.min(4, Math.max(.01, value)); update();
    preview.scrollLeft = x * zoom / old - preview.clientWidth / 2;
    preview.scrollTop = y * zoom / old - preview.clientHeight / 2;
  };
  minus.onclick = () => setZoom(zoom / 1.25); plus.onclick = () => setZoom(zoom * 1.25);
  percent.onclick = () => setZoom(1);
  fit.onclick = () => { fitting = true; update(); preview.scrollTop = preview.scrollLeft = 0; };
  const close = (restoreFocus = true) => {
    if (!open) return;
    open = false;
    resizeObserver?.disconnect(); mutationObserver?.disconnect();
    document.removeEventListener("deditor-close-diagram-overview", deactivate);
    if (frame) cancelAnimationFrame(frame); frame = 0;
    releaseSvg();
    if (dialog.open) dialog.close();
    dom.append(bar, body); controls.hidden = true; dialog.remove();
    dom.style.height = hostHeight;
    button.textContent = tStatic("md.diagramOverview"); button.setAttribute("aria-label", tStatic("md.diagramOverview")); button.title = tStatic("md.diagramOverview");
    button.setAttribute("aria-expanded", "false");
    if (hostScroll) hostScroll.scrollTop = scrollTop;
    preview.scrollTop = preview.scrollLeft = 0;
    if (restoreFocus && button.isConnected) button.focus({ preventScroll: true });
  };
  const deactivate = () => close(false);
  const show = () => {
    if (open || disposed || button.hidden) return;
    hostHeight = dom.style.height;
    hostScroll = dom.closest<HTMLElement>(".md-visual-scroll"); scrollTop = hostScroll?.scrollTop ?? 0;
    dom.style.height = `${dom.getBoundingClientRect().height}px`;
    fitting = true; zoom = 1; open = true;
    controls.hidden = false; dialog.append(bar, body); dom.append(dialog);
    button.textContent = tStatic("md.diagramExitOverview"); button.setAttribute("aria-label", tStatic("md.diagramExitOverview")); button.title = tStatic("md.diagramExitOverview");
    button.setAttribute("aria-expanded", "true");
    dialog.showModal(); button.focus({ preventScroll: true });
    resizeObserver = new ResizeObserver(refresh); resizeObserver.observe(preview);
    mutationObserver = new MutationObserver(refresh); mutationObserver.observe(preview, {childList: true, subtree: true});
    document.addEventListener("deditor-close-diagram-overview", deactivate);
    refresh();
  };
  button.setAttribute("aria-haspopup", "dialog"); button.setAttribute("aria-expanded", "false");
  button.onclick = () => open ? close() : show();
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.addEventListener("close", () => { if (!dialog.open) close(); });
  dialog.addEventListener("keydown", event => {
    if (event.isComposing || (event.target as Element).closest('.md-editor-menu, [role="dialog"]:not(.md-diagram-overview)')) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close(); }
  }, true);
  preview.addEventListener("wheel", event => {
    if (open && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); setZoom(zoom * Math.exp(-event.deltaY * .002)); }
  }, { passive: false });
  return { button, controls, refresh, close, get isOpen() { return open; },
    setEnabled(value: boolean) { if (!value) close(false); button.hidden = !value; },
    destroy() { close(false); disposed = true; dialog.remove(); },
  };
}
