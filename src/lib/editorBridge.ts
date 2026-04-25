import type { EditorView } from "@codemirror/view";

// Module-level handle to the current active editor view.
// The Editor component registers/unregisters itself on mount/unmount,
// other UI (toolbar) calls helpers below to operate on it.

let currentView: EditorView | null = null;

export function setActiveView(v: EditorView | null): void {
  currentView = v;
}

export function getActiveView(): EditorView | null {
  return currentView;
}

function withView(fn: (v: EditorView) => void): void {
  const v = currentView;
  if (!v) return;
  fn(v);
  v.focus();
}

/** Wrap current selection with prefix/suffix (e.g. **bold**, _italic_). */
export function wrapSelection(prefix: string, suffix: string = prefix): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    const insert = prefix + selected + suffix;
    view.dispatch({
      changes: { from, to, insert },
      selection: {
        anchor: from + prefix.length,
        head: from + prefix.length + selected.length,
      },
    });
  });
}

/** Add a prefix to the start of every selected line (e.g. "# ", "- ", "> "). */
export function prefixLines(prefix: string): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const startLine = view.state.doc.lineAt(from);
    const endLine = view.state.doc.lineAt(to);
    const changes = [];
    for (let n = startLine.number; n <= endLine.number; n++) {
      const ln = view.state.doc.line(n);
      changes.push({ from: ln.from, insert: prefix });
    }
    view.dispatch({ changes });
  });
}

/** Insert a literal block at the cursor (or replace selection). */
export function insertText(text: string, cursorOffset?: number): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: {
        anchor: from + (cursorOffset ?? text.length),
      },
    });
  });
}

/** Insert a fenced code block, leaving cursor inside. */
export function insertCodeBlock(lang = ""): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const sel = view.state.sliceDoc(from, to);
    const opening = `\`\`\`${lang}\n`;
    const closing = `\n\`\`\`\n`;
    const text = opening + sel + closing;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: {
        anchor: from + opening.length,
        head: from + opening.length + sel.length,
      },
    });
  });
}

/** Insert a link. If selection exists, use it as link text. */
export function insertLink(url: string, displayText?: string): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const sel = view.state.sliceDoc(from, to);
    const text = displayText ?? sel ?? "链接";
    const insert = `[${text}](${url})`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
  });
}
