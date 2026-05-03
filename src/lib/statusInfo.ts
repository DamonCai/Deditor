import { create } from "zustand";

/** Lightweight per-active-editor status info pushed by the Editor on doc /
 *  selection changes. Lives in its own micro-store so StatusBar doesn't have
 *  to re-scan the entire doc on every keystroke (the old code did
 *  `content.split('\n')`, `offsetToLineCol`, and `detectEol` per render —
 *  each O(n) in the doc length).
 *
 *  CodeMirror's Text data structure already maintains an O(log n) line
 *  index; we let it do the math and just push the result here. */
export type Eol = "CRLF" | "LF";

export interface StatusInfo {
  line: number;
  col: number;
  totalLines: number;
  charCount: number;
  eol: Eol;
}

const INITIAL: StatusInfo = {
  line: 1,
  col: 1,
  totalLines: 1,
  charCount: 0,
  eol: "LF",
};

interface StatusInfoStore {
  info: StatusInfo;
  set: (patch: Partial<StatusInfo>) => void;
  reset: () => void;
}

export const useStatusInfoStore = create<StatusInfoStore>((set) => ({
  info: INITIAL,
  set: (patch) =>
    set((s) => {
      // Skip the broadcast if every patched key matches what's already there.
      // Cheap nullop guard avoids waking StatusBar 60 times per second when
      // nothing actually changed.
      let changed = false;
      for (const k of Object.keys(patch) as (keyof StatusInfo)[]) {
        if (s.info[k] !== patch[k]) {
          changed = true;
          break;
        }
      }
      return changed ? { info: { ...s.info, ...patch } } : s;
    }),
  reset: () => set({ info: INITIAL }),
}));

export function pushStatusInfo(patch: Partial<StatusInfo>): void {
  useStatusInfoStore.getState().set(patch);
}

export function resetStatusInfo(): void {
  useStatusInfoStore.getState().reset();
}

/** Cheap eol detector — looks at the first newline only. Re-run rarely
 *  (file open / save / external reload), not per keystroke. */
export function detectEol(text: string): Eol {
  const firstNl = text.indexOf("\n");
  if (firstNl > 0 && text.charCodeAt(firstNl - 1) === 13) return "CRLF";
  return "LF";
}
