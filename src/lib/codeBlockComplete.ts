import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { EditorView } from "@codemirror/view";
import type { EditorState, Extension } from "@codemirror/state";

// Languages offered for ``` fenced code block info-string. Order = display order.
// Diagrams first (DEditor renders them via plantumlHydrate / mermaid), then the
// most common languages, then the long tail. Aliases (sh / shell, js / javascript)
// are kept because authors reach for whichever they remember first.
const LANGUAGES: { label: string; detail?: string }[] = [
  { label: "mermaid", detail: "Mermaid" },
  { label: "plantuml", detail: "PlantUML" },
  { label: "javascript" },
  { label: "typescript" },
  { label: "jsx" },
  { label: "tsx" },
  { label: "python" },
  { label: "java" },
  { label: "go" },
  { label: "rust" },
  { label: "c" },
  { label: "cpp" },
  { label: "csharp" },
  { label: "kotlin" },
  { label: "scala" },
  { label: "swift" },
  { label: "html" },
  { label: "css" },
  { label: "scss" },
  { label: "sass" },
  { label: "less" },
  { label: "vue" },
  { label: "svelte" },
  { label: "json" },
  { label: "jsonc" },
  { label: "yaml" },
  { label: "toml" },
  { label: "xml" },
  { label: "ini" },
  { label: "sql" },
  { label: "php" },
  { label: "ruby" },
  { label: "lua" },
  { label: "perl" },
  { label: "bash" },
  { label: "shell" },
  { label: "sh" },
  { label: "zsh" },
  { label: "fish" },
  { label: "powershell" },
  { label: "dockerfile" },
  { label: "makefile" },
  { label: "diff" },
  { label: "markdown" },
  { label: "text" },
];

// True at line-start fences like ```, ```py, ```python — three-or-more backticks
// at column 0 with an optional partial language name and nothing else after.
const FENCE_RE = /^(`{3,})([A-Za-z0-9_+#\-]*)$/;

/** Look ahead a bounded window for an existing closing fence. If found, the
 *  user is editing an already-paired block, so we skip auto-close to avoid
 *  duplicating the bottom fence. 100 lines covers any realistic code block. */
function hasClosingFenceAhead(state: EditorState, fromLine: number): boolean {
  const max = Math.min(state.doc.lines, fromLine + 100);
  for (let n = fromLine + 1; n <= max; n++) {
    if (/^`{3,}\s*$/.test(state.doc.line(n).text)) return true;
  }
  return false;
}

function applyLanguage(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
): void {
  const label = completion.label;
  const state = view.state;
  const openLine = state.doc.lineAt(from);
  // Match the opening fence width (3 backticks → close with 3, 4 → close with 4).
  const m = /^(`{3,})/.exec(openLine.text);
  const fence = m ? m[1] : "```";
  if (hasClosingFenceAhead(state, openLine.number)) {
    view.dispatch({
      changes: { from, to, insert: label },
      selection: { anchor: from + label.length },
      scrollIntoView: true,
      userEvent: "input.complete",
    });
    return;
  }
  const insert = `${label}\n\n${fence}`;
  view.dispatch({
    changes: { from, to, insert },
    // Land on the empty line between the two fences.
    selection: { anchor: from + label.length + 1 },
    scrollIntoView: true,
    userEvent: "input.complete",
  });
}

function codeBlockSource(ctx: CompletionContext): CompletionResult | null {
  const line = ctx.state.doc.lineAt(ctx.pos);
  const before = ctx.state.doc.sliceString(line.from, ctx.pos);
  const m = FENCE_RE.exec(before);
  if (!m) return null;
  return {
    from: line.from + m[1].length,
    options: LANGUAGES.map((l) => ({
      label: l.label,
      type: "keyword",
      detail: l.detail,
      apply: applyLanguage,
    })),
    validFor: /^[A-Za-z0-9_+#\-]*$/,
  };
}

/** When the user just typed the third backtick on an otherwise-empty line, pop
 *  the menu open. Without this, CodeMirror only auto-opens completion for word
 *  characters; backticks aren't word chars so the menu would only show after
 *  the next keystroke. */
const triggerOnFence = EditorView.updateListener.of((u) => {
  if (!u.docChanged) return;
  let typedBacktick = false;
  for (const tr of u.transactions) {
    if (!tr.isUserEvent("input.type") && !tr.isUserEvent("input")) continue;
    tr.changes.iterChanges((_fa, _ta, _fb, _tb, inserted) => {
      if (inserted.toString().includes("`")) typedBacktick = true;
    });
  }
  if (!typedBacktick) return;
  const view = u.view;
  const pos = u.state.selection.main.head;
  const line = u.state.doc.lineAt(pos);
  const before = u.state.doc.sliceString(line.from, pos);
  if (FENCE_RE.test(before)) {
    requestAnimationFrame(() => startCompletion(view));
  }
});

/** Bundle: autocomplete with our fence-only source + the explicit trigger. */
export function codeBlockCompletion(): Extension {
  return [
    autocompletion({
      override: [codeBlockSource],
      activateOnTyping: true,
      closeOnBlur: true,
      icons: false,
    }),
    triggerOnFence,
  ];
}
