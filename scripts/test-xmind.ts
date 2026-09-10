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
import { buildScene, edgePath, STRUCTURES } from "../src/lib/xmind/scene";
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
    assert.ok(n.indicatorY + Math.ceil(n.indicators.length / n.indicatorColumns) * 20 <= c.y + c.height);
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
    const stems = paths.map(p => p.match(/^M[^ ]+ H([^ ]+)/)![1]);
    assert.equal(stems[0],stems[1]);
    assert.ok(paths[0].includes(" Q"));
    assert.ok(!paths[1].includes(" Q"), "middle child joins the shared trunk without an extra bend");
    paths.forEach((p,i)=>{
      assert.ok(!p.includes(" C"));
      assert.ok(p.endsWith(`H${direction === "left" ? node(i ? "b" : "a").x + node(i ? "b" : "a").width : node(i ? "b" : "a").x}`));
      const endY = node(i ? "b" : "a").y + node(i ? "b" : "a").height;
      assert.ok(p.includes(`,${endY}`) || p.includes(`V${endY}`));
    });
    assert.ok(edgePath(scene.edges.find(e=>e.to==="main")!,node("root"),node("main")).includes(" Q"));
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

console.log(`${passed} XMind tests passed`);
