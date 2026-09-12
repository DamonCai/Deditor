import { sourceTree, range, type SourceNode } from "./document";

/** Existing DEditor extension: list items inside pipe-table cells use <br>. */
export function tableListTree(tree: SourceNode, source: string) {
  if (tree.type !== "tableCell") { tree.children?.forEach(child => tableListTree(child, source)); return; }
  // mdast cell ranges include separators/padding; inline children delimit content.
  const children = tree.children ?? [];
  if (!children.length) return;
  const from = range(children[0])[0], to = range(children.at(-1)!)[1];
  const breaks = children.filter(node => node.type === "html" && /^<br\s*\/?>$/i.test(node.value ?? ""));
  const breakEnds = new Map(breaks.map(node => range(node)));
  let text = ""; const offsets = [from];
  for (let cursor = from; cursor < to;) {
    const end = breakEnds.get(cursor);
    if (end !== undefined) { text += "\n"; cursor = end; }
    else { text += source[cursor]; cursor++; }
    offsets.push(cursor);
  }
  if (!text.split("\n").some(line => /^\s*(?:[-+*]|\d+[.)])\s+/.test(line))) {
    if (breaks.length) tree.children = children.map(child => breaks.includes(child) ? { type: "break", position: child.position } : child);
    return;
  }
  const blocks = sourceTree(text).children ?? [];
  if (!blocks.some(node => node.type === "list") || !blocks.every(node => node.type === "list" || node.type === "paragraph")) return;
  // A soft line in a list paragraph includes indentation in its source span.
  // Give the rendered break and each line their own exact original ranges.
  const splitLines = (node: SourceNode) => {
    node.children = node.children?.flatMap(child => {
      splitLines(child);
      if (child.type !== "text" || !child.value?.includes("\n")) return [child];
      const [start, end] = range(child), raw = text.slice(start, end);
      const lines = raw.split("\n"), values = child.value.split("\n");
      if (lines.length !== values.length) return [child];
      let cursor = start; const result: SourceNode[] = [];
      lines.forEach((line, index) => {
        const trim = index ? line.length - line.trimStart().length : 0;
        if (values[index]) result.push({type:"text",value:values[index],position:{start:{offset:cursor+trim},end:{offset:cursor+line.length}}});
        cursor += line.length;
        if (index < lines.length - 1) result.push({type:"break",position:{start:{offset:cursor},end:{offset:cursor+1}}});
        cursor++;
      });
      return result;
    });
  };
  blocks.forEach(splitLines);
  const restoreOffsets = (node: SourceNode) => {
    if (node.position) {
      const [start, end] = range(node);
      node.position = {start:{offset:offsets[start] ?? to},end:{offset:offsets[end] ?? to}};
    }
    node.children?.forEach(restoreOffsets);
  };
  blocks.forEach(restoreOffsets);
  tree.children = blocks;
  (tree as SourceNode & { deditorBlocks: boolean }).deditorBlocks = true;
}
