import type { MarkdownDocumentSnapshot } from "./markdownVisual/document";
/** Markdown history owns source edits from both views. Editors are projections. */
export type MarkdownOrigin = "source" | "visual" | "command";
export interface SourceChange { from: number; removed: string; inserted: string }
export function sourceChange(before: string, after: string): SourceChange {
  if (before === after) return { from: before.length, removed: "", inserted: "" };
  // Compare long unchanged ranges with native string equality. Only the edges
  // need UTF-16 code-unit scanning; preserve the original prefix-first result.
  const chunk = 1024;
  const commonLength = Math.min(before.length, after.length);
  let from = 0;
  while (from + chunk <= commonLength && before[from] === after[from]
    && before.slice(from, from + chunk) === after.slice(from, from + chunk)) from += chunk;
  while (from < commonLength && before[from] === after[from]) from++;
  let end = before.length, nextEnd = after.length;
  while (end - chunk >= from && nextEnd - chunk >= from && before[end - 1] === after[nextEnd - 1]
    && before.slice(end - chunk, end) === after.slice(nextEnd - chunk, nextEnd)) { end -= chunk; nextEnd -= chunk; }
  while (end > from && nextEnd > from && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
  return { from, removed: before.slice(from, end), inserted: after.slice(from, nextEnd) };
}
export interface SourceSelection { anchor: number; head: number }
export interface VisualHistoryState { document: MarkdownDocumentSnapshot; selection: SourceSelection; selectionJSON?: Record<string, unknown>; sourceSelection: SourceSelection }
interface Entry { changes: SourceChange[]; origin: MarkdownOrigin; time: number; beforeVisual?: VisualHistoryState; afterVisual?: VisualHistoryState }
export class MarkdownSession {
  version = 0;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private boundary = true;
  private restoredVisual: VisualHistoryState | null = null;
  private composition: { source: string; origin: MarkdownOrigin } | null = null;
  visualSelection = { anchor: 1, head: 1 };
  visualScroll = 0;
  sourceCursor: number | null = null;
  constructor(public source: string) {}
  get canUndo() { return this.past.length > 0 || !!this.composition && this.composition.source !== this.source; }
  get canRedo() { return this.future.length > 0 && (!this.composition || this.composition.source === this.source); }
  get composing() { return this.composition !== null; }
  breakGroup() { this.boundary = true; }
  recordVisual(before: VisualHistoryState | null, after: VisualHistoryState | null) {
    const entry = this.past.at(-1);
    if (entry && !this.composition) {
      if (entry.changes.length === 1) entry.beforeVisual = before ?? undefined;
      entry.afterVisual = after ?? undefined;
    }
  }
  takeHistoryVisual() {
    const visual = this.restoredVisual; this.restoredVisual = null; return visual;
  }
  private restoreVisual(visual?: VisualHistoryState) {
    this.restoredVisual = visual ?? null;
    if (visual) this.sourceCursor = visual.sourceSelection.head;
  }
  beginComposition(origin: MarkdownOrigin = "visual") {
    this.endComposition();
    this.boundary = true;
    this.composition = { source: this.source, origin };
  }
  endComposition() {
    const composition = this.composition;
    this.composition = null;
    if (!composition) return;
    if (composition.source !== this.source) {
      this.past.push({ changes: [sourceChange(composition.source, this.source)], origin: composition.origin, time: Date.now() });
      if (this.past.length > 500) this.past.shift();
      this.future = [];
    }
    this.boundary = true;
  }
  sync(source: string) {
    if (source === this.source) return;
    this.source = source;
    this.restoredVisual = null;
    this.composition = null;
    this.past = []; this.future = []; this.boundary = true; this.version++;
  }
  commit(source: string, origin: MarkdownOrigin, time = Date.now()) {
    if (this.composition && origin !== this.composition.origin) this.endComposition();
    if (source === this.source) return false;
    this.restoredVisual = null;
    // Provisional candidate replacements are one edit, even with long pauses.
    // A cancelled composition must also retain the redo branch it started from.
    if (this.composition) { this.source = source; this.version++; return true; }
    const change = sourceChange(this.source, source);
    const last = this.past.at(-1);
    const previous = last?.changes.at(-1);
    const nearby = previous && change.from <= previous.from + previous.inserted.length + 1 && change.from + change.removed.length >= previous.from - 1;
    if (!this.boundary && origin !== "command" && last?.origin === origin && time - last.time < 750 && nearby) {
      last.changes.push(change); last.time = time; last.afterVisual = undefined;
    } else {
      this.past.push({ changes: [change], origin, time });
      if (this.past.length > 500) this.past.shift();
    }
    this.source = source; this.future = []; this.boundary = false; this.version++;
    return true;
  }
  undo() {
    this.endComposition();
    const entry = this.past.pop();
    if (!entry) return false;
    for (const c of [...entry.changes].reverse()) this.source = this.source.slice(0, c.from) + c.removed + this.source.slice(c.from + c.inserted.length);
    this.restoreVisual(entry.beforeVisual);
    this.future.push(entry); this.boundary = true; this.version++; return true;
  }
  redo() {
    this.endComposition();
    const entry = this.future.pop();
    if (!entry) return false;
    for (const c of entry.changes) this.source = this.source.slice(0, c.from) + c.inserted + this.source.slice(c.from + c.removed.length);
    this.restoreVisual(entry.afterVisual);
    this.past.push(entry); this.boundary = true; this.version++; return true;
  }
}
const sessions = new Map<string, MarkdownSession>();
export function markdownSession(id: string, source: string) {
  let session = sessions.get(id);
  if (!session) { session = new MarkdownSession(source); sessions.set(id, session); }
  else session.sync(source);
  return session;
}
export function dropMarkdownSession(id: string) { sessions.delete(id); }
