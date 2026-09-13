import { useLayoutEffect, useRef, type MutableRefObject } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { search, searchKeymap, openSearchPanel, getSearchQuery, setSearchQuery, SearchQuery } from "@codemirror/search";
import { islandDark } from "../lib/islandDarkTheme";
import { islandLight } from "../lib/islandLightTheme";
import { tStatic } from "../lib/i18n";

interface SearchPanelState {
  query: string; replacement: string; caseSensitive: boolean; regex: boolean; wholeWord: boolean;
  readonly?: boolean; error?: boolean; count: number; current: number;
}
type SearchAction = "next" | "previous" | "close" | "replace" | "replaceAll";
interface Props extends SearchPanelState {
  theme: "light" | "dark";
  change: (state: SearchPanelState) => void;
  next: () => void; previous: () => void; close: () => void;
  replace: () => void; replaceAll: () => void;
  searchRef: MutableRefObject<HTMLInputElement | null>; replaceRef: MutableRefObject<HTMLInputElement | null>;
}
const queryFor = (state: SearchPanelState) => new SearchQuery({search: state.query, replace: state.replacement,
  caseSensitive: state.caseSensitive, regexp: state.regex, wholeWord: state.wholeWord});

/** Mount the existing CodeMirror search panel unchanged. The empty view owns
 * only the stock controls/query; actions operate on the reading document.
 * No second document, custom panel factory, or copied control markup/styles. */
export default function SearchPanel(props: Props) {
  const host = useRef<HTMLDivElement>(null), current = useRef(props); current.current = props;
  const panelView = useRef<EditorView | null>(null), restoreFocus = useRef<string | null>("search");
  useLayoutEffect(() => {
    const parent = host.current!;
    const previousActive = parent.ownerDocument.activeElement as HTMLElement | null;
    const view = new EditorView({ parent, state: EditorState.create({ extensions: [
      search(), keymap.of(searchKeymap), props.theme === "dark" ? islandDark : islandLight,
      EditorState.readOnly.of(!!props.readonly), EditorView.editable.of(false),
      EditorView.updateListener.of(update => {
        if (!update.transactions.some(tr => tr.effects.some(effect => effect.is(setSearchQuery)))) return;
        const query = getSearchQuery(update.state);
        current.current.change({...current.current, query: query.search, replacement: query.replace,
          caseSensitive: query.caseSensitive, regex: query.regexp, wholeWord: query.wholeWord});
      }),
    ] }) });
    panelView.current = view;
    // Only the native panel is displayed. The empty, non-editable carrier must
    // neither occupy a row nor become another keyboard/editor-bridge target.
    view.scrollDOM.style.display = "none";
    view.contentDOM.tabIndex = -1;
    view.dispatch({ effects: setSearchQuery.of(queryFor(current.current)) });
    openSearchPanel(view);
    const panel = view.dom.querySelector<HTMLElement>(".cm-search")!;
    const field = (name: string) => panel.querySelector<HTMLInputElement>(`input[name="${name}"]`);
    current.current.searchRef.current = field("search"); current.current.replaceRef.current = field("replace");
    // The stock All command requires disjoint editing selections, which the
    // reading editor does not support. Keep its native control, disabled here.
    panel.querySelector<HTMLButtonElement>('button[name="select"]')!.disabled = true;
    const commit = () => {
      const query = new SearchQuery({ search: field("search")!.value, replace: field("replace")?.value ?? current.current.replacement,
        caseSensitive: field("case")!.checked, regexp: field("re")!.checked, wholeWord: field("word")!.checked });
      if (!query.eq(getSearchQuery(view.state))) view.dispatch({effects: setSearchQuery.of(query)});
    };
    const run = (action: SearchAction, event: Event) => {
      event.preventDefault(); event.stopPropagation();
      commit(); current.current[action]();
    };
    const onClick = (event: MouseEvent) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button[name]");
      if (!button || button.disabled) return;
      const actions: Partial<Record<string, SearchAction>> = { next: "next", prev: "previous", close: "close", replace: "replace", replaceAll: "replaceAll" };
      const action = actions[button.name];
      if (action) run(action, event);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
      if (event.key === "Escape") run("close", event);
      else if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.type !== "checkbox")
        run(event.target.name === "replace" ? "replace" : event.shiftKey ? "previous" : "next", event);
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "g") run(event.shiftKey ? "previous" : "next", event);
    };
    // Capture commands before the stock panel would apply them to its empty
    // carrier. Checkbox/query updates still use CodeMirror's own panel logic.
    panel.addEventListener("click", onClick, true);
    panel.addEventListener("keydown", onKey, true);
    panel.addEventListener("input", commit);
    const previousFocus = restoreFocus.current;
    if (previousFocus) (field(previousFocus) ?? field("search"))?.focus({preventScroll: true});
    else if (previousActive?.isConnected) previousActive.focus({preventScroll: true});
    return () => {
      restoreFocus.current = panel.contains(document.activeElement) ? (document.activeElement as HTMLInputElement).name || "search" : null;
      panel.removeEventListener("click", onClick, true); panel.removeEventListener("keydown", onKey, true); panel.removeEventListener("input", commit);
      current.current.searchRef.current = null; current.current.replaceRef.current = null; panelView.current = null; view.destroy();
    };
  }, [props.readonly, props.theme]);
  useLayoutEffect(() => {
    const view = panelView.current; if (!view) return;
    const query = queryFor(props);
    if (!query.eq(getSearchQuery(view.state))) view.dispatch({effects: setSearchQuery.of(query)});
    for (const name of ["next", "prev", "replace", "replaceAll"]) {
      const button = view.dom.querySelector<HTMLButtonElement>(`button[name="${name}"]`);
      if (button) button.disabled = !!props.error || props.count === 0;
    }
  });
  return <div className="deditor-search-footer shrink-0" role="search">
    <div ref={host} />
    <span className="sr-only" role="status">{props.count ? `${props.current} / ${props.count}` : props.query ? tStatic("preview.search.noMatch") : ""}</span>
    {props.error && <span className="sr-only" role="alert">{tStatic("md.search.invalidRegex")}</span>}
  </div>;
}
