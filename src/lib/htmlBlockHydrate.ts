interface SvgBox { x: number; y: number; width: number; height: number }

function finiteBox(box: SvgBox) {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.width > 0 && box.height > 0;
}

export function fittedSvgViewBox(viewBox: SvgBox, content: SvgBox): SvgBox {
  if (!finiteBox(viewBox) || !finiteBox(content)) return viewBox;
  const padding = Math.max(4, Math.min(viewBox.width, viewBox.height) * 0.025);
  const candidate = {
    x: content.x - padding,
    y: content.y - padding,
    width: content.width + padding * 2,
    height: content.height + padding * 2,
  };
  // Fit axes independently. The reported SVG already uses almost all of its
  // horizontal canvas but only one fifth of its height, so only Y should move.
  return {
    x: candidate.width < viewBox.width * 0.85 ? candidate.x : viewBox.x,
    y: candidate.height < viewBox.height * 0.85 ? candidate.y : viewBox.y,
    width: candidate.width < viewBox.width * 0.85 ? candidate.width : viewBox.width,
    height: candidate.height < viewBox.height * 0.85 ? candidate.height : viewBox.height,
  };
}

function parseViewBox(value: string): SvgBox | null {
  const values = value.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4) return null;
  const box = { x: values[0], y: values[1], width: values[2], height: values[3] };
  return finiteBox(box) ? box : null;
}

function format(value: number) {
  return String(Number(value.toFixed(3)));
}

/** Crop unused coordinates from responsive fenced-HTML SVGs after mount.
 * Explicit-height SVGs retain their authored canvas. The source is untouched;
 * only the sanitized display DOM receives the fitted viewBox. */
export function hydrateHtmlBlocks(root: HTMLElement): AbortController & { done: Promise<void> } {
  const controller = new AbortController();
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>(
    '.html-render-block > svg[viewBox][width="100%"]:not([height])',
  ));
  const run = () => {
    if (controller.signal.aborted) return;
    for (const svg of svgs) {
      const original = parseViewBox(svg.getAttribute("viewBox") ?? "");
      if (!original || typeof svg.getBBox !== "function") continue;
      try {
        const box = svg.getBBox();
        const next = fittedSvgViewBox(original, box);
        if (next.x !== original.x || next.y !== original.y
          || next.width !== original.width || next.height !== original.height) {
          svg.setAttribute("viewBox", [next.x, next.y, next.width, next.height].map(format).join(" "));
        }
      } catch {
        // Detached/unsupported SVG DOMs keep the authored viewBox.
      }
    }
  };
  // Preview hydrates connected DOM and can fit immediately, avoiding a whole
  // frame before the HTML becomes stable. Code-block previews hydrate a
  // detached staging tree, so keep their fit scheduled until it is mounted.
  let frame: number | undefined;
  if (svgs.every(svg => svg.isConnected)) run();
  else frame = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(run)
    : setTimeout(run, 0) as unknown as number;
  controller.signal.addEventListener("abort", () => {
    if (frame === undefined) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    else clearTimeout(frame);
  }, { once: true });
  return Object.assign(controller, { done: Promise.resolve() });
}
