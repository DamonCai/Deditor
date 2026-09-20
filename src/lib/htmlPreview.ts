import { convertFileSrc } from "@tauri-apps/api/core";
import { logError } from "./logger";
import { resolveMarkdownImage } from "./markdownImageSettings";

// Allow normal document interactions, retaining a separate origin from the
// editor. New windows inherit this isolation; never add allow-same-origin.
export const HTML_PREVIEW_SANDBOX = "allow-scripts allow-forms allow-modals allow-downloads allow-popups";

/** Build a separate document; preserve the author's own policy and behavior. */
export function buildHtmlPreview(content: string, filePath: string | null): string {
  const doc = new DOMParser().parseFromString(content, "text/html");

  // Preserve an authored base (including relative bases), resolving it against
  // the source file. URL path separators must remain literal so ../ works on
  // both asset:// (macOS) and http://asset.localhost (Windows).
  const fileUrl = filePath ? convertFileSrc(filePath).replace(/%2f|%5c/gi, "/") : "about:blank";
  const authoredBase = doc.querySelector("base[href]")?.getAttribute("href");
  const base = doc.createElement("base");
  base.href = fileUrl;
  if (authoredBase) {
    try {
      base.href = new URL(authoredBase, fileUrl).href;
    } catch (err) {
      logError("Invalid HTML preview base URL", err);
    }
  }
  doc.querySelectorAll("base").forEach((node) => node.remove());

  // A <base> resolves relative URLs, but explicit file:/Windows references
  // still need the native asset protocol, just like Markdown media.
  for (const element of doc.querySelectorAll('[src],[href],[poster],[data]')) {
    for (const attr of ['src', 'href', 'poster', 'data']) {
      const raw = element.getAttribute(attr);
      if (!raw || !/^(?:file:|[a-z]:[\\/])/i.test(raw)) continue;
      const target = resolveMarkdownImage(raw, filePath);
      if (target !== null) element.setAttribute(attr, convertFileSrc(target).replace(/%2f|%5c/gi, "/") + (raw.match(/[?#].*$/)?.[0] ?? ''));
    }
  }

  // With a file base, a bare #fragment would reload the saved file. Keep
  // in-page links inside the current (possibly unsaved) srcdoc instead.
  doc.querySelectorAll("a[href], area[href]").forEach((link) => {
    const href = link.getAttribute("href")?.trim();
    if (href?.startsWith("#")) link.setAttribute("href", "about:srcdoc" + href);
  });

  doc.head.prepend(base);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
