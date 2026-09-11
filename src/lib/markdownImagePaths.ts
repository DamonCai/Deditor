import { sourceTree, range, type SourceNode } from "./markdownVisual/document";
import { dirname, isAbsolutePath, isLocalRef, resolveAgainst } from "./pathUtil";

function relativeImage(url: string, oldPath: string, newPath: string, moved?: { from: string; to: string }) {
  if (!isLocalRef(url) || isAbsolutePath(url) || /^file:/i.test(url)) return url;
  let resolved = resolveAgainst(dirname(oldPath), url).replace(/\\/g, "/");
  if (moved) {
    const from = moved.from.replace(/\\/g, "/"), to = moved.to.replace(/\\/g, "/");
    let target = resolved;
    try { target = decodeURI(resolved); } catch { /* Preserve malformed authored URLs. */ }
    if (target === from || target.startsWith(from + "/")) resolved = to + target.slice(from.length);
  }
  const base = dirname(newPath).replace(/\\/g, "/");
  const windows = /^[a-z]:/i.test(base) || base.startsWith("//");
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
export function rebaseMarkdownImages(source: string, oldPath: string, newPath: string, moved?: { from: string; to: string }) {
  if (!moved && dirname(oldPath) === dirname(newPath)) return source;
  type Link = SourceNode & { url?: string; identifier?: string };
  const tree = sourceTree(source), references = new Set<string>();
  const walk = (node: Link, fn: (node: Link) => void) => { fn(node); node.children?.forEach(n => walk(n, fn)); };
  walk(tree, node => { if (node.type === "imageReference") references.add(node.identifier ?? ""); });
  const edits: { from: number; to: number; value: string }[] = [];
  walk(tree, node => {
    const [start, end] = range(node), raw = source.slice(start, end);
    if (node.type === "html") {
      for (const match of raw.matchAll(/<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi)) {
        const url = match[2] ?? match[3], next = relativeImage(url, oldPath, newPath, moved);
        if (next !== url) { const at = start + match.index! + match[0].length - url.length - 1; edits.push({ from: at, to: at + url.length, value: next }); }
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
    const next = relativeImage(token, oldPath, newPath, moved);
    if (next !== token) edits.push({ from: start + at + (angle ? 1 : 0), to: start + at + (angle ? 1 : 0) + token.length, value: next.replace(/ /g, "%20") });
  });
  for (const edit of edits.sort((a, b) => b.from - a.from)) source = source.slice(0, edit.from) + edit.value + source.slice(edit.to);
  return source;
}
