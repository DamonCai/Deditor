import { convertFileSrc } from "@tauri-apps/api/core";
import { logError } from "./logger";
import { resolveMarkdownImage } from "./markdownImageSettings";

// Allow normal document interactions, retaining a separate origin from the
// editor. New windows inherit this isolation; never add allow-same-origin.
export const HTML_PREVIEW_SANDBOX = "allow-scripts allow-forms allow-modals allow-downloads allow-popups";

function localResourceUrl(raw: string, filePath: string | null): string {
  if (!/^(?:file:|[a-z]:[\\/])/i.test(raw)) return raw;
  const target = resolveMarkdownImage(raw, filePath);
  return target === null ? raw : convertFileSrc(target).replace(/%2f|%5c/gi, "/") + (raw.match(/[?#].*$/)?.[0] ?? "");
}

/** Read srcset URL tokens without splitting commas inside data URLs. Keep
 * descriptors and whitespace verbatim; only explicit filesystem URLs change. */
function localSourceSet(value: string, filePath: string | null): string {
  let result = "", offset = 0;
  while (offset < value.length) {
    const separator = value.slice(offset).match(/^[\s,]+/)?.[0] ?? "";
    result += separator; offset += separator.length;
    const token = value.slice(offset).match(/^\S+/)?.[0];
    if (!token) break;
    const url = token.replace(/,+$/, "");
    result += localResourceUrl(url, filePath) + token.slice(url.length);
    offset += token.length;
    if (url.length !== token.length) continue;
    // Descriptors can contain parentheses; commas there do not end a candidate.
    let depth = 0;
    const start = offset;
    for (; offset < value.length; offset++) {
      if (value[offset] === "(") depth++;
      if (value[offset] === ")") depth = Math.max(0, depth - 1);
      if (value[offset] === "," && !depth) { offset++; break; }
    }
    result += value.slice(start, offset);
  }
  return result;
}

/** Build a separate document; preserve the author's own policy and behavior. */
export function buildHtmlPreview(content: string, filePath: string | null): string {
  const doc = new DOMParser().parseFromString(content, "text/html");

  // Preserve an authored base (including relative bases), resolving it against
  // the source file. URL path separators must remain literal so ../ works on
  // both asset:// (macOS) and http://asset.localhost (Windows).
  const fileUrl = filePath ? convertFileSrc(filePath).replace(/%2f|%5c/gi, "/") : "about:blank";
  const authoredBase = doc.querySelector("base[href]")?.getAttribute("href");
  const authoredTarget = doc.querySelector("base[target]")?.getAttribute("target");
  const base = doc.createElement("base");
  base.href = fileUrl;
  if (authoredTarget !== null && authoredTarget !== undefined) base.target = authoredTarget;
  if (authoredBase) {
    try {
      base.href = new URL(localResourceUrl(authoredBase, filePath), fileUrl).href;
    } catch (err) {
      logError("Invalid HTML preview base URL", err);
    }
  }
  doc.querySelectorAll("base").forEach((node) => node.remove());

  // A <base> resolves relative URLs, but explicit file:/Windows references
  // still need the native asset protocol, just like Markdown media.
  // SVG href can live in the XLink namespace. Select its local name in any
  // namespace; matching an escaped qualified name differs across DOM engines.
  for (const element of doc.querySelectorAll('[src],[*|href],[poster],[data],[action],[formaction],[srcset]')) {
    for (const attr of ['src', 'href', 'poster', 'data', 'action', 'formaction', 'xlink:href']) {
      const raw = attr === 'xlink:href'
        ? element.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
        : element.getAttribute(attr);
      if (!raw) continue;
      const resolved = localResourceUrl(raw, filePath);
      if (resolved !== raw) {
        if (attr === 'xlink:href') element.setAttributeNS('http://www.w3.org/1999/xlink', attr, resolved);
        else element.setAttribute(attr, resolved);
      }
    }
    const srcset = element.getAttribute("srcset");
    if (srcset) element.setAttribute("srcset", localSourceSet(srcset, filePath));
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
