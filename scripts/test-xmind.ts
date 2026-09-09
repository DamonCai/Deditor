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
console.log(`${passed} XMind tests passed`);
