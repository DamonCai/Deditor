import { hydrateLegacyDiagrams } from "./legacyDiagramHydrate";
import DOMPurify from "dompurify";
import { hydrateMermaid } from "./mermaidHydrate";
import { hydratePlantuml } from "./plantumlHydrate";
import { hydrateLocalImages } from "./localImgHydrate";
import { hydrateHtmlBlocks } from "./htmlBlockHydrate";
import { HTML_PREVIEW_SANDBOX } from "./htmlPreview";
import { fixedHtmlElements, needsHtmlDocument } from "./htmlDocument";
import { hydrateHtmlFrames } from "./htmlFrameHydrate";
import { tStatic } from "./i18n";

let displayPurifier: typeof DOMPurify | undefined;
function markdownPurifier() {
  if (!displayPurifier) {
    // Keep this exception local to Markdown display, not other HTML consumers.
    displayPurifier = DOMPurify(window);
    displayPurifier.addHook("uponSanitizeAttribute", (node, data) => {
      const name = node.nodeName.toUpperCase();
      if ((name === "A" && data.attrName === "href" ||
        /^(IMG|AUDIO|VIDEO|SOURCE|TRACK|IFRAME)$/.test(name) && /^(src|poster)$/.test(data.attrName) ||
        /^(IMAGE|USE)$/.test(name) && /^(href|xlink:href)$/.test(data.attrName)) &&
        /^(?:file:|[a-z]:[\\/])/i.test(data.attrValue)) data.forceKeepAttr = true;
    });
  }
  return displayPurifier;
}

function sanitizedFragment(html: string | HTMLTemplateElement) {
  const original = typeof html === "string" ? document.createElement("template") : html;
  if (typeof html === "string") original.innerHTML = html;
  const documents: (string | null)[] = [];
  original.content.querySelectorAll("iframe").forEach((frame, index) => {
    documents[index] = frame.getAttribute("srcdoc");
    frame.removeAttribute("srcdoc");
    frame.setAttribute("data-deditor-frame-index", String(index));
  });
  const clean = document.createElement("template");
  clean.innerHTML = markdownPurifier().sanitize(original.innerHTML, {ADD_TAGS:["iframe", "use"], ADD_ATTR:["allowfullscreen"]});
  clean.content.querySelectorAll("iframe").forEach(frame => {
    const source = documents[Number(frame.getAttribute("data-deditor-frame-index"))];
    frame.removeAttribute("data-deditor-frame-index");
    // srcdoc is a separate document, not host markup. Restoring it as inert
    // metadata avoids the host sanitizer stripping the embedded page's script.
    if (source != null) frame.dataset.htmlDocument = source;
  });
  return clean;
}

function isolateFrame(frame: HTMLIFrameElement) {
  frame.setAttribute("sandbox", HTML_PREVIEW_SANDBOX);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("loading", "lazy");
  frame.removeAttribute("allow");
}

function htmlDocumentFrame(source: string) {
  const frame = document.createElement("iframe");
  frame.className = "md-html-document";
  frame.title = tStatic("html.previewTitle");
  frame.dataset.htmlDocument = source;
  isolateFrame(frame);
  return frame;
}

/** Both hosts mount the same sanitized renderer output. Diagram source is inert
 * metadata: restore it after sanitization, which can reject arrows in attributes. */
export function markdownDisplayHtml(html: string): string {
  return markdownDisplayTemplate(html).innerHTML;
}

/** Reuse the sanitized tree when the caller mounts DOM instead of HTML. */
export function markdownDisplayTemplate(html: string): HTMLTemplateElement {
  const original = document.createElement("template"); original.innerHTML = html;
  const clean = sanitizedFragment(original);
  for (const kind of ["mermaid", "plantuml", "legacy"]) {
    const sources = original.content.querySelectorAll(`.${kind}-diagram`);
    clean.content.querySelectorAll(`.${kind}-diagram`).forEach((element, index) => {
      for (const suffix of ["source", "encoded"]) {
        const name = `data-${kind}-${suffix}`, value = sources[index]?.getAttribute(name);
        if (value != null) element.setAttribute(name, value);
      }
    });
  }
  const htmlSources = original.content.querySelectorAll(".html-render-block");
  clean.content.querySelectorAll(".html-render-block").forEach((element, index) => {
    const source = htmlSources[index]?.getAttribute("data-html-source");
    if (source != null) element.setAttribute("data-html-source", source);
  });
  clean.content.querySelectorAll<HTMLElement>(".html-render-block").forEach(element => {
    const source = element.getAttribute("data-html-source") ?? "";
    element.removeAttribute("data-html-source");
    if (needsHtmlDocument(source)) element.replaceChildren(htmlDocumentFrame(source));
    else element.replaceChildren(sanitizedFragment(source).content);
  });
  for (const frame of clean.content.querySelectorAll("iframe")) {
    const src = frame.getAttribute("src") ?? "";
    // Relative/local documents and authored srcdoc are valid embeds, too.
    if (/^\s*(?:javascript|vbscript):/i.test(src)) {frame.remove();continue;}
    isolateFrame(frame);
  }
  // The host viewport includes the file tree and toolbar. Fixed HTML needs
  // a document viewport of its own, including when authored inside a paragraph.
  for (const element of fixedHtmlElements(clean.content)) {
    if (!clean.content.contains(element)) continue;
    // The detached subtree is serialized into the frame. Restore nested srcdoc
    // values here because the host no longer hydrates those frames individually.
    for (const embed of [element, ...element.querySelectorAll("iframe[data-html-document]")]) {
      const source = embed.getAttribute("data-html-document");
      if (embed.localName !== "iframe" || source === null) continue;
      embed.setAttribute("srcdoc", source);
      embed.removeAttribute("data-html-document");
    }
    element.replaceWith(htmlDocumentFrame(element.outerHTML));
  }
  return clean;
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
  hydrateHtmlFrames(root, options.filePath ?? null);
  const children = [hydrateMermaid(root, options.theme), hydratePlantuml(root), hydrateLegacyDiagrams(root, options.theme)];
  const html = hydrateHtmlBlocks(root);
  const controller = new AbortController();
  controller.signal.addEventListener("abort", () => [...children, html].forEach(child => child.abort()), { once: true });
  return Object.assign(controller, { done: Promise.all([...children, html].map(child => child.done)).then(() => {}) });
}
