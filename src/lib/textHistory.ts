import { Annotation, EditorState, Transaction } from "@codemirror/state";
import { isolateHistory, undo, redo } from "@codemirror/commands";
import type { EditorView, ViewUpdate } from "@codemirror/view";

/** One CodeMirror history per text document, independent of its projections.
 * Retain CodeMirror's grouping and inverse changes; pane selections stay local. */
const states = new Map<string, EditorState>();
export const textProjectionSync = Annotation.define<boolean>();
export function rememberTextState(id: string, state: EditorState) {
  if (!states.has(id)) states.set(id, state);
}
export function recordTextUpdate(id: string, update: ViewUpdate) {
  let state = states.get(id) ?? update.startState;
  for (const tr of update.transactions) {
    if (tr.annotation(textProjectionSync)) {
      // The editing projection already recorded peer changes. External store
      // replacements (format/reload) have no origin view and enter history once.
      if (!state.doc.eq(tr.newDoc) && state.doc.eq(tr.startState.doc)) state = state.update({ changes: tr.changes, annotations: isolateHistory.of("full") }).state;
      continue;
    }
    if (state === tr.startState) { state = tr.state; continue; }
    if (!tr.docChanged && !tr.selection) continue;
    if (!state.doc.eq(tr.startState.doc)) state = tr.startState;
    const annotations = [];
    const userEvent = tr.annotation(Transaction.userEvent), time = tr.annotation(Transaction.time);
    const add = tr.annotation(Transaction.addToHistory), isolation = tr.annotation(isolateHistory);
    if (userEvent !== undefined) annotations.push(Transaction.userEvent.of(userEvent));
    if (time !== undefined) annotations.push(Transaction.time.of(time));
    if (add !== undefined) annotations.push(Transaction.addToHistory.of(add));
    if (isolation !== undefined) annotations.push(isolateHistory.of(isolation));
    state = state.update({ changes: tr.changes, selection: tr.selection, annotations }).state;
  }
  states.set(id, state);
}
export function textHistory(id: string, view: EditorView, forward = false) {
  const state = states.get(id) ?? view.state;
  if (!state.doc.eq(view.state.doc)) return false;
  (forward ? redo : undo)({ state, dispatch: tr => {
    states.set(id, tr.state);
    view.dispatch({ changes: tr.changes, selection: tr.selection, annotations: [textProjectionSync.of(true), Transaction.addToHistory.of(false)], scrollIntoView: true });
  } });
  return true;
}
export function dropTextHistory(id: string) { states.delete(id); }
