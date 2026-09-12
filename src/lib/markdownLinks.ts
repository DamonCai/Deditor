import { sourceTree, type SourceNode } from "./markdownVisual/document";
import { dirname, resolveAgainst } from "./pathUtil";
import { openFileByPath } from "./fileio";
import { useEditorStore } from "../store/editor";
import { markdownSession } from "./markdownSession";
import { getVisualEditor } from "./markdownVisualBridge";

export function decodeAnchor(value: string) { try { return decodeURIComponent(value); } catch { return value; } }
export function headingSourcePosition(source: string, anchor: string): { offset: number; line: number } | null {
  const plain = (node: SourceNode): string => node.type === "text" || node.type === "inlineCode" ? node.value ?? "" : node.type === "image" ? (node as SourceNode & {alt?: string}).alt ?? "" : node.children?.map(plain).join("") ?? "";
  const used = new Set<string>(); let found: {offset: number; line: number} | null = null;
  const visit = (node: SourceNode) => {
    if (node.type === "heading") {
      const base = plain(node).trim().toLowerCase().replace(/\s+/g, "-");
      let id = base, suffix = 1; while (used.has(id)) id = `${base}-${suffix++}`;
      used.add(id);
      if (id === decodeAnchor(anchor) && !found) found = {offset: node.position?.start.offset ?? 0, line: source.slice(0, node.position?.start.offset ?? 0).split("\n").length};
    }
    node.children?.forEach(visit);
  };
  visit(sourceTree(source)); return found;
}

/** Split URL metadata before decoding, so an escaped # remains part of the filename. */
export function localMarkdownTarget(href: string, filePath: string | null) {
  const hash = href.indexOf("#"), anchor = hash < 0 ? "" : href.slice(hash + 1);
  const path = (hash < 0 ? href : href.slice(0, hash)).split("?")[0];
  const stripped = path.replace(/^file:\/\/[^/]*/i, "").replace(/^file:/i, "");
  let decoded = stripped; try { decoded = decodeURIComponent(stripped); } catch { /* retain malformed escapes */ }
  return {path: resolveAgainst(filePath ? dirname(filePath) : "", decoded), anchor};
}

export async function openMarkdownFileLink(href: string, filePath: string | null) {
  const target = localMarkdownTarget(href, filePath);
  await openFileByPath(target.path);
  if (!target.anchor) return;
  const store = useEditorStore.getState(), tab = store.tabs.find(tab => tab.filePath === target.path);
  if (!tab || store.activeId !== tab.id) return;
  const position = headingSourcePosition(tab.content, target.anchor); if (!position) return;
  markdownSession(tab.id, tab.content).sourceCursor = position.offset;
  store.setTabPosition(tab.id, {cursor: position.offset, scrollTopLine: position.line});
  const visual = getVisualEditor();
  if (visual?.tabId === tab.id) visual.navigate?.(position.line);
}
