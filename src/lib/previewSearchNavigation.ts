import { useSyncExternalStore } from "react";
import { useEditorStore, type EditorPaneId } from "../store/editor";

export interface PreviewSearchHit {
  tabId: string;
  pane: EditorPaneId;
  source: string;
  line: number;
  column: number;
  length: number;
}
let hit: PreviewSearchHit | null = null;
const listeners = new Set<() => void>();
let cleanup: (() => void) | undefined;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const usePreviewSearchHit = () => useSyncExternalStore(subscribe, () => hit);
export function clearPreviewSearchHit() {
  cleanup?.(); cleanup = undefined;
  if (!hit) return;
  hit = null; listeners.forEach(listener => listener());
}
export function publishPreviewSearchHit(next: PreviewSearchHit, editor: HTMLElement) {
  clearPreviewSearchHit();
  hit = next;
  const stop = useEditorStore.subscribe(state => {
    if (state.activeId !== next.tabId || state.activePane !== next.pane || state.markdownMode !== "split" ||
      state.tabs.find(tab => tab.id === next.tabId)?.content !== next.source) clearPreviewSearchHit();
  });
  editor.addEventListener("mousedown", clearPreviewSearchHit, true);
  editor.addEventListener("keydown", clearPreviewSearchHit, true);
  editor.addEventListener("wheel", clearPreviewSearchHit, { passive: true });
  cleanup = () => {
    stop();
    editor.removeEventListener("mousedown", clearPreviewSearchHit, true);
    editor.removeEventListener("keydown", clearPreviewSearchHit, true);
    editor.removeEventListener("wheel", clearPreviewSearchHit);
  };
  listeners.forEach(listener => listener());
}
