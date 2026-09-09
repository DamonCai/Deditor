import { StateField, type Text } from "@codemirror/state";

export function countText(text: string) {
  let words = 0,
    cjk = 0;
  const word = /\S+/g;
  const chinese = /[一-鿿]/g;
  while (word.exec(text)) words++;
  while (chinese.exec(text)) cjk++;
  return { words, cjk };
}

function countRanges(doc: Text, ranges: [number, number][]) {
  const merged: [number, number][] = [];
  for (const [from, to] of ranges) {
    const start = doc.lineAt(from).from,
      end = doc.lineAt(to).to;
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  let words = 0,
    cjk = 0;
  for (const [from, to] of merged) {
    const part = countText(doc.sliceString(from, to));
    words += part.words;
    cjk += part.cjk;
  }
  return { words, cjk };
}

/** Recount only complete lines touched by a transaction, including joins/splits. */
export const documentStatsField = StateField.define<{
  words: number;
  cjk: number;
}>({
  create: (state) => countText(state.doc.toString()),
  update(stats, tr) {
    if (!tr.docChanged) return stats;
    const before: [number, number][] = [],
      after: [number, number][] = [];
    tr.changes.iterChangedRanges((a, b, c, d) => {
      before.push([a, b]);
      after.push([c, d]);
    });
    const removed = countRanges(tr.startState.doc, before);
    const added = countRanges(tr.newDoc, after);
    return {
      words: stats.words - removed.words + added.words,
      cjk: stats.cjk - removed.cjk + added.cjk,
    };
  },
});
