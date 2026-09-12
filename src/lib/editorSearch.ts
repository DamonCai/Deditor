import { openSearchPanel } from "@codemirror/search";
import { getActiveView, getActiveViewTabId } from "./editorBridge";
import { useEditorStore } from "../store/editor";

const searchEvent = "deditor-open-search";

/** Visible rich editors own the request; otherwise search the active source editor. */
export function openEditorSearch(replace = false) {
  const event = new CustomEvent(searchEvent, { detail: { replace }, cancelable: true });
  if (!window.dispatchEvent(event)) return true;
  const view = getActiveView();
  if (!view || getActiveViewTabId() !== useEditorStore.getState().activeId) return false;
  openSearchPanel(view);
  view.dom.querySelector<HTMLInputElement>(`.cm-search input[name="${replace && !view.state.readOnly ? "replace" : "search"}"]`)?.focus();
  return true;
}

export function installEditorSearch(open: (replace: boolean) => void, isCurrent = () => true) {
  const handler = (event: Event) => {
    if (event.defaultPrevented || !isCurrent()) return;
    event.preventDefault(); open((event as CustomEvent<{ replace: boolean }>).detail.replace);
  };
  window.addEventListener(searchEvent, handler);
  return () => window.removeEventListener(searchEvent, handler);
}
