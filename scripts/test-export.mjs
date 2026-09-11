import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { unzipSync, strFromU8 } from "fflate";
import MarkdownIt from "markdown-it";

const dom = new JSDOM("<!doctype html><body></body>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "Node",
  "HTMLElement",
  "HTMLInputElement",
  "FileReader",
  "Blob",
  "XMLSerializer",
  "localStorage",
])
  globalThis[key] = dom.window[key];
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(
  dom.window,
);
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deditor-export-tests-"));
fs.symlinkSync(
  path.resolve("node_modules"),
  path.join(tmp, "node_modules"),
  "dir",
);
const writes = [];
let saveResult = "/test/out.html";
let saveCalls = 0;
globalThis.__save = async () => {
  saveCalls++;
  return saveResult;
};
globalThis.__invoke = async (name, args) => {
  if (name.startsWith("write_") || name === "print_window")
    writes.push({ name, ...args });
};
const md = new MarkdownIt({ html: true });
globalThis.__render = async (source) => md.render(source);
globalThis.__hydrateMermaid=()=>Object.assign(new AbortController(),{done:Promise.resolve()});
const stubs = {
  "../preview.css?raw": `export default ${JSON.stringify(fs.readFileSync("src/preview.css", "utf8"))};`,
  "@tauri-apps/api/core":
    "export const invoke=(...a)=>globalThis.__invoke(...a)",
  "@tauri-apps/plugin-dialog":
    "export const save=(...a)=>globalThis.__save(...a)",
  "../markdown":
    "export const renderMarkdown=(...a)=>globalThis.__render(...a)",
  "../mermaidHydrate":
    "export const hydrateMermaid=(...a)=>globalThis.__hydrateMermaid(...a)",
  "../plantumlHydrate":
    "export const hydratePlantuml=()=>Object.assign(new AbortController(),{done:Promise.resolve()})",
  "./markdownExport/mathCss": 'export const katexExportCss=()=>""',
  "./logger": "export const logError=()=>{};export const logInfo=()=>{}",
  "./feedback": "export const showError=async()=>{}",
};
await build({
  stdin: {
    contents: `export * from './src/lib/export'; export * from './src/lib/markdownExport/document'; export * from './src/lib/markdownExport/office';`,
    resolveDir: process.cwd(),
  },
  outfile: path.join(tmp, "export.mjs"),
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "boundary",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          stubs[a.path] ? { path: a.path, namespace: "stub" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          contents: stubs[a.path],
          loader: "js",
        }));
      },
    },
  ],
});
const e = await import(pathToFileURL(path.join(tmp, "export.mjs")));
let passed = 0;
async function test(name, fn) {
  await fn();
  passed++;
  console.log(`✓ ${name}`);
}
try {
  await test("snapshot export and cancellation never write the source file", async () => {
    saveResult = null;
    assert.equal(
      await e.exportMarkdown(
        { content: "# Original", filePath: "/test/doc.md" },
        "html",
      ),
      false,
    );
    assert.equal(writes.length, 0);
    saveResult = "/test/out.html";
    await e.exportMarkdown(
      { content: "# Original", filePath: "/test/doc.md" },
      "html",
    );
    assert.match(writes.at(-1).content, /<h1>Original<\/h1>/);
    assert.equal(writes.at(-1).path, "/test/out.html");
    assert.equal(document.querySelector('[aria-hidden="true"]'), null);
  });
  await test("HTML export escapes titles, expands details and removes active markup", async () => {
    await e.exportMarkdown(
      {
        content:
          '<details><summary>More</summary>body</details>\n<script>alert(1)</script>\n<a href="javascript:alert(1)" onclick="x()">safe</a>',
        filePath: "<Title>.md",
      },
      "html",
    );
    const html = writes.at(-1).content;
    assert.match(html, /&lt;Title&gt;/);
    assert.match(html, /<details open="">/);
    assert.doesNotMatch(html, /<script|javascript:|onclick=/);
  });
  await test("HTML/PDF capture the selected document theme and export template", async () => {
    const snapshot = { content: "# Report\n\nBody", filePath: "report.md", documentTheme: "serif", exportTemplate: "report" };
    await e.exportMarkdown(snapshot, "html");
    assert.match(writes.at(-1).content, /data-md-theme="serif" data-export-template="report"/);
    await e.exportMarkdown(snapshot, "pdf");
    assert.equal(document.getElementById("deditor-print-area").dataset.mdTheme, "serif");
    assert.equal(document.getElementById("deditor-print-area").dataset.exportTemplate, "report");
    const html = await e.standalonePage("<p>safe</p>", "Title", "light", { documentTheme: '\"bad', exportTemplate: "unknown" });
    assert.match(html, /data-md-theme="default" data-export-template="default"/);
  });
  await test("PDF retains its snapshot after print invocation", async () => {
    await e.exportMarkdown({ content: "# Printed", filePath: "a.md" }, "pdf");
    assert.equal(writes.at(-1).name, "print_window");
    assert.match(
      document.getElementById("deditor-print-area").textContent,
      /Printed/,
    );
  });
  await test("plain text preserves paragraphs, ordered/nested lists, code, tables and math source", async () => {
    const prepared = await e.prepareDocument(
      {
        content:
          '# 标题\n\n段落 **粗体** 与 [链接](https://example.com)。\n\n3. 第三项\n   - 嵌套\n4. 第四项\n\n| A | B |\n|---|---|\n| 甲 | 乙 |\n\n```js\nx = 1\n```\n\n<span class="katex"><span>visual</span><math><annotation encoding="application/x-tex">x^2</annotation></math></span>',
        filePath: "a.md",
      },
      { plain: true },
    );
    const blocks = await e.documentBlocks(prepared.root, false);
    const text = e.plainText(blocks);
    assert.match(text, /3\. 第三项/);
    assert.match(text, /• 嵌套/);
    assert.match(text, /4\. 第四项/);
    assert.match(text, /甲\t乙/);
    assert.match(text, /x = 1/);
    prepared.dispose();
  });
  await test("Word writes genuine OOXML with editable headings, runs, hyperlinks and tables", async () => {
    const prepared = await e.prepareDocument(
      {
        content:
          "# 文档\n\n**bold** *italic* [Link](https://example.com)\n\n| A | B |\n|---|---|\n| 甲 | 乙 |",
        filePath: "a.md",
      },
      { plain: true },
    );
    const blob = await e.wordDocument(
      await e.documentBlocks(prepared.root, false),
      "示例",
    );
    const files = unzipSync(
      Buffer.from((await e.blobData(blob)).split(",")[1], "base64"),
    );
    const xml = strFromU8(files["word/document.xml"]);
    assert.match(xml, /Heading1/);
    assert.match(xml, /<w:b\/>/);
    assert.match(xml, /<w:i\/>/);
    assert.match(xml, /<w:tbl>/);
    assert.match(xml, /甲/);
    assert.match(
      strFromU8(files["word/_rels/document.xml.rels"]),
      /https:\/\/example.com/,
    );
    prepared.dispose();
  });
  await test("PPTX paginates CJK text without truncating the final paragraph", async () => {
    const text = "中文长文段落。".repeat(220) + "LAST_SENTINEL";
    const blob = await e.slideDocument(
      [
        { kind: "text", level: 1, runs: [{ text: "标题" }] },
        { kind: "text", runs: [{ text }] },
        { kind: "text", level: 2, runs: [{ text: "Next section" }] },
      ],
      "Deck",
    );
    const files = unzipSync(
      Buffer.from((await e.blobData(blob)).split(",")[1], "base64"),
    );
    const slides = Object.keys(files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    assert.ok(slides.length > 3);
    assert.ok(
      slides.some((n) => strFromU8(files[n]).includes("LAST_SENTINEL")),
    );
    assert.ok(slides.some((n) => strFromU8(files[n]).includes("Next section")));
    assert.equal(e.wrapSlideText(text).join(""), text);
  });
  await test("local images embed portable bytes with correct Windows/file URL paths", async () => {
    const previous = globalThis.__invoke;
    const paths = [];
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6H0AAAAASUVORK5CYII=";
    globalThis.Image = class {
      set src(value) {
        this.value = value;
        queueMicrotask(() => this.onload?.());
      }
    };
    globalThis.__invoke = async (name, args) =>
      name === "read_binary_as_base64"
        ? (paths.push(args.path), png)
        : previous(name, args);
    try {
      await e.exportMarkdown(
        {
          content:
            '![local](images/test%20image.png)\n\n<img alt="windows" src="file:///C:/docs/image.png">',
          filePath: "/docs/readme.md",
        },
        "html",
      );
      assert.deepEqual(paths, [
        "/docs/images/test image.png",
        "C:/docs/image.png",
      ]);
      const html = writes.at(-1).content;
      assert.equal(
        (html.match(/src="data:image\/png;base64,/g) || []).length,
        2,
      );
      assert.doesNotMatch(html, /src="(?:file:|asset:)/);
      const count = writes.length;
      globalThis.__invoke = async (name, args) => {
        if (name === "read_binary_as_base64") throw new Error("Missing image");
        return previous(name, args);
      };
      await assert.rejects(
        e.exportMarkdown(
          { content: "![broken](missing.png)", filePath: "/docs/readme.md" },
          "html",
        ),
        /Missing image/,
      );
      assert.equal(writes.length, count);
      assert.equal(document.querySelector('[aria-hidden="true"]'), null);
    } finally {
      globalThis.__invoke = previous;
    }
  });
  await test("plain export leaves images inert and math appears only once", async () => {
    const prepared = await e.prepareDocument(
      {
        content:
          '![offline](https://example.com/image.png)\n\n<span class="katex"><span>visual</span><math><annotation encoding="application/x-tex">x^2</annotation></math></span>',
        filePath: "a.md",
      },
      { plain: true },
    );
    assert.equal(prepared.root.isConnected, false);
    assert.equal(prepared.root.querySelector("img").hasAttribute("src"), false);
    const text = e.plainText(await e.documentBlocks(prepared.root, false));
    assert.match(text, /offline/);
    assert.match(text, /x\^2/);
    assert.doesNotMatch(text, /visual/);
    prepared.dispose();
  });
  await test("HTML waits for Mermaid SVG before writing and follows the captured theme", async () => {
    const render = globalThis.__render, hydrate = globalThis.__hydrateMermaid;
    let finish, renderedTheme, diagramTheme;
    globalThis.__render = async (_source, opts) => { renderedTheme=opts.theme; return '<p><span style="color:#e53e3e">Red</span><mark>Highlight</mark><code>code</code><a href="https://example.com">link</a></p><div class="mermaid-diagram" data-mermaid-source="graph LR;A-->B"><div class="mermaid-loading">正在加载 Mermaid 图表…</div></div>'; };
    globalThis.__hydrateMermaid = (root, theme) => { diagramTheme=theme; return Object.assign(new AbortController(),{done:new Promise(resolve=>{finish=()=>{root.querySelector('.mermaid-diagram').innerHTML='<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000"/></svg>';resolve();};})}); };
    try {
      const count=writes.length;
      const pending=e.exportMarkdown({content:'diagram',filePath:'color.md',theme:'dark'},'html');
      for(let i=0;i<20 && !finish;i++) await new Promise(resolve=>setTimeout(resolve,0));
      assert.equal(typeof finish,'function');assert.equal(writes.length,count);
      finish();await pending;
      const html=writes.at(-1).content;
      assert.equal(renderedTheme,'dark');assert.equal(diagramTheme,'dark');
      assert.match(html,/<html class="dark"/);assert.match(html,/<main class="preview"[^>]*>/);
      assert.match(html,/--preview-link: #8ab4ff/);assert.match(html,/color:#e53e3e/);
      assert.match(html,/<svg/);assert.match(html,/fill="#ff0000"/);
      assert.doesNotMatch(html,/正在加载 Mermaid|class="mermaid-loading"/);
    } finally {globalThis.__render=render;globalThis.__hydrateMermaid=hydrate;}
  });
  await test("unrendered/empty Mermaid and malformed PlantUML never become successful exports", async () => {
    const render=globalThis.__render;
    try {
      for(const family of ['mermaid','plantuml']) {
        globalThis.__render=async()=>`<div class="${family}-diagram"><div class="${family}-loading">Loading</div></div>`;
        const count=writes.length;
        await assert.rejects(e.exportMarkdown({content:'empty',filePath:'empty.md'},'html'));
        assert.equal(writes.length,count);assert.equal(document.querySelector('[aria-hidden="true"]'),null);
      }
    } finally {globalThis.__render=render;}
  });
  await test("failed preparation releases export lock and cleans hidden DOM", async () => {
    globalThis.__render = async () => {
      throw new Error("Render failure");
    };
    await assert.rejects(
      e.exportMarkdown({ content: "x", filePath: "x.md" }, "html"),
      /Render failure/,
    );
    globalThis.__render = async (source) => md.render(source);
    await e.exportMarkdown({ content: "retry", filePath: "x.md" }, "txt");
    assert.equal(writes.at(-1).content.trim(), "retry");
    assert.equal(document.querySelector('[aria-hidden="true"]'), null);
  });
  await test("duplicate exports are rejected before a second save dialog", async () => {
    const prev = globalThis.__save;
    let done;
    globalThis.__save = () =>
      new Promise((resolve) => {
        done = resolve;
        saveCalls++;
      });
    const first = e.exportMarkdown({ content: "x", filePath: "x.md" }, "html");
    const count = saveCalls;
    await assert.rejects(
      e.exportMarkdown({ content: "y", filePath: "y.md" }, "html"),
    );
    assert.equal(saveCalls, count);
    done(null);
    await first;
    globalThis.__save = prev;
  });
  console.log(`${passed} export tests passed`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  dom.window.close();
}
