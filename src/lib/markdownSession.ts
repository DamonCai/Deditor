/** Markdown history owns source edits from both views. Editors are projections. */
export type MarkdownOrigin = "source" | "visual" | "command";
export interface SourceChange { from: number; removed: string; inserted: string }
export function sourceChange(before: string, after: string): SourceChange {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let end = before.length, nextEnd = after.length;
  while (end > from && nextEnd > from && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
  return { from, removed: before.slice(from, end), inserted: after.slice(from, nextEnd) };
}
interface Entry { changes: SourceChange[]; origin: MarkdownOrigin; time: number }
export class MarkdownSession {
  version = 0;
  private past: Entry[] = [];
  private future: Entry[] = [];
  private boundary = true;
  visualSelection = { anchor: 1, head: 1 };
  visualScroll = 0;
  sourceCursor: number | null = null;
  constructor(public source: string) {}
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  breakGroup() { this.boundary = true; }
  sync(source: string) {
    if (source === this.source) return;
    this.source = source;
    this.past = []; this.future = []; this.boundary = true; this.version++;
  }
  commit(source: string, origin: MarkdownOrigin, time = Date.now()) {
    if (source === this.source) return false;
    const change = sourceChange(this.source, source);
    const last = this.past.at(-1);
    const previous = last?.changes.at(-1);
    const nearby = previous && change.from <= previous.from + previous.inserted.length + 1 && change.from + change.removed.length >= previous.from - 1;
    if (!this.boundary && origin !== "command" && last?.origin === origin && time - last.time < 750 && nearby) {
      last.changes.push(change); last.time = time;
    } else {
      this.past.push({ changes: [change], origin, time });
      if (this.past.length > 500) this.past.shift();
    }
    this.source = source; this.future = []; this.boundary = false; this.version++;
    return true;
  }
  undo() {
    const entry = this.past.pop();
    if (!entry) return false;
    for (const c of [...entry.changes].reverse()) this.source = this.source.slice(0, c.from) + c.removed + this.source.slice(c.from + c.inserted.length);
    this.future.push(entry); this.boundary = true; this.version++; return true;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return false;
    for (const c of entry.changes) this.source = this.source.slice(0, c.from) + c.inserted + this.source.slice(c.from + c.removed.length);
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
