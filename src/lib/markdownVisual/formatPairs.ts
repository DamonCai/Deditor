import { PluginKey, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export const formatPairMeta = "deditor-format-pair";
export type FormatPairAction = { type: "open"; from: number; character: string } | { type: "release"; raw: string } | { type: "commit" };
export type FormatPair = { open: number; close: number; width: number; character: string };
export const formatPairKey = new PluginKey<FormatPair | null>("deditor-format-pair");
const pairUpdate = "deditor-format-pair-range";
export const isFormatCharacter = (text: string) => /^[*_`$~=^]$/.test(text);

export function mapFormatPair(tr: Transaction, previous: FormatPair | null): FormatPair | null {
  const action = tr.getMeta(formatPairMeta) as FormatPairAction | undefined;
  if (action?.type === "open") return { open: action.from + 1, close: action.from + 2, width: 1, character: action.character };
  if (action) return null;
  const explicit = tr.getMeta(pairUpdate) as FormatPair | undefined;
  if (explicit) return explicit;
  if (!previous) return null;
  const pair = { ...previous, open: tr.mapping.map(previous.open, -1), close: tr.mapping.map(previous.close, 1) };
  const marker = pair.character.repeat(pair.width);
  if (pair.open < 0 || pair.close + pair.width > tr.doc.content.size || pair.close < pair.open + pair.width) return null;
  if (tr.doc.textBetween(pair.open, pair.open + pair.width) !== marker || tr.doc.textBetween(pair.close, pair.close + pair.width) !== marker) return null;
  return pair;
}

export function openFormatPair(view: EditorView, from: number, character: string) {
  const type = view.state.schema.nodes.deditor_inline_source;
  if (!type) return false;
  const parent = view.state.doc.resolve(from), before = parent.parent.textBetween(0, parent.parentOffset, "", "\ufffc");
  const after = parent.parent.textBetween(parent.parentOffset, parent.parent.content.size, "", "\ufffc");
  if ((before.match(/\\+$/)?.[0].length ?? 0) % 2 || after && !/^[\s)\]}.,!?;:，。！？；：]/.test(after)) return false;
  // Once a block marker run has been released, keep further markers literal.
  // Four-or-more fence/rule delimiters must never start a second inline pair.
  const blockRun = before.trimStart();
  if (blockRun.length >= 3 && [...blockRun].every(value => value === character)) return false;
  // Intraword underscores and equals signs are normally identifiers/operators.
  if ((character === "_" || character === "=") && /[\p{L}\p{N}_]$/u.test(before)) return false;
  const tr = view.state.tr.replaceWith(from, from, type.create(null, view.state.schema.text(character + character)));
  tr.setSelection(TextSelection.create(tr.doc, from + 2));
  view.dispatch(tr.setMeta(formatPairMeta, { type: "open", from, character } satisfies FormatPairAction));
  return true;
}

function blockPrefix(state: EditorState, pair: FormatPair) {
  const resolved = state.doc.resolve(pair.open);
  const before = resolved.before();
  const outer = state.doc.resolve(before);
  return outer.parent.isTextblock && /^\s*$/.test(outer.parent.textBetween(0, outer.parentOffset));
}

/** Only generated closers are skipped/deleted; authored punctuation stays literal. */
export function handleFormatPairInput(view: EditorView, from: number, to: number, text: string, replay: (text: string) => void) {
  const pair = formatPairKey.getState(view.state);
  if (!pair || from !== to) return false;
  const empty = pair.close === pair.open + pair.width;
  const maximum = pair.character === "*" || pair.character === "_" ? 3 : pair.character === "^" ? 1 : 2;
  if (empty && from === pair.close && blockPrefix(view.state, pair) &&
      (text === " " || text === pair.character && pair.width >= maximum)) {
    // Give list/rule/fence/math prefixes back to the normal Markdown rules.
    // Remove only our generated closer, preserving everything actually typed.
    const projected = view.state.doc.resolve(pair.open), at = projected.before();
    const raw = pair.character.repeat(pair.width);
    const tr = view.state.tr.replaceWith(at, at + projected.parent.nodeSize, view.state.schema.text(raw));
    tr.setSelection(TextSelection.create(tr.doc, at + raw.length));
    view.dispatch(tr.setMeta(formatPairMeta, { type: "release", raw } satisfies FormatPairAction));
    replay(text); return true;
  }
  if (text !== pair.character || from < pair.close || from >= pair.close + pair.width) return false;
  // An escaped delimiter is body text; it does not consume our generated closer.
  const body = view.state.doc.textBetween(pair.open + pair.width, from);
  if (pair.character !== "`" && (body.match(/\\+$/)?.[0].length ?? 0) % 2) return false;
  if (empty && from === pair.close && pair.width < maximum) {
    const tr = view.state.tr.insertText(text, pair.close + pair.width).insertText(text, pair.close);
    const next = { ...pair, close: pair.close + 1, width: pair.width + 1 };
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, next.close)).setMeta(pairUpdate, next));
    return true;
  }
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from + 1));
  if (from + 1 === pair.close + pair.width) tr.setMeta(formatPairMeta, { type: "commit" } satisfies FormatPairAction);
  view.dispatch(tr); return true;
}

export function deleteEmptyFormatPair(view: EditorView) {
  const pair = formatPairKey.getState(view.state);
  if (!pair || !view.state.selection.empty || view.state.selection.from !== pair.close || pair.close !== pair.open + pair.width) return false;
  view.dispatch(view.state.tr.delete(pair.open, pair.close + pair.width).setMeta(formatPairMeta, { type: "commit" } satisfies FormatPairAction));
  return true;
}
