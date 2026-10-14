import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import {
  openDocument,
  writeDocument,
  editDocument,
  type Sheet,
} from "../src/lib/xmind/document";
import { buildScene } from "../src/lib/xmind/scene";
import { flexibleRelationshipRoute } from "../src/lib/xmind/flexibleRelationship";
const sheets: Sheet[] = [
  {
    id: "s",
    title: "Benchmark",
    rootTopic: {
      id: "root",
      title: "Root",
      children: {
        attached: Array.from({ length: 1000 }, (_, i) => ({
          id: "n" + i,
          title: "Topic " + i,
        })),
      },
    },
  },
];
const bytes = zipSync({
  "content.json": strToU8(JSON.stringify(sheets)),
  "resources/blob.bin": new Uint8Array(1024 * 1024).fill(13),
});
const doc = openDocument(bytes),
  changed = editDocument(doc.sheets, "s", {
    type: "title",
    id: "n500",
    title: "Updated",
  });
const saves: number[] = [],
  layouts: number[] = [];
let result = bytes;
for (let run = 0; run < 4; run++) {
  let start = performance.now();
  for (let i = 0; i < 10; i++) result = writeDocument(doc, changed);
  if (run) saves.push(performance.now() - start);
  start = performance.now();
  for (let i = 0; i < 10; i++)
    assert.equal(buildScene(changed[0]).nodes.length, 1001);
  if (run) layouts.push(performance.now() - start);
}
assert.equal(
  openDocument(result).sheets[0].rootTopic.children!.attached![500].title,
  "Updated",
);
const median = (arr: number[]) => [...arr].sort((a, b) => a - b)[1];
console.log(
  JSON.stringify(
    {
      nodes: 1001,
      assetBytes: 1048576,
      operations: 10,
      save_ms: saves,
      save_median: median(saves),
      layout_ms: layouts,
      layout_median: median(layouts),
      archive_before: bytes.length,
      archive_after: result.length,
    },
    null,
    2,
  ),
);
// Broad regression bounds avoid treating scheduler noise as a functional bug.
assert.ok(median(saves) < 500, "10 archive edits should stay under 500ms");
assert.ok(median(layouts) < 1000, "10 layouts should stay under 1000ms");

// A saved manual path can contain thousands of control points. Moving a segment
// must not copy every accumulated route prefix for each candidate elbow.
const controlCount = 10000;
const controls = Array.from({ length: controlCount }, (_, i) => ({
  x: 100 + i * 20,
  y: i % 2 ? 100 : -100,
}));
const routeTimes: number[] = [];
for (let run = 0; run < 4; run++) {
  const start = performance.now();
  const geometry = flexibleRelationshipRoute(
    "org.xmind.relationshipShape.zigzag",
    { x: 20, y: 0 }, { x: controlCount * 20 + 200, y: 0 },
    controls,
    { x: 0, y: 0 }, { x: controlCount * 20 + 220, y: 0 },
  );
  if (run) routeTimes.push(performance.now() - start);
  const route = geometry.route!;
  let controlIndex = 0;
  for (let i = 0; i < route.length; i++) {
    if (route[i] === controls[controlIndex]) controlIndex++;
    if (i) assert.ok(route[i].x === route[i - 1].x || route[i].y === route[i - 1].y);
  }
  assert.equal(controlIndex, controlCount, "all saved waypoints remain in order");
}
console.log(JSON.stringify({ controlCount, route_ms: routeTimes, route_median: median(routeTimes) }, null, 2));
assert.ok(median(routeTimes) < 500, "10,000-control routing should stay under 500ms");
