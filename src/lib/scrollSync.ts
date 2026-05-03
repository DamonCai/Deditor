import { create } from "zustand";

/** Editor↔Preview scroll sync. Lives in its own store (not the main editor
 *  store) because it changes on every scroll wheel tick — putting it in the
 *  main store would re-arm persistence + wake every component that uses
 *  `useEditorStore`. With its own micro-store, only the two parties that
 *  care (Editor and Preview) subscribe. */
export type ScrollOrigin = "editor" | "preview";
export interface ScrollSyncState {
  line: number;
  from: ScrollOrigin;
}

interface ScrollSyncStore {
  value: ScrollSyncState | null;
  emit: (line: number, from: ScrollOrigin) => void;
  reset: () => void;
}

export const useScrollSyncStore = create<ScrollSyncStore>((set) => ({
  value: null,
  emit: (line, from) => set({ value: { line, from } }),
  reset: () => set({ value: null }),
}));

/** Hook for the consumer side: returns the latest emitted line if it came
 *  from the OTHER party, otherwise undefined. Use as `externalScrollLine`
 *  / `scrollLine` prop in Editor / Preview. */
export function useExternalScrollLine(self: ScrollOrigin): number | undefined {
  return useScrollSyncStore((s) =>
    s.value && s.value.from !== self ? s.value.line : undefined,
  );
}

/** Producer side. Components call this in their onScroll handler. */
export function emitScroll(line: number, from: ScrollOrigin): void {
  useScrollSyncStore.getState().emit(line, from);
}
