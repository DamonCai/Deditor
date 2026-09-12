import { orderFootnoteTree } from "./footnoteOrder";
import { taskIndentTree } from "./taskIndent";
import { editableBlockTree } from "./blockTree";
import { sizedImages } from "./image";
import { tableListTree } from "./tableLists";
import { inlineHtmlMarks } from "./inline";
import { referenceLinks } from "./references";
import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import remarkFrontmatter from "remark-frontmatter";
import { protectedTree, type SourceNode } from "./document";
export const frontmatter = $remark("deditorFrontmatter", () => remarkFrontmatter, ["yaml", "toml"]);
export function rawRemark(mdx: boolean) {
  return $remark("deditorPreserve", () => () => (tree: unknown, file: { value: unknown }) => {
    editableBlockTree(tree as SourceNode, String(file.value));
    tableListTree(tree as SourceNode, String(file.value));
    taskIndentTree(tree as SourceNode);
    inlineHtmlMarks(tree as SourceNode);
    referenceLinks(tree as SourceNode);
    sizedImages(tree as SourceNode);
    protectedTree(tree as SourceNode, String(file.value), mdx);
    if(!mdx)orderFootnoteTree(tree as SourceNode);
  });
}
export const rawSchema = $nodeSchema("deditor_raw", () => ({
  group: "block", content: "text*", code: true, defining: true, isolating: true, marks: "",
  parseDOM: [{ tag: "pre[data-deditor-raw]", preserveWhitespace: "full" }],
  toDOM: () => ["pre", { "data-deditor-raw": "true" }, 0],
  parseMarkdown: {
    match: n => n.type === "deditorRaw",
    runner: (state, node, type) => { state.openNode(type); if (node.value) state.addText(String(node.value)); state.closeNode(); },
  },
  toMarkdown: { match: n => n.type.name === "deditor_raw", runner: (state, node) => { state.addNode("html", undefined, node.textContent); } },
}));
