import { EditorView as CodeMirrorView } from "@codemirror/view";
import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import type { MarkdownMatch } from "./search";

type Highlights = { matches: MarkdownMatch[]; current: number };
type HighlightState = { search: DecorationSet; navigation: DecorationSet };
export const searchHighlightsKey = new PluginKey<HighlightState>("deditor-search-highlights");
export const navigationHighlightMeta = "deditor-search-navigation-highlight";

function decorations(doc: import("@milkdown/kit/prose/model").Node, update: Highlights) {
  const marks: Decoration[] = [];
  const code = new Map<number, { end: number; matches: { from: number; to: number; current: boolean }[] }>();
  update.matches.forEach((match, index) => {
    if (match.from < 0 || match.to > doc.content.size || match.from >= match.to) return;
    const pos = doc.resolve(match.from), current = index === update.current;
    if (["code_block", "deditor_raw"].includes(pos.parent.type.name)) {
      const from = pos.before(), item = code.get(from) ?? { end: pos.after(), matches: [] };
      item.matches.push({ from: match.from - pos.start(), to: match.to - pos.start(), current }); code.set(from, item);
    } else marks.push(Decoration.inline(match.from, match.to, { class: `preview-search-match${current ? " current" : ""}` }));
  });
  for (const [from, item] of code) marks.push(Decoration.node(from, item.end, {
    "data-search-ranges": JSON.stringify(item.matches),
    ...(item.matches.some(match => match.current) ? { "data-search-current": "true" } : {}),
  }));
  return DecorationSet.create(doc, marks);
}

/** Workspace matches stay painted independently of native focus and the footer search. */
export const markdownSearchHighlights = $prose(() => new Plugin({
  key: searchHighlightsKey,
  state: {
    init: (): HighlightState => ({ search: DecorationSet.empty, navigation: DecorationSet.empty }),
    apply(tr, previous): HighlightState {
      const update = tr.getMeta(searchHighlightsKey) as Highlights | undefined;
      const navigation = tr.getMeta(navigationHighlightMeta) as MarkdownMatch | null | undefined;
      return {
        search: navigation ? DecorationSet.empty : update ? decorations(tr.doc, update) : previous.search.map(tr.mapping, tr.doc),
        navigation: navigation !== undefined
          ? navigation ? decorations(tr.doc, { matches: [navigation], current: 0 }) : DecorationSet.empty
          : tr.docChanged || update?.matches.length ? DecorationSet.empty : previous.navigation.map(tr.mapping, tr.doc),
      };
    },
  },
  props: { decorations: state => {
    const value = searchHighlightsKey.getState(state);
    return value?.search.add(state.doc, value.navigation.find());
  } },
  view(view) {
    // Custom code node views own their DOM, so paint their text without wrapping
    // Shiki spans or feeding DOM mutations back into the document model.
    const doc = view.dom.ownerDocument;
    const win = doc.defaultView as Window & { CSS?: typeof CSS; Highlight?: new (...ranges: Range[]) => Highlight };
    const registry = win.CSS?.highlights;
    const ranges: Range[] = [], current: Range[] = [];
    let frame = 0;
    const owner = {};
    const paint = () => {
      frame = 0; ranges.length = 0; current.length = 0;
      if (!registry || !win.Highlight) return;
      for (const block of view.dom.querySelectorAll<HTMLElement>("[data-search-ranges]")) {
        const matches = JSON.parse(block.dataset.searchRanges!) as {from: number; to: number; current: boolean}[];
        const editor = block.querySelector<HTMLElement>(".cm-editor");
        const cm = editor?.getClientRects().length ? CodeMirrorView.findFromDOM(editor) : null;
        if (cm) {
          for (const match of matches) {
            if (match.to > cm.state.doc.length) continue;
            const from = cm.domAtPos(match.from), to = cm.domAtPos(match.to), range = doc.createRange();
            range.setStart(from.node, from.offset); range.setEnd(to.node, to.offset);
            ranges.push(range); if (match.current) current.push(range);
          }
          continue;
        }
        const content = block.querySelector<HTMLElement>(".md-code-preview pre code");
        if (!content || !content.getClientRects().length) continue;
        const texts: { node: Text; from: number; to: number }[] = [];
        const walker = doc.createTreeWalker(content, NodeFilter.SHOW_TEXT); let size = 0;
        while (walker.nextNode()) { const node = walker.currentNode as Text; texts.push({node, from: size, to: size + node.length}); size += node.length; }
        for (const match of matches) {
          const start = texts.find(text => text.to > match.from), end = texts.find(text => text.to >= match.to);
          if (!start || !end) continue;
          const range = doc.createRange(); range.setStart(start.node, match.from - start.from); range.setEnd(end.node, match.to - end.from);
          ranges.push(range); if (match.current) current.push(range);
        }
      }
      const owners = highlightOwners.get(doc) ?? new Map(); highlightOwners.set(doc, owners);
      owners.set(owner, { ranges: [...ranges], current: [...current] });
      registry.set("deditor-search", new win.Highlight(...Array.from(owners.values()).flatMap(value => value.ranges)));
      registry.set("deditor-search-current", new win.Highlight(...Array.from(owners.values()).flatMap(value => value.current)));
    };
    const schedule = () => { if (!frame) frame = win.requestAnimationFrame(paint); };
    const observer = new MutationObserver(schedule); observer.observe(view.dom, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-search-ranges"] });
    const clearNavigation = () => {
      if (searchHighlightsKey.getState(view.state)?.navigation.find().length) view.dispatch(view.state.tr.setMeta(navigationHighlightMeta, null));
    };
    view.dom.addEventListener("mousedown", clearNavigation, true);
    view.dom.addEventListener("keydown", clearNavigation, true);
    return { update: schedule, destroy() {
      view.dom.removeEventListener("mousedown", clearNavigation, true);
      view.dom.removeEventListener("keydown", clearNavigation, true);
      observer.disconnect(); win.cancelAnimationFrame(frame);
      const owners = highlightOwners.get(doc); owners?.delete(owner);
      if (registry && win.Highlight) {
        for (const [name, field] of [["deditor-search", "ranges"], ["deditor-search-current", "current"]] as const) {
          const remaining = Array.from(owners?.values() ?? []).flatMap(value => value[field]);
          if (remaining.length) registry.set(name, new win.Highlight(...remaining)); else registry.delete(name);
        }
      }
    } };
  },
}));
const highlightOwners = new WeakMap<Document, Map<object, { ranges: Range[]; current: Range[] }>>();

/** ProseMirror's native scroll path is skipped when focus is in the search input. */
export function scrollSearchMatch(view: EditorView, scroller: HTMLElement, match: MarkdownMatch, useHighlight = true) {
  const target = useHighlight ? view.dom.querySelector<HTMLElement>(".preview-search-match.current, [data-search-current]") : null;
  // Source navigation can focus an embedded CodeMirror. ProseMirror only knows
  // the outer code block's box, whereas the DOM range locates the actual match.
  const selection = !useHighlight ? view.dom.ownerDocument.getSelection() : null;
  const selectedRect = selection?.rangeCount && view.dom.contains(selection.anchorNode)
    ? selection.getRangeAt(0).getBoundingClientRect() : null;
  const rect = target?.getBoundingClientRect() ?? (selectedRect?.height ? selectedRect : view.coordsAtPos(match.from));
  const viewport = scroller.getBoundingClientRect();
  scroller.scrollTo({ top: Math.max(0, scroller.scrollTop + rect.top - viewport.top - scroller.clientHeight / 2 + (rect.bottom - rect.top) / 2), behavior: "auto" });
}
