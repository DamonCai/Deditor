import { moveOrthogonalSegment } from '../src/lib/xmind/flexibleRelationship';
import { smartColorSheets } from '../tests/fixtures/xmind-smart-colors';
import { groupRangeAxis, groupRangeBounds, groupRangeReversed, nearestGroupMember } from '../src/lib/xmind/groupRange';
import { BOUNDARY_SHAPES, SUMMARY_SHAPES, boundaryGeometry, boundaryOverflow, summaryPath } from '../src/lib/xmind/groupShapes';
import { round10GroupSheets, round10PolarSheets, round10FlexibleSheets, round10NestedGroupSheets, round10MasterSheets } from '../tests/fixtures/xmind-round10';
import nativeGroupShapes from '../tests/fixtures/xmind-native-group-shapes.json';
import { round9RelationshipSheets } from '../tests/fixtures/xmind-round9';
import { ARROW_SHAPES, arrowDrawing } from '../src/lib/xmind/arrows';
import nativeArrows from '../tests/fixtures/xmind-native-arrows.json';
import nativeFlowchart from "../tests/fixtures/xmind-native-flowchart-shapes.json";
import { PUNCTUATION_SHAPES, punctuationPath } from "../src/lib/xmind/punctuationShapes";
import nativePunctuation from "../tests/fixtures/xmind-native-punctuation-shapes.json";
import { draftBox } from "../src/lib/xmind/draft";
import { ADVANCED_SHAPES, FLOWCHART_SHAPES, referenceSymbol, advancedShape, pointInOutline, shapeContentCenter } from "../src/lib/xmind/shapePaths";
import nativeAdvancedShapes from "../tests/fixtures/xmind-native-advanced-shapes.json";
import { round7ShapeSheets } from "../tests/fixtures/xmind-round7";
import { TOPIC_SHAPES, shapePolygon, shapeSize } from "../src/lib/xmind/shapes";
import { topicDropTarget } from "../src/lib/xmind/drop";
import { movedRelationshipControl, relationshipDropTarget, relationshipGeometry, relationshipStyle, topicAnchor } from "../src/lib/xmind/relationship";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { unzipSync, strFromU8, zipSync, strToU8 } from "fflate";
import { replaceArchiveEntry } from "../src/lib/xmind/archive";
import {
  openDocument,
  writeDocument,
  editDocument,
  findTopic,
  childrenOf,
  newTopic,
  duplicateTopic,
  type Sheet,
} from "../src/lib/xmind/document";
import { buildScene, nodeVisualBounds, edgePath, STRUCTURES, topicStyle, groupStyle } from "../src/lib/xmind/scene";
import { timelineVariantSheets } from "../tests/fixtures/xmind-timeline-variants";
import { round6Sheets } from "../tests/fixtures/xmind-round6";
import { sampleArchive, sampleSheets } from "../tests/fixtures/xmind";
// Preserve the original CLI smoke-test entry point.
if (process.argv[2]) {
  const start = performance.now(),
    doc = openDocument(new Uint8Array(readFileSync(process.argv[2])));
  console.log(
    `parse: ${Math.round(performance.now() - start)}ms (sheets=${doc.sheets.length})`,
  );
  for (const sheet of doc.sheets) {
    const scene = buildScene(sheet);
    console.log(
      `sheet: "${sheet.title}"; root: "${sheet.rootTopic.title}"; topics: ${scene.nodes.length}`,
    );
  }
  console.log("OK");
  process.exit(0);
}
let passed = 0;
function test(round: number, name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`PASS round ${round}: ${name}`);
}
const read = (bytes: Uint8Array) =>
  JSON.parse(strFromU8(unzipSync(bytes)["content.json"])) as Sheet[];
test(1, "open and untouched save preserve exact archive bytes", () => {
  const bytes = sampleArchive(),
    doc = openDocument(bytes);
  assert.deepEqual(writeDocument(doc, doc.sheets), bytes);
  assert.equal(doc.sheets.length, 2);
});
test(
  1,
  "renaming one topic preserves every other raw field and archive entry",
  () => {
    const doc = openDocument(sampleArchive()),
      sheets = editDocument(doc.sheets, "sheet-main", {
        type: "title",
        id: "colors",
        title: "Changed",
      }),
      bytes = writeDocument(doc, sheets);
    const expected = structuredClone(doc.sheets);
    findTopic(expected[0].rootTopic, "colors")!.title = "Changed";
    assert.deepEqual(read(bytes), expected);
    const files = unzipSync(bytes);
    for (const key in doc.files)
      if (key !== "content.json") assert.deepEqual(files[key], doc.files[key]);
  },
);
test(
  1,
  "theme, floating coordinates, callout, image, summary and boundary enter scene",
  () => {
    const scene = buildScene(sampleSheets()[0]);
    const root = scene.nodes.find((n) => n.topic.id === "root")!,
      floating = scene.nodes.find((n) => n.topic.id === "floating")!;
    assert.equal(root.fill, "#344D6C");
    assert.equal(root.fontSize, 24);
    assert.equal(scene.background, "#FAFBFD");
    assert.equal(floating.x + floating.width / 2, 450);
    assert.equal(floating.y + floating.height / 2, 420);
    assert.ok(scene.nodes.some((n) => n.topic.id === "callout"));
    assert.ok(scene.nodes.some((n) => n.topic.id === "summary-topic"));
    assert.equal(scene.groups.length, 2);
    assert.ok(!scene.edges.some((e) => e.to === "floating"));
  },
);
test(
  2,
  "Unicode, empty title, multiline and very long text produce finite geometry",
  () => {
    const sheet = sampleSheets()[1];
    sheet.rootTopic.title = "";
    sheet.rootTopic.children!.attached![0].title =
      "中文😀é\n" + "Long title ".repeat(100);
    const scene = buildScene(sheet);
    for (const n of scene.nodes) {
      assert.ok(Number.isFinite(n.x + n.y + n.width + n.height));
      assert.ok(n.height > 0);
    }
    assert.ok(
      scene.nodes.find((n) => n.topic.id === "design")!.lines.length > 10,
    );
  },
);
test(
  2,
  "all supported structures have finite connectors and directional layout",
  () => {
    for (const [structure] of STRUCTURES) {
      const sheet = sampleSheets()[1];
      sheet.rootTopic.structureClass = structure;
      const scene = buildScene(sheet),
        root = scene.nodes[0],
        child = scene.nodes.find((n) => n.parent === root.topic.id)!;
      for (const edge of scene.edges)
        assert.ok(
          !edgePath(
            edge,
            scene.nodes.find((n) => n.topic.id === edge.from)!,
            scene.nodes.find((n) => n.topic.id === edge.to)!,
          ).includes("NaN"),
        );
      if (structure.endsWith(".down"))
        assert.ok(child.y > root.y + root.height);
      if (structure.endsWith(".left"))
        assert.ok(child.x + child.width < root.x);
      if (structure.endsWith(".up")) assert.ok(child.y + child.height < root.y);
    }
  },
);
test(2, "folded subtrees leave no dangling lines", () => {
  const s = buildScene(sampleSheets()[0], new Set(["read"]));
  assert.ok(!s.nodes.some((n) => n.topic.id === "colors"));
  assert.ok(!s.edges.some((e) => e.to === "colors"));
});
test(
  3,
  "rapid edits across sheets retain both sheets and original root order",
  () => {
    const doc = openDocument(sampleArchive());
    let sheets = editDocument(doc.sheets, "sheet-main", {
      type: "title",
      id: "read",
      title: "Read revised",
    });
    sheets = editDocument(sheets, "sheet-org", {
      type: "title",
      id: "qa",
      title: "QA revised",
    });
    sheets = editDocument(sheets, "sheet-main", {
      type: "add",
      parent: "root",
      topic: newTopic("Added"),
      after: "read",
    });
    const result = read(writeDocument(doc, sheets));
    assert.equal(findTopic(result[0].rootTopic, "read")!.title, "Read revised");
    assert.equal(findTopic(result[1].rootTopic, "qa")!.title, "QA revised");
    assert.deepEqual(
      result[0].rootTopic.children!.attached!.map((n) => n.title),
      ["Read revised", "Added", "直观编辑", "可靠保存", "离线使用"],
    );
  },
);
test(
  3,
  "move to another parent and detach/reattach retain subtree IDs and metadata",
  () => {
    const original = sampleSheets();
    const subtree = structuredClone(findTopic(original[0].rootTopic, "read"));
    let s = editDocument(original, "sheet-main", {
      type: "move",
      id: "read",
      parent: "local",
    });
    assert.deepEqual(findTopic(s[0].rootTopic, "read"), subtree);
    s = editDocument(s, "sheet-main", {
      type: "move",
      id: "read",
      parent: "root",
      position: { x: -550, y: 340 },
    });
    assert.deepEqual(findTopic(s[0].rootTopic, "read")!.position, {
      x: -550,
      y: 340,
    });
    s = editDocument(s, "sheet-main", {
      type: "move",
      id: "read",
      parent: "root",
      after: "safe",
    });
    assert.equal(findTopic(s[0].rootTopic, "read")!.position, undefined);
    assert.equal(s[0].rootTopic.children!.attached!.at(-2)!.id, "read");
  },
);
test(
  3,
  "group ranges follow original members after sibling insert/delete",
  () => {
    let s = sampleSheets();
    s = editDocument(s, "sheet-main", {
      type: "add",
      parent: "read",
      topic: newTopic("inside"),
      after: "colors",
    });
    assert.equal(
      findTopic(s[0].rootTopic, "read")!.boundaries![0].range,
      "(0,2)",
    );
    s = editDocument(s, "sheet-main", { type: "delete", ids: ["colors"] });
    assert.equal(
      findTopic(s[0].rootTopic, "read")!.boundaries![0].range,
      "(0,1)",
    );
  },
);
test(
  4,
  "invalid sheet, duplicate IDs and cyclic moves fail without mutating source",
  () => {
    const s = sampleSheets(),
      before = structuredClone(s);
    assert.throws(() =>
      editDocument(s, "missing", { type: "title", id: "read", title: "x" }),
    );
    assert.throws(() =>
      editDocument(s, "sheet-main", {
        type: "move",
        id: "read",
        parent: "colors",
      }),
    );
    assert.throws(() =>
      editDocument(s, "sheet-main", {
        type: "add",
        parent: "root",
        topic: { id: "read", title: "duplicate" },
      }),
    );
    assert.throws(() => openDocument(new Uint8Array([1, 2, 3])));
    assert.deepEqual(s, before);
  },
);
test(
  4,
  "nonconsecutive grouping and dangling relationship endpoints are rejected",
  () => {
    const s = sampleSheets();
    assert.throws(() =>
      editDocument(s, "sheet-main", {
        type: "group",
        parent: "root",
        ids: ["read", "safe"],
        kind: "boundary",
        title: "x",
      }),
    );
    assert.throws(() =>
      editDocument(s, "sheet-main", {
        type: "relationship",
        from: "read",
        to: "missing",
        title: "x",
      }),
    );
    const next = editDocument(s, "sheet-main", {
      type: "delete",
      ids: ["edit"],
    });
    assert.equal(next[0].relationships!.length, 0);
  },
);
test(
  5,
  "style edits retain style id and unknown properties with original schema",
  () => {
    const doc = openDocument(sampleArchive()),
      s = editDocument(doc.sheets, "sheet-main", {
        type: "properties",
        id: "colors",
        properties: { "svg:fill": "#123456" },
      });
    const n = findTopic(read(writeDocument(doc, s))[0].rootTopic, "colors")!;
    assert.equal(n.style!.id, "custom-style");
    assert.equal(n.style!.properties!["fo:color"], "#2563A0");
    assert.equal(n.style!.properties!["svg:fill"], "#123456");
  },
);
test(
  5,
  "new callout/summary/relationship survive reopen and undo is byte exact",
  () => {
    const doc = openDocument(sampleArchive());
    let s = editDocument(doc.sheets, "sheet-org", {
      type: "add",
      parent: "org-root",
      topic: { id: "new-callout", title: "note" },
      kind: "callout",
    });
    s = editDocument(s, "sheet-org", {
      type: "group",
      parent: "org-root",
      ids: ["design", "dev"],
      kind: "summary",
      title: "Together",
    });
    s = editDocument(s, "sheet-org", {
      type: "relationship",
      from: "design",
      to: "qa",
      title: "Review",
    });
    const next = openDocument(writeDocument(doc, s));
    assert.ok(findTopic(next.sheets[1].rootTopic, "new-callout"));
    assert.equal(next.sheets[1].rootTopic.summaries!.length, 1);
    assert.equal(next.sheets[1].relationships![0].title, "Review");
    assert.deepEqual(writeDocument(doc, doc.sheets), doc.original);
  },
);
test(
  5,
  "1000 topics preserve stable order and selection IDs across layout and edits",
  () => {
    const s: Sheet[] = [
      {
        id: "large",
        title: "Large",
        rootTopic: {
          id: "r",
          title: "Root",
          children: {
            attached: Array.from({ length: 1000 }, (_, i) => ({
              id: "n" + i,
              title: "Node " + i,
            })),
          },
        },
      },
    ];
    const next = editDocument(s, "large", {
      type: "title",
      id: "n499",
      title: "new",
    });
    assert.equal(buildScene(next[0]).nodes.length, 1001);
    assert.deepEqual(
      childrenOf(next[0].rootTopic).map((n) => n.id),
      childrenOf(s[0].rootTopic).map((n) => n.id),
    );
  },
);

test(2, "XMind right-number extension controls branch distribution", () => {
  const sheet = sampleSheets()[0];
  sheet.rootTopic.extensions = [
    {
      provider: "org.xmind.ui.map.unbalanced",
      content: [{ name: "right-number", content: "4" }],
    },
  ];
  const scene = buildScene(sheet);
  for (const n of scene.nodes.filter((n) => n.parent === "root" && !n.detached))
    assert.ok(n.x > scene.nodes[0].x + scene.nodes[0].width);
});
test(
  2,
  "left-side summary is outside its members and does not overlap its parent",
  () => {
    const scene = buildScene(sampleSheets()[0]),
      parent = scene.nodes.find((n) => n.topic.id === "safe")!,
      summary = scene.nodes.find((n) => n.topic.id === "summary-topic")!;
    assert.ok(summary.x + summary.width < parent.x);
    assert.ok(scene.groups.some((g) => g.summary && g.side === "left"));
  },
);
test(
  3,
  "copying a subtree remaps summary topic IDs and retains group styling",
  () => {
    const original = findTopic(sampleSheets()[0].rootTopic, "safe")!,
      copy = duplicateTopic(original);
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.summaries![0].topicId, copy.children!.summary![0].id);
    assert.equal(copy.children!.attached!.length, 2);
  },
);
test(
  4,
  "relationships to boundaries and unknown endpoints survive unrelated edits",
  () => {
    const sheets = sampleSheets();
    sheets[0].relationships!.push({
      id: "boundary-rel",
      end1Id: "boundary",
      end2Id: "unknown-extension-endpoint",
    });
    const result = editDocument(sheets, "sheet-main", {
      type: "title",
      id: "read",
      title: "Updated",
    });
    assert.deepEqual(result[0].relationships, sheets[0].relationships);
  },
);
test(5, "no-op title preserves native titleUnedited flag", () => {
  const sheets = sampleSheets();
  sheets[0].rootTopic.titleUnedited = true;
  const result = editDocument(sheets, "sheet-main", {
    type: "title",
    id: "root",
    title: sheets[0].rootTopic.title,
  });
  assert.equal(result, sheets);
});
test(4, "ZIP history serialization stays identical across clock changes", () => {
  const original=zipSync({'content.json':[strToU8('original'),{mtime:new Date(2001,1,3,4,5,6)}]});
  const RealDate=Date;
  try {
    globalThis.Date=class extends RealDate { constructor(){super(2031,2,4,5,6,8);} } as DateConstructor;
    const first=replaceArchiveEntry(original,'content.json',strToU8('saved state'));
    globalThis.Date=class extends RealDate { constructor(){super(2041,3,5,6,7,10);} } as DateConstructor;
    const replay=replaceArchiveEntry(original,'content.json',strToU8('saved state'));
    assert.deepEqual(replay,first,'undoing to saved content must reproduce its archive bytes');
    const oldView=new DataView(original.buffer),newView=new DataView(first.buffer);
    assert.equal(newView.getUint32(10,true),oldView.getUint32(10,true));
    assert.equal(strFromU8(unzipSync(first)['content.json']),'saved state');
  } finally { globalThis.Date=RealDate; }
});
test(
  4,
  "ZIP replacement preserves members before and after content and the archive comment",
  () => {
    const files = {
      "before.bin": new Uint8Array([1, 2, 3]),
      "content.json": strToU8("original content"),
      "after.bin": new Uint8Array([255, 0, 99]),
    };
    const zip = zipSync(files),
      comment = strToU8("original ZIP comment");
    const original = new Uint8Array(zip.length + comment.length);
    original.set(zip);
    original.set(comment, zip.length);
    new DataView(original.buffer).setUint16(
      zip.length - 2,
      comment.length,
      true,
    );
    for (const value of ["x", "changed content ".repeat(500)]) {
      const next = replaceArchiveEntry(
        original,
        "content.json",
        strToU8(value),
      );
      const result = unzipSync(next);
      assert.equal(strFromU8(result["content.json"]), value);
      assert.deepEqual(result["before.bin"], files["before.bin"]);
      assert.deepEqual(result["after.bin"], files["after.bin"]);
      assert.deepEqual(next.slice(-comment.length), comment);
      const view = new DataView(original.buffer),
        central = view.getUint32(zip.length - 6, true);
      const firstLocalLength =
        30 +
        view.getUint16(26, true) +
        view.getUint16(28, true) +
        view.getUint32(18, true);
      assert.deepEqual(
        next.slice(0, firstLocalLength),
        original.slice(0, firstLocalLength),
      );
      assert.ok(central > firstLocalLength);
    }
  },
);
test(
  4,
  "encrypted ZIP edits fail explicitly without modifying original bytes",
  () => {
    const archive = zipSync({ "content.json": strToU8("[]") });
    const view = new DataView(archive.buffer),
      central = view.getUint32(archive.length - 6, true);
    view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
    const before = archive.slice();
    assert.throws(
      () => replaceArchiveEntry(archive, "content.json", strToU8("{}")),
      /Encrypted/,
    );
    assert.deepEqual(archive, before);
  },
);
// Native rendering regressions: containment is tested against the real shape,
// not merely against its surrounding rectangle.
test(1, "diamond and ellipse contain title and metadata with labels below the outline", () => {
  for (const shape of ["diamond", "ellipse", "roundedRect", "pill"]) {
    const sheet: Sheet = { id: "shape-sheet", title: "Shapes", rootTopic: {
      id: "shape-root", title: "菱形 / Decision\n第二行 gyp",
      labels: ["长标签".repeat(30)], notes: { plain: { content: "note" } },
      markers: [{ markerId: "priority-1" }, { markerId: "task-half" }],
      style: { properties: { "shape-class": shape, "fo:font-style": "italic", "fo:max-width": "130" } },
    } };
    const n = buildScene(sheet).nodes[0], c = n.content;
    for (const x of [c.x, c.x + c.width]) for (const y of [c.y, c.y + c.height]) {
      const dx = Math.abs(x - n.width / 2) / (n.width / 2);
      const dy = Math.abs(y - n.height / 2) / (n.height / 2);
      assert.ok(shape === "diamond" ? dx + dy < 1 : shape === "ellipse" ? dx * dx + dy * dy < 1 : dx < 1 && dy < 1);
    }
    assert.ok(n.labelLines.length > 1);
    for (const icon of n.indicatorPositions) {
      assert.ok(icon.x >= c.x && icon.x + 16 <= c.x + c.width);
      assert.ok(icon.y >= c.y && icon.y + 16 <= c.y + c.height);
    }
  }
});
const fishSheet = (structure = "org.xmind.ui.fishbone.leftHeaded", count = 4): Sheet => ({
  id: "fish-sheet", title: "Fishbone", rootTopic: { id: "fish", title: "显示效果差异", structureClass: structure,
    children: { attached: Array.from({ length: count }, (_, i) => ({ id: `cause-${i}`, title: `原因 ${i}`,
      children: { attached: Array.from({ length: 3 }, (_, j) => ({ id: `leaf-${i}-${j}`, title: `原因明细 ${j}` })) } })) } },
});
test(1, "fishbone has alternating diagonal ribs with horizontal twigs on each rib", () => {
  const scene = buildScene(fishSheet()), root = scene.nodes[0];
  assert.deepEqual(scene.warnings, []);
  for (let i = 0; i < 4; i++) {
    const rib = scene.edges.find(e => e.to === `cause-${i}`)!;
    const points = rib.points!, base = points[points.length - 2], tip = points[points.length - 1];
    assert.equal(base.y, 0);
    assert.ok((tip.y < 0) === (i % 2 === 0));
    assert.ok(Math.abs(Math.abs(tip.y) / (tip.x - base.x) - Math.sqrt(3)) < 1e-8);
    const cause = scene.nodes.find(n => n.topic.id === rib.to)!;
    for (let j = 0; j < 3; j++) {
      const twig = scene.edges.find(e => e.to === `leaf-${i}-${j}`)!.points!;
      assert.equal(twig[0].y, twig[1].y);
      assert.ok(Math.abs(twig[0].x - base.x - Math.abs(twig[0].y) / Math.sqrt(3)) < 1e-8);
      assert.ok(Math.abs(twig[0].y) < Math.abs(tip.y));
      assert.ok(twig[1].x > twig[0].x);
    }
    assert.ok(cause.x > root.x + root.width);
  }
  for (const a of scene.nodes) for (const b of scene.nodes) if (a !== b) {
    assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
      `overlap: ${a.topic.id}, ${b.topic.id}`);
  }
});
test(1, "opposite fishbone ribs attach at staggered spine positions", () => {
  for (const direction of ["leftHeaded", "rightHeaded"]) {
    const sheet = fishSheet(`org.xmind.ui.fishbone.${direction}`, 6);
    const scene = buildScene(sheet);
    const roots = sheet.rootTopic.children!.attached!;
    const bases = roots.map(t => scene.edges.find(e => e.to === t.id)!.points![0]);
    const sign = direction === "leftHeaded" ? 1 : -1;
    for (let i = 1; i < bases.length; i++) {
      assert.ok(sign * (bases[i].x - bases[i - 1].x) > 0,
        "successive upper/lower ribs must have separate, ordered junctions");
      assert.equal(bases[i].y, bases[0].y);
    }
    const trunk = scene.edges.find(e => e.trunk)!.trunk!;
    for (const base of bases) {
      assert.ok(base.x >= Math.min(trunk[0].x, trunk[1].x));
      assert.ok(base.x <= Math.max(trunk[0].x, trunk[1].x));
    }
  }
});
test(3, "staggered fishbone keeps lower twigs attached when an opposite rib folds", () => {
  const sheet = fishSheet();
  for (const folded of [new Set<string>(), new Set(["cause-0"]), new Set(["cause-1"])]) {
    const scene = buildScene(sheet, folded);
    const ribs = [0, 1].map(i => scene.edges.find(e => e.to === `cause-${i}`)!.points!);
    assert.ok(ribs[1][0].x > ribs[0][0].x);
    for (const e of scene.edges.filter(e => e.from === "cause-1")) {
      const anchor = e.points![0], base = ribs[1][0];
      assert.ok(Math.abs(anchor.x - base.x - Math.abs(anchor.y) / Math.sqrt(3)) < 1e-8);
    }
  }
});
test(2, "fishbone handles empty, single, odd, mirrored and deeply nested causes", () => {
  for (const count of [0, 1, 3, 8]) {
    const left = fishSheet(undefined, count), right = fishSheet("org.xmind.ui.fishbone.rightHeaded", count);
    if (count) for (const sheet of [left, right]) {
      const leaf = sheet.rootTopic.children!.attached![0].children!.attached![0];
      leaf.title = "中英文 long text ".repeat(20);
      leaf.children = { attached: [{ id: "deep", title: "更深一层" }] };
    }
    const a = buildScene(left), b = buildScene(right);
    assert.equal(a.nodes.length, b.nodes.length);
    a.nodes.forEach((n, i) => {
      assert.ok(Math.abs(n.x + n.width + b.nodes[i].x) < 1e-8);
      assert.equal(n.y, b.nodes[i].y);
    });
    for (const scene of [a, b]) for (const edge of scene.edges) {
      const path = edgePath(edge, scene.nodes.find(n => n.topic.id === edge.from)!, scene.nodes.find(n => n.topic.id === edge.to)!);
      assert.ok(!/NaN|Infinity/.test(path));
    }
  }
});
test(3, "folding and reopening a fishbone preserves branches, routes and archive", () => {
  const sheets = [fishSheet(), ...sampleSheets()];
  const bytes = zipSync({ "content.json": strToU8(JSON.stringify(sheets)) });
  const doc = openDocument(bytes);
  const whole = buildScene(doc.sheets[0]);
  for (const id of ["fish", "cause-0"]) {
    const folded = buildScene(doc.sheets[0], new Set([id]));
    assert.equal(folded.nodes.length, id === "fish" ? 1 : whole.nodes.length - 3);
    for (const e of folded.edges) assert.ok(folded.nodes.some(n => n.topic.id === e.to));
    assert.deepEqual(buildScene(doc.sheets[0]), whole);
  }
  assert.deepEqual(writeDocument(doc, doc.sheets), bytes);
});


test(1, "marker IDs become symbols without deleting user labels or archive fields", () => {
  const sheet: Sheet = { id: "symbols", title: "Symbols", rootTopic: {
    id: "symbols-root", title: "task-done is a user title", labels: ["star-red", "客户标签"],
    markers: [{ markerId: "task-done" }, { markerId: "task-half" },
      { markerId: "priority-1" }, { markerId: "star-red" }, { markerId: "unknown-internal-name" }],
    notes: { plain: { content: "Keep these notes" } }, href: "https://example.test/",
  } };
  const before = JSON.stringify(sheet), node = buildScene(sheet).nodes[0];
  assert.deepEqual(node.indicators.map(i => i.kind), ["task", "task", "priority", "star", "marker", "notes", "link"]);
  assert.equal(node.indicators[0].value, 1);
  assert.equal(node.indicators[1].value, .5);
  assert.ok(node.labelLines.join("").includes("star-red"));
  assert.ok(node.lines.join("").includes("task-done"));
  assert.ok(!JSON.stringify(node.indicators).includes("unknown-internal-name"));
  assert.equal(JSON.stringify(sheet), before);
  const bytes = zipSync({ "content.json": strToU8(JSON.stringify([sheet])) });
  const doc = openDocument(bytes);
  const renamed = editDocument(doc.sheets, sheet.id, { type: "title", id: "symbols-root", title: "Renamed" });
  const reopened = openDocument(writeDocument(doc, renamed)).sheets[0].rootTopic;
  assert.deepEqual(reopened.markers, sheet.rootTopic.markers);
  assert.deepEqual(reopened.notes, sheet.rootTopic.notes);
  assert.deepEqual(reopened.labels, sheet.rootTopic.labels);
});
test(2, "many and unknown markers wrap inside shaped topics without phantom text rows", () => {
  for (const count of [0, 1, 31]) {
    const sheet: Sheet = { id: "wrap-symbols", title: "Symbols", rootTopic: {
      id: "root", title: "标题", style: { properties: { "shape-class": "diamond", "fo:max-width": "60" } },
      markers: Array.from({ length: count }, (_, i) => ({ markerId: `unrecognized-${i}` })),
    } };
    const n = buildScene(sheet).nodes[0];
    assert.equal(n.indicators.length, count);
    if (count) {
      assert.ok(n.indicatorColumns * 20 - 4 <= n.content.width);
      assert.ok(n.indicatorY + Math.ceil(count / n.indicatorColumns) * 20 <= n.content.y + n.content.height);
    }
    assert.deepEqual(n.labelLines, []);
  }
});

const styledBranches = (direction: "left" | "right"): Sheet => ({
  id: "styled", title: "Styled branches", theme: {
    map: { properties: { "multi-line-colors": "#2563EB #DB2777" } },
    centralTopic: { properties: { "line-class": "org.xmind.branchConnection.curve" } },
    mainTopic: { properties: { "line-class": "org.xmind.branchConnection.roundedElbow" } },
    subTopic: { properties: { "shape-class": "org.xmind.topicShape.underline" } },
    calloutTopic: { properties: { "svg:fill": "#FFE4E6", "shape-class": "roundedRect" } },
  }, rootTopic: { id: "root", title: "Root", structureClass: `org.xmind.ui.logic.${direction}`, children: { attached: [
    { id: "main", title: "Architecture", style: { properties: { "line-color": "#DB2777" } }, children: {
      attached: [{id:"a",title:"Frontend",children:{attached:[{id:"leaf",title:"SVG"}]}},{id:"b",title:"Native"},{id:"c",title:"Documentation"}],
      callout: [{id:"bubble",title:"批注",position:{x:0,y:-160}}],
    } },
  ] } },
});
test(1, "rounded branches inherit color, share a spine and join underline endpoints on either side", () => {
  for (const direction of ["left", "right"] as const) {
    const scene = buildScene(styledBranches(direction));
    const node = (id: string) => scene.nodes.find(n => n.topic.id === id)!;
    for (const id of ["a", "b", "leaf"]) {
      assert.equal(node(id).lineColor, "#DB2777");
      assert.equal(node(id).stroke, "#DB2777");
      assert.equal(node(id).properties["line-class"], "org.xmind.branchConnection.roundedElbow");
    }
    const paths = ["a", "b"].map(id => edgePath(scene.edges.find(e=>e.to===id)!,node("main"),node(id)));
    const stems = ['a','c'].map(id=>edgePath(scene.edges.find(e=>e.to===id)!,node('main'),node(id)).match(/^M[^ ]+ H([^ ]+)/)![1]);
    assert.equal(stems[0],stems[1]);
    assert.ok(paths[0].includes(" Q"));
    assert.ok(!paths[1].includes(" Q"), "middle child joins the shared trunk without an extra bend");
    paths.forEach((p,i)=>{
      assert.ok(!p.includes(" C"));
      assert.ok(p.endsWith(`H${direction === "left" ? node(i ? "b" : "a").x + node(i ? "b" : "a").width : node(i ? "b" : "a").x}`));
      const endY = node(i ? "b" : "a").y + node(i ? "b" : "a").height;
      assert.ok(p.includes(`,${endY}`) || p.includes(`V${endY}`));
    });
    assert.ok(edgePath(scene.edges.find(e=>e.to==="main")!,node("root"),node("main")).includes(" C"));
  }
});
test(2, "callout positions control filled tails above, below and beside their parent", () => {
  for (const position of [{x:0,y:-160},{x:0,y:160},{x:-300,y:0},{x:300,y:0}]) {
    const sheet = styledBranches("left");
    sheet.rootTopic.children!.attached![0].children!.callout![0].position = position;
    const scene = buildScene(sheet), parent = scene.nodes.find(n=>n.topic.id==="main")!, bubble=scene.nodes.find(n=>n.topic.id==="bubble")!;
    assert.ok(Math.abs(bubble.x+bubble.width/2-parent.x-parent.width/2-position.x)<1e-8);
    assert.ok(Math.abs(bubble.y+bubble.height/2-parent.y-parent.height/2-position.y)<1e-8);
    assert.equal(bubble.stroke,"none");
    const edge=scene.edges.find(e=>e.to==="bubble")!;
    assert.equal(edge.callout,true);
    const path=edgePath(edge,parent,bubble);
    assert.ok(path.endsWith(" Z"));assert.ok(!/NaN|Infinity| H| V/.test(path));
  }
});
test(3, "callout and rounded branches survive edit, save, reopen and folding without source mutation", () => {
  const sheets=[styledBranches("right")], bytes=zipSync({"content.json":strToU8(JSON.stringify(sheets))});
  const doc=openDocument(bytes);
  const edited=editDocument(doc.sheets,"styled",{type:"title",id:"bubble",title:"保存后的批注"});
  const reopened=openDocument(writeDocument(doc,edited));
  assert.deepEqual(findTopic(reopened.sheets[0].rootTopic,"bubble")!.position,{x:0,y:-160});
  const scene=buildScene(reopened.sheets[0],new Set(["a"]));
  assert.ok(scene.edges.find(e=>e.to==="bubble")!.callout);
  assert.equal(scene.nodes.find(n=>n.topic.id==="b")!.lineColor,"#DB2777");
  assert.deepEqual(writeDocument(doc,doc.sheets),bytes);
});

test(6, "pasting subtrees rejects nested duplicate IDs and preserves the original document", () => {
  const sheets=sampleSheets(), before=JSON.stringify(sheets);
  assert.throws(()=>editDocument(sheets,sheets[0].id,{type:"paste",parent:"root",topics:[
    {id:"fresh",title:"Fresh"},
    {id:"another",title:"Another",children:{attached:[{id:"read",title:"Duplicate"}]}}
  ]}),/duplicate topic ID/);
  assert.equal(JSON.stringify(sheets),before);
  assert.throws(()=>duplicateTopic({id:"same",title:"Parent",children:{attached:[{id:"same",title:"Child"}]}}),/Invalid clipboard/);
  const changed=editDocument(sheets,sheets[0].id,{type:"paste",parent:"root",topics:[{id:"a1",title:"A"},{id:"b1",title:"B"}]});
  const archive=openDocument(sampleArchive());
  const reopened=openDocument(writeDocument(archive,changed));
  assert.deepEqual(reopened.sheets[0].rootTopic.children!.attached!.slice(-2).map(t=>t.title),["A","B"]);
});

test(1, "relationship control vectors are relative to the matching topic centres", () => {
  const sheet=sampleSheets()[0], scene=buildScene(sheet);
  const a=scene.nodes.find(n=>n.topic.id==='read')!, b=scene.nodes.find(n=>n.topic.id==='edit')!;
  const relation={id:'r',end1Id:'read',end2Id:'edit',title:'Review',controlPoints:{'0':{x:200,y:-100},'1':{x:250,y:80}},style:{properties:{'line-color':'#aa1122','line-pattern':'solid','line-width':'3pt'}}};
  const g=relationshipGeometry(sheet,relation,a,b);
  assert.deepEqual(g.c1,{x:a.x+a.width/2+200,y:a.y+a.height/2-100});
  assert.deepEqual(g.c2,{x:b.x+b.width/2+250,y:b.y+b.height/2+80});
  assert.equal(g.color,'#aa1122');assert.equal(g.width,3);assert.equal(g.dash,undefined);
  assert.equal(g.label.x,(g.start.x+3*g.c1.x+3*g.c2.x+g.end.x)/8);
  assert.notEqual(g.start.x,a.x+a.width/2,'control direction determines the outline attachment, not a fixed top-centre point');
});
test(2, "relationship outline intersections and coincident topics remain finite", () => {
  const a=buildScene(sampleSheets()[0]).nodes[0];
  for(const shape of ['ellipse','diamond','roundedRect']) {
    const n={...a,x:0,y:0,width:100,height:60,shape};
    const p=topicAnchor(n,{x:200,y:120});
    assert.ok(p.x>=0&&p.x<=100&&p.y>=0&&p.y<=60);
    const g=relationshipGeometry(sampleSheets()[0],{id:'r',end1Id:'a',end2Id:'a'},n,n);
    assert.ok(!/NaN|Infinity/.test(g.path));
  }
});
test(3, "relationship edits preserve the other control, custom fields and archive resources", () => {
  const doc=openDocument(sampleArchive());
  const sheets=editDocument(doc.sheets,'sheet-main',{type:'relationship-update',id:'rel',controlPoints:{'1':{x:200,y:-120}},title:'Updated relation'});
  const result=openDocument(writeDocument(doc,sheets));
  assert.deepEqual(result.sheets[0].relationships![0].controlPoints,{'0':{x:8,y:9},'1':{x:200,y:-120}});
  assert.deepEqual(result.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
  assert.throws(()=>editDocument(sheets,'sheet-main',{type:'relationship-update',id:'rel',controlPoints:{'0':{x:NaN,y:0}}}),/Invalid control/);
  assert.equal(editDocument(sheets,'sheet-main',{type:'relationship-delete',id:'rel'})[0].relationships!.length,0);
  assert.equal(result.sheets[0].relationships!.length,1);
});
test(1, "organization branches honour explicit curves and use curved central/default rounded child links", () => {
  for(const dir of ['up','down']) {
    const sheet=sampleSheets()[1];sheet.rootTopic.structureClass='org.xmind.ui.org-chart.'+dir;
    for(const [style,token] of [['','Q'],['org.xmind.branchConnection.curve','C'],['org.xmind.branchConnection.elbow','H'],['org.xmind.branchConnection.roundedElbow','Q']]) {
      sheet.rootTopic.style={properties:{'line-class':style}};
      const scene=buildScene(sheet),edge=scene.edges.find(e=>e.from===sheet.rootTopic.id)!;
      const path=edgePath(edge,scene.nodes.find(n=>n.topic.id===edge.from)!,scene.nodes.find(n=>n.topic.id===edge.to)!);
      assert.ok(path.includes(token),`${dir} ${style}: ${path}`);
    }
  }
});

test(2, "detached maps honour explicit right-number instead of inheriting the central direction", () => {
  const sheet=sampleSheets()[0];
  sheet.rootTopic.children!.detached=[{id:'free-direction',title:'Free',structureClass:'org.xmind.ui.map.unbalanced',
    extensions:[{provider:'org.xmind.ui.map.unbalanced',content:[{name:'right-number',content:'0'}]}],
    children:{attached:[{id:'free-left',title:'Left'}]}}];
  const scene=buildScene(sheet),free=scene.nodes.find(n=>n.topic.id==='free-direction')!,child=scene.nodes.find(n=>n.topic.id==='free-left')!;
  assert.ok(child.x+child.width<free.x);
});

test(1, "native default branch counts keep two topics on the right before balancing", () => {
  for(const [count,right] of [[1,1],[2,2],[3,2],[4,2],[6,3]]) {
    const sheet=sampleSheets()[0];sheet.rootTopic.children={attached:Array.from({length:count},(_,i)=>({id:'b'+i,title:'Branch '+i}))};
    const scene=buildScene(sheet),root=scene.nodes.find(n=>n.depth===0)!;
    assert.equal(scene.nodes.filter(n=>n.depth===1&&n.x>root.x).length,right);
  }
});

test(1, "native no-theme defaults distinguish central, main, leaf and floating topics", () => {
  const sheet: Sheet = {id:'defaults',title:'默认',rootTopic:{id:'r',title:'核对',children:{attached:[{id:'a',title:'设计',children:{attached:[{id:'l',title:'视觉规范'}]}}],detached:[{id:'f',title:'自由主题'}]}}};
  const nodes=buildScene(sheet).nodes, get=(id:string)=>nodes.find(n=>n.topic.id===id)!;
  assert.deepEqual(['r','a','l','f'].map(id=>get(id).fontSize),[30,18,14,14]);
  assert.deepEqual(['r','a','l','f'].map(id=>get(id).fill),['#3949AB','#EEEEEE','none','#00897B']);
  assert.equal(get('a').width,76);assert.equal(get('l').width,68);assert.equal(get('f').width,82);
  const note=structuredClone(sheet);note.rootTopic.children!.attached![0].notes={plain:{content:'新建测试备注'}};
  const withNote=buildScene(note).nodes.find(n=>n.topic.id==='a')!;
  assert.equal(withNote.height,get('a').height);assert.equal(withNote.width,get('a').width+24);
  assert.ok(withNote.indicatorPositions[0].x>withNote.titleX);
});
test(3, "multi-topic moves keep document order, descendants, metadata and atomic archive edits", () => {
  const doc=openDocument(sampleArchive()), sheet=doc.sheets[0], roots=sheet.rootTopic.children!.attached!;
  const first=roots[0],second=roots[1],target=roots[2];
  assert.ok(target);
  const moved=editDocument(doc.sheets,sheet.id,{type:'move-many',ids:[second.id,first.id,...childrenOf(first).map(n=>n.id)],parent:target.id});
  const dest=findTopic(moved[0].rootTopic,target.id)!;
  assert.deepEqual(dest.children!.attached!.slice(-2),[first,second]);
  assert.deepEqual(doc.sheets[0],sheet);
  const back=openDocument(writeDocument(doc,moved));
  assert.deepEqual(back.sheets,moved);assert.deepEqual(back.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
  assert.throws(()=>editDocument(doc.sheets,sheet.id,{type:'move-many',ids:[first.id],parent:childrenOf(first)[0].id}),/descendant/);
  const detached=editDocument(doc.sheets,sheet.id,{type:'move-many',ids:[first.id,second.id],parent:sheet.rootTopic.id,positions:{[first.id]:{x:0,y:40},[second.id]:{x:20,y:90}}});
  assert.equal(findTopic(detached[0].rootTopic,first.id)!.position!.x,0);
  assert.throws(()=>editDocument(doc.sheets,sheet.id,{type:'move-many',ids:[first.id,second.id],parent:sheet.rootTopic.id,positions:{[first.id]:{x:0,y:0}}}),/Invalid topic position/);
});
test(2, "drop geometry rejects descendants and distinguishes child and sibling insertion", () => {
  const sheet:Sheet={id:'drag',title:'Drag',rootTopic:{id:'r',title:'Root',structureClass:'org.xmind.ui.logic.right',children:{attached:[{id:'a',title:'A',children:{attached:[{id:'a1',title:'A1'}]}},{id:'b',title:'B'},{id:'c',title:'C'}]}}};
  const nodes=buildScene(sheet).nodes,get=(id:string)=>nodes.find(n=>n.topic.id===id)!,moving=new Set(['a','a1']);
  const b=get('b');
  assert.equal(topicDropTarget(nodes,moving,b.x+b.width/2,b.y+b.height/2,1)!.kind,'child');
  assert.equal(topicDropTarget(nodes,moving,b.x+b.width/2,b.y+b.height/2,0.1)!.target,'b');
  assert.equal(topicDropTarget(nodes,moving,b.x+b.width/2,b.y,1)!.kind,'before');
  assert.equal(topicDropTarget(nodes,moving,b.x+b.width/2,b.y+b.height,1)!.kind,'after');
  const a1=get('a1');assert.equal(topicDropTarget(nodes,moving,a1.x+a1.width/2,a1.y+a1.height/2,1)!.kind,'invalid');
  const result=editDocument([sheet],sheet.id,{type:'move-many',ids:['c','a'],parent:'r',before:'b'});
  assert.deepEqual(result[0].rootTopic.children!.attached!.map(n=>n.id),['a','c','b']);
  assert.equal(topicDropTarget(nodes,moving,10000,10000,1),null);
});
test(2, "boundaries and summary subtrees reserve space during sibling layout", () => {
  for(const direction of ['right','left','down','up']) {
    const sheet:Sheet={id:'spacing',title:'Spacing',rootTopic:{id:'r',title:'Root',structureClass:direction==='up'||direction==='down'?'org.xmind.ui.org-chart.'+direction:'org.xmind.ui.logic.'+direction,children:{attached:[{id:'a',title:'A',children:{attached:[{id:'a1',title:'Previous'},{id:'a2',title:'Grouped'},{id:'a3',title:'Following'}],summary:[{id:'sum',title:'A summary with descendants',children:{attached:[{id:'sum1',title:'Detail'}]}}]},boundaries:[{id:'bound',range:'(1,1)',title:'Boundary long label '.repeat(8)}],summaries:[{id:'sum-group',range:'(1,1)',topicId:'sum'}]},{id:'b',title:'B'}]}}};
    const scene=buildScene(sheet),group=scene.groups.find(g=>g.id==='bound')!;
    const others=scene.nodes.filter(n=>n.topic.id==='a1'||n.topic.id==='a3'||n.topic.id==='b');
    const titleBox={...group,y:group.y-group.titleHeight,height:group.height+group.titleHeight};
    const overlaps=(a:{x:number;y:number;width:number;height:number},b:typeof a)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
    for(const n of others)assert.equal(overlaps(titleBox,n),false,`${direction} ${n.topic.id}`);
    const summary=scene.nodes.find(n=>n.topic.id==='sum')!;
    assert.ok(scene.nodes.some(n=>n.topic.id==='sum1'));
    for(const n of others)assert.equal(overlaps(summary,n),false,`${direction} summary ${n.topic.id}`);
  }
});
test(3, "moving every grouped member removes the empty group and its orphan summary", () => {
  const sheet:Sheet={id:'groups',title:'Groups',rootTopic:{id:'r',title:'R',children:{attached:[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C'}],summary:[{id:'sum',title:'Summary'}]},boundaries:[{id:'bound',range:'(0,1)'}],summaries:[{id:'summary',range:'(0,1)',topicId:'sum'}]}};
  const result=editDocument([sheet],sheet.id,{type:'move-many',ids:['a','b'],parent:'c'})[0];
  assert.equal(result.rootTopic.boundaries!.length,0);assert.equal(result.rootTopic.summaries!.length,0);
  assert.equal(result.rootTopic.children!.summary!.length,0);
  assert.equal(sheet.rootTopic.children!.summary!.length,1);
});
test(4, "inspector styles match rendered topic kinds and inherited branch lines", () => {
  const sheet:Sheet={id:'styles',title:'Styles',rootTopic:{id:'r',title:'Root',children:{attached:[{id:'a',title:'A',style:{properties:{'line-color':'#ff0000'}},children:{attached:[{id:'leaf',title:'Leaf'}],callout:[{id:'call',title:'Callout'}],summary:[{id:'sum',title:'Summary'}]},summaries:[{id:'sg',range:'(0,0)',topicId:'sum'}]}],detached:[{id:'free',title:'Free',children:{attached:[{id:'free-child',title:'Child'}]}}]}}};
  for(const node of buildScene(sheet).nodes) {
    const resolved=topicStyle(sheet,node.topic.id);
    for(const key of ['fontSize','fill','color','shape','lineColor'] as const) assert.equal(resolved[key],node[key],`${node.topic.id} ${key}`);
  }
  const summary=topicStyle(sheet,'sum');
  assert.deepEqual([summary.fill,summary.color,summary.shape,summary.fontSize],['#00897B','#FFFFFF','roundedRect',14]);
  sheet.rootTopic.children!.attached![0].children!.summary![0].style={properties:{'svg:fill':'#123456','fo:color':'#abcdef','shape-class':'ellipse'}};
  const custom=topicStyle(sheet,'sum');assert.deepEqual([custom.fill,custom.color,custom.shape],['#123456','#abcdef','ellipse']);
});
test(4, "three-branch maps put the lone left topic below center without shifting logic trees", () => {
  const sheet:Sheet={id:'quadrants',title:'Quadrants',rootTopic:{id:'r',title:'Root',structureClass:'org.xmind.ui.map.unbalanced',children:{attached:[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C'}]}}};
  const scene=buildScene(sheet),r=scene.nodes[0],left=scene.nodes.find(n=>n.topic.id==='c')!;
  assert.ok(left.y>r.y+r.height/2);
  sheet.rootTopic.structureClass='org.xmind.ui.logic.left';sheet.rootTopic.children!.attached=sheet.rootTopic.children!.attached!.slice(0,1);
  const logic=buildScene(sheet);assert.equal(logic.nodes[0].y+logic.nodes[0].height/2,logic.nodes[1].y+logic.nodes[1].height/2);
});
test(4, "native group defaults and inherited colors resolve consistently", () => {
  const sheet=sampleSheets()[0], group={id:'test',range:'(0,0)'};
  assert.equal(groupStyle(sheet,group,false)['svg:opacity'],'0.2');
  assert.equal(groupStyle({...sheet,theme:{}},group,true)['line-color'],'#00897B');
  sheet.theme={boundary:{properties:{'svg:fill':'#123456','line-color':'#654321'}}};
  assert.equal(groupStyle(sheet,{...group,style:{properties:{'svg:fill':'inherited'}}},false)['svg:fill'],'#123456');
  assert.equal(groupStyle(sheet,{...group,style:{properties:{'line-color':'#abcdef'}}},false)['line-color'],'#abcdef');
});
test(1, "native mind-map quadrants leave the center clear and preserve clockwise order", () => {
  for(const count of [1,2,3,4,5,6]) {
    const sheet:Sheet={id:'map',title:'Map',rootTopic:{id:'r',title:'中心主题',structureClass:'org.xmind.ui.map.unbalanced',children:{attached:Array.from({length:count},(_,i)=>({id:'n'+i,title:'主题'+i}))}}};
    const original=structuredClone(sheet),scene=buildScene(sheet),root=scene.nodes[0];
    const node=(i:number)=>scene.nodes.find(n=>n.topic.id==='n'+i)!;
    const cy=(n:typeof root)=>n.y+n.height/2;
    assert.equal(root.height,78);
    if(count<=4) {
      assert.ok(node(0).y+node(0).height<=root.y,'first branch occupies upper quadrant');
      if(count>1)assert.ok(node(1).y>=root.y+root.height,'second branch occupies lower quadrant');
      if(count>2)assert.ok(node(2).y>=root.y+root.height,'first left branch occupies lower quadrant');
    } else {
      assert.ok(Math.abs(cy(node(1))-cy(root))<1e-8,'odd branch stack has a centered middle topic');
    }
    if(count===2||count===3||count===4)assert.ok(Math.abs((cy(node(0))+cy(node(1)))/2-cy(root))<1e-8);
    if(count===4)assert.ok(cy(node(3))<cy(node(2)),'left branches reverse document order');
    assert.deepEqual(sheet,original,'layout never writes topic positions');
  }
});
test(2, "asymmetric branches center their actual connection anchors in either direction", () => {
  for(const direction of ['left','right']) {
    const sheet:Sheet={id:'anchors',title:'Anchors',rootTopic:{id:'r',title:'中心',structureClass:'org.xmind.ui.logic.'+direction,children:{attached:[{id:'a',title:'Parent',children:{attached:[{id:'a1',title:'First'},{id:'a2',title:'Middle'},{id:'a3',title:'Last'}]}},{id:'b',title:'Other',children:{attached:[{id:'b1',title:'First'},{id:'b2',title:'Last'}]}}]}}};
    const scene=buildScene(sheet),node=(id:string)=>scene.nodes.find(n=>n.topic.id===id)!;
    const cy=(id:string)=>node(id).y+node(id).height/2;
    const baseline=(id:string)=>node(id).y+node(id).height;
    assert.ok(Math.abs(cy('a')-baseline('a2'))<1e-8);
    assert.ok(Math.abs(cy('b')-(baseline('b1')+baseline('b2'))/2)<1e-8);
    assert.ok(Math.abs(cy('r')-(cy('a')+cy('b'))/2)<1e-8);
  }
});
test(3, "logic roots use longer side connections while mind maps keep their own curves", () => {
  for(const direction of ['left','right']) {
    const sheet:Sheet={id:'logic',title:'Logic',rootTopic:{id:'r',title:'中心',structureClass:'org.xmind.ui.logic.'+direction,children:{attached:[{id:'a',title:'A'},{id:'b',title:'B'}]}}};
    const scene=buildScene(sheet),root=scene.nodes[0],child=scene.nodes[1];
    assert.equal(direction==='right'?child.x-root.x-root.width:root.x-child.x-child.width,100);
    const path=edgePath(scene.edges[0],root,child);
    assert.ok(path.startsWith(`M${direction==='right'?root.x+root.width:root.x},${root.y+root.height/2} C`));
  }
});
test(3, "organization levels use compact subtopics and center unequal child widths", () => {
  for(const direction of ['up','down']) {
    const sheet:Sheet={id:'org',title:'Org',rootTopic:{id:'r',title:'中心',structureClass:'org.xmind.ui.org-chart.'+direction,children:{attached:[{id:'a',title:'A',children:{attached:[{id:'a1',title:'Short'},{id:'a2',title:'Much wider topic'},{id:'a3',title:'Third'}]}},{id:'b',title:'B'}]}}};
    const scene=buildScene(sheet),get=(id:string)=>scene.nodes.find(n=>n.topic.id===id)!,cx=(id:string)=>get(id).x+get(id).width/2;
    assert.ok(Math.abs(cx('r')-(cx('a')+cx('b'))/2)<1e-8);
    assert.ok(Math.abs(cx('a')-(cx('a1')+cx('a3'))/2)<1e-8);
    const rootGap=direction==='down'?get('a').y-get('r').y-get('r').height:get('r').y-get('a').y-get('a').height;
    assert.ok(Math.abs(rootGap-100)<1e-8);
    assert.ok(Math.abs(get('a2').x-get('a1').x-get('a1').width-6)<1e-8);
  }
});
test(3, "brace structure inherits into descendants but explicit child structure overrides it", () => {
  const sheet:Sheet={id:'brace',title:'Brace',rootTopic:{id:'r',title:'中心',structureClass:'org.xmind.ui.brace.right',children:{attached:[{id:'a',title:'A',children:{attached:[{id:'a1',title:'One'},{id:'a2',title:'Two'}]}},{id:'b',title:'B',structureClass:'org.xmind.ui.logic.right',children:{attached:[{id:'b1',title:'Override'}]}}]}}};
  const scene=buildScene(sheet);assert.ok(scene.edges.filter(e=>e.from==='a').every(e=>e.brace));
  assert.equal(scene.edges.find(e=>e.to==='b1')!.brace,false);
});
test(5, "horizontal timeline milestones share one axis with alternating compact detail stacks", () => {
  const sheet=fishSheet("org.xmind.ui.timeline.horizontal",3);
  const before=structuredClone(sheet),scene=buildScene(sheet),get=(id:string)=>scene.nodes.find(n=>n.topic.id===id)!;
  assert.deepEqual(scene.warnings,[]);
  for(let i=0;i<3;i++) {
    const main=get(`cause-${i}`),previous=i?get(`cause-${i-1}`):scene.nodes[0];
    assert.ok(Math.abs(main.y+main.height/2)<1e-8);
    assert.ok(main.x>=previous.x+previous.width+100-1e-8);
    const axis=scene.edges.find(e=>e.to===main.topic.id)!.points!;
    assert.equal(axis[0].x,previous.x+previous.width);
    assert.equal(axis[1].x,main.x);
    assert.ok(axis.every(p=>p.y===0));
    for(let j=0;j<3;j++) {
      const leaf=get(`leaf-${i}-${j}`),edge=scene.edges.find(e=>e.to===leaf.topic.id)!;
      assert.ok(i%2===0?leaf.y+leaf.height<main.y:leaf.y>main.y+main.height);
      assert.ok(leaf.x>main.x+main.width/2);
      assert.ok(edgePath(edge,main,leaf).includes('Q'));
      if(j) { const previousLeaf=get(`leaf-${i}-${j-1}`); assert.ok(Math.abs(leaf.y-previousLeaf.y-previousLeaf.height-3)<1e-8); }
    }
  }
  assert.deepEqual(sheet,before);
});
test(5, "timeline folding, explicit structures and deep content remain visible without overlaps", () => {
  const sheet=fishSheet("org.xmind.ui.timeline.horizontal",4);
  const first=sheet.rootTopic.children!.attached![0];
  first.children!.attached![0].title='Multi-line content '.repeat(30);
  first.children!.attached![0].children={attached:[{id:'timeline-deep',title:'Nested child'}]};
  sheet.rootTopic.children!.attached![2].structureClass='org.xmind.ui.logic.right';
  const scene=buildScene(sheet),folded=buildScene(sheet,new Set(['cause-0']));
  assert.ok(scene.nodes.some(n=>n.topic.id==='timeline-deep'));
  assert.ok(!folded.nodes.some(n=>n.topic.id==='timeline-deep'));
  assert.ok(folded.nodes.some(n=>n.topic.id==='cause-0'));
  assert.equal(buildScene(sheet,new Set(['fish'])).nodes.length,1);
  for(const current of [scene,folded]) for(const a of current.nodes) for(const b of current.nodes) if(a!==b) {
    assert.ok(a.x+a.width<=b.x+1e-8||b.x+b.width<=a.x+1e-8||a.y+a.height<=b.y+1e-8||b.y+b.height<=a.y+1e-8,`timeline overlap ${a.topic.id}/${b.topic.id}`);
  }
  sheet.rootTopic.structureClass='org.xmind.ui.timeline.vertical';
  assert.ok(buildScene(sheet).warnings.includes('org.xmind.ui.timeline.vertical'),'unverified variants must remain identified');
});
test(5, "fishbone detail spacing matches compact native stacks in both orientations", () => {
  for(const structure of ['leftHeaded','rightHeaded']) {
    const scene=buildScene(fishSheet('org.xmind.ui.fishbone.'+structure,2));
    for(let i=0;i<2;i++) {
      const leaves=[0,1,2].map(j=>scene.nodes.find(n=>n.topic.id===`leaf-${i}-${j}`)!);
      assert.ok(Math.abs(Math.abs(leaves[1].y-leaves[0].y)-leaves[0].height-3)<1e-8);
    }
  }
});
test(5, "timeline long upper details do not push the next lower milestone away", () => {
  const sheet=fishSheet("org.xmind.ui.timeline.horizontal",3);
  const baseline=buildScene(sheet),before=baseline.nodes.find(n=>n.topic.id==='cause-1')!;
  sheet.rootTopic.children!.attached![0].children!.attached![0].title='第一项·原生保存核对';
  const after=buildScene(sheet).nodes.find(n=>n.topic.id==='cause-1')!;
  assert.equal(after.x,before.x);
  assert.equal(after.y,before.y);
});
test(5, "fishbone empty and folded causes reserve distinct native rib lengths", () => {
  const sheet=fishSheet(undefined,2);sheet.rootTopic.children!.attached![1].children={attached:[]};
  const scene=buildScene(sheet,new Set(['cause-0']));
  for(const [id,reach] of [['cause-0',70],['cause-1',50]] as const) {
    const [base,tip]=scene.edges.find(e=>e.to===id)!.points!;
    assert.equal(Math.abs(base.y-tip.y),reach);
  }
});
test(5, "fishbone upper ribs close the gap independently of longer lower content", () => {
  const sheet=fishSheet(undefined,3),folded=new Set(['cause-0']);
  sheet.rootTopic.children!.attached![2].children={attached:[]};
  const before=buildScene(sheet,folded),base=before.edges.find(e=>e.to==='cause-2')!.points![0].x;
  sheet.rootTopic.children!.attached![1].children!.attached![0].title='Extremely long lower detail '.repeat(20);
  const after=buildScene(sheet,folded);
  assert.equal(after.edges.find(e=>e.to==='cause-2')!.points![0].x,base);
  for(const a of after.nodes)for(const b of after.nodes)if(a!==b)
    assert.ok(a.x+a.width<=b.x+1e-8||b.x+b.width<=a.x+1e-8||a.y+a.height<=b.y+1e-8||b.y+b.height<=a.y+1e-8,`fishbone overlap ${a.topic.id}/${b.topic.id}`);
});
test(1, "native vertical, off-axis and leftward timeline axes remain distinct", () => {
  for (const sheet of round6Sheets()) {
    const before = JSON.stringify(sheet), scene = buildScene(sheet), nodes = scene.nodes;
    const root = nodes[0], main = nodes.filter(n => n.parent === root.topic.id);
    assert.equal(scene.warnings.length, 0);
    assert.equal(nodes.length, 13);
    if (sheet.rootTopic.structureClass!.includes("vertical")) {
      assert.equal(root.direction, "down");
      for (const [i,n] of main.entries()) {
        assert.ok(Math.abs(n.x + n.width / 2) < 0.001);
        assert.ok(n.y > (i ? main[i-1].y + main[i-1].height : root.y + root.height));
        const detail=nodes.find(child=>child.parent===n.topic.id)!;
        assert.ok(i%2 ? detail.x+detail.width<n.x : detail.x>n.x+n.width);
      }
    } else if (sheet.rootTopic.structureClass!.includes("sided")) {
      main.forEach((n,i) => assert.ok(i % 2 ? n.y > 0 : n.y + n.height < 0));
      assert.equal(scene.edges.filter(e=>e.trunk).length,4);
      if(sheet.rootTopic.structureClass!.endsWith('.rtl')) {
        assert.equal(root.direction,'left');
        assert.ok(main.every(n=>n.x+n.width<root.x));
        assert.ok(main.every((n,i)=>!i||n.x<main[i-1].x));
      }
    } else {
      main.forEach(n => assert.ok(Math.abs(n.y+n.height/2)<0.001));
      if (sheet.rootTopic.structureClass!.endsWith("rtl")) {
        assert.equal(root.direction,"left");
        assert.ok(main.every(n=>n.x+n.width<root.x));
        const detail=nodes.find(n=>n.parent===main[0].topic.id)!;
        assert.ok(detail.x+detail.width<main[0].x+main[0].width/2);
      }
    }
    assert.equal(JSON.stringify(sheet),before);
  }
});
test(2, "off-axis boundaries keep consecutive milestones on one side and preserve structure overrides", () => {
  for(const template of round6Sheets().filter(s=>s.rootTopic.structureClass!.includes('sided'))) {
    for(const [ranges,sides] of [
      [['(0,1)'],[true,true,false,true]],
      [['(1,2)'],[true,false,false,true]],
      [['(0,1)','(1,2)'],[true,true,true,false]],
      [['(0,1)','(2,3)'],[true,true,false,false]],
      [['(2,1)','(0,99)','master'],[true,false,true,false]],
    ] as [string[],boolean[]][]) {
      const sheet=structuredClone(template),root=sheet.rootTopic;
      const children=root.children!.attached!;
      children[1].structureClass='org.xmind.ui.org-chart.down';
      root.boundaries=ranges.map((range,i)=>({id:`range-${i}`,title:'Grouped stages',range}));
      const before=JSON.stringify(sheet);
      for(const folded of [new Set<string>(),new Set([children[0].id]),new Set(children.map(c=>c.id))]) {
        const scene=buildScene(sheet,folded),main=children.map(c=>scene.nodes.find(n=>n.topic.id===c.id)!);
        main.forEach((n,i)=>assert.ok(sides[i]?n.y+n.height<0:n.y>0,`${template.title} ${ranges} stage ${i}`));
        if(!folded.has(children[1].id)) {
          const details=scene.nodes.filter(n=>n.parent===children[1].id);
          assert.ok(details.every(n=>sides[1]?n.y+n.height<main[1].y:n.y>main[1].y+main[1].height));
          assert.ok(details[0].y<details[1].y,'stored org-chart override does not replace the native detail stack');
        }
        for(const [i,a] of scene.nodes.entries()) for(const b of scene.nodes.slice(i+1))
          assert.ok(a.x+a.width<=b.x+.01||b.x+b.width<=a.x+.01||a.y+a.height<=b.y+.01||b.y+b.height<=a.y+.01,'grouped milestones do not overlap');
      }
      assert.equal(JSON.stringify(sheet),before);
      const doc=openDocument(sampleArchive([sheet]));
      const edited=editDocument(doc.sheets,sheet.id,{type:'title',id:children[0].id,title:'Saved stage'});
      const reopened=openDocument(writeDocument(doc,edited));
      assert.equal(reopened.sheets[0].rootTopic.children!.attached![0].title,'Saved stage');
      assert.equal(reopened.sheets[0].rootTopic.children!.attached![1].structureClass,'org.xmind.ui.org-chart.down');
      assert.deepEqual(reopened.sheets[0].rootTopic.boundaries,root.boundaries);
    }
  }
});
test(2, "timeline detail boundary captions clear the milestone and master frames remain unique", () => {
  for(const sheet of round6Sheets().filter(s=>s.rootTopic.structureClass!.includes('horizontal'))) {
    const children=sheet.rootTopic.children!.attached!;
    children.forEach((child,i)=>{child.boundaries=[
      {id:`detail-${i}`,range:'(0,1)',title:'Long caption\nSecond line',style:{properties:{'fo:font-size':'28'}}},
      {id:`master-${i}`,range:'master',title:'Whole stage'},
    ];});
    const scene=buildScene(sheet);
    children.forEach((child,i)=>{
      const milestone=scene.nodes.find(n=>n.topic.id===child.id)!;
      const frame=scene.groups.find(g=>g.id===`detail-${i}`)!;
      assert.equal(scene.groups.filter(g=>g.id===`master-${i}`).length,1);
      assert.ok(frame.y+frame.height<milestone.y || frame.y-frame.titleHeight>milestone.y+milestone.height,
        `${sheet.title} caption must not cover stage ${i}`);
      const master=scene.groups.find(g=>g.id===`master-${i}`)!;
      assert.ok(master.y<=Math.min(milestone.y,frame.y-frame.titleHeight));
      assert.ok(master.y+master.height>=Math.max(milestone.y+milestone.height,frame.y+frame.height));
    });
  }
});
test(2, "upward through timelines preserve detail reading order, groups, fold states and archive fields", () => {
  const sheet=timelineVariantSheets()[0],children=sheet.rootTopic.children!.attached!;
  children[0].children!.attached![0].title='Long 中文 detail '.repeat(12);
  children[1].boundaries=[{id:'detail-group',range:'(0,1)',title:'明细分组'}];
  sheet.rootTopic.boundaries=[{id:'stage-group',range:'(0,1)',title:'前两阶段'}];
  const before=JSON.stringify(sheet);
  for(const fold of [new Set<string>(),new Set([children[0].id]),new Set(children.map(c=>c.id))]) {
    const scene=buildScene(sheet,fold),root=scene.nodes[0],main=children.map(c=>scene.nodes.find(n=>n.topic.id===c.id)!);
    assert.equal(root.direction,'up');assert.equal(scene.warnings.length,0);
    for(const [i,n] of main.entries()) {
      assert.ok(Math.abs(n.x+n.width/2)<.001);
      assert.ok(n.y+n.height<(i?main[i-1].y:root.y));
      const details=scene.nodes.filter(d=>d.parent===n.topic.id);
      if(details.length) {
        assert.ok(details[0].y<details[1].y,'A precedes B in upward main-axis layouts');
        assert.ok(details.every(d=>i%2?d.x+d.width<n.x:d.x>n.x+n.width));
      }
    }
    assert.equal(groupRangeAxis(root,scene.nodes),'y');
    assert.equal(groupRangeReversed(sheet.rootTopic,scene.nodes,'y'),true);
    for(const [i,a] of scene.nodes.entries())for(const b of scene.nodes.slice(i+1))
      assert.ok(a.x+a.width<=b.x+.01||b.x+b.width<=a.x+.01||a.y+a.height<=b.y+.01||b.y+b.height<=a.y+.01);
    for(const edge of scene.edges.filter(e=>e.from===root.topic.id))assert.equal(edge.direction,'up');
  }
  assert.equal(JSON.stringify(sheet),before);
  const doc=openDocument(sampleArchive([sheet]));
  const edited=editDocument(doc.sheets,sheet.id,{type:'fold',ids:[children[0].id],folded:true});
  const saved=openDocument(writeDocument(doc,edited));
  assert.equal(saved.sheets[0].rootTopic.structureClass,'org.xmind.ui.timeline.through.vertical.btt');
  assert.equal(saved.sheets[0].rootTopic.children!.attached![0].branch,'folded');
  assert.deepEqual(saved.sheets[0].rootTopic.boundaries,sheet.rootTopic.boundaries);
});
test(2, "symmetric vertical milestones balance 1–5 details while preserving reading order and source structure", () => {
  for(const sheet of timelineVariantSheets(true).slice(1)) {
    const children=sheet.rootTopic.children!.attached!,upward=sheet.rootTopic.structureClass!.endsWith('.btt');
    children[0].structureClass='org.xmind.ui.org-chart.down';
    const before=JSON.stringify(sheet);
    const scene=buildScene(sheet),root=scene.nodes[0];
    assert.equal(scene.warnings.length,0);assert.equal(root.direction,upward?'up':'down');
    children.forEach((child,i)=>{
      const stage=scene.nodes.find(n=>n.topic.id===child.id)!;
      const details=child.children!.attached!.map(t=>scene.nodes.find(n=>n.topic.id===t.id)!);
      const count=[1,2,2,2,3][i]; // Native five-stage quantity probe.
      assert.equal(stage.direction,'side');
      assert.equal(stage.topic.structureClass,child.structureClass,'render-only override must not escape into source topics');
      assert.ok(Math.abs(stage.x+stage.width/2)<.001);
      details.forEach((n,j)=>assert.ok(j<count?n.x>stage.x+stage.width:n.x+n.width<stage.x));
      for(let j=1;j<count;j++)assert.ok(details[j].y>details[j-1].y);
      for(let j=count+1;j<details.length;j++)assert.ok(details[j].y<details[j-1].y);
      for(const side of [details.slice(0,count),details.slice(count)])if(side.length) {
        const center=side.reduce((sum,n)=>sum+n.y+n.height/2,0)/side.length;
        assert.ok(Math.abs(center-stage.y-stage.height/2)<.001,'each side remains centered on the milestone');
      }
    });
    assert.equal(JSON.stringify(sheet),before);
    const folded=buildScene(sheet,new Set(children.map(c=>c.id)));assert.equal(folded.nodes.length,6);
    const doc=openDocument(sampleArchive([sheet]));
    const edited=editDocument(doc.sheets,sheet.id,{type:'title',id:children[2].id,title:'Saved symmetric stage'});
    const reopened=openDocument(writeDocument(doc,edited));
    assert.equal(reopened.sheets[0].rootTopic.children!.attached![2].title,'Saved symmetric stage');
    assert.equal(reopened.sheets[0].rootTopic.children!.attached![0].structureClass,'org.xmind.ui.org-chart.down');
    assert.equal(reopened.sheets[0].rootTopic.structureClass,sheet.rootTopic.structureClass);
  }
});
test(2, "timeline variants keep long, mixed and grouped subtrees separate at every fold state", () => {
  for (const sheet of [...round6Sheets(),...timelineVariantSheets()]) {
    const children=sheet.rootTopic.children!.attached!;
    children[0].children!.attached![0].title="中文 Long title ".repeat(24);
    children[1].structureClass="org.xmind.ui.org-chart.down";
    children[2].boundaries=[{id:sheet.id+"-boundary",range:"(0,1)",title:"分组长标题"}];
    for(const fold of [new Set<string>(),new Set([children[0].id]),new Set(children.map(t=>t.id))]) {
      const scene=buildScene(sheet,fold);
      for(const [i,a] of scene.nodes.entries()) {
        assert.ok(Number.isFinite(a.x+a.y+a.width+a.height));
        for(const b of scene.nodes.slice(i+1)) {
          assert.ok(a.x+a.width<=b.x+0.01 || b.x+b.width<=a.x+0.01 || a.y+a.height<=b.y+0.01 || b.y+b.height<=a.y+0.01,`${sheet.title}: ${a.topic.title} overlaps ${b.topic.title}`);
        }
      }
      for(const e of scene.edges) assert.ok(!/NaN|Infinity/.test(edgePath(e,scene.nodes.find(n=>n.topic.id===e.from)!,scene.nodes.find(n=>n.topic.id===e.to)!)));
    }
  }
});
test(3, "timeline variants and native theme survive edits and archive reopen", () => {
  const sheets=round6Sheets(),doc=openDocument(sampleArchive(sheets));
  for(const sheet of sheets) {
    const child=sheet.rootTopic.children!.attached![0];
    const edited=editDocument(doc.sheets,sheet.id,{type:"fold",ids:[child.id],folded:true});
    const reopened=openDocument(writeDocument(doc,edited));
    assert.equal(reopened.sheets.find(s=>s.id===sheet.id)!.rootTopic.children!.attached![0].branch,"folded");
    assert.deepEqual(reopened.sheets.map(s=>s.theme),sheets.map(s=>s.theme));
    assert.deepEqual(reopened.sheets.map(s=>s.rootTopic.structureClass),sheets.map(s=>s.rootTopic.structureClass));
  }
});
test(1, "native inherited rainbow fill, level style and automatic text stay visible", () => {
  const sheet=round6Sheets()[0], scene=buildScene(sheet);
  assert.equal(scene.nodes[0].fill,"none");assert.equal(scene.nodes[0].color,"#000000");
  const main=scene.nodes.find(n=>n.topic.id==='vertical-main-0')!;
  const detail=scene.nodes.find(n=>n.topic.id==='vertical-detail-0-a')!;
  assert.equal(main.fill,"#FF6B6B");assert.equal(detail.fill,"#FF6B6B");
  assert.equal(detail.properties['svg:fill-opacity'],undefined);
  assert.equal(detail.fillOpacity,0.2);assert.equal(detail.color,'#660000');
  assert.equal(scene.nodes.find(n=>n.topic.id==='vertical-detail-2-a')!.color,'#1E4733');
  const topic=sheet.rootTopic.children!.attached![0].children!.attached![0];
  topic.style={properties:{'svg:fill':'#123456','svg:fill-opacity':'0.7','fo:color':'#FEDCBA','fo:font-size':'22pt'}};
  const overridden=topicStyle(sheet,topic.id);
  assert.equal(overridden.fill,'#123456');assert.equal(overridden.properties['svg:fill-opacity'],'0.7');
  assert.equal(overridden.fillOpacity,1);assert.equal(overridden.color,'#FEDCBA');assert.equal(overridden.fontSize,22);
});
test(2, "smart inherited text prefers readable white, uses the theme palette and keeps explicit colors", () => {
  const sheets = smartColorSheets();
  const original = structuredClone(sheets);
  for (const [index, sheet] of sheets.entries()) {
    const scene = buildScene(sheet);
    const colors = scene.nodes.map(node => node.color.toUpperCase());
    assert.deepEqual(colors, index
      ? ['#FFFFFF', '#FFFFFF', '#243B53', '#FFFFFF', '#FFFFFF', '#9A2250', '#FFFFFF']
      : ['#0055CC', '#FFFFFF', '#243B53', '#243B53', '#243B53', '#9A2250', '#FFFFFF']);
    for (const node of scene.nodes) assert.equal(topicStyle(sheet, node.topic.id).color, node.color);
  }
  const rainbow = round6Sheets()[0];
  const main = rainbow.rootTopic.children!.attached![0];
  main.style = { properties: { 'svg:fill': '#777777' } };
  rainbow.theme!.map!.properties!['color-list'] = '#FFFFFF #9A2250';
  assert.equal(topicStyle(rainbow, main.id).color, '#FFFFFF');
  const doc = openDocument(sampleArchive(sheets));
  const edited = editDocument(doc.sheets, sheets[0].id, { type: 'title', id: 'smart-0-1', title: '保存智能文字' });
  const reopened = openDocument(writeDocument(doc, edited));
  assert.equal(topicStyle(reopened.sheets[0], 'smart-0-1').color, '#243B53');
  assert.deepEqual(sheets, original, 'computed colors must never modify the original styles');
  assert.deepEqual(reopened.sheets.map(sheet => sheet.theme), original.map(sheet => sheet.theme));
});
test(2, "partial themes keep base borders distinct from explicit branch inheritance", () => {
  const sheet = smartColorSheets()[0];
  const topic = sheet.rootTopic.children!.detached![0];
  const before = JSON.stringify(sheet);
  const original = topicStyle(sheet, topic.id);
  assert.equal(original.stroke, '#000000');
  assert.equal(original.properties['border-line-width'], '1');
  assert.equal(original.properties['border-line-pattern'], 'solid');
  assert.equal(JSON.stringify(sheet), before);
  topic.style!.properties = { ...topic.style!.properties,
    'line-color': '#E05566', 'line-width': '4', 'line-pattern': 'dash',
    'border-line-color': 'inherited', 'border-line-width': 'inherited', 'border-line-pattern': 'inherited' };
  const inherited = topicStyle(sheet, topic.id);
  assert.equal(inherited.stroke, '#E05566');
  assert.equal(inherited.properties['border-line-width'], '4');
  assert.equal(inherited.properties['border-line-pattern'], 'dash');
  topic.style!.properties['border-line-color'] = '#007799';
  assert.equal(topicStyle(sheet, topic.id).stroke, '#007799');
  topic.style!.properties['border-line-pattern'] = 'none';
  assert.equal(topicStyle(sheet, topic.id).stroke, 'none');
});

test(2, "smart relationship and boundary labels use their actual background and preserve explicit overrides", () => {
  for (const [index, sheet] of smartColorSheets().entries()) {
    sheet.theme!.relationship = { properties: { 'fo:color': 'inherited', 'line-color': '#777777' } };
    sheet.theme!.boundary = { properties: { 'fo:color': 'inherited', 'line-color': '#FFF4CC' } };
    const relation = { id: 'smart-relation', end1Id: `smart-${index}-0`, end2Id: `smart-${index}-1` };
    const boundary = { id: 'smart-boundary', range: '(0,1)', title: '边界颜色' };
    assert.equal(relationshipStyle(sheet, relation)['fo:color'], index ? '#FFFFFF' : '#243B53');
    assert.equal(groupStyle(sheet, boundary, false)['fo:color'], '#243B53');
    assert.equal(groupStyle(sheet, { ...boundary, style: { properties: { 'line-color': '#777777' } } }, false)['fo:color'], '#FFFFFF');
    const explicit = { properties: { 'fo:color': '#9A2250' } };
    assert.equal(relationshipStyle(sheet, { ...relation, style: explicit })['fo:color'], '#9A2250');
    assert.equal(groupStyle(sheet, { ...boundary, style: explicit }, false)['fo:color'], '#9A2250');
    assert.equal(sheet.theme!.relationship.properties!['fo:color'], 'inherited');
    assert.equal(sheet.theme!.boundary.properties!['fo:color'], 'inherited');
  }
});
test(2, "basic shapes contain padded content and have finite outline anchors", () => {
  for (const shape of TOPIC_SHAPES) for (const [w,h] of [[50,24],[70,300],[450,34]]) {
    const size=shapeSize(shape,w,h);
    const sheet:Sheet={id:'shape-test',title:'Shape',rootTopic:{id:'shape-root',title:'Title',style:{properties:{'shape-class':shape}}}};
    const node={...buildScene(sheet).nodes[0],...size,x:0,y:0};
    const polygon=shapePolygon(shape,size.width,size.height);
    if(polygon) for(const x of [(size.width-w)/2,(size.width+w)/2]) for(const y of [(size.height-h)/2,(size.height+h)/2]) {
      const crosses=polygon.map((a,i)=>{const b=polygon[(i+1)%polygon.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);});
      assert.ok(crosses.every(c=>c>=-1e-8)||crosses.every(c=>c<=1e-8),`${shape} clips padded corner`);
    }
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12) {
      const dx=Math.cos(angle),dy=Math.sin(angle),c={x:size.width/2,y:size.height/2};
      const anchor=topicAnchor(node,{x:c.x+dx*1000,y:c.y+dy*1000});
      assert.ok(Number.isFinite(anchor.x+anchor.y));
      assert.ok(anchor.x>=-1e-8&&anchor.x<=size.width+1e-8&&anchor.y>=-1e-8&&anchor.y<=size.height+1e-8);
      assert.ok(Math.abs((anchor.x-c.x)*dy-(anchor.y-c.y)*dx)<1e-7,'endpoint stays on ray');
      if(shape==='circle.compact') assert.ok(Math.abs(Math.hypot(anchor.x-c.x,anchor.y-c.y)-size.width/2)<1e-7);
      if(shape==='ellipticrectangle'&&Math.abs(anchor.x-c.x)<size.width/2-1e-6)
        assert.ok(Math.abs(Math.abs(anchor.y-c.y)-(size.height/2-.8*size.height*((anchor.x-c.x)/size.width)**2))<1e-7);
      if(shape==='ellipserect.compact') {
        const radius=size.height/2;
        const distance=Math.hypot(Math.max(0,Math.abs(anchor.x-c.x)-(size.width/2-radius)),anchor.y-c.y);
        assert.ok(Math.abs(distance-radius)<1e-7,'pill endpoints meet capsule');
      }
    }
  }
});
test(1, "saved text alignment reserves inline icons and preserves original title", () => {
  for(const alignment of ['left','center','right']) {
    const title='Long first line\n短行';
    const sheet:Sheet={id:'align-test',title:'Alignment',rootTopic:{id:'align-root',title,href:'https://example.com',image:{src:'xap:resources/test.png',width:240,height:60},style:{properties:{'fo:text-align':alignment}}}};
    const node=buildScene(sheet).nodes[0];
    assert.equal(node.titleAnchor,alignment==='left'?'start':alignment==='right'?'end':'middle');
    if(alignment==='left') assert.equal(node.titleX,node.content.x);
    if(alignment==='right') assert.equal(node.titleX,node.content.x+node.content.width-24);
    assert.ok(node.indicatorPositions[0].x+16<=node.content.x+node.content.width+1e-6);
    assert.equal(sheet.rootTopic.title,title);
  }
});
test(5, "relationship inherited overrides preserve theme colors and finite widths", () => {
  const sheet=round6Sheets()[0],scene=buildScene(sheet);
  const relation={id:'rel-style',end1Id:scene.nodes[0].topic.id,end2Id:scene.nodes[1].topic.id,style:{properties:{'line-color':'inherited','fo:color':'inherited','line-width':'invalid'}}};
  const g=relationshipGeometry(sheet,relation,scene.nodes[0],scene.nodes[1]);
  assert.equal(g.color,'#00000066');assert.equal(g.properties['fo:color'],'#000000');assert.equal(g.textColor,'#000000');assert.equal(g.width,1.5);
  assert.ok(!/NaN|Infinity/.test(g.path));
});
test(2, "long draft editors stay visible at 10 and 400 percent without changing topic styles", () => {
  const node=buildScene(round6Sheets()[0]).nodes[0],original=structuredClone(node.topic);
  const measure=(text:string,size:number)=>Array.from(text).length*size;
  for(const zoom of [.1,1,4]) for(const [w,h] of [[320,240],[720,480],[1280,800]]) {
    const viewport={x:1000,y:-1000,width:w/zoom,height:h/zoom};
    for(const draft of ['','中文','Long 中文\n'.repeat(500)]) {
      const box=draftBox(node,draft,viewport,zoom,measure);
      assert.ok(box.x+node.x>=viewport.x && box.y+node.y>=viewport.y);
      assert.ok(box.x+node.x+box.width<=viewport.x+viewport.width);
      assert.ok(box.y+node.y+box.height<=viewport.y+viewport.height-60/zoom);
      assert.ok(box.fontSize*zoom>=12);
      assert.ok(box.width>0&&box.height>0);
      const single=draftBox(node,draft,viewport,zoom,measure,true);
      assert.ok(single.height<=single.fontSize*1.4+single.padding*2+2+1e-8,'relationship labels stay one scrollable line');
    }
  }
  assert.deepEqual(node.topic,original);
});
test(1, "advanced palette fields match native saves and retain archive metadata", () => {
  assert.deepEqual(ADVANCED_SHAPES.map(s=>'org.xmind.topicShape.'+s),nativeAdvancedShapes.map(s=>s.shape));
  const sheets=round7ShapeSheets(),doc=openDocument(sampleArchive(sheets));
  const updated=editDocument(doc.sheets,sheets[0].id,{type:'title',id:'advanced-0',title:'中文新标题'});
  const reopened=openDocument(writeDocument(doc,updated));
  assert.equal(reopened.sheets[0].rootTopic.children!.detached![0].title,'中文新标题');
  assert.deepEqual(reopened.sheets[0].rootTopic.children!.detached!.map(t=>t.style),sheets[0].rootTopic.children!.detached!.map(t=>t.style));
  assert.deepEqual(reopened.sheets[0].relationships,sheets[0].relationships);
});
test(2, "concave advanced shapes contain content and all-angle line anchors touch their outline", () => {
  const base=buildScene(round7ShapeSheets()[0]).nodes[0];
  for(const shape of ADVANCED_SHAPES) for(const [w,h] of [[50,24],[70,300],[450,34]]) {
    const size=shapeSize(shape,w,h),geometry=advancedShape(shape,size.width,size.height)!;
    assert.ok(!/NaN|Infinity/.test(geometry.path));
    const node={...base,...size,x:0,y:0,shape};
    const [cx,cy]=shapeContentCenter(shape);
    for(let i=0;i<=100;i++)for(const [x,y] of [[i/100,0],[i/100,1],[0,i/100],[1,i/100]])
      assert.ok(pointInOutline([size.width*cx-w/2+x*w,size.height*cy-h/2+y*h],geometry.outline),`${shape} clips text box`);
    for(let i=0;i<72;i++) {
      const angle=i*Math.PI/36,dx=Math.cos(angle),dy=Math.sin(angle),c={x:size.width/2,y:size.height/2};
      const point=topicAnchor(node,{x:c.x+dx*10000,y:c.y+dy*10000});
      const distance=Math.min(...geometry.outline.map(([ax,ay],j)=>{
        const [bx,by]=geometry.outline[(j+1)%geometry.outline.length],ex=bx-ax,ey=by-ay;
        const t=Math.max(0,Math.min(1,((point.x-ax)*ex+(point.y-ay)*ey)/(ex*ex+ey*ey)||0));
        return Math.hypot(point.x-ax-t*ex,point.y-ay-t*ey);
      }));
      assert.ok(distance<1e-7,`${shape} arrow floats off outline`);
      assert.ok(Math.abs((point.x-c.x)*dy-(point.y-c.y)*dx)<1e-7);
    }
  }
});
test(3, "native customWidth expands text boxes and resets without losing styles or attachments", () => {
  const sheet:Sheet={id:'width-sheet',title:'Width',rootTopic:{id:'width-root',title:'中文 Title',
    children:{attached:[{id:'width-a',title:'Text',style:{properties:{'shape-class':'org.xmind.topicShape.rect','keep':'yes'}}},
      {id:'width-b',title:'More text',customWidth:180}]}}};
  const doc=openDocument(sampleArchive([sheet]));
  const next=editDocument(doc.sheets,sheet.id,{type:'width',ids:['width-a','width-b'],width:320});
  for(const id of ['width-a','width-b'])assert.equal(buildScene(next[0]).nodes.find(n=>n.topic.id===id)!.width,320);
  const bytes=writeDocument(doc,next), reopened=openDocument(bytes);
  assert.equal(reopened.sheets[0].rootTopic.children!.attached![0].customWidth,320);
  assert.deepEqual(unzipSync(bytes)['attachments/keep.bin'],unzipSync(doc.original)['attachments/keep.bin']);
  const reset=editDocument(next,sheet.id,{type:'width',ids:['width-a'],width:null});
  assert.equal(reset[0].rootTopic.children!.attached![0].customWidth,undefined);
  assert.equal(reset[0].rootTopic.children!.attached![1].customWidth,320);
  const reshape=editDocument(next,sheet.id,{type:'properties',id:'width-a',properties:{'shape-class':'org.xmind.topicShape.heart.compact'}});
  assert.equal(reshape[0].rootTopic.children!.attached![0].customWidth,undefined);
  assert.equal(reshape[0].rootTopic.children!.attached![0].style!.properties!.keep,'yes');
  for(const width of [NaN,Infinity,-1,20,2001])assert.throws(()=>editDocument(next,sheet.id,{type:'width',ids:['width-a'],width}));
  assert.equal(next[0].rootTopic.children!.attached![0].customWidth,320);
});
test(4, "advanced rich topics place markers beside titles and labels below the outline",()=>{
  const sheet=round7ShapeSheets()[1],scene=buildScene(sheet);
  for(const node of scene.nodes.filter(n=>n.detached)) {
    const outline=advancedShape(node.shape,node.width,node.height)!.outline;
    const c=node.content;
    for(const [x,y] of [[c.x,c.y],[c.x+c.width,c.y],[c.x,c.y+c.height],[c.x+c.width,c.y+c.height]])
      assert.ok(pointInOutline([x,y],outline),`${node.shape} clips rich content`);
    for(const label of node.labels) {
      assert.ok(label.y>=node.height+6);
      assert.ok(node.y+label.y+label.height<=scene.bounds.y+scene.bounds.height);
    }
    assert.equal(node.labels[0].x,0);
    assert.equal(node.labels[0].y,node.labels[1].y);
    const markerPositions=node.indicators.flatMap((icon,i)=>icon.kind==='priority'||icon.kind==='task'?[node.indicatorPositions[i]]:[]);
    for(const icon of markerPositions)assert.ok(icon.x+16<=node.titleX);
    for(const icon of node.indicatorPositions)assert.ok(icon.x>=c.x-1e-7 && icon.x+16<=c.x+c.width+1e-7);
    assert.equal(node.topic.title,sheet.rootTopic.children!.detached!.find(t=>t.id===node.topic.id)!.title);
  }
});
test(2, "external label rows reserve sibling and group space without moving outline anchors",()=>{
  for(const structureClass of ['org.xmind.ui.logic.right','org.xmind.ui.org-chart.down','org.xmind.ui.map.unbalanced']) {
    const sheet:Sheet={id:'label-layout',title:'Labels',rootTopic:{id:'label-root',title:'Root',structureClass,
      boundaries:[{id:'label-group',range:'(0,2)'}],children:{attached:Array.from({length:3},(_,i)=>({
        id:`label-${i}`,title:'Topic',labels:['Alpha','中文标签','A long label that wraps '.repeat(i+1)],
      }))}}};
    const scene=buildScene(sheet), children=scene.nodes.filter(n=>n.parent==='label-root'), group=scene.groups[0];
    for(const n of children) {
      const b=nodeVisualBounds(n);
      assert.ok(b.height>n.height);
      assert.ok(b.y+b.height<=group.y+group.height);
      for(const label of n.labels)assert.ok(label.y>=n.height);
      const hit=topicAnchor(n,{x:n.x+n.width/2,y:n.y+10000});
      assert.ok(hit.y<=n.y+n.height+1e-7,'a link touches the shape, not the labels');
      for(const other of children.filter(o=>o!==n)) {
        const o=nodeVisualBounds(other);
        assert.ok(b.x+b.width<=o.x || o.x+o.width<=b.x || b.y+b.height<=o.y || o.y+o.height<=b.y,'labels overlap an adjacent topic');
      }
    }
    const bare=structuredClone(sheet);bare.rootTopic.children!.attached!.forEach(t=>delete t.labels);
    const bareNodes=buildScene(bare).nodes;
    for(const n of children){const b=bareNodes.find(t=>t.topic.id===n.topic.id)!;assert.equal(n.width,b.width);assert.equal(n.height,b.height);}
  }
});
test(1, "native punctuation shapes keep open strokes, readable text and saved fill semantics",()=>{
  assert.deepEqual(nativePunctuation.map(v=>v.shape),PUNCTUATION_SHAPES.map(s=>`org.xmind.topicShape.${s}`));
  for(const fixture of nativePunctuation) {
    const sheet:Sheet={id:'punctuation-sheet',title:'Punctuation',rootTopic:{id:'punctuation-root',title:'中文 Unicode ✨\nSecond line',customWidth:320,
      style:{properties:{'svg:fill':'#102030','fill-pattern':'solid',keep:'unchanged'}}}};
    const doc=openDocument(sampleArchive([sheet]));
    const next=editDocument(doc.sheets,sheet.id,{type:'properties',id:'punctuation-root',properties:{'shape-class':fixture.shape}});
    const root=next[0].rootTopic,n=buildScene(next[0]).nodes[0];
    assert.equal(root.customWidth,undefined);
    assert.equal(root.style!.properties!['fill-pattern'],fixture.fill);
    assert.equal(root.style!.properties!['svg:fill'],'#102030');
    assert.equal(root.style!.properties!.keep,'unchanged');
    assert.equal(n.fill,'none');assert.equal(n.color,'#000000');
    const path=punctuationPath(fixture.shape,n.width,n.height)!;
    assert.ok(path && !/NaN|Infinity|Z/.test(path));
    assert.ok(n.content.x>=32);
    assert.deepEqual(buildScene(next[0]).warnings,[]);
    const reopened=openDocument(writeDocument(doc,next));
    assert.equal(reopened.sheets[0].rootTopic.style!.properties!['shape-class'],fixture.shape);
    assert.equal(reopened.sheets[0].rootTopic.title,sheet.rootTopic.title);
    const batch=editDocument(doc.sheets,sheet.id,{type:'properties-many',ids:['punctuation-root'],properties:{'shape-class':fixture.shape}});
    assert.deepEqual(batch,next);
  }
});
test(2, "native flowchart shapes contain titles and connect at the outer contour",()=>{
  assert.deepEqual(nativeFlowchart.map(v=>v.shape),FLOWCHART_SHAPES.map(s=>`org.xmind.topicShape.${s}`));
  for(const fixture of nativeFlowchart)for(const title of ['中文\nEnglish','长文字 '.repeat(30)]) {
    const sheet:Sheet={id:'flow-sheet',title:'Flowchart',rootTopic:{id:'flow-root',title,labels:['Label'],
      style:{properties:{'shape-class':fixture.shape,'svg:fill':'#EEFAFF','fo:color':'#102030'}}}};
    const scene=buildScene(sheet),n=scene.nodes[0],c=n.content;
    assert.deepEqual(scene.warnings,[]);
    const geometry=advancedShape(fixture.shape,n.width,n.height);
    if(geometry) {
      for(const x of [c.x,c.x+c.width])for(const y of [c.y,c.y+c.height])
        assert.ok(pointInOutline([x,y],geometry.outline),`${fixture.shape} clips title at ${x},${y}`);
      for(let i=0;i<36;i++) {
        const angle=i*Math.PI/18,point=topicAnchor(n,{x:n.x+n.width/2+10000*Math.cos(angle),y:n.y+n.height/2+10000*Math.sin(angle)});
        const distance=Math.min(...geometry.outline.map(([ax,ay],j)=>{
          const [bx,by]=geometry.outline[(j+1)%geometry.outline.length],ex=bx-ax,ey=by-ay;
          const px=point.x-n.x,py=point.y-n.y;
          const t=Math.max(0,Math.min(1,((px-ax)*ex+(py-ay)*ey)/(ex*ex+ey*ey)||0));
          return Math.hypot(px-ax-t*ex,py-ay-t*ey);
        }));
        assert.ok(distance<1e-7,`${fixture.shape} link misses outline`);
      }
    } else if(referenceSymbol(fixture.shape))assert.ok(c.y>=80,'reference title belongs below the symbol');
    else {assert.equal(n.width,n.height);assert.ok(Math.hypot(c.width,c.height)+14<=n.width);}
    assert.ok(n.labels[0].y>n.height);
    const doc=openDocument(sampleArchive([sheet]));
    const edited=editDocument(doc.sheets,sheet.id,{type:'title',id:'flow-root',title:'保存核对'});
    assert.equal(openDocument(writeDocument(doc,edited)).sheets[0].rootTopic.style!.properties!['shape-class'],fixture.shape);
  }
});
test(3, "relationship reconnect and format edits preserve raw fields and reject dangling/self ends", () => {
  const doc=openDocument(sampleArchive()), before=doc.sheets[0].relationships![0];
  let sheets=editDocument(doc.sheets,'sheet-main',{type:'relationship-reconnect',id:'rel',end:0,topicId:'floating'});
  assert.deepEqual(sheets[0].relationships![0],{...before,end1Id:'floating'});
  assert.equal(editDocument(sheets,'sheet-main',{type:'relationship-reconnect',id:'rel',end:0,topicId:'floating'}),sheets);
  for(const topicId of ['missing','edit'])assert.throws(()=>editDocument(sheets,'sheet-main',{type:'relationship-reconnect',id:'rel',end:0,topicId}),/different topics/);
  sheets=editDocument(sheets,'sheet-main',{type:'relationship-update',id:'rel',properties:{'arrow-end-class':'org.xmind.arrowShape.hook','line-width':'4'}});
  const reopened=openDocument(writeDocument(doc,sheets));
  assert.equal(reopened.sheets[0].relationships![0].end1Id,'floating');
  assert.deepEqual(reopened.sheets[0].relationships![0].controlPoints,before.controlPoints);
  assert.deepEqual(reopened.sheets[0].rootTopic,doc.sheets[0].rootTopic);
  assert.deepEqual(reopened.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
});
test(2, "relationship endpoint targets exclude the opposite end and prefer the smallest overlapping topic", () => {
  const n=buildScene(sampleSheets()[0]).nodes[0];
  const large={...n,x:0,y:0,width:100,height:100,topic:{id:'large',title:'Large'}};
  const small={...large,width:30,height:30,topic:{id:'small',title:'Small'}};
  assert.equal(relationshipDropTarget([large,small],{x:20,y:20},'large')?.topic.id,'small');
  assert.equal(relationshipDropTarget([large,small],{x:20,y:20},'none')?.topic.id,'small');
  assert.equal(relationshipDropTarget([large,small],{x:200,y:20},'none'),undefined);
});
test(1, "all native arrow fields have distinct artwork instead of falling back to one triangle", () => {
  assert.deepEqual(nativeArrows.map(a=>a.value),ARROW_SHAPES.map(a=>'org.xmind.arrowShape.'+a));
  const drawn=nativeArrows.filter(a=>!a.value.endsWith('.none')&&!a.value.endsWith('.dot')).map(a=>arrowDrawing(a.value)!.path);
  assert.equal(new Set(drawn).size,9);
  assert.ok(drawn.every(path=>!path.includes('NaN')));
});

test(2, "native relationship shape variants use finite curves, segments and orthogonal routes", () => {
  const sheet=round9RelationshipSheets()[0],scene=buildScene(sheet);
  for(const relation of sheet.relationships!) {
    const a=scene.nodes.find(n=>n.topic.id===relation.end1Id)!,b=scene.nodes.find(n=>n.topic.id===relation.end2Id)!;
    const g=relationshipGeometry(sheet,relation,a,b),shape=relation.style!.properties!['shape-class'];
    assert.ok(!/NaN|Infinity/.test(g.path));
    if(shape.includes('zigzag')) {
      assert.ok(!g.path.includes('C'));
      for(let i=1;i<g.route!.length;i++)assert.ok(g.route![i].x===g.route![i-1].x||g.route![i].y===g.route![i-1].y,'orthogonal segments remain axis-aligned');
    } else if(shape.includes('curved'))assert.ok(g.path.includes('C'));
    else assert.ok(!g.path.includes('C'));
    if(shape.includes('flexible.curved')) {
      const dx=b.x+b.width/2-a.x-a.width/2,dy=b.y+b.height/2-a.y-a.height/2;
      assert.ok(Math.abs((g.c1.x-a.x-a.width/2)*dy-(g.c1.y-a.y-a.height/2)*dx)<1e-8,'flexible curves begin collinear');
    }
  }
});

test(3, "boundary and summary range edits preserve crossing groups, summary descendants and archive entries", () => {
  const doc=openDocument(sampleArchive());
  let sheets=editDocument(doc.sheets,'sheet-main',{type:'group-update',parent:'read',id:'boundary',range:{start:1,end:2}});
  assert.equal(findTopic(sheets[0].rootTopic,'read')!.boundaries![0].range,'(1,2)');
  const owner=findTopic(sheets[0].rootTopic,'read')!;
  owner.summaries=[{id:'cross-summary',range:'(0,1)',topicId:'range-summary',custom:{preserve:true}}];
  owner.children!.summary=[{id:'range-summary',title:'Summary',children:{attached:[{id:'range-detail',title:'Detail'}]}}];
  const before=structuredClone(sheets);
  sheets=editDocument(sheets,'sheet-main',{type:'group-update',parent:'read',id:'cross-summary',range:{start:0,end:2}});
  const after=findTopic(sheets[0].rootTopic,'read')!;
  assert.deepEqual(after.boundaries,findTopic(before[0].rootTopic,'read')!.boundaries);
  assert.deepEqual(after.children!.summary,findTopic(before[0].rootTopic,'read')!.children!.summary);
  assert.deepEqual(after.summaries![0],{...findTopic(before[0].rootTopic,'read')!.summaries![0],range:'(0,2)'});
  const reopened=openDocument(writeDocument(doc,sheets));
  assert.deepEqual(reopened.sheets,sheets);
  assert.deepEqual(reopened.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
  for(const range of [{start:-1,end:2},{start:1,end:0},{start:0,end:99},{start:.5,end:1}])
    assert.throws(()=>editDocument(sheets,'sheet-main',{type:'group-update',parent:'read',id:'boundary',range}),/Invalid group range/);
});

test(2, "group range geometry follows visible descendants and nearest member order", () => {
  const sheet=sampleSheets()[0],scene=buildScene(sheet),owner=findTopic(sheet.rootTopic,'read')!;
  const short=groupRangeBounds(owner,0,1,scene.nodes)!,long=groupRangeBounds(owner,0,2,scene.nodes)!;
  assert.ok(long.height>short.height);
  const image=scene.nodes.find(n=>n.topic.id==='image')!;
  assert.equal(nearestGroupMember(owner,scene.nodes,'y',image.y+image.height/2),2);
  assert.ok(long.y+long.height>=image.y+image.height+14-1e-8);
  assert.equal(groupRangeBounds(owner,99,100,scene.nodes),null);
  assert.equal(groupRangeReversed(owner,scene.nodes,'y'),false);
  const mirrored=scene.nodes.map(n=>({...n,y:-n.y-n.height}));
  assert.equal(groupRangeReversed(owner,mirrored,'y'),true);
  assert.equal(nearestGroupMember(owner,mirrored,'y',-image.y-image.height/2),2);
});

test(2, "native missing text colors and topic alpha keep defaults without rewriting saved styles", () => {
  const sheets=sampleSheets(),sheet=sheets[0],floating=findTopic(sheet.rootTopic,'floating')!;
  const before=structuredClone(sheets);
  assert.equal(topicStyle(sheet,'floating')!.color,'#FFFFFF','native floating default remains white on a pale explicit fill');
  assert.deepEqual(sheets,before);
  floating.style!.properties!['svg:fill']='#112244';
  floating.style!.properties!['svg:fill-opacity']='0.2';
  floating.style!.properties!['svg:opacity']='0.3';
  const opaque=topicStyle(sheet,'floating');
  assert.equal(opaque.color,'#FFFFFF');assert.equal(opaque.fillOpacity,1,'topic opacity comes from color alpha, not boundary opacity fields');
  floating.style!.properties!['svg:fill']='#FFFFFF80';
  sheet.style={properties:{'svg:fill':'#112244'}};
  assert.equal(topicStyle(sheet,'floating')!.fill,'#FFFFFF80');
  assert.equal(topicStyle(sheet,'floating')!.fillOpacity,1,'preserve the color alpha without multiplying an unsupported field');
  floating.style!.properties!['fo:color']='#FFAACC';
  assert.equal(topicStyle(sheet,'floating')!.color,'#FFAACC');
  const doc=openDocument(sampleArchive(sheets));
  const edited=editDocument(doc.sheets,sheet.id,{type:'title',id:'floating',title:'Alpha preserved'});
  assert.deepEqual(findTopic(openDocument(writeDocument(doc,edited)).sheets[0].rootTopic,'floating')!.style,floating.style);
});

test(2, "range handles follow vertical and reverse timelines instead of connector directions", () => {
  for (const sheet of round6Sheets()) {
    const scene=buildScene(sheet),root=scene.nodes.find(n=>n.topic.id===sheet.rootTopic.id)!;
    const axis=groupRangeAxis(root,scene.nodes);
    assert.equal(axis,sheet.id==='round6-vertical'?'y':'x');
    assert.equal(groupRangeReversed(root.topic,scene.nodes,axis),sheet.rootTopic.structureClass!.endsWith('.rtl'));
  }
  const sheet=round6Sheets()[0];
  sheet.rootTopic.structureClass='org.xmind.ui.org-chart.down';
  const scene=buildScene(sheet);
  assert.equal(groupRangeAxis(scene.nodes[0],scene.nodes),'x');
});

test(2, "range drops inside a left topic do not select the opposite right branch", () => {
  const sheet: Sheet = {id:'two-sided-range',title:'Range',rootTopic:{id:'r',title:'Root',
    structureClass:'org.xmind.ui.map.unbalanced',
    children:{attached:Array.from({length:6},(_,i)=>({id:`member-${i}`,title:`Topic ${i}`}))},
    boundaries:[{id:'left-range',range:'(3,4)'}]}};
  const scene=buildScene(sheet),target=scene.nodes.find(n=>n.topic.id==='member-5')!;
  const y=target.y+target.height-4,x=target.x+target.width/2;
  assert.equal(nearestGroupMember(sheet.rootTopic,scene.nodes,'y',y,x),5);
  const reflected=scene.nodes.map(n=>({...n,x:-n.x-n.width}));
  assert.equal(nearestGroupMember(sheet.rootTopic,reflected,'y',y,-x),5);
  for (const range of [{start:0,end:1},{start:0,end:0}])
    assert.equal(groupRangeReversed(sheet.rootTopic,scene.nodes,'y',range),false);
  for (const range of [{start:3,end:4},{start:3,end:3}])
    assert.equal(groupRangeReversed(sheet.rootTopic,scene.nodes,'y',range),true);
});

test(2, "all packaged summary shape fields render distinct finite paths and retain inherited styles", () => {
  const fields=nativeGroupShapes.fields.filter(f=>f.shapeClass.includes('.summaryShape.'));
  assert.deepEqual(new Set(fields.map(f=>f.shapeClass.split('.').pop())),new Set(SUMMARY_SHAPES));
  for(const length of [0,8,100,1500]) {
    const paths=SUMMARY_SHAPES.map(name=>summaryPath(`org.xmind.summaryShape.${name}`,length));
    assert.equal(new Set(paths).size,5);
    assert.ok(paths.every(path=>!/(NaN|Infinity)/.test(path)));
  }
  const sheets=sampleSheets(),sheet=sheets[0];
  for(const name of SUMMARY_SHAPES) {
    sheet.theme={...sheet.theme,summary:{properties:{'shape-class':`org.xmind.summaryShape.${name}`}}};
    const before=structuredClone(sheet),scene=buildScene(sheet);
    assert.equal(scene.groups.find(g=>g.id==='summary')!.properties['shape-class'],`org.xmind.summaryShape.${name}`);
    assert.equal(scene.warnings.includes(`org.xmind.summaryShape.${name}`),false);
    assert.deepEqual(sheet,before);
  }
});

test(2, "native boundary shapes enclose members and keep open borders separate from fills", () => {
  const fields=nativeGroupShapes.fields.filter(f=>f.shapeClass.includes('.boundaryShape.'));
  assert.deepEqual(new Set(fields.map(f=>f.shapeClass.split('.').pop())),new Set(BOUNDARY_SHAPES));
  const [sheet]=round10GroupSheets(),scene=buildScene(sheet);
  assert.equal(scene.groups.length,9);
  const paths=new Set<string>();
  for(const group of scene.groups) {
    const shape=group.properties['shape-class'],geometry=boundaryGeometry(shape,group.width,group.height,group.memberBoxes);
    assert.equal(scene.warnings.includes(shape),false);
    const overflow=boundaryOverflow(shape);
    assert.ok(scene.bounds.x<=group.x-overflow && scene.bounds.x+scene.bounds.width>=group.x+group.width+overflow);
    if(geometry) {
      assert.ok(!/(NaN|Infinity)/.test(geometry.fillPath+geometry.borderPath));
      assert.ok(geometry.fillPath.endsWith('Z'));
      if(shape.endsWith('focus')||shape.endsWith('cross'))assert.notEqual(geometry.fillPath,geometry.borderPath);
      paths.add(geometry.borderPath);
    }
  }
  assert.equal(paths.size,7);
  const poly=boundaryGeometry('polygon',200,200,[{x:14,y:14,width:60,height:30},{x:80,y:120,width:106,height:66}])!;
  assert.notEqual(poly.borderPath,'M0,0 H200 V200 H0 Z','polygon follows the different member widths');
});

test(2, "native polygon frames hide stored titles and keep the far edge flat in every direction", () => {
  const [sheet]=round10GroupSheets(),before=structuredClone(sheet),scene=buildScene(sheet);
  for(const group of scene.groups) {
    const hidden=/\.(polygon|roundedPolygon)$/.test(group.properties['shape-class']);
    assert.equal(group.titleLines.length===0,hidden);
    if(hidden) { assert.ok(group.title.length>0);assert.equal(group.titleHeight,0); }
  }
  assert.deepEqual(sheet,before,'hidden titles remain in the document');
  const members=[{x:14,y:14,width:60,height:30},{x:80,y:120,width:106,height:66}];
  for(const direction of ['left','right','up','down'] as const) {
    const geometry=boundaryGeometry('polygon',200,200,members,14,direction)!;
    const points=[...geometry.borderPath.matchAll(/[ML]([\d.-]+),([\d.-]+)/g)].map(m=>[+m[1],+m[2]]);
    const edge=direction==='right'?[[200,0],[200,200]]:direction==='left'?[[0,0],[0,200]]:direction==='up'?[[0,0],[200,0]]:[[0,200],[200,200]];
    for(const corner of edge)assert.ok(points.some(p=>p[0]===corner[0]&&p[1]===corner[1]));
  }
});

test(2, "manual orthogonal segment moves keep endpoint stubs and survive a fresh route", () => {
  const sheet=round10FlexibleSheets()[0],scene=buildScene(sheet),relation=sheet.relationships![2];
  const a=scene.nodes.find(n=>n.topic.id===relation.end1Id)!,b=scene.nodes.find(n=>n.topic.id===relation.end2Id)!;
  const g=relationshipGeometry(sheet,relation,a,b),before=structuredClone(relation);
  assert.ok(g.virtualControls!.length>=3);
  for(const handle of g.virtualControls!) {
    const moved={...handle,[handle.segment!.axis]:handle[handle.segment!.axis]+35};
    const route=moveOrthogonalSegment(g.route!,handle.segment!,moved);
    assert.deepEqual(route.slice(0,2),g.route!.slice(0,2));
    assert.deepEqual(route.slice(-2),g.route!.slice(-2));
    for(let i=1;i<route.length;i++)assert.ok(Math.abs(route[i].x-route[i-1].x)<1e-7||Math.abs(route[i].y-route[i-1].y)<1e-7);
    const next={...relation,flexibleControlPoints:route.slice(2,-2).map(p=>({x:p.x-a.x-a.width/2,y:p.y-a.y-a.height/2}))};
    const rerouted=relationshipGeometry(sheet,next,a,b);
    assert.deepEqual(rerouted.start,g.start);assert.deepEqual(rerouted.end,g.end);
    assert.ok(!/NaN|Infinity/.test(rerouted.path));
    assert.ok(rerouted.flexibleControls!.some(p=>Math.abs(p[handle.segment!.axis]-moved[handle.segment!.axis])<1e-7));
  }
  assert.deepEqual(relation,before);
});

test(2, "manual curve insertion positions and short Cartesian controls remain finite without mutating vectors", () => {
  const sheet=sampleSheets()[0],template=buildScene(sheet).nodes[0];
  const a={...template,x:0,y:0,width:100,height:60,shape:'rect'},b={...a,x:500};
  for(const shape of ['curved','angled']) {
    const relation={id:'short-manual',end1Id:'a',end2Id:'b',flexibleControlPoints:[{x:3,y:4},{x:260,y:90},{x:0,y:0}],
      style:{properties:{'shape-class':`org.xmind.relationshipShape.flexible.${shape}`}}};
    const before=structuredClone(relation),g=relationshipGeometry(sheet,relation,a,b);
    assert.deepEqual(g.flexibleControls![0],{x:56,y:38},'native nonzero control vectors have ten-unit minimum length');
    assert.deepEqual(g.flexibleControls![2],{x:50,y:30},'zero stays at the source center');
    assert.equal(g.virtualControls!.length,4);
    for(const p of g.virtualControls!)assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    assert.deepEqual(relation,before);
  }
});

test(2, "polar controls rotate fractions of the endpoint vector without moving outline anchors", () => {
  const sheet=sampleSheets()[0],template=buildScene(sheet).nodes[0];
  const a={...template,x:0,y:0,width:100,height:60,shape:'rect'},b={...a,x:300};
  const relation={id:'polar',end1Id:'a',end2Id:'b',controlPoints:{'0':{amount:.5,angle:Math.PI/2},'1':{amount:.25,angle:0}},
    style:{properties:{'shape-class':'org.xmind.relationshipShape.curved'}}};
  const g=relationshipGeometry(sheet,relation,a,b);
  assert.deepEqual(g.start,{x:100,y:30});assert.deepEqual(g.end,{x:300,y:30});
  assert.ok(Math.abs(g.c1.x-100)<1e-8);assert.equal(g.c1.y,130);
  assert.deepEqual(g.c2,{x:250,y:30});assert.equal(g.unsupportedPolar,false);
  const fixed=relationshipGeometry(sheet,{...relation,lineEndPoints:{'0':{x:0,y:-80},'1':{x:0,y:80}}},a,b);
  assert.deepEqual(fixed.start,{x:50,y:0});assert.deepEqual(fixed.end,{x:350,y:60});
  const vertical=relationshipGeometry(sheet,relation,a,{...b,x:0,y:300});
  assert.ok(Math.abs(vertical.c1.x+70)<1e-8);assert.ok(Math.abs(vertical.c1.y-60)<1e-8);
  const zero=relationshipGeometry(sheet,{...relation,controlPoints:{'0':{amount:0,angle:-5},'1':{amount:0,angle:0}}},a,b);
  assert.deepEqual(zero.c1,zero.start);assert.deepEqual(zero.c2,zero.end);
  const coincident=relationshipGeometry(sheet,relation,a,a);assert.ok(!/NaN|Infinity/.test(coincident.path));
});

test(3, "polar drag, reconnect and archive preserve fixed endpoints, opposite controls and resources", () => {
  const sheets=round10PolarSheets(),sheet=sheets[0],doc=openDocument(sampleArchive(sheets)),scene=buildScene(sheet);
  assert.equal(scene.warnings.includes('relationship-polar-controls'),false);
  const relation=sheet.relationships![3],a=scene.nodes.find(n=>n.topic.id===relation.end1Id)!,b=scene.nodes.find(n=>n.topic.id===relation.end2Id)!;
  const before=structuredClone(relation),g=relationshipGeometry(sheet,relation,a,b),target={x:g.start.x+220,y:g.start.y-130};
  const moved=movedRelationshipControl((relation.controlPoints as any)[0],target,a,g.start,g.end);
  assert.ok('amount' in moved);
  const updated=editDocument(sheets,sheet.id,{type:'relationship-update',id:relation.id,controlPoints:{'0':moved}});
  const after=updated[0].relationships![3],geometry=relationshipGeometry(sheet,after,a,b);
  assert.ok(Math.hypot(geometry.c1.x-target.x,geometry.c1.y-target.y)<1e-8);
  assert.deepEqual(geometry.start,g.start);assert.deepEqual(geometry.end,g.end);
  const connected=editDocument(updated,sheet.id,{type:'relationship-reconnect',id:relation.id,end:1,topicId:'polar-2-1'});
  const reopened=openDocument(writeDocument(doc,connected)),saved=reopened.sheets[0].relationships![3];
  assert.deepEqual(saved.lineEndPoints,before.lineEndPoints);
  assert.deepEqual((saved.controlPoints as any)[1],(before.controlPoints as any)[1]);
  assert.equal(saved.end2Id,'polar-2-1');assert.deepEqual(relation,before);
  assert.deepEqual(reopened.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
  assert.throws(()=>editDocument(sheets,sheet.id,{type:'relationship-update',id:relation.id,controlPoints:{'0':{amount:NaN,angle:0}}}),/Invalid control/);
});

test(2, "manual relationship paths use every saved waypoint and Fit contains their distant bends", () => {
  const sheet=round10FlexibleSheets()[0],before=structuredClone(sheet),scene=buildScene(sheet);
  for(const relation of sheet.relationships!) {
    const a=scene.nodes.find(n=>n.topic.id===relation.end1Id)!,b=scene.nodes.find(n=>n.topic.id===relation.end2Id)!;
    const g=relationshipGeometry(sheet,relation,a,b);
    assert.equal(g.flexibleControls!.length,3);
    if(g.route && relation.id.endsWith('2')) {
      const middle=g.flexibleControls![1],index=g.route.findIndex(p=>p.x===middle.x&&p.y===middle.y);
      assert.ok(index>0 && index<g.route.length-1);
      assert.equal(g.route[index-1].y,middle.y,'native zigzag enters the middle waypoint horizontally');
      assert.equal(g.route[index+1].y,middle.y,'native zigzag continues horizontally through the middle waypoint');
    }
    for(const point of g.flexibleControls!) {
      assert.ok(g.path.includes(`${point.x},${point.y}`),'path passes through each saved waypoint');
      assert.ok(point.x>=scene.bounds.x && point.x<=scene.bounds.x+scene.bounds.width);
    }
    if(g.route && relation.id.endsWith('2'))for(let i=1;i<g.route.length;i++) {
      assert.ok(g.route[i].x===g.route[i-1].x||g.route[i].y===g.route[i-1].y);
      if(i>1) {
        const a=g.route[i-2],b=g.route[i-1],c=g.route[i];
        assert.ok((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)>=0,'route does not immediately double back at a waypoint');
      }
    }
    const far={...relation,flexibleControlPoints:[{x:-1800,y:2200},{x:-1800,y:2200},{x:450,y:-40}]};
    const result=relationshipGeometry(sheet,far,a,b);assert.ok(!/NaN|Infinity/.test(result.path));
    sheet.relationships=[far];const enlarged=buildScene(sheet);
    const fa=enlarged.nodes.find(n=>n.topic.id===relation.end1Id)!,fb=enlarged.nodes.find(n=>n.topic.id===relation.end2Id)!;
    for(const point of relationshipGeometry(sheet,far,fa,fb).bounds)
      assert.ok(point.x>=enlarged.bounds.x && point.y<=enlarged.bounds.y+enlarged.bounds.height);
  }
  sheet.relationships=before.relationships;assert.deepEqual(sheet,before);
});

test(3, "manual waypoint edits preserve ordinary controls, references, metadata and resources", () => {
  const sheets=round10FlexibleSheets(),sheet=sheets[0],relation=sheet.relationships![0];
  relation.controlPoints={'0':{amount:.25,angle:.5}};relation.custom={retain:true};
  const doc=openDocument(sampleArchive(sheets)),before=structuredClone(relation);
  const points=(relation.flexibleControlPoints as {x:number;y:number}[]).map((p,i)=>i===1?{...p,y:150,custom:'keep'}:{...p});
  const edited=editDocument(sheets,sheet.id,{type:'relationship-update',id:relation.id,flexibleControlPoints:points});
  const reopened=openDocument(writeDocument(doc,edited)),saved=reopened.sheets[0].relationships![0];
  assert.deepEqual(saved,{...before,flexibleControlPoints:points});assert.deepEqual(relation,before);
  assert.deepEqual(reopened.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
  assert.throws(()=>editDocument(sheets,sheet.id,{type:'relationship-update',id:relation.id,flexibleControlPoints:[{x:Infinity,y:0}]}),/Invalid control/);
});

test(2, "mirrored polygon groups follow visible members and nested frames including labels and thick strokes", () => {
  for(const sheet of round10NestedGroupSheets()) {
    const scene=buildScene(sheet),outer=scene.groups.find(g=>g.id.endsWith('-outer'))!;
    for(const group of scene.groups.filter(g=>!g.id.endsWith('-outer'))) {
      const owner=findTopic(sheet.rootTopic,group.parent)!;
      if(sheet.rootTopic.structureClass!.includes('fishbone')) {
        const cause=scene.nodes.find(n=>n.topic.id===owner.id)!,stroke=parseFloat(group.properties['line-width']??'2');
        assert.ok(cause.y+cause.height<=group.y-group.titleHeight-stroke/2 || cause.y>=group.y+group.height+stroke/2,
          'fishbone cause cannot overlap its child frame or frame title');
      }
      for(const topic of owner.children!.attached!) {
        const node=scene.nodes.find(n=>n.topic.id===topic.id)!,box=nodeVisualBounds(node);
        assert.ok(group.memberBoxes!.some(b=>Math.abs(group.x+b.x-box.x)<1e-7&&Math.abs(group.y+b.y-box.y)<1e-7&&Math.abs(b.width-box.width)<1e-7),
          'polygon member geometry must follow the reflected node and its left-aligned labels');
        const stroke=parseFloat(group.properties['line-width']??'2');
        assert.ok(box.x>=group.x+stroke/2 && box.y>=group.y+stroke/2,'thick stroke cannot cover member content');
      }
      if(!group.id.endsWith('-2')) {
        assert.ok(group.x>=outer.x && group.x+group.width<=outer.x+outer.width,'outer frame includes child frame width');
        assert.ok(group.y-group.titleHeight>=outer.y && group.y+group.height<=outer.y+outer.height,'outer frame includes child title and bottom');
      }
    }
  }
});

test(2, "native master example keeps titles left aligned, summaries curved and default callouts close", () => {
  const sheet=round10MasterSheets()[0],before=structuredClone(sheet),scene=buildScene(sheet);
  const owner=scene.nodes.find(n=>n.topic.id==='whole-branch')!,callout=scene.nodes.find(n=>n.topic.id==='whole-callout')!;
  assert.equal(owner.y-(callout.y+callout.height),5,'default callout has a short tail, not an 80px gap');
  assert.deepEqual([callout.fill,callout.color,callout.fontSize],['#00897B','#FFFFFF',14]);
  const whole=scene.groups.find(g=>g.id==='whole-second')!;
  assert.ok(whole.titleOffsetX<whole.width/4,'outer title sits near the left edge');
  const summary=scene.groups.find(g=>g.summary)!;
  assert.equal(summary.properties['shape-class'],'org.xmind.summaryShape.round');
  assert.deepEqual(sheet,before);
  const stored=findTopic(sheet.rootTopic,'whole-callout')!;stored.position={x:170,y:120};
  const moved=buildScene(sheet),bubble=moved.nodes.find(n=>n.topic.id==='whole-callout')!,parent=moved.nodes.find(n=>n.topic.id==='whole-branch')!;
  assert.ok(Math.abs(bubble.x+bubble.width/2-parent.x-parent.width/2-170)<1e-7);
  assert.ok(Math.abs(bubble.y+bubble.height/2-parent.y-parent.height/2-120)<1e-7);
});

test(2, "whole-topic boundaries include nested frames, summaries and callouts and survive folding", () => {
  const sheets=round10MasterSheets(),sheet=sheets[0],before=structuredClone(sheet),scene=buildScene(sheet);
  const first=scene.groups.find(g=>g.id==='whole-first')!,outer=scene.groups.find(g=>g.id==='whole-second')!;
  assert.ok(first && outer,'master ranges must render');
  for(const id of ['whole-branch','whole-a','whole-b','whole-summary','whole-callout'])assert.ok(first.memberIds!.includes(id));
  assert.equal(first.memberIds!.includes('whole-neighbor'),false);
  assert.ok(first.memberGroupIds!.includes('summary-master'));
  assert.ok(outer.memberGroupIds!.includes(first.id));
  assert.ok(outer.y<=first.y-first.titleHeight);
  const folded=editDocument(sheets,sheet.id,{type:'fold',ids:['whole-branch'],folded:true});
  const foldedScene=buildScene(folded[0],new Set(['whole-branch']));
  assert.ok(foldedScene.groups.some(g=>g.id==='whole-first'));
  assert.equal(foldedScene.nodes.some(n=>n.topic.id==='whole-a'),false);
  assert.deepEqual(sheet,before);
});

test(3, "whole-topic boundary creation, rename and child edits preserve master ranges in the archive", () => {
  const sheets=round10MasterSheets(),sheet=sheets[0],doc=openDocument(sampleArchive(sheets));
  const created=editDocument(sheets,sheet.id,{type:'group',parent:'whole-neighbor',ids:['whole-neighbor'],kind:'boundary',master:true,title:'整体'});
  const boundary=findTopic(created[0].rootTopic,'whole-neighbor')!.boundaries![0];assert.equal(boundary.range,'master');
  const added=editDocument(created,sheet.id,{type:'add',parent:'whole-neighbor',topic:{id:'new-child',title:'新主题'},kind:'attached'});
  const renamed=editDocument(added,sheet.id,{type:'group-update',parent:'whole-neighbor',id:boundary.id,title:'整体新标题'});
  const reopened=openDocument(writeDocument(doc,renamed)),owner=findTopic(reopened.sheets[0].rootTopic,'whole-neighbor')!;
  assert.deepEqual(owner.boundaries![0],{...boundary,title:'整体新标题'});assert.equal(owner.children!.attached![0].id,'new-child');
  assert.deepEqual(reopened.files['attachments/keep.bin'],doc.files['attachments/keep.bin']);
  assert.throws(()=>editDocument(sheets,sheet.id,{type:'group',parent:'whole-neighbor',ids:['whole-neighbor'],kind:'summary',master:true,title:'Invalid'}),/Invalid whole-topic/);
});

test(1, "synthetic native archives use a structured creator and list every payload in the manifest", () => {
  const files=unzipSync(sampleArchive()),metadata=JSON.parse(strFromU8(files['metadata.json'])),manifest=JSON.parse(strFromU8(files['manifest.json']));
  assert.equal(typeof metadata.creator,'object');assert.equal(typeof metadata.creator.name,'string');
  assert.equal(metadata.dataStructureVersion,'3');
  for(const name of Object.keys(files).filter(name=>name!=='manifest.json'))assert.ok(name in manifest['file-entries']);
});

console.log(`${passed} XMind tests passed`);
