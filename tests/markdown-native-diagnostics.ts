// Opt-in only: add this entry to an isolated review snapshot's index.html.
// It observes self-created /tmp/deditor-* fixtures; production does not import it.
import { useEditorStore } from "../src/store/editor";
import { logInfo } from "../src/lib/logger";

let sequence = 0;
function record(kind: string, event?: Event) {
  const state = useEditorStore.getState(), tab = state.tabs.find(tab => tab.id === state.activeId);
  if (!tab?.filePath?.startsWith("/tmp/deditor-")) return;
  const target = event?.target as HTMLElement | null, selection = document.getSelection();
  const scroller = document.querySelector<HTMLElement>(".md-visual-scroll");
  const caret = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
  logInfo("MD_NATIVE_TRACE " + JSON.stringify({ seq: ++sequence, time: performance.now(), kind,
    target: target?.className, data: (event as InputEvent)?.data, inputType: (event as InputEvent)?.inputType,
    isComposing: (event as InputEvent)?.isComposing, key: (event as KeyboardEvent)?.key,
    scrollTop: scroller?.scrollTop, caretTop: caret?.top, caretBottom: caret?.bottom,
    mode: state.markdownMode, cursor: state.tabPositions[tab.id]?.cursor,
    sourceHead: tab.content.slice(0, 240), chars: tab.content.length,
  }));
}
for (const kind of ["compositionstart", "compositionupdate", "compositionend", "beforeinput", "input", "keydown", "focusin", "focusout"]) {
  document.addEventListener(kind, event => { record(kind, event); if (kind === "compositionend") setTimeout(() => record("composition-settled"), 80); }, true);
}
useEditorStore.subscribe((state, before) => {
  const id = state.activeId;
  if (state.tabs.find(tab => tab.id === id)?.content !== before.tabs.find(tab => tab.id === id)?.content) record("source-change");
});
