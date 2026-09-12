import { MarkdownDocument } from "./document";
import { setBlockType, toggleMark, wrapIn, lift } from "@milkdown/kit/prose/commands";
import { wrapInList, liftListItem } from "@milkdown/kit/prose/schema-list";
import { Slice } from "@milkdown/kit/prose/model";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { VisualEditorBridge } from "../markdownVisualBridge";
import { getVisualEditor } from "../markdownVisualBridge";
import { tStatic } from "../i18n";
const names: Record<string, string> = { "**": "strong", "*": "emphasis", "~~": "strike_through", "`": "inlineCode", "<u>": "deditor_underline", "<sup>": "deditor_sup", "<sub>": "deditor_sub" };
export function visualCommands(view: EditorView, tabId: string, parse: (s: string) => ProseNode, boundary: () => void): VisualEditorBridge {
  const { from, to, $from } = view.state.selection;
  const selected = view.state.doc.textBetween(from, to, "\n");
  let projectedMarks: readonly import("@milkdown/kit/prose/model").Mark[] | undefined;
  const currentMarks = () => {
    if ($from.parent.type.name !== "deditor_inline_source") return view.state.storedMarks ?? $from.marks();
    if (projectedMarks) return projectedMarks;
    // Source projections intentionally have no marks. Read the small inline
    // fragment at its source caret so toolbar state still describes its format.
    const raw = $from.parent.textContent, parsed = parse(raw);
    const mapped = new MarkdownDocument(raw, parse, () => raw, false, parsed);
    const at = parsed.resolve(mapped.positionAtSource($from.parentOffset));
    projectedMarks = at.marks();
    if (!projectedMarks.length && $from.parentOffset > 0 && $from.parentOffset < raw.length) projectedMarks = at.nodeBefore?.marks ?? at.nodeAfter?.marks ?? projectedMarks;
    return projectedMarks;
  };
  const focus = () => view.focus();
  const insert = (markdown: string, block: boolean) => {
    boundary();
    const parsed = parse(markdown);
    const slice = !block && parsed.childCount === 1 && parsed.firstChild?.type.name === "paragraph"
      ? new Slice(parsed.firstChild.content, 0, 0) : new Slice(parsed.content, 0, 0);
    const { $from, empty } = view.state.selection;
    const tr = view.state.tr;
    if (empty && slice.openStart === 0 && slice.content.firstChild?.isBlock && $from.depth === 1 && $from.parent.content.size > 0 && ($from.parentOffset === 0 || $from.parentOffset === $from.parent.content.size)) {
      const at = $from.parentOffset === 0 ? $from.before() : $from.after();
      tr.replaceRange(at, at, slice);
    } else tr.replaceSelection(slice);
    view.dispatch(tr.scrollIntoView()); boundary(); focus();
  };
  return { tabId, editable: view.editable, selected,
    heading: $from.parent.type.name === "heading" ? $from.parent.attrs.level : 0,
    focus, insert,
    marked: marker => {
      const mark = view.state.schema.marks[names[marker]];
      return !!mark && (from === to ? !!mark.isInSet(currentMarks()) : view.state.doc.rangeHasMark(from, to, mark));
    },
    wrap(prefix, suffix) {
      const mark = view.state.schema.marks[names[prefix]];
      boundary();
      if (mark) toggleMark(mark)(view.state, view.dispatch);
      else insert(prefix + selected + suffix, false);
      boundary(); focus();
    },
    prefix(prefix) {
      boundary();
      const { nodes } = view.state.schema;
      const { $from } = view.state.selection;
      if (/^#{1,6} $/.test(prefix)) setBlockType(nodes.heading, { level: prefix.trim().length })(view.state, view.dispatch);
      else if (!prefix) setBlockType(nodes.paragraph)(view.state, view.dispatch);
      else if (prefix === "> ") {
        if ($from.depth > 1 && $from.node($from.depth - 1).type === nodes.blockquote) lift(view.state, view.dispatch);
        else wrapIn(nodes.blockquote)(view.state, view.dispatch);
      } else {
        const type = prefix === "1. " ? nodes.ordered_list : nodes.bullet_list;
        const selectedItems = () => {
          const { doc, selection } = view.state, items = new Set<number>();
          // Include the owner of each selected textblock, not its list ancestors.
          doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (!node.isTextblock) return;
            const at = doc.resolve(pos + 1);
            for (let depth = at.depth; depth > 0; depth--) {
              if (at.node(depth).type === nodes.list_item) { items.add(at.before(depth)); break; }
            }
          });
          return [...items];
        };
        const taskItems = prefix === "- [ ] " ? selectedItems() : [];
        const removeTasks = taskItems.length > 0 && taskItems.every(pos => typeof view.state.doc.nodeAt(pos)?.attrs.checked === "boolean");
        let listDepth = $from.depth;
        while (listDepth > 0 && ![nodes.bullet_list, nodes.ordered_list].includes($from.node(listDepth).type)) listDepth--;
        if (removeTasks) {
          const tr = view.state.tr;
          for (const pos of taskItems) tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, checked: null, taskIndent: 0 });
          view.dispatch(tr);
          liftListItem(nodes.list_item)(view.state, view.dispatch);
        }
        else if (listDepth && prefix !== "- [ ] " && $from.node(listDepth).type === type) liftListItem(nodes.list_item)(view.state, view.dispatch);
        else if (listDepth && $from.node(listDepth).type !== type) view.dispatch(view.state.tr.setNodeMarkup($from.before(listDepth), type));
        else if (!listDepth && type) wrapInList(type)(view.state, view.dispatch);
        if (prefix === "- [ ] " && !removeTasks) {
          const tr = view.state.tr;
          for (const pos of selectedItems()) {
            const item = tr.doc.nodeAt(pos)!;
            if (item.attrs.checked == null) tr.setNodeMarkup(pos, undefined, { ...item.attrs, checked: false });
          }
          if (tr.docChanged) view.dispatch(tr);
        }
      }
      focus();
    },
    color(property, color) {
      boundary();
      const type = view.state.schema.marks[property === "color" ? "deditor_color" : "deditor_background"];
      const mark = type.create({ color });
      const { from, to } = view.state.selection;
      const tr = view.state.tr;
      if (from === to) tr.addStoredMark(mark); else tr.addMark(from, to, mark);
      view.dispatch(tr); focus();
    },
    link(url, text) {
      boundary();
      const { from: start, to: end } = view.state.selection;
      const label = text || selected || tStatic("md.linkDefaultText");
      const mark = view.state.schema.marks.link.create({ href: url.trim() });
      view.dispatch(view.state.tr.replaceWith(start, end, view.state.schema.text(label, [mark])).scrollIntoView()); focus();
    },
    capture() {
      const captured = view.state.doc, selection = view.state.selection;
      return { selected, apply(action) {
        if (getVisualEditor()?.tabId !== tabId || !view.editable || view.state.doc !== captured || view.isDestroyed) return false;
        view.dispatch(view.state.tr.setSelection(selection));
        action(); return true;
      } };
    },
  };
}
