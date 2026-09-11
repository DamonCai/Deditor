import { decodeHTMLAttribute } from "entities";
import { sourceTree, range, type SourceNode } from "./markdownVisual/document";
import { dirname, isAbsolutePath, isLocalRef, resolveAgainst } from "./pathUtil";
import { documentImageRoot, resolveMarkdownImage } from "./markdownImageSettings";

function relativeImage(url: string, oldPath: string, newPath: string, moved?: { from: string; to: string }) {
  if (!isLocalRef(url) || isAbsolutePath(url) || /^file:/i.test(url)) return url;
  let decoded = url;
  try { decoded = decodeURI(url); } catch { /* Preserve malformed authored URLs. */ }
  let resolved = resolveAgainst(dirname(oldPath), decoded).replace(/\\/g, "/");
  const windows = /^[a-z]:/i.test(oldPath) || /^[a-z]:/i.test(newPath) || oldPath.startsWith("\\\\") || oldPath.startsWith("//");
  const key = (value: string) => windows ? value.toLowerCase() : value;
  if (moved) {
    const from = moved.from.replace(/\\/g, "/"), to = moved.to.replace(/\\/g, "/");
    if (key(resolved) === key(from) || key(resolved).startsWith(key(from) + "/")) resolved = to + resolved.slice(from.length);
    else if (key(dirname(oldPath).replace(/\\/g, "/")) === key(dirname(newPath).replace(/\\/g, "/"))) return url;
  }
  const base = dirname(newPath).replace(/\\/g, "/");
  const same = (a: string, b: string) => windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  const parts = resolved.split("/"), from = base.split("/");
  if (!same(parts[0], from[0]) || base.startsWith("//") && (!same(parts[2], from[2]) || !same(parts[3], from[3]))) return resolved;
  let common = 0;
  while (common < parts.length - 1 && common < from.length && same(parts[common], from[common])) common++;
  return [...from.slice(common).map(() => ".."), ...parts.slice(common)].join("/");
}

function destinationToken(raw: string) {
  let depth = 0, i = 0;
  for (; i < raw.length; i++) {
    if (raw[i] === "\\") { i++; continue; }
    if (/\s/.test(raw[i])) break;
    if (raw[i] === "(") depth++;
    if (raw[i] === ")") { if (!depth) break; depth--; }
  }
  return raw.slice(0, i);
}
/** Patch only parsed image destinations, never code examples or unrelated links. */
export function rewriteMarkdownImageUrls(source: string, replace: (url: string) => string) {
  type Link = SourceNode & { url?: string; identifier?: string };
  const tree = sourceTree(source), references = new Set<string>();
  const walk = (node: Link, fn: (node: Link) => void) => { fn(node); node.children?.forEach(n => walk(n, fn)); };
  walk(tree, node => { if (node.type === "imageReference") references.add(node.identifier ?? ""); });
  const edits: { from: number; to: number; value: string }[] = [];
  walk(tree, node => {
    const [start, end] = range(node), raw = source.slice(start, end);
    if (node.type === "html") {
      for (const match of raw.matchAll(/<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
        const url = match[2] ?? match[3], decoded = decodeHTMLAttribute(url), next = replace(decoded);
        if (next !== decoded) { const at = start + match.index! + match[0].length - url.length - 1; edits.push({ from: at, to: at + url.length, value: next.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }); }
      }
      return;
    }
    if (node.type !== "image" && !(node.type === "definition" && references.has(node.identifier ?? ""))) return;
    if (!node.url) return;
    // Locate the authored destination after the label, retaining title, delimiters and spacing.
    const opener = node.type === "image" ? raw.indexOf("](") + 2 : raw.indexOf("]:") + 2;
    if (opener < 2) return;
    const rest = raw.slice(opener), leading = rest.match(/^\s*/)?.[0].length ?? 0;
    const at = opener + leading, angle = raw[at] === "<";
    const token = angle ? raw.slice(at + 1, raw.indexOf(">", at + 1)) : destinationToken(raw.slice(at));
    if (!token) return;
    const next = replace(node.url);
    if (next !== node.url) edits.push({ from: start + at + (angle ? 1 : 0), to: start + at + (angle ? 1 : 0) + token.length, value: next.replace(/[\s()<>"\\]/g, character => encodeURIComponent(character).replace(/\(/g, "%28").replace(/\)/g, "%29")) });
  });
  for (const edit of edits.sort((a, b) => b.from - a.from)) source = source.slice(0, edit.from) + edit.value + source.slice(edit.to);
  return source;
}

export function rebaseMarkdownImages(source: string, oldPath: string, newPath: string, moved?: { from: string; to: string }) {
  if (!moved && dirname(oldPath) === dirname(newPath)) return source;
  const oldRoot = documentImageRoot(source, oldPath), newRoot = documentImageRoot(source, newPath);
  return rewriteMarkdownImageUrls(source, url => {
    if (oldRoot !== null && /^\/(?!\/)/.test(url)) {
      let target = resolveMarkdownImage(url, oldPath, oldRoot)!.replace(/\\/g, "/");
      const key = (path: string) => /^[a-z]:/i.test(oldPath) || /^(?:\\\\|\/\/)/.test(oldPath) ? path.toLowerCase() : path;
      if (moved) {
        const from = moved.from.replace(/\\/g, "/"), to = moved.to.replace(/\\/g, "/");
        if (key(target) === key(from) || key(target).startsWith(key(from) + "/")) target = to + target.slice(from.length);
      }
      if (key(target) === key(resolveMarkdownImage(url, newPath, newRoot)!.replace(/\\/g, "/"))) return url;
      // Keep the authored root, but preserve this image's target when a relative
      // root changes meaning after Save As or a folder/image move.
      const encoded = encodeURI(target).replace(/#/g, "%23").replace(/\?/g, "%3F");
      const suffix = url.match(/[?#].*$/)?.[0] ?? "";
      return (target.startsWith("//") ? "file:" : target.startsWith("/") ? "file://" : "file:///") + encoded + suffix;
    }
    return relativeImage(url, oldPath, newPath, moved);
  });
}
