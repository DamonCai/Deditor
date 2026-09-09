import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { performance } from "node:perf_hooks";
import { countText, documentStatsField } from "../src/lib/documentStats";

// Same document/transactions; only the statistics implementation changes.
const text = "中文 text for a long document with words\n".repeat(20_000);
function measure(incremental: boolean) {
  let state = EditorState.create({
    doc: text,
    extensions: incremental ? [documentStatsField] : [],
  });
  const start = performance.now();
  for (let i = 0; i < 100; i++) {
    state = state.update({ changes: { from: 12, insert: "x" } }).state;
    if (incremental) {
      assert.ok(state.field(documentStatsField).words > 0);
    } else {
      const value = state.doc.toString();
      const lines = value.split("\n").length;
      const cjk = (value.match(/[一-鿿]/g) ?? []).length;
      const words = value.split(/\s+/).filter(Boolean).length;
      const newlines: number[] = [];
      for (let j = 0; j < value.length; j++)
        if (value.charCodeAt(j) === 10) newlines.push(j);
      assert.equal(lines, newlines.length + 1);
      assert.ok(cjk + words > 0);
    }
  }
  if (incremental)
    assert.deepEqual(
      state.field(documentStatsField),
      countText(state.doc.toString()),
    );
  return performance.now() - start;
}
measure(false);
measure(true);
const before = Array.from({ length: 3 }, () => measure(false));
const after = Array.from({ length: 3 }, () => measure(true));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[1];
console.log(
  JSON.stringify(
    {
      document_chars: text.length,
      edits: 100,
      before_ms: before,
      after_ms: after,
      before_median: median(before),
      after_median: median(after),
      reduction_pct: (1 - median(after) / median(before)) * 100,
    },
    null,
    2,
  ),
);
