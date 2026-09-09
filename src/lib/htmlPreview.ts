import { convertFileSrc } from "@tauri-apps/api/core";
import { logError } from "./logger";

/** Build a separate document; never insert file HTML into the application's DOM.
 * The iframe sandbox is the security boundary, with CSP as defense in depth. */
export function buildHtmlPreview(content: string, filePath: string): string {
  const doc = new DOMParser().parseFromString(content, "text/html");
  // A refresh could replace the reading view without the user's interaction.
  doc.querySelectorAll("meta[http-equiv]").forEach((meta) => {
    if (meta.getAttribute("http-equiv")?.toLowerCase() === "refresh") meta.remove();
  });

  // Preserve an authored base (including relative bases), resolving it against
  // the source file. URL path separators must remain literal so ../ works on
  // both asset:// (macOS) and http://asset.localhost (Windows).
  const fileUrl = convertFileSrc(filePath).replace(/%2f|%5c/gi, "/");
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

  // With a file base, a bare #fragment would reload the saved file. Keep
  // in-page links inside the current (possibly unsaved) srcdoc instead.
  doc.querySelectorAll("a[href], area[href]").forEach((link) => {
    const href = link.getAttribute("href")?.trim();
    if (href?.startsWith("#")) link.setAttribute("href", "about:srcdoc" + href);
  });

  const policy = doc.createElement("meta");
  policy.httpEquiv = "Content-Security-Policy";
  policy.content = "script-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'";
  doc.head.prepend(policy, base);
  return "<!doctype html>\n" + doc.documentElement.outerHTML;
}
