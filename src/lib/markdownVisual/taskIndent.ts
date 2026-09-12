import { extendListItemSchemaForTask } from "@milkdown/kit/preset/gfm";
import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { taskIndent, taskIndentMarker } from "../markdownListIndent";
import type { SourceNode } from "./document";

export function taskIndentTree(tree: SourceNode) {
  if (tree.type === "listItem") {
    const paragraph = tree.children?.[0];
    const first = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
    const marker = first?.type === "html" ? first.value?.match(taskIndentMarker) : null;
    if (marker) {
      (tree as SourceNode & { taskIndent: number }).taskIndent = taskIndent(marker[1]);
      paragraph!.children!.shift();
      const text = paragraph!.children![0];
      if (text?.type === "text" && text.value?.startsWith(" ")) {
        text.value = text.value.slice(1);
        if (text.position?.start.offset !== undefined) text.position.start.offset++;
        if (!text.value) paragraph!.children!.shift();
      }
    }
  }
  tree.children?.forEach(taskIndentTree);
}

export const indentedTasks = extendListItemSchemaForTask.extendSchema(previous => ctx => {
  const base = previous(ctx);
  return { ...base, attrs: { ...base.attrs, taskIndent: { default: 0 } },
    parseDOM: base.parseDOM?.map(rule => ({ ...rule, getAttrs: (dom: HTMLElement) => {
      const attrs = rule.getAttrs?.(dom) ?? rule.attrs ?? {};
      if (attrs === false) return false;
      return { ...attrs, taskIndent: taskIndent(dom.getAttribute("data-task-indent") ?? dom.closest(".milkdown-list-item-block")?.getAttribute("data-task-indent")) };
    } })),
    toDOM: node => {
      const spec = base.toDOM!(node);
      if (Array.isArray(spec) && taskIndent(node.attrs.taskIndent)) {
        spec[1] = { ...(typeof spec[1] === "object" ? spec[1] : {}), "data-task-indent": String(taskIndent(node.attrs.taskIndent)) };
      }
      return spec;
    },
    parseMarkdown: { ...base.parseMarkdown, runner: (state, node, type) => {
      // Reuse the task schema's normal attributes, adding the presentation depth.
      base.parseMarkdown.runner(state, node, type);
      const parent = state.top(), last = parent?.content.at(-1);
      if (last && node.taskIndent) parent!.content[parent!.content.length - 1] = last.type.create({ ...last.attrs, taskIndent: taskIndent(node.taskIndent) }, last.content, last.marks);
    } },
    toMarkdown: { ...base.toMarkdown, runner: (state, node) => {
      base.toMarkdown.runner(state, node);
      const indent = taskIndent(node.attrs.taskIndent);
      const item = state.top()?.children?.at(-1), paragraph = item?.children?.[0];
      if (indent && typeof node.attrs.checked === "boolean" && paragraph?.type === "paragraph") {
        paragraph.children ??= [];
        paragraph.children.unshift({ type: "html", value: `<!-- deditor-task-indent:${indent} -->` }, { type: "text", value: " " });
      }
    } },
  };
});

export const taskIndentDecorations = $prose(() => {
  let cachedDoc: import("@milkdown/kit/prose/model").Node | null = null, cached = DecorationSet.empty;
  return new Plugin({ props: { decorations(state) {
    if (cachedDoc === state.doc) return cached;
    const decorations: Decoration[] = [];
    state.doc.descendants((node, pos) => {
      const indent = taskIndent(node.attrs.taskIndent);
      if (node.type.name === "list_item" && indent) decorations.push(Decoration.node(pos, pos + node.nodeSize, { "data-task-indent": String(indent), style: `--md-task-indent:${indent}` }));
    });
    cachedDoc = state.doc; cached = DecorationSet.create(state.doc, decorations); return cached;
  } },
  });
});
