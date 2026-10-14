import { markdownDisplayHtml, hydrateMarkdownDisplay, type MarkdownDisplayOptions } from "./markdownDisplay";

const markerAttribute = "data-deditor-preview-line";
export interface PreviewBlock { html: string; lines: string[] }

/** Per-preview cache; retain only blocks used by the latest document. */
export class MarkdownPreviewCache {
  private previous = new Map<string, string>();
  prepare(rawHtml: string): PreviewBlock[] {
    const template = document.createElement("template");
    template.innerHTML = rawHtml;
    const next = new Map<string, string>();
    const blocks = Array.from(template.content.childNodes, node => {
      const lines: string[] = [];
      if (node.nodeType === Node.ELEMENT_NODE) {
        const root = node as Element;
        for (const element of [root, ...root.querySelectorAll(`[${markerAttribute}]`)]) element.removeAttribute(markerAttribute);
        for (const element of [root, ...root.querySelectorAll("[data-line]")]) {
          const line = element.getAttribute("data-line");
          if (line == null) continue;
          element.removeAttribute("data-line");
          element.setAttribute(markerAttribute, String(lines.length)); lines.push(line);
        }
      }
      const raw = node.nodeType === Node.ELEMENT_NODE ? (node as Element).outerHTML
        : node.nodeType === Node.TEXT_NODE ? (node.textContent ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
      let clean = this.previous.get(raw);
      if (clean === undefined) clean = markdownDisplayHtml(raw);
      next.set(raw, clean);
      return { html: clean, lines };
    });
    this.previous = next;
    return blocks;
  }
  clear() { this.previous.clear(); }
}

interface Block { html: string; nodes: Node[]; markers: { element: Element; index: number }[] }

/** Own direct children without adding layout wrappers. Unchanged blocks keep
 * their DOM, including rendered diagrams, loaded images and open details. */
export class MarkdownPreviewDocument {
  private blocks: Block[] = [];
  private context = "";
  private pending = new Map<ReturnType<typeof hydrateMarkdownDisplay>, Node[]>();
  constructor(private root: HTMLElement) {}

  update(htmlBlocks: readonly PreviewBlock[], options: MarkdownDisplayOptions) {
    if (!htmlBlocks.length) { this.destroy(); this.root.replaceChildren(); return; }
    const context = JSON.stringify(options);
    if (context !== this.context) {
      this.destroy();
      this.context = context;
    }
    const available = new Map<string, Block[]>();
    for (const block of this.blocks) {
      const bucket = available.get(block.html) ?? [];
      bucket.push(block); available.set(block.html, bucket);
    }
    const added: Node[] = [];
    this.blocks = htmlBlocks.map(({ html, lines }) => {
      const reused = available.get(html)?.shift();
      let block = reused;
      if (!block) {
        const template = document.createElement("template"); template.innerHTML = html;
        const markers = Array.from(template.content.querySelectorAll(`[${markerAttribute}]`), element => {
          const index = Number(element.getAttribute(markerAttribute)); element.removeAttribute(markerAttribute);
          return { element, index };
        });
        block = { html, nodes: Array.from(template.content.childNodes), markers };
        added.push(...block.nodes);
      }
      for (const { element, index } of block.markers) {
        const line = lines[index];
        if (line != null && element.getAttribute("data-line") !== line) element.setAttribute("data-line", line);
      }
      return block;
    });
    const retained = new Set(this.blocks.flatMap(block => block.nodes));
    for (const node of Array.from(this.root.childNodes)) if (!retained.has(node)) node.remove();
    let cursor = this.root.firstChild;
    for (const block of this.blocks) for (const node of block.nodes) {
      if (node !== cursor) this.root.insertBefore(node, cursor);
      else cursor = cursor.nextSibling;
    }
    for (const [hydration, nodes] of this.pending) if (!nodes.some(node => this.root.contains(node))) {
      hydration.abort(); this.pending.delete(hydration);
    }
    // Keep in-flight work for reused nodes alive. Each hydration skips already
    // claimed diagrams; aborting it on every edit would strand placeholders.
    if (added.length) {
      const hydration = hydrateMarkdownDisplay(this.root, options);
      this.pending.set(hydration, added);
      void hydration.done.finally(() => this.pending.delete(hydration));
    }
  }

  destroy() {
    for (const hydration of this.pending.keys()) hydration.abort();
    this.pending.clear(); this.blocks = []; this.context = "";
  }
}
