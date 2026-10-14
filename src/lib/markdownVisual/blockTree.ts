import type { SourceNode } from "./document";

const alertPattern = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]*\r?\n|[ \t]*$)/i;
/** The editing AST omits only the alert marker; source offsets still point into the authored text. */
export function editableBlockTree(tree: SourceNode, source: string) {
  if (tree.type === "blockquote") {
    const paragraph = tree.children?.[0], first = paragraph?.children?.[0];
    const match = first?.type === "text" ? first.value?.match(alertPattern) : null;
    if (match && first && paragraph) {
      (tree as SourceNode & { callout?: string }).callout = match[1].toUpperCase();
      first.value = first.value!.slice(match[0].length);
      if (!first.value) {
        paragraph.children!.shift();
        // Milkdown materializes soft line endings before this transform.
        if (!match[0].includes("\n") && paragraph.children?.[0]?.type === "break") paragraph.children.shift();
      }
      else if (first.position) {
        const start = first.position.start.offset ?? 0;
        const raw = source.slice(start).match(/^\[![^\]]+\][ \t]*(?:\r?\n[ \t]*(?:>[ \t]*)*)?/);
        first.position = { ...first.position, start: { offset: start + (raw?.[0].length ?? match[0].length) } };
      }
      if (!paragraph.children?.length) tree.children!.shift();
      if (!tree.children?.length) tree.children = [{ type: "paragraph", children: [] }];
    }
  }
  tree.children?.forEach(child => editableBlockTree(child, source));
}

