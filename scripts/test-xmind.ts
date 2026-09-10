import { draftBox } from "../src/lib/xmind/draft";
import { ADVANCED_SHAPES, advancedShape, pointInOutline, shapeContentCenter } from "../src/lib/xmind/shapePaths";
import nativeAdvancedShapes from "../tests/fixtures/xmind-native-advanced-shapes.json";
import { round7ShapeSheets } from "../tests/fixtures/xmind-round7";
import { TOPIC_SHAPES, shapePolygon, shapeSize } from "../src/lib/xmind/shapes";
import { topicDropTarget } from "../src/lib/xmind/drop";
import { relationshipGeometry, topicAnchor } from "../src/lib/xmind/relationship";
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
import { buildScene, edgePath, STRUCTURES, topicStyle, groupStyle } from "../src/lib/xmind/scene";
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
test(1, "diamond and ellipse contain title, labels and metadata", () => {
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
  assert.equal(groupStyle(sheet,group,false)['svg:fill-opacity'],'0.2');
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
test(2, "timeline variants keep long, mixed and grouped subtrees separate at every fold state", () => {
  for (const sheet of round6Sheets()) {
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
  assert.equal(detail.properties['svg:fill-opacity'],'0.2');
  assert.equal(detail.fillOpacity,0.2);assert.equal(detail.color,'#660000');
  assert.equal(scene.nodes.find(n=>n.topic.id==='vertical-detail-2-a')!.color,'#1E4733');
  const topic=sheet.rootTopic.children!.attached![0].children!.attached![0];
  topic.style={properties:{'svg:fill':'#123456','svg:fill-opacity':'0.7','fo:color':'#FEDCBA','fo:font-size':'22pt'}};
  const overridden=topicStyle(sheet,topic.id);
  assert.equal(overridden.fill,'#123456');assert.equal(overridden.properties['svg:fill-opacity'],'0.7');
  assert.equal(overridden.color,'#FEDCBA');assert.equal(overridden.fontSize,22);
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
  assert.equal(g.color,'#00000066');assert.equal(g.properties['fo:color'],undefined);assert.equal(g.width,1.5);
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
console.log(`${passed} XMind tests passed`);
