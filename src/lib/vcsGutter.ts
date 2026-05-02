import { invoke } from "@tauri-apps/api/core";
import {
  RangeSet,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  WidgetType,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

/** Hunk shape returned by `git_file_diff_lines` Rust command. */
interface DiffHunk {
  kind: "A" | "M" | "D";
  start: number;
  end: number;
}

interface BlameLine {
  line: number;
  short_hash: string;
  author: string;
  time: number;
  summary: string;
}

const setHunks = StateEffect.define<DiffHunk[]>();
const setBlame = StateEffect.define<BlameLine[]>();

const hunksField = StateField.define<DiffHunk[]>({
  create: () => [],
  update(hunks, tr) {
    for (const e of tr.effects) if (e.is(setHunks)) return e.value;
    return hunks;
  },
});

const blameField = StateField.define<BlameLine[]>({
  create: () => [],
  update(blame, tr) {
    for (const e of tr.effects) if (e.is(setBlame)) return e.value;
    return blame;
  },
});

class HunkMarker extends GutterMarker {
  constructor(private readonly kind: "A" | "M" | "D") {
    super();
  }
  override toDOM(): HTMLElement {
    const el = document.createElement("div");
    el.style.width = "3px";
    el.style.height = "100%";
    el.style.marginLeft = "2px";
    el.style.background =
      this.kind === "A"
        ? "#5fa570" // added — green
        : this.kind === "D"
          ? "#e55353" // deleted — red
          : "#56a8f5"; // modified — blue
    return el;
  }
}

const ADDED = new HunkMarker("A");
const MODIFIED = new HunkMarker("M");
const DELETED = new HunkMarker("D");

function vcsGutterDef(): Extension {
  return gutter({
    class: "cm-vcs-gutter",
    lineMarker(view, blockInfo) {
      const lineNum =
        view.state.doc.lineAt(blockInfo.from).number;
      const hunks = view.state.field(hunksField, false);
      if (!hunks) return null;
      for (const h of hunks) {
        if (lineNum >= h.start && lineNum <= h.end) {
          return h.kind === "A" ? ADDED : h.kind === "D" ? DELETED : MODIFIED;
        }
      }
      return null;
    },
    initialSpacer: () => ADDED,
  });
}

// ---------------------------------------------------------------------------
// Inline blame on the cursor line

class BlameWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }
  override eq(other: BlameWidget): boolean {
    return other.text === this.text;
  }
  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.style.color = "var(--text-soft)";
    span.style.opacity = "0.6";
    span.style.fontStyle = "italic";
    span.style.marginLeft = "2em";
    span.style.fontSize = "85%";
    span.style.userSelect = "none";
    return span;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

const blameDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet = RangeSet.empty;
    constructor(view: EditorView) {
      this.decorations = build(view);
    }
    update(u: ViewUpdate): void {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.transactions.some((t) =>
          t.effects.some((e) => e.is(setBlame)),
        )
      ) {
        this.decorations = build(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

function build(view: EditorView): DecorationSet {
  const blame = view.state.field(blameField, false);
  if (!blame || blame.length === 0) return RangeSet.empty;
  const cursor = view.state.selection.main.head;
  const line = view.state.doc.lineAt(cursor);
  const entry = blame.find((b) => b.line === line.number);
  if (!entry) return RangeSet.empty;
  const text = formatBlame(entry);
  return Decoration.set([
    Decoration.widget({
      widget: new BlameWidget(text),
      side: 1,
    }).range(line.to),
  ]);
}

function formatBlame(b: BlameLine): string {
  const ago = b.time > 0 ? humanizeAgo(Date.now() / 1000 - b.time) : "";
  const parts = [b.author];
  if (ago) parts.push(ago);
  parts.push(b.short_hash);
  return parts.join(" · ");
}

function humanizeAgo(seconds: number): string {
  const min = 60,
    hour = 60 * min,
    day = 24 * hour,
    week = 7 * day,
    month = 30 * day,
    year = 365 * day;
  if (seconds < min) return "just now";
  if (seconds < hour) return `${Math.floor(seconds / min)}m ago`;
  if (seconds < day) return `${Math.floor(seconds / hour)}h ago`;
  if (seconds < week) return `${Math.floor(seconds / day)}d ago`;
  if (seconds < month) return `${Math.floor(seconds / week)}w ago`;
  if (seconds < year) return `${Math.floor(seconds / month)}mo ago`;
  return `${Math.floor(seconds / year)}y ago`;
}

// ---------------------------------------------------------------------------
// Public API

export function vcsExtensions(): Extension {
  // Both fields + gutter live together; the markers extension is always
  // installed but renders nothing when the fields are empty (cheap).
  return [hunksField, blameField, vcsGutterDef(), blameDecorations];
}

/** Push a fresh diff into a view. Caller decides when (typically on file
 *  load + on save). Pass [] to clear. */
export function dispatchHunks(view: EditorView, hunks: DiffHunk[]): void {
  view.dispatch({ effects: setHunks.of(hunks) });
}

export function dispatchBlame(view: EditorView, blame: BlameLine[]): void {
  view.dispatch({ effects: setBlame.of(blame) });
}

/** Convenience: query both diff hunks and blame for a workspace+file pair
 *  and dispatch them into the view. Errors swallowed (file not in repo /
 *  binary / etc. → no markers, no blame; that's the right empty state). */
export async function refreshVcsForView(
  view: EditorView,
  workspace: string,
  filePath: string,
  opts: { gutterEnabled: boolean; blameEnabled: boolean },
): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  if (opts.gutterEnabled) {
    tasks.push(
      invoke<DiffHunk[]>("git_file_diff_lines", {
        workspace,
        path: filePath,
        vsIndex: false,
      })
        .then((h) => dispatchHunks(view, h))
        .catch(() => dispatchHunks(view, [])),
    );
  } else {
    dispatchHunks(view, []);
  }
  if (opts.blameEnabled) {
    tasks.push(
      invoke<BlameLine[]>("git_blame", {
        workspace,
        path: filePath,
      })
        .then((b) => dispatchBlame(view, b))
        .catch(() => dispatchBlame(view, [])),
    );
  } else {
    dispatchBlame(view, []);
  }
  await Promise.all(tasks);
}
