import DOMPurify from "dompurify";
import { hydrateMermaid } from "./mermaidHydrate";
import { hydratePlantuml } from "./plantumlHydrate";
import { hydrateLocalImages } from "./localImgHydrate";

/** Both hosts mount the same sanitized renderer output. Diagram source is inert
 * metadata: restore it after sanitization, which can reject arrows in attributes. */
export function markdownDisplayHtml(html: string): string {
  const original = document.createElement("template"); original.innerHTML = html;
  const clean = document.createElement("template"); clean.innerHTML = DOMPurify.sanitize(html);
  for (const kind of ["mermaid", "plantuml"]) {
    const sources = original.content.querySelectorAll(`.${kind}-diagram`);
    clean.content.querySelectorAll(`.${kind}-diagram`).forEach((element, index) => {
      for (const suffix of ["source", "encoded"]) {
        const name = `data-${kind}-${suffix}`, value = sources[index]?.getAttribute(name);
        if (value != null) element.setAttribute(name, value);
      }
    });
  }
  return clean.innerHTML;
}

export interface MarkdownDisplayOptions {
  theme: "light" | "dark";
  filePath?: string | null;
  imageRoot?: string | null;
}

/** Shared post-mount lifecycle for Preview, raw blocks and code/diagram views.
 * Hosts retain their own stale-result checks and editing-height reservations. */
export function hydrateMarkdownDisplay(root: HTMLElement, options: MarkdownDisplayOptions) {
  hydrateLocalImages(root, options.filePath ?? null, options.imageRoot ?? null);
  const children = [hydrateMermaid(root, options.theme), hydratePlantuml(root)];
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => children.forEach(child => child.abort()), { once: true });
  return Object.assign(controller, { done: Promise.all(children.map(child => child.done)).then(() => {}) });
}
