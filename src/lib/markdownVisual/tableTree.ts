import { sourceTree, range, type SourceNode } from "./document";
import { tableCellSource, tableListStart, tableCjkStrongAt } from "../markdownTableSyntax";

function cellStrongTree(node: SourceNode, source: string) {
  node.children = node.children?.flatMap(child => {
    if (child.type !== "text") { cellStrongTree(child, source); return [child]; }
    const [from, to] = range(child), raw = source.slice(from, to);
    // Escape/entity decoding changes offsets; those spellings retain their
    // normal interpretation rather than guessing a source position.
    if (raw !== child.value) return [child];
    const result: SourceNode[] = []; let consumed = 0;
    const text = (start: number, end: number) => ({ type: "text", value: raw.slice(start, end), position: { start: { offset: from + start }, end: { offset: from + end } } });
    for (let at = 0; at < raw.length; at++) {
      const match = tableCjkStrongAt(raw, at); if (!match) continue;
      if (at > consumed) result.push(text(consumed, at));
      result.push({ type: "strong", children: [text(at + 2, at + match.length - 2)], position: { start: { offset: from + at }, end: { offset: from + at + match.length } } });
      consumed = at + match.length; at = consumed - 1;
    }
    if (!consumed) return [child];
    if (consumed < raw.length) result.push(text(consumed, raw.length));
    return result;
  });
}

/** Existing DEditor extension: list items inside pipe-table cells use <br>. */
export function tableListTree(tree: SourceNode, source: string) {
  if (tree.type !== "tableCell") { tree.children?.forEach(child => tableListTree(child, source)); return; }
  // mdast cell ranges include separators/padding; inline children delimit content.
  const children = tree.children ?? [];
  if (!children.length) return;
  const from = range(children[0])[0], to = range(children.at(-1)!)[1];
  const breaks: SourceNode[] = [];
  const findBreaks = (node: SourceNode) => {
    if (node.type === "html" && /^<br\s*\/?>$/i.test(node.value ?? "")) breaks.push(node);
    node.children?.forEach(findBreaks);
  };
  children.forEach(findBreaks);
  const normalized = tableCellSource(source.slice(from, to), breaks.map(node => { const [a, b] = range(node); return [a - from, b - from]; }));
  const text = normalized.text, offsets = normalized.offsets.map(offset => offset + from);
  if (!text.split("\n").some(line => tableListStart.test(line))) {
    if (breaks.length) tree.children = children.map(child => breaks.includes(child) ? { type: "break", position: child.position } : child);
    cellStrongTree(tree, source);
    return;
  }
  const blocks = sourceTree(text).children ?? [];
  if (!blocks.some(node => node.type === "list") || !blocks.every(node => node.type === "list" || node.type === "paragraph")) return;
  blocks.forEach(block => cellStrongTree(block, text));
  // A soft line in a list paragraph includes indentation in its source span.
  // Give the rendered break and each line their own exact original ranges.
  const splitLines = (node: SourceNode) => {
    const list = node as SourceNode & { ordered?: boolean; start?: number };
    if (node.type === "list" && list.ordered) {
      // These lists are created after Milkdown's remark list-label pass.
      // Supply its expected labels now, avoiding a startup repair transaction
      // that would otherwise serialize the untouched table.
      node.children?.forEach((item, index) => { (item as SourceNode & { label: number }).label = (list.start ?? 1) + index; });
    }
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
