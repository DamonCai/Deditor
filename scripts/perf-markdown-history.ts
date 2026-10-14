import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { MarkdownSession, sourceChange, type SourceChange } from "../src/lib/markdownSession";

// The original algorithm is also the oracle for canonical offsets: repeated text
// and split UTF-16 surrogate pairs must keep exactly the same history entries.
function original(before: string, after: string): SourceChange {
  let from = 0;
  while (from < before.length && from < after.length && before[from] === after[from]) from++;
  let end = before.length, nextEnd = after.length;
  while (end > from && nextEnd > from && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
  return { from, removed: before.slice(from, end), inserted: after.slice(from, nextEnd) };
}
function equivalent(before: string, after: string) {
  const change = sourceChange(before, after);
  assert.deepEqual(change, original(before, after));
  assert.equal(before.slice(0, change.from) + change.inserted + before.slice(change.from + change.removed.length), after);
}

let cases = 0;
const parts = ["", "a", "aaaaa", "abababab", "中文😀e\u0301\r\n", "\ud800", "\udfff"];
for (const before of parts) for (const after of parts) { equivalent(before, after); cases++; }
for (const size of [63, 127, 128, 1023, 1024, 1025, 2047, 2048, 16385]) {
  const before = "中文😀\r\na".repeat(Math.ceil(size / 7)).slice(0, size);
  for (const at of [0, 1, size >> 1, size - 1, size]) {
    for (const removed of [0, 1, 2, 1024, size]) {
      for (const inserted of ["", "q", "文😀\r\n", before.slice(at, at + removed)]) {
        equivalent(before, before.slice(0, at) + inserted + before.slice(at + removed)); cases++;
      }
    }
  }
}
let seed = 382947;
const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
for (let i = 0; i < 5000; i++) {
  const before = Array.from({ length: random(60) }, () => parts[random(parts.length)]).join("");
  const at = random(before.length + 1), end = at + random(before.length - at + 1);
  equivalent(before, before.slice(0, at) + parts[random(parts.length)] + before.slice(end)); cases++;
}
for (let i = 0; i < 500; i++) {
  const before = parts[1 + random(parts.length - 1)].repeat(2000 + random(4000));
  const at = random(before.length + 1), end = at + random(before.length - at + 1);
  equivalent(before, before.slice(0, at) + parts[random(parts.length)] + before.slice(end)); cases++;
}
console.log(`Canonical source changes: ${cases} cases passed (UTF-16, CRLF, repetitions, chunk boundaries).`);

const base = "正文😀\r\n".repeat(1000);
const session = new MarkdownSession(base);
session.commit(base + "a", "visual", 0); session.commit(base + "ab", "visual", 100);
session.commit(base + "abc", "source", 200);
assert(session.undo()); assert.equal(session.source, base + "ab");
assert(session.undo()); assert.equal(session.source, base);
assert(session.redo()); assert.equal(session.source, base + "ab");
assert(session.redo()); assert.equal(session.source, base + "abc");
session.beginComposition(); session.commit(base + "abcni", "visual", 2000);
session.commit(base + "abc你", "visual", 9000); session.endComposition();
assert(session.undo()); assert.equal(session.source, base + "abc");
session.beginComposition(); session.commit(base + "abcq", "visual"); session.commit(base + "abc", "visual"); session.endComposition();
assert(session.canRedo); assert(session.redo()); assert.equal(session.source, base + "abc你");
const snapshots = [session.source];
for (let i = 0; i < 100; i++) {
  session.breakGroup();
  const before = session.source, at = random(before.length + 1);
  session.commit(before.slice(0, at) + `改${i}😀` + before.slice(at + random(4)), i % 2 ? "source" : "visual");
  snapshots.push(session.source);
}
for (let i = snapshots.length - 2; i >= 0; i--) { assert(session.undo()); assert.equal(session.source, snapshots[i]); }
for (let i = 1; i < snapshots.length; i++) { assert(session.redo()); assert.equal(session.source, snapshots[i]); }
console.log("History: adjacent grouping, mixed origins, long composition, cancelled composition, 100-edit undo/redo passed.");

const long = "# 段落\r\n正文包含 **格式** 和 😀 字符。\r\n\r\n".repeat(25000);
const fixtures = [
  { name: "short-edit", before: "hello world", after: "hello worlds", iterations: 10000 },
  ...[0, long.length >> 1, long.length].map(at => ({ name: `long-edit-${at}`, before: long, after: long.slice(0, at) + "新" + long.slice(at), iterations: 30 })),
  { name: "long-equal", before: long, after: long.slice(0), iterations: 30 },
  { name: "long-replace", before: long, after: "!" + long.slice(1, -1) + "?", iterations: 30 },
];
let sink = 0;
function measure(fn: typeof sourceChange, fixture: typeof fixtures[number]) {
  for (let i = 0; i < 10; i++) sink += fn(fixture.before, fixture.after).from;
  const samples = [];
  for (let trial = 0; trial < 5; trial++) {
    const start = performance.now();
    for (let i = 0; i < fixture.iterations; i++) { const change = fn(fixture.before, fixture.after); sink += change.from + change.inserted.length; }
    samples.push((performance.now() - start) / fixture.iterations);
  }
  return samples;
}
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[2];
const report = fixtures.map(fixture => {
  equivalent(fixture.before, fixture.after);
  const before = measure(original, fixture), after = measure(sourceChange, fixture);
  return { name: fixture.name, chars: fixture.before.length, beforeMs: before, afterMs: after, beforeMedianMs: median(before), afterMedianMs: median(after), speedup: median(before) / median(after) };
});
console.log(JSON.stringify({ benchmark: "markdown-history-common-ranges", report, sink }, null, 2));
