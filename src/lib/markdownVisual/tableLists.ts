import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { SerializerState } from "@milkdown/kit/transformer";
import { remarkCtx } from "@milkdown/kit/core";
import { tableCellSchema, tableHeaderSchema } from "@milkdown/kit/preset/gfm";
import type { SourceNode } from "./document";
import { sourceTree, range } from "./document";

/** Existing DEditor extension: list items inside pipe-table cells use <br>. */
export function tableListTree(tree: SourceNode, source: string) {
  if (tree.type === "tableCell") {
    const [from, to] = range(tree);
    let text = source.slice(from, to);
    const breaks = tree.children?.filter(n => n.type === "html" && /^<br\s*\/?>$/i.test(n.value ?? "")) ?? [];
    for (const node of [...breaks].reverse()) {
      const [start, end] = range(node);
      text = text.slice(0, start - from) + "\n" + text.slice(end - from);
    }
    if (!text.split("\n").some(line => /^\s*(?:[-+*]|\d+[.)])\s+/.test(line))) {
      if (breaks.length) tree.children = tree.children?.map(child => breaks.includes(child) ? { type: "break" } : child);
      return;
    }
    const blocks = sourceTree(text).children ?? [];
    if (blocks.some(n => n.type === "list") && blocks.every(n => n.type === "list" || n.type === "paragraph")) {
      tree.children = blocks;
      (tree as SourceNode & { deditorBlocks: boolean }).deditorBlocks = true;
    }
    return;
  }
  tree.children?.forEach(child => tableListTree(child, source));
}
export const extendedTableCells = [tableCellSchema, tableHeaderSchema].map(schema => schema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, content: "(paragraph | bullet_list | ordered_list)+",
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => {
      if (node.deditorBlocks) state.openNode(type, { alignment: node.align }).next(node.children).closeNode();
      else base.parseMarkdown.runner(state, node, type);
    } },
    toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
      if (node.childCount === 1 && node.firstChild?.type.name === "paragraph") {
        if (!node.firstChild.content.size) { state.openNode("tableCell").closeNode(); return; }
        let hasBreak = false; node.firstChild.forEach(child => { if (child.type.name === "hardbreak") hasBreak = true; });
        if (!hasBreak) { base.toMarkdown.runner(state, node); return; }
      }
      const chunks: string[] = [];
      const serializeCellBlock = SerializerState.create(node.type.schema, ctx.get(remarkCtx));
      node.forEach(child => {
        if (child.type.name === "paragraph") {
          const segments: ProseNode[][] = [[]];
          child.forEach(inline => { if (inline.type.name === "hardbreak") segments.push([]); else segments.at(-1)!.push(inline); });
          chunks.push(segments.map(segment => segment.length ? serializeCellBlock(node.type.schema.nodes.doc.create(null, child.type.create(null, segment))).replace(/\n$/, "") : "").join("<br>"));
        } else chunks.push(serializeCellBlock(node.type.schema.nodes.doc.create(null, child)).trimEnd());
      });
      const content = chunks.join("\n\n").replace(/\\?\r?\n/g, "<br>").replace(/(?<!\\)\|/g, "\\|");
      state.openNode("tableCell").addNode("html", undefined, content).closeNode();
    } },
  };
}));
