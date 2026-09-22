import { accurateTableDrop } from "./tableDrag";
import { spreadsheetTableHeaders } from "./tablePaste";
import { tableMenuPlacement } from "./tableMenu";
import type { Ctx } from "@milkdown/kit/ctx";
import { hardbreakFilterNodes, paragraphSchema } from "@milkdown/kit/preset/commonmark";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { SerializerState } from "@milkdown/kit/transformer";
import { remarkCtx } from "@milkdown/kit/core";
import { tableCellSchema, tableHeaderSchema, tableHeaderRowSchema, tableSchema } from "@milkdown/kit/preset/gfm";
export { tableListTree } from "./tableTree";

const tableCellExtensions = [tableCellSchema, tableHeaderSchema].map(schema => schema.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, content: "(paragraph | bullet_list | ordered_list)+",
    // Match tables inserted from Markdown: new columns have no explicit
    // alignment until the user chooses one. Rendering still defaults to left.
    attrs: { ...base.attrs, alignment: { ...base.attrs?.alignment, default: null }, verticalAlignment: { default: null } },
    toDOM: node => {
      const spec = base.toDOM!(node) as [string, Record<string, unknown>, number];
      return [spec[0], { ...spec[1], style: String(spec[1].style ?? "") + (node.attrs.verticalAlignment ? `;vertical-align:${node.attrs.verticalAlignment}` : "") }, spec[2]];
    },
    parseDOM: base.parseDOM?.map(rule => !('tag' in rule) ? rule : {
      ...rule,
      getAttrs: (dom: HTMLElement) => {
        const attrs = rule.getAttrs ? rule.getAttrs(dom) : rule.attrs;
        if (attrs === false) return false;
        return { ...attrs, ...(dom.getAttribute('data-deditor-alignment') === 'default' ? { alignment: null } : {}), verticalAlignment: ['middle', 'bottom'].includes(dom.style.verticalAlign) ? dom.style.verticalAlign : null };
      },
    }),
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => {
      state.openNode(type, { alignment: node.align, verticalAlignment: node.deditorVAlign ?? null });
      if (node.deditorBlocks) state.next(node.children);
      else state.openNode(paragraphSchema.type(ctx)).next(node.children).closeNode();
      state.closeNode();
    } },
    toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
      if (!node.attrs.verticalAlignment && node.childCount === 1 && node.firstChild?.type.name === "paragraph") {
        if (!node.firstChild.content.size) { state.openNode("tableCell").closeNode(); return; }
        let hasBreak = false; node.firstChild.forEach(child => { if (child.type.name === "hardbreak") hasBreak = true; });
        if (!hasBreak && !/^[ \t]|[ \t]$/.test(node.firstChild.textContent)) { base.toMarkdown.runner(state, node); return; }
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
      // GFM strips padding around cells before parsing inline content. Encode
      // actual boundary whitespace so save/reopen does not turn it into padding.
      const faithful = content.replace(/^[ \t]+|[ \t]+$/g, spaces => [...spaces].map(char => char === " " ? "&#32;" : "&#9;").join(""));
      state.openNode("tableCell").addNode("html", undefined, (node.attrs.verticalAlignment ? `<!-- deditor:valign=${node.attrs.verticalAlignment} -->` : "") + faithful).closeNode();
    } },
  };
}));

/** Pipe cells support durable <br> breaks, so do not reject Shift+Enter. */
export function configureTableEditing(ctx: Ctx) {
  ctx.update(hardbreakFilterNodes.key, nodes => nodes.filter(name => name !== "table"));
}

// An empty header row makes the generic table repair choose a data cell, which
// the Markdown header schema cannot contain. Its fitting step can add an extra
// data row during repair/history restore. Keep one empty header cell instead.
const nonemptyTableHeader = tableHeaderRowSchema.extendSchema(previous => ctx => ({
  ...previous(ctx), content: "table_header+",
}));
// GFM allows a header-only table after its final data row is deleted.
const headerOnlyTable = tableSchema.extendSchema(previous => ctx => ({
  ...previous(ctx), content: "table_header_row table_row*",
}));
export const extendedTableCells = [...tableCellExtensions, nonemptyTableHeader, headerOnlyTable, tableMenuPlacement, accurateTableDrop, spreadsheetTableHeaders];
