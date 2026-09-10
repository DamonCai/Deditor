import type { EditorView } from "@codemirror/view";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { isolateHistory } from "@codemirror/commands";
import { tStatic } from "./i18n";

let currentView: EditorView | null = null;
let currentTabId: string | undefined;
let currentContent: string | undefined;
const listeners = new Set<() => void>();
export const subscribeActiveEditor = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const getActiveEditorState = (): EditorState | null =>
  currentView?.state ?? null;
export function notifyActiveEditor() {
  listeners.forEach((listener) => listener());
}
export function getActiveViewContent() {
  return currentContent;
}
export function getActiveViewTabId() {
  return currentTabId;
}

export function setActiveView(
  v: EditorView | null,
  tabId?: string,
  content?: string,
): void {
  currentView = v;
  currentTabId = v ? tabId : undefined;
  currentContent = v ? (content ?? v.state.doc.toString()) : undefined;
  notifyActiveEditor();
}
export function getActiveView(): EditorView | null {
  return currentView;
}
function withView(fn: (v: EditorView) => void): void {
  if (!currentView) return;
  fn(currentView);
  currentView.focus();
}

/** Toggle inline markers, preserving the inner selection for the next action. */
export function wrapSelection(prefix: string, suffix = prefix): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const selected = view.state.sliceDoc(from, to);
    if (prefix === "`" && suffix === "`") {
      const left = view.state
        .sliceDoc(view.state.doc.lineAt(from).from, from)
        .match(/(`+)( ?)$/);
      const right = view.state
        .sliceDoc(to, view.state.doc.lineAt(to).to)
        .match(/^( ?)(`+)/);
      const selectedLeft = selected.match(/^`+/)?.[0];
      const selectedRight = selected.match(/`+$/)?.[0];
      if (left && right && left[1].length === right[2].length) {
        prefix = left[1] + left[2];
        suffix = right[1] + right[2];
      } else if (
        selectedLeft &&
        selectedLeft === selectedRight &&
        selected.length > selectedLeft.length * 2
      ) {
        prefix = suffix = selectedLeft;
      } else if (selected.includes("`")) {
        const length =
          Array.from(selected.matchAll(/`+/g)).reduce(
            (max, m) => Math.max(max, m[0].length),
            0,
          ) + 1;
        const padding =
          selected.startsWith("`") || selected.endsWith("`") ? " " : "";
        prefix = "`".repeat(length) + padding;
        suffix = padding + "`".repeat(length);
      }
    }
    const before = view.state.sliceDoc(Math.max(0, from - prefix.length), from);
    const after = view.state.sliceDoc(to, to + suffix.length);
    // A single asterisk must not strip one half of a bold marker.
    const starsBefore = view.state.sliceDoc(Math.max(0, from - 3), from);
    const isBold =
      prefix === "*" &&
      ((starsBefore.endsWith("**") && !starsBefore.endsWith("***")) ||
        (selected.startsWith("**") && !selected.startsWith("***")));
    if (!isBold && before === prefix && after === suffix) {
      view.dispatch({
        changes: [
          { from: from - prefix.length, to: from },
          { from: to, to: to + suffix.length },
        ],
        selection: { anchor: from - prefix.length, head: to - prefix.length },
        annotations: isolateHistory.of("full"),
      });
    } else if (
      !isBold &&
      selected.length >= prefix.length + suffix.length &&
      selected.startsWith(prefix) &&
      selected.endsWith(suffix)
    ) {
      const text = selected.slice(prefix.length, -suffix.length);
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from, head: from + text.length },
        annotations: isolateHistory.of("full"),
      });
    } else {
      view.dispatch({
        changes: { from, to, insert: prefix + selected + suffix },
        selection: { anchor: from + prefix.length, head: to + prefix.length },
        annotations: isolateHistory.of("full"),
      });
    }
  });
}

/** Set headings or toggle list/quote prefixes on precisely the selected lines. */
export function prefixLines(prefix: string): void {
  withView((view) => {
    const numbers = new Set<number>();
    for (const { from, to } of view.state.selection.ranges) {
      const first = view.state.doc.lineAt(from).number;
      // A selection ending at column zero does not include that next line.
      const last = view.state.doc.lineAt(to > from ? to - 1 : to).number;
      for (let n = first; n <= last; n++) numbers.add(n);
    }
    const lines = [...numbers]
      .sort((a, b) => a - b)
      .map((n) => view.state.doc.line(n));
    const heading = /^(#{1,6} )$/.test(prefix) || prefix === "";
    const quote = prefix === "> ";
    const marker = heading
      ? /^(\s{0,3})(?:#{1,6}\s+)?/
      : quote
        ? /^(\s*)(?:>\s?)?/
        : /^(\s*)(?:(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/;
    const parsed = lines.map((line) => ({
      line,
      match: line.text.match(marker)!,
    }));
    const allMatch =
      prefix !== "" &&
      parsed.every(({ match }) => {
        const old = match[0].slice(match[1].length);
        return prefix === "1. "
          ? /^\d+[.)]\s+$/.test(old)
          : prefix === "- [ ] "
            ? /^[-+*]\s+\[[ xX]\]\s+$/.test(old)
            : old === prefix;
      });
    const changes = parsed.map(({ line, match }, index) => ({
      from: line.from + match[1].length,
      to: line.from + match[0].length,
      insert: allMatch ? "" : prefix === "1. " ? `${index + 1}. ` : prefix,
    }));
    view.dispatch({ changes, annotations: isolateHistory.of("full") });
  });
}

/** Literal inline insertion. */
export function insertText(text: string, cursorOffset?: number): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + (cursorOffset ?? text.length) },
      annotations: isolateHistory.of("full"),
    });
  });
}

/** Isolate a block from surrounding paragraphs, including a mid-line caret. */
export function insertBlock(
  text: string,
  selectionStart = 0,
  selectionLength = text.length,
): void {
  withView((view) => {
    const { from, to } = view.state.selection.main;
    const before = view.state.sliceDoc(Math.max(0, from - 2), from);
    const after = view.state.sliceDoc(
      to,
      Math.min(view.state.doc.length, to + 2),
    );
    const leading =
      from === 0
        ? ""
        : before.endsWith("\n\n")
          ? ""
          : before.endsWith("\n")
            ? "\n"
            : "\n\n";
    const trailing =
      to === view.state.doc.length
        ? "\n"
        : after.startsWith("\n\n")
          ? ""
          : after.startsWith("\n")
            ? "\n"
            : "\n\n";
    const anchor = from + leading.length + selectionStart;
    view.dispatch({
      changes: { from, to, insert: leading + text + trailing },
      selection: EditorSelection.single(anchor, anchor + selectionLength),
      annotations: isolateHistory.of("full"),
    });
  });
}
export function insertCodeBlock(lang = ""): void {
  const view = currentView;
  if (!view) return;
  const selected = view.state.sliceDoc(
    view.state.selection.main.from,
    view.state.selection.main.to,
  );
  const longest = Array.from(selected.matchAll(/`+/g)).reduce(
    (max, m) => Math.max(max, m[0].length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longest + 1));
  const opening = `${fence}${lang.replace(/[\r\n`]/g, "")}\n`;
  insertBlock(
    opening + selected + `\n${fence}`,
    opening.length,
    selected.length,
  );
}

export function escapeMarkdownLabel(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/([\[\]])/g, "\\$1")
    .replace(/[\r\n]+/g, " ");
}
export function markdownDestination(url: string): string {
  return `<${url.trim().replace(/[<>\r\n]/g, (c) => encodeURIComponent(c))}>`;
}
export function insertLink(url: string, displayText?: string): void {
  const view = currentView;
  if (!view) return;
  const { from, to } = view.state.selection.main;
  const label = escapeMarkdownLabel(
    displayText ||
      view.state.sliceDoc(from, to) ||
      tStatic("md.linkDefaultText"),
  );
  insertText(`[${label}](${markdownDestination(url)})`);
}

/** A dialog must never apply its captured selection to a different/edited tab. */
export function captureEditorTarget() {
  const view = currentView;
  if (!view) return null;
  const { from, to } = view.state.selection.main;
  const doc = view.state.doc;
  return {
    selected: view.state.sliceDoc(from, to),
    apply(action: () => void): boolean {
      if (currentView !== view || view.state.doc !== doc) return false;
      view.dispatch({ selection: { anchor: from, head: to } });
      action();
      return true;
    },
  };
}
