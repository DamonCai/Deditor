import { editableBlockTree } from "./blockTree";
import { taskIndentTree } from "./taskIndent";
import { sourceTree, range, type SourceNode } from "./document";
import { backgroundMarker, backgroundPrefix } from "../markdownBackground";

export function blockBackgroundEdits(source: string, from: number, to: number, color: string | null) {
  const edits: { from: number; to: number; insert: string }[] = [];
  const visit = (node: SourceNode) => {
    const [start, end] = range(node);
    if (node.type !== "root" && (from === to ? from < start || from > end : to <= start || from >= end)) return;
    if (["tableCell", "paragraph", "heading"].includes(node.type)) {
      let at = node.children?.[0]?.position?.start.offset ?? start;
      if (node.type === "tableCell") {
        const prefix = /^\|?[ \t]*(?:<!-- deditor:(?:table-indent=\d+|valign=(?:middle|bottom)) -->[ \t]*)*/.exec(source.slice(start, end))![0];
        at = start + prefix.length;
      } else if (node.type === "heading" && !node.children?.length) {
        at += /^#{1,6}[ \t]*/.exec(source.slice(start, end))?.[0].length ?? 0;
      }
      at += /^<!-- deditor-task-indent:\d+ -->[ \t]*/.exec(source.slice(at, end))?.[0].length ?? 0;
      const marker = backgroundPrefix.exec(source.slice(at, end));
      const insert = backgroundMarker(color);
      if ((marker?.[0] ?? "") !== insert) edits.push({ from: at, to: at + (marker?.[0].length ?? 0), insert });
      return;
    }
    node.children?.forEach(visit);
  };
  const tree = sourceTree(source);
  editableBlockTree(tree, source); taskIndentTree(tree);
  visit(tree);
  // A caret in a blank source line can create a shaded empty paragraph.
  if (!edits.length && color && from === to) {
    const start = source.lastIndexOf("\n", from - 1) + 1;
    const end = source.indexOf("\n", from);
    if (!source.slice(start, end < 0 ? source.length : end).trim()) {
      const inBlock = tree.children?.some(node => { const [a,b] = range(node); return start >= a && start < b; });
      if (!inBlock) edits.push({ from, to, insert: backgroundMarker(color) });
    }
  }
  return edits;
}
