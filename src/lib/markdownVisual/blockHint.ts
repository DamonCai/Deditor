import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection, NodeSelection, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

/** Markdown syntax cues, independent of source serialization and undo history. */
export function getBlockHint(state: EditorState) {
  const { selection } = state, { $head } = selection;
  const selectedNode = selection instanceof NodeSelection ? selection.node : null;
  if (!selectedNode && (!(selection instanceof TextSelection) || !selection.empty)) return null;
  let depth = $head.depth;
  while (depth > 0 && !$head.node(depth).isBlock) depth--;
  const node = selectedNode ?? $head.node(depth);
  if (!node.isBlock || (!selectedNode && !$head.depth)) return null;
  const from = selectedNode ? selection.from : $head.before(depth);
  let label = "¶";
  switch (node.type.name) {
    case "heading": label = `H${node.attrs.level}`; break;
    case "code_block": {
      const language = String(node.attrs.language ?? "").toLowerCase();
      label = language === "latex" ? "$$" : ["mermaid", "plantuml", "puml", "uml"].includes(language) ? "UML" : "</>";
      break;
    }
    case "image": case "image-block": label = "IMG"; break;
    case "hr": case "horizontal_rule": label = "---"; break;
    case "deditor_raw": label = /^\s*</.test(node.textContent) ? "HTML" : /^---\r?\n/.test(node.textContent) ? "YAML" : "MD"; break;
    case "table": case "table_cell": case "table_header": label = "| |"; break;
    case "blockquote": label = ">"; break;
    case "list_item": label = typeof node.attrs.checked === "boolean" ? "[ ]" : node.attrs.listType === "ordered" ? "1." : "-"; break;
    default:
      // Describe the nearest enclosing structure, but align beside the current line's block.
      for (let depth = $head.depth; depth > 0; depth--) {
        const parent = $head.node(depth);
        if (["table_cell", "table_header"].includes(parent.type.name)) { label = "| |"; break; }
        if (parent.type.name === "list_item") {
          label = typeof parent.attrs.checked === "boolean" ? "[ ]" : $head.node(depth - 1).type.name === "ordered_list" ? "1." : "-";
          break;
        }
        if (parent.type.name === "blockquote") { label = ">"; break; }
      }
  }
  return { node, from, label };
}

export const activeBlockHint = $prose(() => new Plugin({
  props: {
    decorations(state) {
      const block = getBlockHint(state);
      return block ? DecorationSet.create(state.doc, [Decoration.node(block.from, block.from + block.node.nodeSize, {
        class: `md-block-active${block.node.type.name === "heading" ? " md-heading-active" : ""}`,
        "data-md-block-hint": block.label,
      })]) : DecorationSet.empty;
    },
  },
  view(view) {
    const scroller = view.dom.closest<HTMLElement>(".md-visual-scroll");
    if (!scroller) return {};
    // Outside the editable document: cannot be copied, serialized, or observed as an edit.
    const hint = document.createElement("span");
    hint.className = "md-block-hint"; hint.setAttribute("aria-hidden", "true"); hint.hidden = true;
    scroller.append(hint);
    let frame = 0;
    const refresh = () => {
      frame = 0;
      const active = view.dom.ownerDocument.activeElement;
      const editing = active === view.dom || active instanceof HTMLElement && view.dom.contains(active) && active.isContentEditable;
      const block = getBlockHint(view.state);
      const target = block ? view.nodeDOM(block.from) : null;
      hint.hidden = !view.editable || !editing || !(target instanceof HTMLElement);
      if (hint.hidden || !block || !(target instanceof HTMLElement)) return;
      const rect = target.getBoundingClientRect(), viewport = scroller.getBoundingClientRect();
      hint.textContent = block.label;
      // Absolute gutter positioning leaves list markers, nested content and table cells untouched.
      hint.style.top = `${rect.top - viewport.top + scroller.scrollTop + 4}px`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(refresh); };
    scroller.addEventListener("scroll", schedule, true);
    view.dom.addEventListener("focusin", schedule);
    view.dom.addEventListener("focusout", schedule);
    view.dom.addEventListener("deditor-editable-change", schedule);
    const observer = new ResizeObserver(schedule); observer.observe(scroller); observer.observe(view.dom);
    schedule();
    return {
      update: schedule,
      destroy() {
        cancelAnimationFrame(frame); observer.disconnect(); hint.remove();
        scroller.removeEventListener("scroll", schedule, true);
        view.dom.removeEventListener("focusin", schedule);
        view.dom.removeEventListener("focusout", schedule);
        view.dom.removeEventListener("deditor-editable-change", schedule);
      },
    };
  },
}));
