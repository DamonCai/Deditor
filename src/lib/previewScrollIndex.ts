/** Source markers shared by both directions of Preview scroll sync. */
export interface PreviewMarkers {
  lines: number[];
  tops: number[];
  linesOrdered: boolean;
  topsOrdered: boolean;
}

function ordered(values: number[]): boolean {
  return values.every((value, i) => i === 0 || value >= values[i - 1]);
}

/** Preserve the original first-greater boundary for nested/positioned HTML. */
export function markerFloor(values: number[], target: number, sorted: boolean): number {
  if (!sorted) {
    let result = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] <= target) result = i;
      else break;
    }
    return result;
  }
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

export class PreviewScrollIndex {
  private markers: PreviewMarkers = { lines: [], tops: [], linesOrdered: true, topsOrdered: true };
  private dirty = true;
  private dimensions = "";
  private observed: HTMLElement[] = [];
  private mutations: MutationObserver;
  private ancestors: MutationObserver;
  private resize: ResizeObserver | undefined;
  private fonts: FontFaceSet | undefined;
  private parent: HTMLElement;
  private motion = 0;
  private interactionEvents = ["pointerover", "pointerout", "focusin", "focusout", "input", "change", "toggle"] as const;

  constructor(private root: HTMLElement) {
    this.parent = root.parentElement ?? root;
    // Include the shared surface's sibling <style>, but not outline/search
    // chrome whose active classes may change on every scroll.
    this.mutations = new MutationObserver(records => this.changed(records));
    this.mutations.observe(this.parent, { subtree: true, childList: true, characterData: true, attributes: true });
    this.ancestors = new MutationObserver(this.invalidate);
    for (let el = root.parentElement; el; el = el.parentElement) {
      this.ancestors.observe(el, { attributes: true });
    }
    this.ancestors.observe(root.ownerDocument.head, { subtree: true, childList: true, characterData: true, attributes: true });
    if (typeof ResizeObserver !== "undefined") {
      this.resize = new ResizeObserver(this.invalidate);
      this.resize.observe(root);
    }
    root.addEventListener("load", this.invalidate, true);
    root.addEventListener("error", this.invalidate, true);
    // User CSS can move margins on hover/focus without changing box sizes.
    for (const event of this.interactionEvents) root.addEventListener(event, this.invalidate, true);
    root.addEventListener("transitionrun", this.motionStarted, true);
    root.addEventListener("animationstart", this.motionStarted, true);
    for (const event of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) root.addEventListener(event, this.motionEnded, true);
    root.ownerDocument.defaultView?.addEventListener("resize", this.invalidate);
    this.fonts = root.ownerDocument.fonts;
    this.fonts?.addEventListener("loadingdone", this.invalidate);
  }

  invalidate = (): void => { this.dirty = true; };
  private motionStarted = (): void => { this.motion++; this.invalidate(); };
  private motionEnded = (): void => { this.motion = Math.max(0, this.motion - 1); this.invalidate(); };

  reset(): void {
    this.invalidate();
    this.motion = 0;
    this.observed = [];
    this.markers = { lines: [], tops: [], linesOrdered: true, topsOrdered: true };
    this.resize?.disconnect();
    this.resize?.observe(this.root);
  }

  private changed(records: MutationRecord[]): void {
    if (records.some(record => this.root.contains(record.target)
      || (record.target as Element).closest?.("style")
      || (record.target.parentElement?.closest("style"))
      || (record.target === this.parent && Array.from(record.addedNodes).concat(Array.from(record.removedNodes))
        .some(node => node === this.root || (node as Element).tagName === "STYLE")))) this.invalidate();
  }

  read(): PreviewMarkers {
    // React and hydrators can mutate then request a scroll before observers run.
    this.changed(this.mutations.takeRecords());
    if (this.ancestors.takeRecords().length) this.invalidate();
    if (this.motion) this.invalidate();
    const root = this.root;
    const dimensions = `${root.clientWidth}/${root.clientHeight}/${root.scrollWidth}/${root.scrollHeight}`;
    if (dimensions !== this.dimensions) this.invalidate();
    if (!this.dirty) return this.markers;
    this.dimensions = dimensions;
    const lines: number[] = [];
    const tops: number[] = [];
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-line]"));
    for (const el of elements) {
      const line = Number(el.dataset.line);
      if (!Number.isFinite(line)) continue;
      lines.push(line);
      tops.push(el.offsetTop);
    }
    // Observe individual block sizes too: equal total height can conceal a
    // redistribution between blocks (for example an asynchronously loaded image).
    if (elements.length !== this.observed.length || elements.some((el, i) => el !== this.observed[i])) {
      this.resize?.disconnect();
      this.resize?.observe(root);
      for (const el of elements) this.resize?.observe(el);
      this.observed = elements;
    }
    this.markers = { lines, tops, linesOrdered: ordered(lines), topsOrdered: ordered(tops) };
    this.dirty = false;
    return this.markers;
  }

  destroy(): void {
    this.mutations.disconnect();
    this.ancestors.disconnect();
    this.resize?.disconnect();
    this.root.removeEventListener("load", this.invalidate, true);
    this.root.removeEventListener("error", this.invalidate, true);
    for (const event of this.interactionEvents) this.root.removeEventListener(event, this.invalidate, true);
    this.root.removeEventListener("transitionrun", this.motionStarted, true);
    this.root.removeEventListener("animationstart", this.motionStarted, true);
    for (const event of ["transitionend", "transitioncancel", "animationend", "animationcancel"]) this.root.removeEventListener(event, this.motionEnded, true);
    this.root.ownerDocument.defaultView?.removeEventListener("resize", this.invalidate);
    this.fonts?.removeEventListener("loadingdone", this.invalidate);
    this.observed = [];
    this.markers = { lines: [], tops: [], linesOrdered: true, topsOrdered: true };
  }
}
