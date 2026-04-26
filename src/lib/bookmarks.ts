import { StateField, StateEffect, RangeSet, EditorState, RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";

/** Bookmark a line by anchoring a zero-length range at the line's start.
 *  RangeSet.map() automatically tracks the position through edits, so a line
 *  bookmarked at "line 12" stays anchored to that text even after the user
 *  inserts lines above. */

export const toggleBookmarkEffect = StateEffect.define<{ from: number }>();
export const clearBookmarksEffect = StateEffect.define<null>();

const bookmarkMark = Decoration.line({
  attributes: { class: "cm-bookmark-line" },
});

export const bookmarkField = StateField.define<DecorationSet>({
  create: () => RangeSet.empty,
  update(set, tr) {
    let next = set.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(clearBookmarksEffect)) {
        next = RangeSet.empty;
      } else if (e.is(toggleBookmarkEffect)) {
        const pos = tr.state.doc.lineAt(e.value.from).from;
        // Check if a bookmark already exists on this line.
        let exists = false;
        next.between(pos, pos, () => {
          exists = true;
          return false;
        });
        if (exists) {
          next = next.update({
            filter: (from) => from !== pos,
          });
        } else {
          // Insert into the rangeset at the right ordering.
          const builder = new RangeSetBuilder<Decoration>();
          let inserted = false;
          const cursor = next.iter();
          while (cursor.value) {
            if (!inserted && cursor.from > pos) {
              builder.add(pos, pos, bookmarkMark);
              inserted = true;
            }
            builder.add(cursor.from, cursor.to, cursor.value);
            cursor.next();
          }
          if (!inserted) builder.add(pos, pos, bookmarkMark);
          next = builder.finish();
        }
      }
    }
    return next;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Toggle a bookmark on the line containing the primary selection's head. */
export function toggleBookmark(view: EditorView): boolean {
  view.dispatch({
    effects: toggleBookmarkEffect.of({ from: view.state.selection.main.head }),
  });
  return true;
}

/** Jump to the next bookmark after the primary selection. Cycles to the first
 *  bookmark when there's no later one. Returns false if no bookmarks exist. */
export function nextBookmark(view: EditorView): boolean {
  return jumpBookmark(view, 1);
}
export function prevBookmark(view: EditorView): boolean {
  return jumpBookmark(view, -1);
}

function jumpBookmark(view: EditorView, dir: 1 | -1): boolean {
  const set = view.state.field(bookmarkField, false);
  if (!set || set.size === 0) return false;
  const here = view.state.selection.main.head;
  const positions: number[] = [];
  set.between(0, view.state.doc.length, (from) => {
    positions.push(from);
  });
  if (positions.length === 0) return false;
  positions.sort((a, b) => a - b);
  let target: number | undefined;
  if (dir === 1) {
    target = positions.find((p) => p > here);
    if (target === undefined) target = positions[0]; // wrap around
  } else {
    for (let i = positions.length - 1; i >= 0; i--) {
      if (positions[i] < here) {
        target = positions[i];
        break;
      }
    }
    if (target === undefined) target = positions[positions.length - 1];
  }
  view.dispatch({
    selection: { anchor: target },
    scrollIntoView: true,
  });
  return true;
}

export function clearBookmarks(view: EditorView): boolean {
  view.dispatch({ effects: clearBookmarksEffect.of(null) });
  return true;
}

export function bookmarkExtension(): Extension {
  return [bookmarkField];
}

export function countBookmarks(state: EditorState): number {
  const set = state.field(bookmarkField, false);
  return set ? set.size : 0;
}
