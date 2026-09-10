import { zipSync, strToU8 } from "fflate";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { EditorView } from "@codemirror/view";
import MarkdownIt from "markdown-it";
import { EditorState, StateEffect } from "@codemirror/state";
import { history, undo, redo, undoDepth } from "@codemirror/commands";
import { foldEffect, foldedRanges } from "@codemirror/language";

const dom = new JSDOM(
  '<!doctype html><body><button id="invoker">Open</button><div id="root"></div></body>',
  { url: "http://localhost", pretendToBeVisual: true },
);
for (const key of [
  "Window",
  "window",
  "document",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "Node",
  "NodeFilter",
  "Element",
  "MutationObserver",
  "DOMRect",
  "DOMParser",
  "getComputedStyle",
  "localStorage",
  "requestAnimationFrame",
  "cancelAnimationFrame",
])
  globalThis[key] =
    typeof dom.window[key] === "function" &&
    [
      "getComputedStyle",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ].includes(key)
      ? dom.window[key].bind(dom.window)
      : dom.window[key];
window.matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});
window.ResizeObserver = globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};
window.Range.prototype.getClientRects = () => [];
window.Range.prototype.getBoundingClientRect = () => ({
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
});
HTMLElement.prototype.scrollTo = function ({ top = 0 }) {
  this.scrollTop = top;
};
HTMLElement.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "deditor-regression-"));
fs.symlinkSync(
  path.resolve("node_modules"),
  path.join(dir, "node_modules"),
  "dir",
);
const stubs = {
  "../preview.css?raw": `export default ${JSON.stringify(fs.readFileSync("src/preview.css", "utf8"))};`,
  "@tauri-apps/api/core":
    "export const invoke=(...args)=>globalThis.__invoke(...args); export const convertFileSrc=(p)=>'http://asset.localhost/'+encodeURIComponent(p);",
  "@tauri-apps/plugin-dialog":
    "export const save=(...args)=>globalThis.__save(...args); export const open=(...args)=>globalThis.__open(...args);",
  "@tauri-apps/plugin-opener":
    "export const revealItemInDir=async()=>{}; export const openUrl=async()=>{}; export const openPath=async()=>{};",
  "./markdownExport/mathCss": "export const katexExportCss=()=>\"\";",
  "./format":
    "export const formatBuffer=(...args)=>globalThis.__format(...args);",
  "./logger":
    "export const logError=()=>{};export const logWarn=()=>{};export const logInfo=()=>{};export const logDebug=()=>{};",
  "../lib/logger":
    "export const logError=()=>{};export const logWarn=()=>{};export const logInfo=()=>{};export const logDebug=()=>{};",
};
await build({
  stdin: {
    contents: `
export * from './src/lib/fileio';
export {loadPersisted} from './src/lib/persistence';
export {default as FileTree} from './src/components/FileTree';
export {useFileWatch} from './src/lib/fileWatch';
export {default as XmindView} from './src/components/XmindView';
export {sampleArchive} from './tests/fixtures/xmind';
export {openDocument as openXmindDocument} from './src/lib/xmind/document';
export {useEditorStore} from './src/store/editor';
export * from './src/lib/documentStats';
export * from './src/lib/editorBridge';
export * from './src/lib/editorStateCache';
export * from './src/lib/bookmarks';
export * from './src/lib/retainedTabs';
export {default as Editor} from './src/components/Editor';
export {default as EditorHost} from './src/components/EditorHost';
export {default as PreviewHost} from './src/components/PreviewHost';
export {default as Tooltip} from './src/components/ui/Tooltip';
export {Button} from './src/components/ui/Button';
export {default as XmindIndicator} from './src/components/XmindIndicator';
export {DIAGRAM_TEMPLATES, diagramBlock} from './src/lib/diagramTemplates';
export {default as MarkdownToolbar} from './src/components/MarkdownToolbar';
export {default as HtmlToolbar} from './src/components/HtmlToolbar';
export {default as JsonToolbar} from './src/components/JsonToolbar';
export {showError} from './src/lib/feedback';
export {default as HtmlPreview} from './src/components/HtmlPreview';
export {buildHtmlPreview} from './src/lib/htmlPreview';
export {isHtml} from './src/lib/lang';
export {default as ConfirmDialog, chooseAction} from './src/components/ConfirmDialog';
export {default as FindInFiles} from './src/components/FindInFiles';
export {default as SettingsDialog} from './src/components/SettingsDialog';
export {default as CommandPalette} from './src/components/CommandPalette';
export {default as GotoAnything} from './src/components/GotoAnything';
export {default as GotoSymbol} from './src/components/GotoSymbol';
`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  packages: "external",
  format: "esm",
  platform: "node",
  outfile: path.join(dir, "app.mjs"),
  loader: { ".css": "empty" },
  plugins: [
    {
      name: "ipc-test-boundary",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path.endsWith(".css"))
            return { path: "css-stub", namespace: "stub" };
          if (
            a.path === "../components/ConfirmDialog" &&
            a.importer.endsWith("/fileio.ts")
          )
            return { path: "confirm-stub", namespace: "stub" };
          if (
            a.path === "../lib/markdown" &&
            a.importer.endsWith("/Preview.tsx")
          )
            return { path: "markdown-stub", namespace: "stub" };
          if (stubs[a.path]) return { path: a.path, namespace: "stub" };
        });
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({
          loader: "js",
          contents:
            a.path === "css-stub"
              ? ""
              : a.path === "confirm-stub"
                ? "export const confirmUnsaved=(...args)=>globalThis.__confirm(...args);"
                : a.path === "markdown-stub"
                  ? 'export const renderMarkdown=async(s)=>`<h1 id="heading" data-line="1">${s.replace(/[<>]/g,"")}</h1>`; export const renderCode=renderMarkdown;'
                  : stubs[a.path],
        }));
      },
    },
  ],
  logLevel: "silent",
});
const app = await import(pathToFileURL(path.join(dir, "app.mjs")));
const store = app.useEditorStore;
const initial = store.getState();
const tab = (
  id,
  content = "draft",
  filePath = `/test/${id}.txt`,
  savedContent = "old",
) => ({ id, filePath, content, savedContent });
const pause = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const flush = () => pause(0);
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
let writes, root;
const browserErrors = [];
window.addEventListener("error", (e) => browserErrors.push(e.error));
function reset(tabs = [tab("a"), tab("b", "other")]) {
  writes = [];
  store.setState({
    ...initial,
    tabs,
    activeId: tabs[0].id,
    tabPositions: {},
    formatOnSave: false,
    language: "en",
    closedTabsStack: [],
  });
  globalThis.__invoke = async (cmd, args) => {
    if (cmd.startsWith("write_")) writes.push({ cmd, ...args });
    return undefined;
  };
  globalThis.__open = async () => null;
  globalThis.__save = async () => "/test/saved.txt";
  globalThis.__format = async (content) => content;
  globalThis.__confirm = async () => "save";
  app.setActiveView(null);
}
async function render(element) {
  root = createRoot(document.getElementById("root"));
  await act(async () => {
    root.render(element);
    await pause(20);
  });
}
function button(name) {
  const b = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === name,
  );
  assert.ok(b, `button ${name}`);
  return b;
}
async function click(name) {
  await act(async () => {
    button(name).click();
    await flush();
  });
}
function setInput(input, value) {
  Object.getOwnPropertyDescriptor(
    input instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
    "value",
  ).set.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
const tests = [];
const test = (round, name, fn) => tests.push({ round, name, fn });

async function withToolbarEditor(doc, fn, selection = { anchor: 0, head: doc.length }) {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({ parent, state: EditorState.create({ doc, selection, extensions: [history(), EditorView.updateListener.of(u => {
    if (app.getActiveView() === u.view && (u.docChanged || u.selectionSet)) app.setActiveView(u.view, "a");
  })] }) });
  app.setActiveView(view, "a");
  try { await fn(view); } finally {
    await act(async () => app.setActiveView(null));
    view.destroy(); parent.remove();
  }
}

test(1, "Markdown inline tools toggle markup and undo as separate commands", async () => {
  reset();
  for (const marker of ["**", "*", "~~", "`", "$"]) {
    await withToolbarEditor("sample", async view => {
      app.wrapSelection(marker);
      assert.equal(view.state.doc.toString(), marker + "sample" + marker);
      app.wrapSelection(marker);
      assert.equal(view.state.doc.toString(), "sample");
      undo(view);
      assert.equal(view.state.doc.toString(), marker + "sample" + marker);
      undo(view);
      assert.equal(view.state.doc.toString(), "sample");
    });
  }
  for (const text of ["a`b", "`edge", "edge`", "```"]) {
    await withToolbarEditor(text, async view => {
      app.wrapSelection("`");
      const token = new MarkdownIt().parseInline(view.state.doc.toString(), {})[0].children.find(t=>t.type === "code_inline");
      assert.equal(token.content, text);
      app.wrapSelection("`");
      assert.equal(view.state.doc.toString(), text);
    });
  }
  await withToolbarEditor("sample", async view => {
    app.wrapSelection("**"); app.wrapSelection("*");
    assert.equal(view.state.doc.toString(), "***sample***");
    app.wrapSelection("*");
    assert.equal(view.state.doc.toString(), "**sample**");
  });
});

test(2, "Markdown headings replace levels and list conversion respects selection boundaries", async () => {
  reset();
  await withToolbarEditor("# Title", async view => {
    app.prefixLines("###### "); assert.equal(view.state.doc.toString(), "###### Title");
    app.prefixLines(""); assert.equal(view.state.doc.toString(), "Title");
  });
  await withToolbarEditor("a\nb\nc", async view => {
    app.prefixLines("- "); assert.equal(view.state.doc.toString(), "- a\n- b\nc");
    app.prefixLines("1. "); assert.equal(view.state.doc.toString(), "1. a\n2. b\nc");
    app.prefixLines("- [ ] "); assert.equal(view.state.doc.toString(), "- [ ] a\n- [ ] b\nc");
    app.prefixLines("- [ ] "); assert.equal(view.state.doc.toString(), "a\nb\nc");
  }, { anchor: 0, head: 4 });
  await withToolbarEditor("  note", async view => {
    app.prefixLines("> "); assert.equal(view.state.doc.toString(), "  > note");
    app.prefixLines("> "); assert.equal(view.state.doc.toString(), "  note");
  });
});

test(3, "Markdown block and link insertion produce valid syntax without losing surrounding text", async () => {
  reset();
  const parser = new MarkdownIt();
  await withToolbarEditor("beforeafter", async view => {
    app.insertBlock("---", 3, 0);
    const tokens = parser.parse(view.state.doc.toString(), {});
    assert.equal(tokens.filter(t=>t.type === "hr").length, 1);
    assert.match(view.state.doc.toString(), /^before\n\n---\n\nafter$/);
  }, {anchor:6});
  await withToolbarEditor("literal\n```\ncode", async view => {
    app.insertCodeBlock("markdown");
    const fence = parser.parse(view.state.doc.toString(), {}).find(t=>t.type === "fence");
    assert.equal(fence.content, "literal\n```\ncode\n");
    assert.equal(fence.info, "markdown");
  });
  await withToolbarEditor("", async view => {
    app.insertLink("https://example.com/a (b)");
    assert.equal(view.state.doc.toString(), "[link](<https://example.com/a (b)>)");
    assert.match(parser.render(view.state.doc.toString()), /<a href=/);
  });
  await withToolbarEditor("label", async view => {
    const target = app.captureEditorTarget();
    view.dispatch({changes:{from:0,insert:"changed "}});
    assert.equal(target.apply(()=>app.insertLink("https://example.com")), false);
    assert.equal(view.state.doc.toString(), "changed label");
  });
});

test(4, "Markdown toolbar dialogs validate tables and reading mode disables editing", async () => {
  reset();
  await withToolbarEditor("", async view => {
    await render(React.createElement(app.MarkdownToolbar));
    assert.equal(document.querySelectorAll('.md-heading-select').length, 1, "heading control appears once");
    assert.equal(document.querySelectorAll('.md-tool[aria-label="Bold (**…**)"]').length, 1, "bold control appears once");
    assert.equal(document.querySelectorAll('.md-menu-trigger').length, 0, "actions are directly visible");
    await act(async () => document.querySelector('.md-tool[aria-label="Table"]').click());
    const inputs = document.querySelectorAll('.md-insert-dialog input');
    await act(async () => { setInput(inputs[0], "3"); setInput(inputs[1], "2"); });
    await act(async () => document.querySelector('.md-insert-dialog form').dispatchEvent(new window.Event("submit", {bubbles:true,cancelable:true})));
    assert.equal(document.querySelector('[role="dialog"]'), null);
    const html = new MarkdownIt().render(view.state.doc.toString());
    assert.equal((html.match(/<th>/g) || []).length, 3);
    assert.equal((html.match(/<td>/g) || []).length, 6);
    await act(async () => store.setState({showPreview:true,previewMaximized:true}));
    assert.ok([...document.querySelectorAll('.md-tool, .md-heading-select, .md-color-trigger')].every(b=>b.disabled));
    assert.ok([...document.querySelectorAll('.deditor-segment')].every(b=>!b.disabled));
  });
});

test(3, "Markdown color picker applies once and font controls respect bounds", async () => {
  reset();
  await withToolbarEditor("sample", async view => {
    await act(async () => view.dispatch({selection:{anchor:0,head:6}}));
    await render(React.createElement(app.MarkdownToolbar));
    await act(async () => document.querySelector('.md-color-trigger').click());
    assert.equal(document.querySelectorAll('.md-color-swatch').length, 60);
    await act(async () => setInput(document.querySelector('.md-native-color'), "#008080"));
    assert.equal(document.querySelector('.md-hex-input').value, "#008080");
    assert.equal(view.state.doc.toString(), "sample", "choosing a color does not change the document");
    await act(async () => document.querySelector('.md-color-custom').dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true})));
    assert.equal(view.state.doc.toString(), '<span style="color:#008080">sample</span>');
    assert.equal(document.querySelector('.md-color-popover'), null);
    await act(async () => store.setState({editorFontSize:10}));
    assert.equal(document.querySelector('.md-font-controls button').disabled, true);
    await act(async () => store.setState({editorFontSize:28}));
    assert.equal([...document.querySelectorAll('.md-font-controls button')].at(-1).disabled, true);
  });
});

test(2, "Markdown palette validates HEX and closes with Escape without editing", async () => {
  reset();
  await withToolbarEditor("sample", async view => {
    await render(React.createElement(app.MarkdownToolbar));
    const trigger = document.querySelector('.md-color-trigger');
    await act(async () => trigger.click());
    await act(async () => setInput(document.querySelector('.md-hex-input'), "#ZZZZZZ"));
    assert.equal(document.querySelector('.md-color-custom button').disabled, true);
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('.md-color-popover'), null);
    assert.equal(document.activeElement, trigger);
    assert.equal(view.state.doc.toString(), "sample");
    await act(async () => trigger.click());
    await act(async () => setInput(document.querySelector('.md-hex-input'), "abc"));
    await act(async () => document.querySelector('.md-color-custom').dispatchEvent(new window.Event('submit', {bubbles:true,cancelable:true})));
    assert.equal(view.state.doc.toString(), '<span style="color:#AABBCC">sample</span>');
  });
});

test(3, "Markdown palette applies swatches immediately and replaces the same selected color", async () => {
  reset();
  await withToolbarEditor("sample", async view => {
    await act(async () => view.dispatch({selection:{anchor:0,head:6}}));
    await render(React.createElement(app.MarkdownToolbar));
    const pick = async color => {
      await act(async () => document.querySelector('.md-color-trigger').click());
      await act(async () => document.querySelector(`.md-color-swatch[aria-label="${color}"]`).click());
    };
    await pick("#4472C4");
    assert.equal(view.state.doc.toString(), '<span style="color:#4472C4">sample</span>');
    await pick("#C00000");
    assert.equal(view.state.doc.toString(), '<span style="color:#C00000">sample</span>');
    await pick("#C00000");
    assert.equal(view.state.doc.toString(), '<span style="color:#C00000">sample</span>', 'choosing the same color never removes it');
    await act(async () => view.dispatch({selection:{anchor:0,head:view.state.doc.length}}));
    await pick("#C00000");
    assert.equal(view.state.doc.toString(), '<span style="color:#C00000">sample</span>', 'selecting the entire span does not toggle it off');
    await act(async () => document.querySelectorAll('.md-color-trigger')[1].click());
    await act(async () => document.querySelector('.md-color-swatch[aria-label="#FFFF00"]').click());
    assert.equal(view.state.doc.toString(), '<span style="color:#C00000"><span style="background:#FFFF00">sample</span></span>');
  });
});

test(1, "hover outline defaults unpinned and restores only an explicit pin", async () => {
  reset();
  const snapshot = { v: 3, tabs: [], workspaces: [], activeIndex: 0, theme: "light", showPreview: true, showSidebar: true, sidebarPx: 240, previewPct: 50, tocVisible: true };
  globalThis.__invoke = async (cmd) => cmd === "read_app_state" ? JSON.stringify(snapshot) : undefined;
  await app.loadPersisted();
  assert.equal(store.getState().tocVisible, false, "legacy visible state is not a pin");
  snapshot.tocPinned = true;
  await app.loadPersisted();
  assert.equal(store.getState().tocVisible, true, "explicit pin survives restart");
  snapshot.tocPinned = false;
  await app.loadPersisted();
  assert.equal(store.getState().tocVisible, false, "unpin survives restart");
});

test(2, "same-name workspace groups collapse independently and preserve file selection", async () => {
  reset([tab("a", "# Note", "/work/docs/readme.md")]);
  store.setState({ workspaces: ["/work/docs", "/personal/docs"], expandedDirs: {} });
  const calls = [];
  globalThis.__invoke = async (cmd, args) => {
    calls.push({cmd, ...args});
    if (cmd === "list_dir") return [{ name: "readme.md", path: args.path + "/readme.md", is_dir: false }];
    return undefined;
  };
  await render(React.createElement(app.FileTree));
  assert.deepEqual([...document.querySelectorAll(".workspace-parent")].map(e=>e.textContent), ["/work", "/personal"]);
  const roots = [...document.querySelectorAll(".workspace-toggle")];
  await act(async () => roots[0].click());
  assert.equal(roots[0].getAttribute("aria-expanded"), "false");
  assert.equal(roots[1].getAttribute("aria-expanded"), "true");
  assert.equal(store.getState().activeId, "a");
  await act(async () => { roots[0].click(); await flush(); });
  assert.equal(document.querySelector('.filetree-row[aria-current="page"]').title, "/work/docs/readme.md");
  assert.ok(calls.every(c=>c.cmd === "list_dir"), "disclosure performs only directory reads");
});

test(1, "HTML reading renders current unsaved content and preserves document styles", async () => {
  const content = '<html lang="zh"><head><style>h1 { color: red }</style></head><body><h1>阅读</h1><img src="assets/photo.png"></body></html>';
  reset([tab("html", content, "/test/site/index.html")]);
  await render(React.createElement(app.HtmlPreview, { tabId: "html" }));
  const frame = document.querySelector("iframe");
  assert.equal(frame.title, "HTML reading view");
  const doc = new DOMParser().parseFromString(frame.srcdoc, "text/html");
  assert.equal(doc.querySelector("h1").textContent, "阅读");
  assert.match(doc.querySelector("style").textContent, /color: red/);
  assert.equal(doc.documentElement.lang, "zh");
  assert.equal(new URL(doc.querySelector("img").getAttribute("src"), doc.querySelector("base").href).pathname, "//test/site/assets/photo.png");
  assert.equal(store.getState().tabs[0].content, content);
  assert.equal(store.getState().tabs[0].savedContent, "old");
});

test(2, "HTML handles empty files, fragments, mixed-case extensions and Windows Unicode paths", async () => {
  assert.equal(app.isHtml(null), false);
  assert.equal(app.isHtml("/test/a.HTML"), true);
  assert.equal(app.isHtml("C:\\docs\\a.HTM"), true);
  assert.equal(app.isHtml("/test/html.txt"), false);
  for (const content of ["", "<h1>未闭合标题", "<p>中文 &amp; &lt;标签&gt;</p>"]) {
    const doc = new DOMParser().parseFromString(app.buildHtmlPreview(content, "C:\\阅读 文档\\index.htm"), "text/html");
    assert.ok(doc.body);
    const target = new URL("images/photo.png", doc.querySelector("base").href);
    assert.equal(decodeURIComponent(target.pathname), "/C:/阅读 文档/images/photo.png");
  }
  const doc = new DOMParser().parseFromString(app.buildHtmlPreview('<base href="../shared/"><base href="https://ignored.test/"><img src="a.png">', "/test/site/index.html"), "text/html");
  assert.equal(doc.querySelectorAll("base").length, 1);
  assert.equal(new URL("a.png", doc.querySelector("base").href).pathname, "//test/shared/a.png");
  const malformed = new DOMParser().parseFromString(app.buildHtmlPreview('<base href="http://["><a href="#section">Section</a><h1 id="section">Still readable</h1>', "/test/a.html"), "text/html");
  assert.equal(malformed.querySelector("base").href, "http://asset.localhost//test/a.html");
  assert.equal(malformed.querySelector("a").getAttribute("href"), "about:srcdoc#section");
  assert.equal(malformed.querySelector("h1").textContent, "Still readable");
});

test(3, "HTML mode toggles preserve editor undo and preview follows edits and tab switches", async () => {
  reset([tab("a", "<h1>A</h1>", "/test/a.html"), tab("b", "<h1>B</h1>", "/test/b.htm")]);
  function Host() {
    const activeId = store((s) => s.activeId);
    const show = store((s) => s.showPreview);
    const reading = store((s) => s.previewMaximized);
    return React.createElement(React.Fragment, null,
      React.createElement(app.HtmlToolbar),
      React.createElement("div", { style: { display: show && reading ? "none" : "block" } }, React.createElement(app.EditorHost, { activeId, theme: "light", fontSize: 14 })),
      show && React.createElement(app.HtmlPreview, { key: activeId, tabId: activeId }));
  }
  await render(React.createElement(Host));
  const view = app.getActiveView();
  await act(async () => view.dispatch({ changes: { from: 4, to: 5, insert: "Updated" } }));
  await click("Reading");
  assert.equal(button("Reading").getAttribute("aria-pressed"), "true");
  assert.match(document.querySelector("iframe").srcdoc, /Updated/);
  await act(async () => store.getState().setActive("b"));
  assert.match(document.querySelector("iframe").srcdoc, /<h1>B<\/h1>/);
  await act(async () => store.getState().setActive("a"));
  await click("Edit");
  assert.equal(document.querySelector("iframe"), null);
  assert.equal(app.getActiveView(), view);
  await act(async () => assert.equal(undo(view), true));
  assert.equal(store.getState().tabs[0].content, "<h1>A</h1>");
  await click("Live Preview");
  assert.equal(store.getState().previewMaximized, false);
  assert.match(document.querySelector("iframe").srcdoc, /<h1>A<\/h1>/);
});

test(4, "HTML reading isolates scripts, nested frames and refresh navigation", async () => {
  reset([tab("a", '<meta http-equiv="REFRESH" content="0;url=https://example.com"><script>parent.compromised=true</script><iframe src="https://example.com"></iframe><form action="https://example.com"></form>', "/test/a.html")]);
  await render(React.createElement(app.HtmlPreview, { tabId: "a" }));
  const frame = document.querySelector("iframe");
  assert.equal(frame.getAttribute("sandbox"), "");
  const doc = new DOMParser().parseFromString(frame.srcdoc, "text/html");
  assert.equal(doc.querySelector('meta[http-equiv="REFRESH"]'), null);
  assert.match(doc.querySelector("meta").content, /script-src 'none'/);
  assert.match(doc.querySelector("meta").content, /frame-src 'none'/);
  assert.match(doc.querySelector("meta").content, /form-action 'none'/);
  assert.equal(window.compromised, undefined);
});

test(
  1,
  "save writes the exact text and clears only its dirty flag",
  async () => {
    reset();
    await app.saveFile();
    assert.equal(writes[0].content, "draft");
    assert.equal(store.getState().tabs[0].savedContent, "draft");
    assert.equal(store.getState().tabs[1].savedContent, "old");
  },
);
test(1, "save-as rebinds its originating tab", async () => {
  reset([tab("a", "draft", null)]);
  assert.equal(await app.saveFileAs(), true);
  assert.equal(store.getState().tabs[0].filePath, "/test/saved.txt");
});
test(1, "unchanged save does not write or change mtime", async () => {
  reset([tab("a", "same", "/test/a.txt", "same")]);
  assert.equal(await app.saveFile(), true);
  assert.equal(writes.length, 0);
});
test(1, "XMind callouts render a filled tail and remain editable through standard save", async () => {
  await mountXmind();
  const tail=document.querySelector('[data-callout-tail="true"]');
  assert.ok(tail);assert.equal(tail.getAttribute('stroke'),'none');
  assert.notEqual(tail.getAttribute('fill'),'none');
  assert.ok(tail.getAttribute('d').endsWith(' Z'));
  const bubble=document.querySelector('[data-topic="callout"]');
  assert.ok(bubble);
  await act(async()=>bubble.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  await act(async()=>setInput(document.querySelector('textarea[aria-label="Edit topic text"]'),'批注修改后保存'));
  await act(async()=>app.saveFile());
  const saved=app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64')));
  const collect=t=>[t,...Object.values(t.children??{}).filter(Array.isArray).flatMap(cs=>cs.flatMap(collect))];
  assert.equal(collect(saved.sheets[0].rootTopic).find(t=>t.id==='callout').title,'批注修改后保存');
  assert.ok(document.querySelector('[data-callout-tail="true"]'));
});

test(1, "XMind save remains binary, including save-as", async () => {
  reset([
    tab(
      "a",
      "data:application/vnd.xmind.workbook;base64,SGVsbG8=",
      "/test/a.xmind",
    ),
  ]);
  await app.saveFileAs();
  assert.equal(writes[0].cmd, "write_binary_file");
  assert.equal(writes[0].data, "SGVsbG8=");
});
test(2, "a text data URL stays literal text", async () => {
  reset([tab("a", "data:text/plain;base64,SGVsbG8=")]);
  await app.saveFile();
  assert.equal(writes[0].cmd, "write_text_file");
  assert.equal(writes[0].content, "data:text/plain;base64,SGVsbG8=");
});
test(
  2,
  "cancel native save dialog preserves the original untitled tab",
  async () => {
    reset([tab("a", "unsaved", null)]);
    globalThis.__save = async () => null;
    assert.equal(await app.closeActiveTab(), false);
    assert.equal(store.getState().tabs[0].id, "a");
    assert.equal(writes.length, 0);
  },
);
test(
  2,
  "incremental stats match full scans for 500 Unicode and multiline edits",
  async () => {
    let state = EditorState.create({
      doc: "中文\nhello world\n😀\tfoo",
      extensions: [app.documentStatsField],
    });
    let seed = 37;
    const rnd = (n) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed % n;
    };
    for (let i = 0; i < 500; i++) {
      const from = rnd(state.doc.length + 1),
        to = Math.min(state.doc.length, from + rnd(5));
      const insert = ["", "\n", "中文", " x ", "😀", "\t\u00a0a", "\r\ny"][
        rnd(7)
      ];
      state = state.update({ changes: { from, to, insert } }).state;
      assert.deepEqual(
        state.field(app.documentStatsField),
        app.countText(state.doc.toString()),
      );
    }
    assert.deepEqual(app.countText(""), { words: 0, cjk: 0 });
  },
);
test(
  2,
  "LRU membership is capped, stable and removes closed tabs",
  async () => {
    let recent = [];
    const ids = Array.from({ length: 20 }, (_, i) => String(i));
    for (const id of ids) recent = app.retainRecentTabs(recent, id, ids);
    assert.equal(recent.length, 8);
    assert.deepEqual(recent, ids.slice(-8));
    assert.deepEqual(app.retainRecentTabs(recent, "0", ["0"]), ["0"]);
  },
);
test(
  3,
  "switching tabs during save never marks the new tab saved",
  async () => {
    reset();
    const gate = deferred();
    globalThis.__invoke = async (cmd, args) => {
      writes.push({ cmd, ...args });
      await gate.promise;
    };
    const saving = app.saveFile();
    await flush();
    store.getState().setActive("b");
    gate.resolve();
    await saving;
    assert.equal(store.getState().tabs[0].savedContent, "draft");
    assert.equal(store.getState().tabs[1].savedContent, "old");
  },
);
test(3, "typing during save keeps newer text dirty", async () => {
  reset();
  const gate = deferred();
  globalThis.__invoke = async (cmd, args) => {
    writes.push({ cmd, ...args });
    await gate.promise;
  };
  const saving = app.saveFile();
  await flush();
  store.getState().setContent("newer", "a");
  gate.resolve();
  assert.equal(await saving, false);
  assert.equal(store.getState().tabs[0].content, "newer");
  assert.equal(store.getState().tabs[0].savedContent, "draft");
});
test(
  3,
  "save-as cannot overwrite a different tab after tab switch",
  async () => {
    reset();
    const gate = deferred();
    globalThis.__save = () => gate.promise;
    const saving = app.saveFileAs();
    await flush();
    store.getState().setActive("b");
    gate.resolve("/test/new.txt");
    await saving;
    assert.equal(store.getState().tabs[0].filePath, "/test/new.txt");
    assert.equal(store.getState().tabs[1].content, "other");
    assert.equal(store.getState().tabs[1].filePath, "/test/b.txt");
  },
);
test(
  3,
  "queued saves write old then new snapshots, never out of order",
  async () => {
    reset();
    const gate = deferred();
    globalThis.__invoke = async (cmd, args) => {
      writes.push({ cmd, ...args });
      if (writes.length === 1) await gate.promise;
    };
    const first = app.saveFile();
    await flush();
    store.getState().setContent("newer", "a");
    const second = app.saveFile();
    await flush();
    assert.equal(writes.length, 1);
    gate.resolve();
    await Promise.all([first, second]);
    assert.deepEqual(
      writes.map((w) => w.content),
      ["draft", "newer"],
    );
    assert.equal(store.getState().tabs[0].savedContent, "newer");
  },
);
test(3, "async formatting never overwrites new typing", async () => {
  reset();
  store.setState({ formatOnSave: true });
  const gate = deferred();
  globalThis.__format = () => gate.promise;
  const saving = app.saveFile();
  await flush();
  store.getState().setContent("new typing", "a");
  gate.resolve("formatted");
  await saving;
  assert.equal(writes[0].content, "formatted");
  assert.equal(store.getState().tabs[0].content, "new typing");
  assert.equal(store.getState().tabs[0].savedContent, "formatted");
});
test(4, "failed write preserves dirty state and aborts closing", async () => {
  reset();
  globalThis.__invoke = async () => {
    throw new Error("disk full");
  };
  assert.equal(await app.closeActiveTab(), false);
  assert.equal(store.getState().tabs[0].id, "a");
  assert.equal(store.getState().tabs[0].savedContent, "old");
});
test(
  4,
  "auto-save skips external conflicts and preserves new edits",
  async () => {
    reset([{ ...tab("a"), externalChange: "disk edit" }, tab("b")]);
    await app.saveAllDirty();
    assert.deepEqual(
      writes.map((w) => w.path),
      ["/test/b.txt"],
    );
    assert.equal(store.getState().tabs[0].externalChange, "disk edit");
  },
);
test(4, "cancel close-others preserves remaining dirty tabs", async () => {
  reset();
  globalThis.__confirm = async () => "cancel";
  await app.closeOtherTabs("a");
  assert.equal(store.getState().tabs.length, 2);
  assert.equal(writes.length, 0);
});
test(4, "save-as rejects an already-open destination", async () => {
  reset();
  globalThis.__save = async () => "/test/b.txt";
  await assert.rejects(app.saveFileAs(), /already open/);
  assert.equal(writes.length, 0);
});
test(
  5,
  "confirmation traps focus, restores invoker, and Enter on Cancel never saves",
  async () => {
    reset();
    const invoker = document.getElementById("invoker");
    invoker.focus();
    await render(React.createElement(app.ConfirmDialog));
    let choice;
    await act(async () => {
      choice = app.chooseAction({
        title: "Confirm",
        message: "Test",
        buttons: [
          { label: "Cancel", value: "cancel" },
          { label: "Save", value: "save", primary: true },
        ],
      });
      await flush();
    });
    const dlg = document.querySelector("[role=dialog]");
    assert.equal(dlg.getAttribute("aria-modal"), "true");
    assert.equal(dlg.parentElement.style.zIndex, "3000");
    assert.equal(document.activeElement, button("Cancel"));
    await act(async () => {
      button("Cancel").dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    assert.equal(document.activeElement, button("Save"));
    let resolved = false;
    void choice.then(() => { resolved = true; });
    await act(async () => {
      button("Cancel").focus();
      button("Cancel").dispatchEvent(new window.KeyboardEvent("keydown", {
        key: "Enter", bubbles: true,
      }));
      await flush();
    });
    // jsdom does not synthesize the browser's default button click.
    assert.equal(resolved, false);
    await click("Cancel");
    assert.equal(await choice, "cancel");
    assert.equal(document.activeElement, invoker);
  },
);
test(
  5,
  "multiple confirmations queue instead of orphaning a promise",
  async () => {
    reset();
    await render(React.createElement(app.ConfirmDialog));
    let a, b;
    await act(async () => {
      a = app.chooseAction({
        title: "First",
        message: "A",
        buttons: [{ label: "First OK", value: "a" }],
      });
      b = app.chooseAction({
        title: "Second",
        message: "B",
        buttons: [{ label: "Second OK", value: "b" }],
      });
      await flush();
    });
    await click("First OK");
    assert.equal(await a, "a");
    await click("Second OK");
    assert.equal(await b, "b");
  },
);
test(5, "untitled Markdown creates a preview slot", async () => {
  reset([tab("a", "# Hello", null)]);
  await render(
    React.createElement(app.PreviewHost, { activeId: "a", theme: "light" }),
  );
  await act(async () => {
    await pause(120);
  });
  assert.ok(document.querySelector("h1"));
  assert.match(document.querySelector("h1").textContent, /Hello/);
});
test(
  5,
  "evicting editor DOM preserves history, bookmark, fold and selection",
  async () => {
    const tabs = Array.from({ length: 12 }, (_, i) =>
      tab(
        String(i),
        "first\nsecond\nthird",
        `/test/${i}.txt`,
        "first\nsecond\nthird",
      ),
    );
    reset(tabs);
    function Host() {
      const activeId = store((s) => s.activeId);
      return React.createElement(app.EditorHost, {
        activeId,
        theme: "light",
        fontSize: 14,
      });
    }
    await render(React.createElement(Host));
    let view = app.getActiveView();
    assert.ok(view);
    await act(async () => {
      view.dispatch({
        changes: { from: 0, insert: "x" },
        selection: { anchor: 2 },
        effects: [
          app.toggleBookmarkEffect.of({ from: 0 }),
          foldEffect.of({ from: 6, to: 12 }),
        ],
      });
    });
    assert.equal(undoDepth(view.state), 1);
    for (let i = 1; i < 12; i++) {
      await act(async () => {
        store.getState().setActive(String(i));
        await pause(15);
      });
    }
    assert.ok(document.querySelectorAll(".cm-editor").length <= 8);
    assert.ok(app.getEditorStateCache("0") instanceof EditorState);
    await act(async () => {
      store.getState().setActive("0");
      await pause(20);
    });
    view = app.getActiveView();
    assert.equal(view.state.selection.main.anchor, 2);
    assert.equal(view.state.field(app.bookmarkField).size, 1);
    assert.equal(foldedRanges(view.state).size, 1);
    await act(async () => {
      assert.equal(undo(view), true);
    });
    assert.equal(store.getState().tabs[0].content, "first\nsecond\nthird");
    await act(async () => {
      assert.equal(redo(view), true);
    });
    assert.equal(store.getState().tabs[0].content, "xfirst\nsecond\nthird");
  },
);

test(3, "clearing search discards an older in-flight response", async () => {
  reset();
  store.setState({ workspaces: ["/test"] });
  const gate = deferred();
  let calls = 0;
  globalThis.__invoke = async (cmd) => {
    if (cmd === "find_in_files") {
      calls++;
      return gate.promise;
    }
  };
  await render(
    React.createElement(app.FindInFiles, { open: true, onClose() {} }),
  );
  const input = document.querySelector("input");
  await act(async () => setInput(input, "old"));
  await act(async () => pause(350));
  assert.equal(calls, 1);
  await act(async () => setInput(input, ""));
  await act(async () => {
    gate.resolve({
      hits: [{ path: "/test/a.txt", line: 1, col: 1, text: "STALE RESULT" }],
      truncated: false,
      files_scanned: 1,
    });
    await flush();
  });
  assert.ok(!document.body.textContent.includes("STALE RESULT"));
});
test(
  4,
  "search failure is visible and retry renders fresh results",
  async () => {
    reset();
    store.setState({ workspaces: ["/test"] });
    let fail = true;
    globalThis.__invoke = async (cmd) => {
      if (cmd === "find_in_files") {
        if (fail) throw new Error("offline");
        return {
          hits: [
            { path: "/test/a.txt", line: 1, col: 1, text: "fresh result" },
          ],
          truncated: false,
          files_scanned: 1,
        };
      }
    };
    await render(
      React.createElement(app.FindInFiles, { open: true, onClose() {} }),
    );
    await act(async () => setInput(document.querySelector("input"), "fresh"));
    await act(async () => pause(350));
    assert.match(document.querySelector("[role=alert]").textContent, /offline/);
    fail = false;
    await click("Retry search");
    await act(async () => pause(350));
    assert.match(document.body.textContent, /fresh result/);
    assert.equal(document.querySelector("[role=alert]"), null);
  },
);
test(
  5,
  "replace confirmation appears above search and reports partial failures",
  async () => {
    reset();
    store.setState({ workspaces: ["/test"] });
    let replaced = 0;
    globalThis.__invoke = async (cmd) => {
      if (cmd === "find_in_files")
        return {
          hits: [{ path: "/test/a.txt", line: 1, col: 1, text: "match" }],
          truncated: false,
          files_scanned: 1,
        };
      if (cmd === "replace_in_files") {
        replaced++;
        return { total: 2, files_changed: 1, errors: ["read-only file"] };
      }
    };
    await render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(app.FindInFiles, { open: true, onClose() {} }),
        React.createElement(app.ConfirmDialog),
      ),
    );
    await act(async () => setInput(document.querySelector("input"), "match"));
    await act(async () => pause(350));
    await act(async () =>
      document.querySelector('button[aria-label="Toggle replace input"]').click(),
    );
    await click("Replace All");
    assert.equal(replaced, 0);
    const confirm = document.querySelector(
      '[role=dialog][aria-label="Confirm Replace All"]',
    );
    assert.ok(confirm);
    assert.equal(confirm.parentElement.style.zIndex, "3000");
    await act(async () => {
      [...confirm.querySelectorAll("button")]
        .find((b) => b.textContent === "Replace All")
        .click();
      await flush();
    });
    assert.equal(replaced, 1);
    assert.match(document.querySelector("[role=status]").textContent, /2.*1/);
    assert.match(
      document.querySelector("[role=alert]").textContent,
      /read-only/,
    );
  },
);

test(
  5,
  "cold previews release document DOM and restore their search query",
  async () => {
    reset(
      Array.from({ length: 12 }, (_, i) =>
        tab(String(i), "hello " + i, `/test/${i}.md`),
      ),
    );
    store.setState({ previewMaximized: true });
    function Host() {
      const activeId = store((s) => s.activeId);
      return React.createElement(app.PreviewHost, { activeId, theme: "light" });
    }
    await render(React.createElement(Host));
    await act(async () => pause(120));
    await act(async () =>
      window.dispatchEvent(
        new window.KeyboardEvent("keydown", {
          key: "f",
          ctrlKey: true,
          bubbles: true,
        }),
      ),
    );
    const search = document.querySelector("input");
    assert.ok(search);
    await act(async () => setInput(search, "hello"));
    for (let i = 1; i < 12; i++) {
      await act(async () => store.getState().setActive(String(i)));
      await act(async () => pause(90));
    }
    assert.ok(document.querySelectorAll("h1").length <= 8);
    await act(async () => store.getState().setActive("0"));
    await act(async () => pause(30));
    assert.equal(search.value, "hello");
    assert.ok(document.querySelector(".preview-search-match"));
  },
);

test(5, "navigation and settings dialogs restore keyboard focus", async () => {
  for (const Component of [app.SettingsDialog, app.CommandPalette, app.GotoAnything, app.GotoSymbol]) {
    reset();
    globalThis.__invoke = async () => [];
    let closed = false;
    const invoker = document.getElementById("invoker");
    invoker.focus();
    await render(React.createElement(Component, {open: true, onClose() {closed = true;}}));
    const panel = document.querySelector('[role="dialog"]');
    assert.ok(panel.contains(document.activeElement));
    await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", {key:"Escape", bubbles:true})));
    assert.equal(closed, true);
    await act(async () => {root.unmount(); await flush();});
    root = undefined;
    assert.equal(document.activeElement, invoker);
  }
});


function xmindUrl(bytes) {return `data:application/vnd.xmind.workbook;base64,${Buffer.from(bytes).toString('base64')}`;}
function xmindSheets() {return app.openXmindDocument(new Uint8Array(Buffer.from(store.getState().tabs[0].content.split(',')[1], 'base64'))).sheets;}
async function mountXmind(editing = true, bytes = app.sampleArchive()) {
  if(root){await act(async()=>root.unmount());root=undefined;}
  window.HTMLCanvasElement.prototype.getContext = () => ({font:'',measureText:text=>({width:Array.from(text).length*9})});
  const url=xmindUrl(bytes);
  reset([tab('xm',url,'/test/sample.xmind',url)]);
  localStorage.setItem('deditor:xmind:viewMode',editing?'edit':'read');
  function Host() {const content=store(s=>s.tabs.find(t=>t.id==='xm')?.content);return content?React.createElement(app.XmindView,{dataUrl:content,filePath:'/test/sample.xmind',tabId:'xm'}):null;}
  await render(React.createElement(Host));
}
async function dragCallout(dx, dy, { cancel = false, over = null } = {}) {
  const svg = document.querySelector('.xm-svg');
  const bubble = document.querySelector('[data-topic="callout"]');
  const tail = () => document.querySelector('[data-callout-tail="true"]').getAttribute('d');
  const beforeTail = tail();
  svg.setPointerCapture = () => {};
  const originalHit = document.elementFromPoint;
  document.elementFromPoint = () => over;
  try {
    await act(async () => bubble.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles:true, button:0, clientX:100, clientY:100 })));
    await act(async () => svg.dispatchEvent(new window.MouseEvent('pointermove', { bubbles:true, clientX:100+dx, clientY:100+dy })));
    assert.notEqual(tail(), beforeTail, 'tail follows the bubble while dragging');
    await act(async () => svg.dispatchEvent(new window.MouseEvent(cancel ? 'pointercancel' : 'pointerup', { bubbles:true, clientX:100+dx, clientY:100+dy })));
  } finally { document.elementFromPoint = originalHit; }
}
function calloutOwner(sheets) {
  const visit = topic => topic.children?.callout?.some(t => t.id === 'callout') ? topic
    : Object.values(topic.children ?? {}).flat().map(visit).find(Boolean);
  return visit(sheets[0].rootTopic);
}
test(1, 'XMind callout drag preserves ownership and styling, including live tail and standard save', async () => {
  await mountXmind();
  const owner = calloutOwner(xmindSheets());
  const before = structuredClone(owner.children.callout[0]);
  const originalBuffer = store.getState().tabs[0].content;
  const fill = document.querySelector('[data-callout-tail="true"]').getAttribute('fill');
  await dragCallout(0, 30);
  const movedOwner = calloutOwner(xmindSheets());
  assert.equal(movedOwner.id, owner.id);
  const moved = movedOwner.children.callout[0];
  assert.ok(Number.isFinite(moved.position.y));
  const {position, ...unchanged} = moved;
  assert.deepEqual(unchanged, before);
  assert.equal(document.querySelector('[data-callout-tail="true"]').getAttribute('fill'), fill);
  assert.equal(document.querySelector('[data-topic="callout"]').getAttribute('data-detached'), null);
  await click('Undo'); assert.equal(store.getState().tabs[0].content, originalBuffer);
  await click('Redo'); assert.deepEqual(calloutOwner(xmindSheets()).children.callout[0], moved);
  await act(async () => app.saveFile());
  const saved = new Uint8Array(Buffer.from(writes.at(-1).data, 'base64'));
  await mountXmind(true, saved);
  assert.deepEqual(calloutOwner(xmindSheets()).children.callout[0], moved);
  assert.equal(document.querySelector('[data-callout-tail="true"]').getAttribute('fill'), fill);
});
test(2, 'XMind callout drag over a different topic never reparents; cancelling leaves the document intact', async () => {
  await mountXmind();
  const owner = calloutOwner(xmindSheets()).id;
  const before = store.getState().tabs[0].content;
  await dragCallout(40, -30, {cancel:true});
  assert.equal(store.getState().tabs[0].content, before);
  await dragCallout(90, -40, {over:document.querySelector('[data-topic="read"]')});
  assert.equal(calloutOwner(xmindSheets()).id, owner);
  assert.ok(document.querySelector('[data-callout-tail="true"]').getAttribute('d').endsWith(' Z'));
});
test(3, 'XMind outline and format toggles remain independent after removing the duplicate close control', async () => {
  await mountXmind();
  const before = store.getState().tabs[0].content;
  assert.equal(document.querySelector('.xm-panel-title button'), null);
  await click('Outline'); await click('Format');
  assert.ok(document.querySelector('.xm-outline'));
  assert.equal(document.querySelector('.xm-inspector'), null);
  await click('Format'); await click('Outline');
  assert.ok(document.querySelector('.xm-inspector'));
  assert.equal(document.querySelector('.xm-outline'), null);
  assert.equal(store.getState().tabs[0].content, before);
});
test(3, 'XMind symbols and layout hints never paint internal names with legacy mode preferences', async()=>{
  const sheet={id:'icons-sheet',title:'Icons',rootTopic:{id:'icons-root',title:'交付计划',
    structureClass:'org.xmind.ui.unknown-internal-layout',labels:['客户标签'],
    markers:[{markerId:'task-done'},{markerId:'task-half'},{markerId:'star-red'},{markerId:'priority-1'},{markerId:'vendor-private-marker'}],
    notes:{plain:{content:'保留真实备注'}},href:'https://example.test/'}};
  const bytes=zipSync({'content.json':strToU8(JSON.stringify([sheet]))});
  for(const previousEditing of [false,true]) {
    await mountXmind(previousEditing,bytes);
    const node=document.querySelector('[data-topic="icons-root"]');
    const painted=[...node.querySelectorAll('text')].map(n=>n.textContent).join(' ');
    assert.ok(painted.includes('交付计划'));
    assert.ok(painted.includes('客户标签'));
    assert.ok(!/task-done|task-half|star-red|priority-1|vendor-private-marker|Notes|Link/.test(painted));
    assert.equal(node.querySelectorAll('svg[role="img"]').length,7);
    assert.ok(node.querySelector('[aria-label="Task progress 100%"]'));
    assert.ok(node.querySelector('[aria-label="Has notes"]'));
    assert.ok(!document.querySelector('.xm-warning').textContent.includes('org.xmind'));
    assert.ok(![...document.querySelectorAll('option')].some(n=>n.textContent.includes('org.xmind')));
  }
  assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
  assert.deepEqual(xmindSheets()[0].rootTopic.markers,sheet.rootTopic.markers);
});
test(1, 'XMind creates a subtopic, marks dirty and preserves unknown fields', async()=>{
  await mountXmind(); const count=document.querySelectorAll('[data-topic]').length;
  await click('Subtopic');
  assert.equal(document.querySelectorAll('[data-topic]').length,count+1);
  assert.notEqual(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
  assert.deepEqual(xmindSheets()[0].rootTopic.customExtension,{keep:['unknown',123]});
});
test(1, 'XMind opens editable even with an old read preference and has no separate save or mode controls', async()=>{
  await mountXmind(false);
  const before=store.getState().tabs[0].content;
  const buttons=[...document.querySelectorAll('.xm-workbench button')].map(b=>b.textContent);
  for(const name of ['Read','Edit','Save'])assert.ok(!buttons.includes(name));
  assert.equal(document.querySelectorAll('.xm-workbench .document-toolbar').length,1);
  assert.equal(document.querySelector('.xm-tools strong'),null);
  assert.ok(buttons.includes('Subtopic'));
  assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
  const canvas=document.querySelector('.xm-canvas');
  await act(async()=>canvas.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F2',bubbles:true})));
  assert.ok(document.querySelector('textarea[aria-label="Edit topic text"]'));
  await act(async()=>setInput(document.querySelector('textarea[aria-label="Edit topic text"]'),'直接编辑中文'));
  await act(async()=>app.saveFile());
  assert.notEqual(store.getState().tabs[0].content,before);
  assert.equal(xmindSheets()[0].rootTopic.title,'直接编辑中文');
  assert.equal(writes.at(-1).cmd,'write_binary_file');
});
test(1, 'Unverified timeline variants retain compatibility hints without blocking editing or saving',async()=>{
  const timeline={id:'timeline',title:'时间轴',rootTopic:{id:'timeline-root',title:'2026 · 版本演进',structureClass:'org.xmind.ui.timeline.vertical',children:{attached:[{id:'q1',title:'Q1 · 发现'}]}}};
  await mountXmind(false,zipSync({'content.json':strToU8(JSON.stringify([timeline]))}));
  assert.ok(document.querySelector('.xm-warning'));
  assert.equal(document.querySelector('.xm-warning').textContent,'');
  await act(async()=>document.querySelector('[data-topic="q1"]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  await act(async()=>setInput(document.querySelector('textarea[aria-label="Edit topic text"]'),'Q1 · 已编辑'));
  await act(async()=>app.saveFile());
  const saved=app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64')));
  assert.equal(saved.sheets[0].rootTopic.children.attached[0].title,'Q1 · 已编辑');
  assert.equal(saved.sheets[0].rootTopic.structureClass,timeline.rootTopic.structureClass);
  assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
});
test(2, 'Legacy XML remains viewable without offering unsupported editing', async()=>{
  const bytes=zipSync({'content.xml':strToU8('<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0"><sheet id="old"><title>Legacy</title><topic id="old-root"><title>旧文件</title></topic></sheet></xmap-content>')});
  await mountXmind(false,bytes);
  const before=store.getState().tabs[0].content;
  assert.ok(document.querySelector('[data-topic="old-root"]'));
  assert.ok(document.querySelector('.xm-legacy'));
  const canvas=document.querySelector('.xm-canvas');
  for(const key of ['Enter','Tab','Delete','F2'])await act(async()=>canvas.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true})));
  assert.equal(store.getState().tabs[0].content,before);
  assert.equal(document.querySelector('textarea[aria-label="Edit topic text"]'),null);
  assert.ok(![...document.querySelectorAll('button')].some(b=>b.textContent==='Subtopic'));
});
test(3, 'XMind sheet edits retain active sheet, undo/redo and canvas instance',async()=>{
  await mountXmind();await click('组织结构');
  const svg=document.querySelector('.xm-svg');
  await click('Subtopic');assert.equal(document.querySelector('[role=tab][aria-selected=true]').textContent,'组织结构');
  assert.equal(xmindSheets()[1].rootTopic.children.attached.length,4);
  await click('Undo');assert.equal(xmindSheets()[1].rootTopic.children.attached.length,3);
  await click('Redo');assert.equal(xmindSheets()[1].rootTopic.children.attached.length,4);
  assert.equal(document.querySelector('.xm-svg'),svg);
  assert.equal(xmindSheets()[0].rootTopic.title,'DEditor\n思维导图体验');
});
test(3, 'XMind save flushes the in-place title before binary IPC',async()=>{
  await mountXmind();
  await act(async()=>document.querySelector('[data-topic="root"]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  const input=document.querySelector('textarea[aria-label="Edit topic text"]');assert.ok(input);
  await act(async()=>setInput(input,'Saved while editing'));
  await act(async()=>app.saveFile());
  assert.equal(writes.at(-1).cmd,'write_binary_file');
  const doc=app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64')));
  assert.equal(doc.sheets[0].rootTopic.title,'Saved while editing');
  assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
});
test(3, 'XMind automatic save commits a focused draft through the shared save queue',async()=>{
  await mountXmind(false);
  await act(async()=>document.querySelector('[data-topic="root"]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  await act(async()=>setInput(document.querySelector('textarea[aria-label="Edit topic text"]'),'自动保存草稿'));
  await act(async()=>app.saveAllDirty());
  assert.equal(writes.at(-1).cmd,'write_binary_file');
  const doc=app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64')));
  assert.equal(doc.sheets[0].rootTopic.title,'自动保存草稿');
  assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
});
test(3, 'XMind close uses the common unsaved prompt and save-as keeps a valid archive',async()=>{
  await mountXmind(false);
  await act(async()=>document.querySelector('[data-topic="root"]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  await act(async()=>setInput(document.querySelector('textarea[aria-label="Edit topic text"]'),'关闭前保留'));
  let prompts=0;globalThis.__confirm=async()=>{prompts++;return 'cancel';};
  await act(async()=>assert.equal(await app.closeActiveTab(),false));
  assert.equal(prompts,1);assert.equal(store.getState().tabs.length,1);
  assert.notEqual(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
  globalThis.__save=async(options)=>{assert.deepEqual(options.filters,[{name:'XMind',extensions:['xmind']}]);return '/test/renamed.xmind';};
  await act(async()=>assert.equal(await app.saveFileAs(),true));
  assert.equal(writes.at(-1).cmd,'write_binary_file');
  const doc=app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64')));
  assert.equal(doc.sheets[0].rootTopic.title,'关闭前保留');
  assert.equal(store.getState().tabs[0].filePath,'/test/renamed.xmind');
  await act(async()=>assert.equal(await app.closeActiveTab(),true));
  assert.equal(prompts,1);assert.ok(!store.getState().tabs.some(t=>t.id==='xm'));
});
test(2, 'XMind Escape cancels the inline draft even when focus blurs', async()=>{
  await mountXmind();const before=store.getState().tabs[0].content;
  await act(async()=>document.querySelector('[data-topic="root"]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  const input=document.querySelector('textarea[aria-label="Edit topic text"]');
  await act(async()=>setInput(input,'Must be cancelled'));
  await act(async()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('textarea[aria-label="Edit topic text"]'),null);
  assert.equal(store.getState().tabs[0].content,before);
});
test(2, 'XMind inspector preserves multiline title on an unchanged blur', async()=>{
  await mountXmind();const before=store.getState().tabs[0].content;
  const input=document.querySelector('textarea[aria-label="Topic text"]');assert.ok(input);
  assert.equal(input.value,'DEditor\n思维导图体验');
  await act(async()=>{input.focus();input.blur();});
  assert.equal(store.getState().tabs[0].content,before);
});
test(4,'XMind failed save leaves edited archive dirty and visible',async()=>{
  await mountXmind();await click('Subtopic');
  globalThis.__invoke=async(cmd)=>{if(cmd==='write_binary_file')throw new Error('disk full');};
  await assert.rejects(()=>app.saveFile(),/disk full/);
  assert.notEqual(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
  assert.ok(document.querySelector('[data-topic="root"]'));
});
test(3, 'XMind tab unmount commits a draft and restores sheet and undo history', async()=>{
  await mountXmind();await click('组织结构');
  await act(async()=>document.querySelector('[data-topic="org-root"]').dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  await act(async()=>setInput(document.querySelector('textarea[aria-label="Edit topic text"]'),'Draft across tabs'));
  await act(async()=>{root.unmount();});root=undefined;
  assert.equal(xmindSheets()[1].rootTopic.title,'Draft across tabs');
  function Host(){const content=store(s=>s.tabs[0].content);return React.createElement(app.XmindView,{dataUrl:content,filePath:'/test/sample.xmind',tabId:'xm'});}
  await render(React.createElement(Host));
  assert.equal(document.querySelector('[role=tab][aria-selected=true]').textContent,'组织结构');
  assert.ok(document.querySelector('[data-topic="org-root"]'));
  await click('Undo');assert.equal(xmindSheets()[1].rootTopic.title,'项目组');
});
test(5,'XMind standard save preserves camera and rendered content',async()=>{
  await mountXmind();const svg=document.querySelector('.xm-svg');
  const zoom=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Zoom in');
  await act(async()=>zoom.click());const box=svg.getAttribute('viewBox');
  await act(async()=>app.saveFile());
  assert.equal(document.querySelector('.xm-svg'),svg);assert.equal(svg.getAttribute('viewBox'),box);
});

test(4, "format errors use the themed dialog and preserve the original buffer", async () => {
  const content = "this is invalid json {";
  reset([tab("json", content, "/test/invalid.json", content)]);
  await render(React.createElement(React.Fragment, null,
    React.createElement(app.JsonToolbar),
    React.createElement(app.EditorHost, { activeId: "json", theme: "light", fontSize: 14 }),
    React.createElement(app.ConfirmDialog)));
  const format = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Format"));
  assert.ok(format);
  format.focus();
  await act(async () => { format.click(); await flush(); });
  const dialog = document.querySelector('[role="dialog"][aria-label="Operation failed"]');
  assert.ok(dialog);
  assert.ok(dialog.querySelector('[data-tone="error"]'));
  assert.ok(dialog.contains(document.activeElement));
  assert.equal(store.getState().tabs[0].content, content);
  await click("Close");
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(document.activeElement, format);
});

test(4, "queued error dialogs reset their appearance before a normal confirmation", async () => {
  reset();
  await render(React.createElement(app.ConfirmDialog));
  let first, second, next;
  await act(async () => {
    first = app.showError("第一条错误 " + "details ".repeat(300));
    second = app.showError("Second failure");
    next = app.chooseAction({ title: "Continue", message: "Normal confirmation", buttons: [{ label: "Done", value: "done", primary: true }] });
    await flush();
  });
  assert.match(document.querySelector('[data-tone="error"]').textContent, /第一条错误/);
  await click("Close"); await first;
  assert.match(document.querySelector('[data-tone="error"]').textContent, /Second failure/);
  await act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await second;
  await act(async () => flush());
  assert.equal(document.querySelector('[data-tone="error"]'), null);
  assert.match(document.querySelector('[role="dialog"]').textContent, /Normal confirmation/);
  await click("Done"); assert.equal(await next, "done");
});

test(6, 'XMind paste is atomic and one undo removes the whole pasted group', async () => {
  await mountXmind();
  const original = store.getState().tabs[0].content;
  const canvas = document.querySelector('.xm-canvas');
  const paste = data => {
    const event = new window.Event('paste', {bubbles:true,cancelable:true});
    Object.defineProperty(event, 'clipboardData', {value:{getData:type=>type==='application/x-deditor-topics'?data:''}});
    canvas.dispatchEvent(event);
  };
  await act(async()=>paste(JSON.stringify([{id:'paste1',title:'First'}, {id:'paste2',title:'Second'}])));
  assert.equal(xmindSheets()[0].rootTopic.children.attached.length, 6);
  await click('Undo');
  assert.equal(store.getState().tabs[0].content, original);
  await act(async()=>paste(JSON.stringify([{id:'valid',title:'Valid'}, {id:'invalid'}])));
  assert.equal(store.getState().tabs[0].content, original, 'invalid clipboard must not partially apply');
});

test(6, 'XMind copying parent and child includes that child only once', async () => {
  await mountXmind();
  const canvas = document.querySelector('.xm-canvas');
  await act(async()=>canvas.dispatchEvent(new window.KeyboardEvent('keydown',{key:'a',metaKey:true,bubbles:true})));
  const copied = {};
  const event = new window.Event('copy', {bubbles:true,cancelable:true});
  Object.defineProperty(event,'clipboardData',{value:{setData:(type,value)=>{copied[type]=value;}}});
  await act(async()=>canvas.dispatchEvent(event));
  const topics = JSON.parse(copied['application/x-deditor-topics']);
  assert.equal(topics.length,1);
  assert.equal(topics[0].id,'root');
});

test(6, 'XMind dragged node lets the underlying drop target receive hit testing', async () => {
  await mountXmind();
  const svg = document.querySelector('.xm-svg');
  const moved = document.querySelector('[data-topic="local"]');
  const target = document.querySelector('[data-topic="read"]');
  svg.setPointerCapture = () => {};
  const previous = document.elementFromPoint;
  try {
    await act(async()=>moved.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100})));
    await act(async()=>svg.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,button:0,clientX:100,clientY:100})));
    await act(async()=>moved.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100})));
    await act(async()=>svg.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:160,clientY:150})));
    assert.equal(moved.getAttribute('pointer-events'),'none');
    const [tx,ty]=target.getAttribute('transform').match(/-?[\d.]+/g).map(Number);
    const shape=target.querySelector('rect');
    const [vx,vy,vw,vh]=svg.getAttribute('viewBox').split(' ').map(Number),zoom=800/vw;
    const clientX=(tx+Number(shape.getAttribute('width'))/2-vx-vw/2)*zoom;
    const clientY=(ty+Number(shape.getAttribute('height'))/2-vy-vh/2)*zoom;
    await act(async()=>svg.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,clientX,clientY})));
    const sheets=xmindSheets();
    const read=sheets[0].rootTopic.children.attached.find(n=>n.id==='read');
    assert.ok(read.children.attached.some(n=>n.id==='local'));
    assert.equal(document.querySelector('[data-topic="local"]').getAttribute('data-detached'),null);
    await click('Undo');
    assert.ok(xmindSheets()[0].rootTopic.children.attached.some(n=>n.id==='local'));
  } finally {document.elementFromPoint=previous;}
});

test(6, 'XMind camera benchmark preserves all 1001 topics during zoom', async () => {
  const sheets=[{id:'perf',title:'Performance',rootTopic:{id:'root',title:'Root',children:{attached:Array.from({length:1000},(_,i)=>({id:'n'+i,title:'Topic '+i}))}}}];
  await mountXmind(true,zipSync({'content.json':strToU8(JSON.stringify(sheets))}));
  await act(async()=>root.unmount());root=undefined;
  const durations=[];
  await render(React.createElement(React.Profiler,{id:'xmind',onRender:(_id,phase,duration)=>{if(phase==='update')durations.push(duration);}},
    React.createElement(app.XmindView,{dataUrl:store.getState().tabs[0].content,tabId:'xm',filePath:'/test/perf.xmind'})));
  const zoom=document.querySelector('button[aria-label="Zoom in"]');
  durations.length=0;
  for(let i=0;i<8;i++)await act(async()=>zoom.click());
  assert.equal(document.querySelectorAll('[data-topic]').length,1001);
  console.log('XMIND_CAMERA_PROFILE',JSON.stringify({samples:durations,median_ms:[...durations].sort((a,b)=>a-b)[Math.floor(durations.length/2)]}));
});

test(6, "External file monitoring retries failed reads and ignores overlapping or stale reads", async () => {
  reset([tab('watch','original','/test/watch.md','original')]);
  let poll, mtime=1, reads=0, fail=true, pending=null;
  const realInterval=globalThis.setInterval;
  globalThis.setInterval=(callback,ms,...args)=>{
    if(ms===3000){poll=callback;return -1;}
    return realInterval(callback,ms,...args);
  };
  globalThis.__invoke=async(cmd)=>{
    if(cmd==='file_mtimes')return [mtime];
    if(cmd==='read_text_file'){
      reads++;
      if(fail)throw new Error('temporarily unavailable');
      return pending?pending.promise:'external';
    }
  };
  function Watch(){app.useFileWatch();return null;}
  try {
    await render(React.createElement(Watch));
    mtime=2;
    await act(async()=>{poll();await flush();});
    assert.equal(reads,1);
    assert.equal(store.getState().tabs[0].content,'original');
    fail=false;
    await act(async()=>{poll();await flush();});
    assert.equal(reads,2,'retry even when mtime is unchanged');
    assert.equal(store.getState().tabs[0].content,'external');
    mtime=3;pending=deferred();
    await act(async()=>{poll();await flush();poll();await flush();});
    assert.equal(reads,3,'only one read can be in flight');
    store.setState({tabs:[tab('watch','locally saved','/test/watch.md','locally saved')]});
    await act(async()=>{pending.resolve('older disk content');await flush();});
    assert.equal(store.getState().tabs[0].content,'locally saved');
    assert.equal(store.getState().tabs[0].externalChange,undefined);
  } finally {globalThis.setInterval=realInterval;}
});

test(6, "Markdown extra tools keep selections, produce previewable syntax and undo cleanly", async () => {
  reset();
  for(const [label,tag] of [['Underline','u'],['Superscript','sup'],['Subscript','sub']]) {
    await withToolbarEditor('sample',async view=>{
      await render(React.createElement(app.MarkdownToolbar));
      const tool=document.querySelector(`button[aria-label="${label}"]`);
      await act(async()=>tool.click());
      assert.equal(new MarkdownIt({html:true}).renderInline(view.state.doc.toString()),`<${tag}>sample</${tag}>`);
      await act(async()=>tool.click());assert.equal(view.state.doc.toString(),'sample');
      await act(async()=>root.unmount());root=undefined;
    });
  }
  for(const [label,kind] of [['Collapsible details','details']]) {
    await withToolbarEditor('beforeafter',async view=>{
      await render(React.createElement(app.MarkdownToolbar));
      await act(async()=>document.querySelector(`button[aria-label="${label}"]`).click());
      const markdown=view.state.doc.toString();
      const parser=new MarkdownIt({html:true});
      if(kind==='details')assert.match(parser.render(markdown),/<details>\n<summary>Show details<\/summary>\n<p>Write details here.<\/p>/);
      else {
        const fence=parser.parse(markdown,{}).find(t=>t.type==='fence');
        assert.equal(fence.info,kind==='plantuml'?'plantuml':'mermaid');
        if(kind!=='plantuml')assert.ok(fence.content.startsWith(kind));
      }
      assert.ok(markdown.startsWith('before\n\n'));
      assert.ok(markdown.endsWith('\n\nafter'));
      await act(async()=>undo(view));assert.equal(view.state.doc.toString(),'beforeafter');
      await act(async()=>root.unmount());root=undefined;
    },{anchor:6});
  }
});

test(7, "Immediate tooltips handle SVG, keyboard, clicks and disappearing controls without stealing focus", async () => {
  reset();
  let clicks=0;
  await render(React.createElement(React.Fragment,null,
    React.createElement(app.Tooltip),
    React.createElement(app.Button,{title:'First tool',size:'icon','aria-describedby':'existing',onClick:()=>clicks++},React.createElement('span',null,'A')),
    React.createElement(app.Button,{title:'Disabled tool',size:'icon',disabled:true},'B'),
    React.createElement('svg',null,React.createElement(app.XmindIndicator,{icon:{kind:'notes'},x:0,y:0,label:'Has notes',color:'#555'}))));
  const first=document.querySelector('[data-tooltip="First tool"]');
  const disabled=document.querySelector('[data-tooltip="Disabled tool"]');
  const icon=document.querySelector('svg[data-tooltip="Has notes"]');
  for(const el of [first,disabled,icon]) {
    el.getClientRects=()=>[{left:0,top:0,width:16,height:16}];
    el.getBoundingClientRect=()=>({left:0,top:0,width:16,height:16,bottom:16,right:16});
  }
  const over=el=>el.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));
  await act(async()=>over(first.firstChild));
  assert.equal(document.querySelector('[role="tooltip"]').textContent,'First tool');
  assert.equal(first.getAttribute('title'),'','no delayed or inherited native tooltip');
  assert.ok(first.getAttribute('aria-describedby').startsWith('existing '));
  await act(async()=>over(disabled));
  assert.equal(document.querySelector('[role="tooltip"]').textContent,'Disabled tool');
  assert.equal(first.getAttribute('aria-describedby'),'existing');
  await act(async()=>over(icon.firstChild));
  assert.equal(document.querySelectorAll('[role="tooltip"]').length,1);
  assert.equal(document.querySelector('[role="tooltip"]').textContent,'Has notes');
  assert.equal(icon.querySelector('title'),null);
  await act(async()=>{icon.dispatchEvent(new window.MouseEvent('pointerout',{bubbles:true,relatedTarget:first}));});
  assert.equal(document.querySelector('[role="tooltip"]'),null);
  await act(async()=>first.focus());
  assert.equal(document.querySelector('[role="tooltip"]').textContent,'First tool');
  assert.equal(document.activeElement,first);
  await act(async()=>first.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('[role="tooltip"]'),null);
  assert.equal(document.activeElement,first);
  await act(async()=>{over(first);});
  await act(async()=>{first.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));first.click();});
  assert.equal(clicks,1);assert.equal(document.querySelector('[role="tooltip"]'),null);
  await act(async()=>over(icon));
  await act(async()=>{icon.setAttribute('hidden','');await flush();});
  assert.equal(document.querySelector('[role="tooltip"]'),null);
});

test(8, "Diagram family menus insert all 22 templates at the captured selection as a single undo step", async () => {
  reset();
  for(const family of ['mermaid','plantuml']) {
    const templates=app.DIAGRAM_TEMPLATES[family];
    for(let index=0;index<templates.length;index++) {
      await withToolbarEditor('before selected after',async view=>{
        await render(React.createElement(app.MarkdownToolbar));
        const trigger=document.querySelector(`button[aria-label="${family==='mermaid'?'Mermaid':'PlantUML'}"]`);
        await act(async()=>trigger.click());
        const menu=document.querySelector('[role="menu"]');
        assert.ok(menu);assert.equal(trigger.getAttribute('aria-expanded'),'true');
        assert.equal(view.state.doc.toString(),'before selected after','opening does not change text');
        assert.equal(menu.querySelectorAll('[role="menuitem"]').length,11);
        await act(async()=>menu.querySelectorAll('[role="menuitem"]')[index].click());
        const markdown=view.state.doc.toString();
        const fence=new MarkdownIt().parse(markdown,{}).find(token=>token.type==='fence');
        assert.equal(fence.info,family);
        assert.equal(fence.content,templates[index].source+'\n');
        assert.ok(markdown.startsWith('before \n\n'));
        assert.ok(markdown.endsWith('\n\n after'));
        assert.equal(view.state.sliceDoc(view.state.selection.main.from,view.state.selection.main.to),templates[index].selection);
        assert.equal(document.querySelector('[role="menu"]'),null);
        assert.ok(view.hasFocus);
        await act(async()=>undo(view));assert.equal(view.state.doc.toString(),'before selected after');
        await act(async()=>root.unmount());root=undefined;
      },{anchor:7,head:15});
    }
  }
});

test(8, "Diagram menus switch families, restore keyboard focus and reject stale document targets", async () => {
  reset();
  await withToolbarEditor('original',async view=>{
    await render(React.createElement(app.MarkdownToolbar));
    const mermaid=document.querySelector('button[aria-label="Mermaid"]');
    const plantuml=document.querySelector('button[aria-label="PlantUML"]');
    await act(async()=>mermaid.click());
    assert.ok(document.activeElement.matches('[role="menuitem"]'));
    await act(async()=>{plantuml.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));plantuml.click();});
    assert.equal(document.querySelectorAll('[role="menu"]').length,1);
    assert.equal(document.querySelector('[role="menu"]').getAttribute('aria-label'),'PlantUML');
    await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('[role="menu"]'),null);assert.equal(document.activeElement,plantuml);
    assert.equal(view.state.doc.toString(),'original');
    await act(async()=>mermaid.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
    await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'End',bubbles:true})));
    assert.equal(document.activeElement.textContent,'Git branches');
    await act(async()=>document.body.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true})));
    assert.equal(document.querySelector('[role="menu"]'),null);
    await act(async()=>mermaid.click());
    await act(async()=>view.dispatch({changes:{from:0,insert:'changed '}}));
    await act(async()=>document.querySelector('[role="menuitem"]').click());
    assert.equal(view.state.doc.toString(),'changed original');
    assert.match(document.querySelector('[role="alert"]').textContent,/document changed/i);
    await act(async()=>store.setState({previewMaximized:true,showPreview:true}));
    assert.equal(document.querySelector('[role="menu"]'),null);assert.equal(mermaid.disabled,true);
    await act(async()=>store.setState({previewMaximized:false}));
    await act(async()=>mermaid.click());
    await act(async()=>store.setState({activeId:'another'}));
    assert.equal(document.querySelector('[role="menu"]'),null);
    assert.equal(view.state.doc.toString(),'changed original');
  });
});

test(8, "All Mermaid templates parse with the bundled Mermaid version", async () => {
  const {default:mermaid}=await import('mermaid');
  mermaid.initialize({startOnLoad:false,securityLevel:'loose'});
  for(const template of app.DIAGRAM_TEMPLATES.mermaid) {
    assert.ok(await mermaid.parse(template.source),template.id);
  }
});

test(9, "workspace path errors dismiss, expire, reset on retry and preserve the path for correction", async () => {
  reset(); store.setState({ workspaces: [], language: "zh" });
  let failure = "No such file or directory (os error 2)";
  globalThis.__invoke = async (cmd, args) => {
    if (cmd === "resolve_path") { if (failure) throw failure; return args.path; }
    if (cmd === "list_dir") return [];
  };
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  const timers = new Map(); let tick = 0;
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 5000) return realSet(callback, delay, ...args);
    const id = {tick: ++tick}; timers.set(id, callback); return id;
  };
  globalThis.clearTimeout = id => { if (!timers.delete(id)) realClear(id); };
  try {
    await render(React.createElement(app.FileTree));
    const input = document.querySelector('.filetree input');
    const edit = value => act(async () => { setInput(input, value); });
    const enter = () => act(async () => { input.dispatchEvent(new window.KeyboardEvent('keydown', {key:'Enter', bubbles:true})); await flush(); });
    const error = () => document.querySelector('.filetree-path-error');
    await edit('/missing'); await enter();
    assert.match(error().textContent, /路径不存在/);
    assert.doesNotMatch(error().textContent, /os error|No such file/);
    assert.equal(input.value, '/missing');
    assert.equal(input.getAttribute('aria-invalid'), 'true');
    assert.equal(timers.size, 1);
    await act(async () => error().querySelector('button').click());
    assert.equal(error(), null); assert.equal(timers.size, 0);
    assert.equal(document.activeElement, input);
    await enter(); const firstTimer = [...timers.keys()][0];
    await enter();
    assert.equal(timers.size, 1); assert.equal(timers.has(firstTimer), false, 'retry gives the new error its full display time');
    await act(async () => { const callback=[...timers.values()][0];timers.clear();callback(); });
    assert.equal(error(), null); assert.equal(input.value, '/missing');
    await enter(); await edit('/corrected');
    assert.equal(error(), null); assert.equal(timers.size, 0);
    await enter();
    await act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(error(), null);
    await enter();
    await act(async () => document.querySelector('button[data-tooltip="选择文件夹（可多选）"]').click());
    assert.equal(error(), null, 'opening folder picker clears the stale path error, even if canceled');
    failure = '';
    await enter();
    assert.equal(error(), null); assert.equal(input.value, '');
    assert.deepEqual(store.getState().workspaces, ['/corrected']);
    failure = 'Permission denied (os error 13)';
    await edit('/denied');await enter();
    assert.match(error().textContent, /访问权限/);
    await act(async () => {root.unmount();}); root=undefined;
    assert.equal(timers.size, 0, 'unmount cancels the pending dismissal');
  } finally { globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear; }
});

test(1, 'XMind fold persists across sheets and save, with undo/redo', async () => {
  await mountXmind();
  const before = store.getState().tabs[0].content;
  await act(async () => document.querySelector('[data-topic="read"] [data-fold]').dispatchEvent(new window.MouseEvent('click', {bubbles:true})));
  assert.equal(document.querySelector('[data-topic="colors"]'), null);
  assert.equal(document.querySelector('[data-topic="read"] [data-fold] text').textContent, '3');
  assert.equal(xmindSheets()[0].rootTopic.children.attached[0].branch, 'folded');
  await click('组织结构'); await click('产品设计');
  assert.equal(document.querySelector('[data-topic="colors"]'), null);
  await click('Undo');
  assert.ok(document.querySelector('[data-topic="colors"]'));
  assert.equal(store.getState().tabs[0].content, before);
  await click('Redo');
  await act(async()=>app.saveFile());
  const doc = app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64')));
  assert.equal(doc.sheets[0].rootTopic.children.attached[0].branch,'folded');
});

test(2, 'XMind fold controls follow left/up/down layout and labels remain separate', async () => {
  for (const direction of ['left','up','down']) {
    const structure = direction === 'left' ? 'logic.left' : 'org-chart.'+direction;
    const sheets = [{id:'test-sheet',title:'Test',rootTopic:{id:'root',title:'Root',structureClass:'org.xmind.ui.'+structure,
      children:{attached:[{id:'branch',title:'分支', labels:['visual-QA', '跨平台'],children:{attached:[{id:'leaf',title:'Leaf'}]}}]}}}];
    await mountXmind(true, zipSync({'content.json':strToU8(JSON.stringify(sheets))}));
    const node=document.querySelector('[data-topic="branch"]');
    const [x,y] = node.querySelector('[data-fold]').getAttribute('transform').match(/-?[\d.]+/g).map(Number);
    const shape=node.querySelector('rect');
    if(direction==='left') assert.ok(x<0);
    if(direction==='up') assert.ok(y<0);
    if(direction==='down') assert.ok(y>Number(shape.getAttribute('height')));
    assert.equal(node.querySelectorAll('[data-label]').length,2);
    assert.equal(node.querySelector('[data-label="0"] text').textContent,'visual-QA');
    assert.equal(node.querySelector('[data-label="1"] text').textContent,'跨平台');
  }
});

test(3, 'XMind searches and outline reveal folded descendants without writing', async () => {
  const sheets=[{id:'test-sheet',title:'Test',rootTopic:{id:'root',title:'Root',children:{attached:[
    {id:'branch',title:'Branch',branch:'folded',children:{attached:[{id:'leaf',title:'Hidden needle'}]}}
  ]}}}];
  await mountXmind(true,zipSync({'content.json':strToU8(JSON.stringify(sheets))}));
  const before=store.getState().tabs[0].content;
  assert.equal(document.querySelector('[data-topic="leaf"]'),null);
  await act(async()=>setInput(document.querySelector('input[aria-label="Find topics"]'),'needle'));
  assert.ok(document.querySelector('[data-topic="leaf"][aria-selected="true"]'));
  assert.equal(store.getState().tabs[0].content,before);
  assert.match(document.querySelector('.xm-search-count').textContent,/1/);
  await act(async()=>setInput(document.querySelector('input[aria-label="Find topics"]'),'missing'));
  assert.match(document.querySelector('.xm-search-count').textContent,/0/);
  assert.equal(document.querySelector('.xm-search-count button').disabled,true);
  // Explicitly collapse the search-revealed branch, then select via outline.
  await act(async()=>document.querySelector('[data-topic="branch"] [data-fold]').dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.equal(document.querySelector('[data-topic="leaf"]'),null);
  await click('Outline'); await click('Hidden needle');
  assert.ok(document.querySelector('[data-topic="leaf"][aria-selected="true"]'));
});

test(2, 'XMind multiline draft expands without writing and Escape cancels', async () => {
  await mountXmind();
  const before=store.getState().tabs[0].content;
  const node=document.querySelector('[data-topic="read"]');
  await act(async()=>node.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  const editor=document.querySelector('textarea[aria-label="Edit topic text"]');
  const height=Number(editor.parentElement.getAttribute('height'));
  await act(async()=>setInput(editor,'很长的主题文字'.repeat(12)+'\n第二行\n第三行'));
  assert.ok(Number(editor.parentElement.getAttribute('height'))>height);
  assert.equal(store.getState().tabs[0].content,before);
  await act(async()=>editor.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(store.getState().tabs[0].content,before);
  assert.equal(document.querySelector('foreignObject'),null);
});

test(3, 'XMind context keyboard Escape closes from focused menu and drag Escape cancels', async () => {
  await mountXmind();
  const node=document.querySelector('[data-topic="read"]');
  await act(async()=>node.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,clientX:40,clientY:50})));
  assert.ok(document.activeElement.closest('.xm-context'));
  await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})));
  assert.match(document.activeElement.textContent,/Sibling/);
  await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('.xm-context'),null);
  assert.equal(document.activeElement,document.querySelector('.xm-canvas'));
  const before=store.getState().tabs[0].content;
  const svg=document.querySelector('.xm-svg');svg.setPointerCapture=()=>{};
  await act(async()=>node.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100})));
  await act(async()=>svg.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:150,clientY:150})));
  await act(async()=>document.querySelector('.xm-canvas').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>svg.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:150})));
  assert.equal(store.getState().tabs[0].content,before);
});

test(1, 'XMind relationship selection, draft save and delete preserve topics and undo', async () => {
  await mountXmind();
  const nodeCount=document.querySelectorAll('[data-topic]').length;
  const relation=document.querySelector('[data-relationship="rel"]');
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  assert.equal(document.querySelectorAll('[data-control]').length,2);
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  const input=document.querySelector('input[aria-label="Edit relationship text"]');assert.ok(input);
  await act(async()=>setInput(input,'联系保存核对'));
  await act(async()=>app.saveFile());
  assert.equal(app.openXmindDocument(new Uint8Array(Buffer.from(writes.at(-1).data,'base64'))).sheets[0].relationships[0].title,'联系保存核对');
  await act(async()=>document.querySelector('.xm-canvas').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Delete',bubbles:true})));
  assert.equal(document.querySelector('[data-relationship="rel"]'),null);
  assert.equal(document.querySelectorAll('[data-topic]').length,nodeCount);
  await click('Undo');assert.ok(document.querySelector('[data-relationship="rel"]'));
});
test(2, 'XMind relationship Escape cancels title and control-point drags', async () => {
  await mountXmind();
  const before=store.getState().tabs[0].content;
  const relation=document.querySelector('[data-relationship="rel"]');
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  const input=document.querySelector('input[aria-label="Edit relationship text"]');
  await act(async()=>setInput(input,'Cancelled'));
  await act(async()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(store.getState().tabs[0].content,before);
  const handle=document.querySelector('[data-control="0"]');handle.setPointerCapture=()=>{};
  const path=()=>document.querySelector('[data-relationship-path]').getAttribute('d');
  const original=path();
  await act(async()=>handle.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  await act(async()=>handle.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:200,clientY:50})));
  assert.notEqual(path(),original);
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>handle.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,clientX:200,clientY:50})));
  assert.equal(store.getState().tabs[0].content,before);assert.equal(path(),original);
});
test(3, 'XMind control-point drag is a single edit and notes icon selects the owner and opens its field', async () => {
  await mountXmind();
  const original=store.getState().tabs[0].content;
  const relation=document.querySelector('[data-relationship="rel"]');
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  const handle=document.querySelector('[data-control="1"]');handle.setPointerCapture=()=>{};
  await act(async()=>handle.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  await act(async()=>handle.dispatchEvent(new window.MouseEvent('pointermove',{bubbles:true,clientX:230,clientY:80})));
  assert.equal(store.getState().tabs[0].content,original,'preview does not write per pointer movement');
  await act(async()=>handle.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,clientX:230,clientY:80})));
  assert.deepEqual(xmindSheets()[0].relationships[0].controlPoints['0'],{x:8,y:9});
  assert.ok(xmindSheets()[0].relationships[0].controlPoints['1']);
  await click('Undo');assert.equal(store.getState().tabs[0].content,original);
  await click('Format');
  const note=document.querySelector('[data-topic="edit"] [data-note-button]');
  await act(async()=>note.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.ok(document.querySelector('[data-topic="edit"][aria-selected="true"]'));
  assert.equal(document.activeElement.getAttribute('data-field'),'notes');
  assert.match(document.activeElement.value,/Tab/);
  assert.equal(store.getState().tabs[0].content,original);
});

test(2, 'XMind relationship text clipboard stays inside input and Enter restores canvas focus', async () => {
  await mountXmind();
  const original=store.getState().tabs[0].content;
  const relation=document.querySelector('[data-relationship="rel"]');
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  await act(async()=>relation.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true})));
  const input=document.querySelector('input[aria-label="Edit relationship text"]');
  const paste=new window.Event('paste',{bubbles:true,cancelable:true});
  Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'Pasted relation'}});
  await act(async()=>input.dispatchEvent(paste));
  assert.equal(paste.defaultPrevented,false);
  assert.equal(store.getState().tabs[0].content,original);
  await act(async()=>setInput(input,'Pasted relation'));
  await act(async()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  assert.equal(document.activeElement,document.querySelector('.xm-canvas'));
  assert.equal(xmindSheets()[0].relationships[0].title,'Pasted relation');
  await click('Undo');assert.equal(store.getState().tabs[0].content,original);
});

test(4, 'one editor tab can switch XMind, text and binary hydration without changing hook order', async () => {
  reset();
  window.HTMLCanvasElement.prototype.getContext = () => ({font:'',measureText:text=>({width:Array.from(text).length*9})});
  const url=xmindUrl(app.sampleArchive());
  const props={value:url,filePath:'/test/probe.xmind',theme:'light',fontSize:14,tabId:'a',active:true,onChange:()=>{}};
  await render(React.createElement(app.Editor,props));
  assert.ok(document.querySelector('.xm-canvas'));
  await act(async()=>root.render(React.createElement(app.Editor,{...props,filePath:'/test/probe.txt',value:'Text after Save As'})));
  assert.ok(document.querySelector('.cm-editor'));
  await act(async()=>root.render(React.createElement(app.Editor,props)));
  assert.ok(document.querySelector('.xm-canvas'));
  await act(async()=>root.render(React.createElement(app.Editor,{...props,filePath:'/test/probe.png',value:''})));
  await act(async()=>root.render(React.createElement(app.Editor,{...props,filePath:'/test/probe.png',value:'data:image/png;base64,AA=='})));
  assert.ok(document.querySelector('img'));
});

function interactionArchive() {
  return zipSync({'content.json':strToU8(JSON.stringify([{id:'r3',title:'Round 3',rootTopic:{id:'r3root',title:'Root',structureClass:'org.xmind.ui.logic.right',children:{attached:[{id:'r3a',title:'A',children:{attached:[{id:'r3a1',title:'A1'},{id:'r3a2',title:'A2'}]}},{id:'r3b',title:'B'},{id:'r3c',title:'C'}]}}}]))});
}
async function selectR3(id,multi=false) {
  const node=document.querySelector(`[data-topic="${id}"]`);
  await act(async()=>node.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0,shiftKey:multi})));
  await act(async()=>node.dispatchEvent(new window.MouseEvent('pointerup',{bubbles:true,button:0,shiftKey:multi})));
}
async function keyR3(key,extra={}) {
  await act(async()=>document.querySelector('.xm-canvas').dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra})));
}
test(1,'XMind transparent topics have a full hit area and multi-selection formatting is one undo',async()=>{
  await mountXmind(true,interactionArchive());
  const hit=document.querySelector('[data-topic="r3a1"] > [data-topic-hitbox]');
  assert.ok(hit);assert.equal(hit.getAttribute('fill'),'transparent');
  await selectR3('r3a1');await selectR3('r3a2',true);
  const original=store.getState().tabs[0].content;
  await click('No fill');
  assert.deepEqual(xmindSheets()[0].rootTopic.children.attached[0].children.attached.map(n=>n.style.properties['svg:fill']),['#EEEEEE','#EEEEEE']);
  await click('Undo');assert.equal(store.getState().tabs[0].content,original);
  await click('Bold');
  const leaves=xmindSheets()[0].rootTopic.children.attached[0].children.attached;
  assert.deepEqual(leaves.map(n=>n.style.properties['fo:font-weight']),['bold','bold']);
  await click('Undo');assert.equal(store.getState().tabs[0].content,original);
});
test(3,'XMind native topic shortcuts edit text, reorder, add a parent and reveal the root',async()=>{
  await mountXmind(true,interactionArchive());await selectR3('r3b');
  const before=store.getState().tabs[0].content;
  await keyR3(' ');assert.ok(document.querySelector('textarea[aria-label="Edit topic text"]'));
  await keyR3('Escape');assert.equal(store.getState().tabs[0].content,before);
  await keyR3('ArrowUp',{altKey:true});assert.deepEqual(xmindSheets()[0].rootTopic.children.attached.map(n=>n.id),['r3b','r3a','r3c']);
  await click('Undo');await selectR3('r3a1');await keyR3('Enter',{metaKey:true});
  const inserted=xmindSheets()[0].rootTopic.children.attached[0].children.attached[0];
  assert.notEqual(inserted.id,'r3a1');assert.equal(inserted.children.attached[0].id,'r3a1');
  await click('Undo');assert.equal(store.getState().tabs[0].content,before);
  assert.equal(document.querySelector('[data-topic][aria-selected="true"]').getAttribute('data-topic'),'r3a1');
  await keyR3('r',{metaKey:true});assert.equal(document.querySelector('[data-topic][aria-selected="true"]').getAttribute('data-topic'),'r3root');
});
test(3,'XMind link edits flush to save, internal links reveal folded targets, invalid links remain recoverable',async()=>{
  await mountXmind(true,interactionArchive());await selectR3('r3a');await keyR3('/',{metaKey:true});await selectR3('r3b');
  const link=document.querySelector('input[aria-label="Link"]');
  await act(async()=>{link.focus();setInput(link,'#r3a1');});await act(async()=>app.saveFile());
  assert.equal(xmindSheets()[0].rootTopic.children.attached[1].href,'#r3a1');
  const saved=store.getState().tabs[0].content;
  await act(async()=>document.querySelector('[data-link-button]').dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.equal(document.querySelector('[data-topic][aria-selected="true"]').getAttribute('data-topic'),'r3a1');
  assert.equal(store.getState().tabs[0].content,saved);
  await selectR3('r3b');const input=document.querySelector('input[aria-label="Link"]');
  await act(async()=>{input.focus();setInput(input,'javascript:alert(1)');input.blur();});
  await act(async()=>document.querySelector('[data-link-button]').dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.match(document.querySelector('[role="alert"]').textContent,/not supported/);
  await click('Undo');assert.equal(xmindSheets()[0].rootTopic.children.attached[1].href,'#r3a1');
});
test(3,'XMind boundary and summary editing save their titles and deleting a group preserves members',async()=>{
  for(const kind of ['Boundary','Summary']) {
    await mountXmind(true,interactionArchive());await selectR3('r3a1');await selectR3('r3a2',true);await click(kind);
    const group=document.querySelector('[data-group]');
    await act(async()=>group.dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
    const input=document.querySelector('input[aria-label="Topic text"]');assert.ok(input);
    await act(async()=>{input.focus();setInput(input,`${kind} 保存核对`);});await act(async()=>app.saveFile());
    const owner=xmindSheets()[0].rootTopic.children.attached[0];
    assert.equal(owner[kind==='Boundary'?'boundaries':'summaries'][0].title,`${kind} 保存核对`);
    if(kind==='Boundary') {
      const badge=document.querySelector('[data-group-title]');assert.ok(badge);
      assert.equal(badge.querySelector('rect').getAttribute('fill'),'#00897B');
      assert.equal(badge.querySelector('text').getAttribute('fill'),'#FFFFFF');
      assert.equal(badge.querySelector('text').getAttribute('font-size'),'14');
    }
    if(kind==='Summary')assert.equal(owner.children.summary[0].title,'Summary 保存核对');
    const saved=store.getState().tabs[0].content;
    await keyR3('Delete');assert.equal(document.querySelectorAll('[data-group]').length,0);
    assert.deepEqual(xmindSheets()[0].rootTopic.children.attached[0].children.attached.map(n=>n.id),['r3a1','r3a2']);
    if(kind==='Summary')assert.equal(xmindSheets()[0].rootTopic.children.attached[0].children.summary.length,0);
    await click('Undo');assert.equal(store.getState().tabs[0].content,saved);
  }
});

test(3,'XMind undoing a new sheet restores a usable active sheet and edit target',async()=>{
  await mountXmind(true,interactionArchive());
  await act(async()=>document.querySelector('button[aria-label="New sheet"]').click());
  assert.equal(xmindSheets().length,2);
  await click('Undo');assert.equal(xmindSheets().length,1);
  await click('Subtopic');assert.equal(xmindSheets()[0].rootTopic.children.attached.length,4);
  assert.equal(document.querySelector('[role="alert"]'),null);
});
test(4,'XMind floating inspector matches the canvas and window undo works outside canvas',async()=>{
  await mountXmind(true,interactionArchive());await click('Floating topic');
  assert.equal(document.querySelector('input[type="number"]').value,'14');
  const added=store.getState().tabs[0].content;
  const key=async(target,extra={})=>{
    const event=new window.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true,...extra});
    await act(async()=>target.dispatchEvent(event));return event;
  };
  const field=document.querySelector('textarea[aria-label="Topic text"]');
  assert.equal((await key(field)).defaultPrevented,false);
  assert.equal(store.getState().tabs[0].content,added);
  await key(document.body);assert.equal(xmindSheets()[0].rootTopic.children.detached?.length??0,0);
  await key(document.body,{shiftKey:true});assert.equal(store.getState().tabs[0].content,added);
  await selectR3('r3a1');await click('Boundary');
  await act(async()=>document.querySelector('[data-group]').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0})));
  const grouped=store.getState().tabs[0].content;
  await click('Delete');assert.equal(document.querySelectorAll('[data-group]').length,0);
  await key(document.body);assert.equal(store.getState().tabs[0].content,grouped);
  await keyR3('z',{metaKey:true});assert.equal(document.querySelectorAll('[data-group]').length,0);
  assert.equal(xmindSheets()[0].rootTopic.children.detached.length,1,'canvas undo must not run twice');
});
test(4,'XMind outline includes summary and callout topics and can select them',async()=>{
  await mountXmind(true,interactionArchive());await selectR3('r3a1');await click('Summary');await click('Callout');await click('Outline');
  const owner=xmindSheets()[0].rootTopic.children.attached[0];
  const summary=owner.children.summary[0], callout=owner.children.attached[0].children.callout[0];
  const outline=document.querySelector('.xm-outline');
  for(const topic of [summary,callout]) {
    const button=[...outline.querySelectorAll('button')].find(b=>b.textContent===topic.title);assert.ok(button);
    await act(async()=>button.click());assert.ok(document.querySelector(`[data-topic="${topic.id}"][aria-selected="true"]`));
  }
});
test(5,'XMind horizontal timeline folding and undo keep milestones on the axis and save correctly',async()=>{
  const sheet={id:'tl',title:'Timeline',rootTopic:{id:'troot',title:'Timeline',structureClass:'org.xmind.ui.timeline.horizontal',children:{attached:[{id:'ta',title:'Design',children:{attached:[{id:'ta1',title:'First'},{id:'ta2',title:'Second'}]}},{id:'tb',title:'Build'}]}}};
  await mountXmind(true,zipSync({'content.json':strToU8(JSON.stringify([sheet]))}));
  assert.equal(document.querySelector('.xm-warning'),null);
  const node=()=>document.querySelector('[data-topic="ta"]');
  const before=node().getAttribute('transform');
  await act(async()=>node().querySelector('[data-fold]').dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.equal(document.querySelector('[data-topic="ta1"]'),null);
  assert.equal(node().getAttribute('transform'),before);
  await act(async()=>app.saveFile());
  assert.equal(xmindSheets()[0].rootTopic.children.attached[0].branch,'folded');
  await click('Undo');assert.ok(document.querySelector('[data-topic="ta1"]'));
  assert.equal(node().getAttribute('transform'),before);
  await act(async()=>app.saveFile());
  assert.equal(xmindSheets()[0].rootTopic.structureClass,'org.xmind.ui.timeline.horizontal');
});
test(5,'XMind right-headed fishbone exposes its structure and folds on the spine side',async()=>{
  const sheet={id:'fb',title:'Fishbone',rootTopic:{id:'froot',title:'Fishbone',structureClass:'org.xmind.ui.fishbone.rightHeaded',children:{attached:[{id:'fa',title:'Cause'}]}}};
  await mountXmind(true,zipSync({'content.json':strToU8(JSON.stringify([sheet]))}));
  const option=[...document.querySelectorAll('option')].find(o=>o.value==='org.xmind.ui.fishbone.rightHeaded');
  assert.equal(option.textContent,'Right-headed fishbone');
  assert.equal(option.parentElement.value,option.value);
  const fold=document.querySelector('[data-topic="froot"] [data-fold]');
  assert.match(fold.getAttribute('transform'),/^translate\(-/);
  await act(async()=>fold.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.equal(document.querySelector('[data-topic="fa"]'),null);
  await click('Undo');assert.ok(document.querySelector('[data-topic="fa"]'));
});
test(5,'Native open dialog includes XMind and routes the selected file through binary loading',async()=>{
  reset(); const bytes=app.sampleArchive();const requests=[];
  globalThis.__open=async(options)=>{assert.ok(options.filters.some(f=>f.extensions.includes('xmind')));return '/generated/open-test.xmind';};
  globalThis.__invoke=async(cmd,args)=>{requests.push(cmd);if(cmd==='read_binary_as_base64')return Buffer.from(bytes).toString('base64');};
  await act(async()=>app.openFile());
  const opened=store.getState().tabs.find(t=>t.filePath==='/generated/open-test.xmind');
  assert.ok(opened?.content.startsWith('data:application/vnd.xmind.workbook;base64,'));
  assert.ok(requests.includes('read_binary_as_base64'));assert.ok(!requests.includes('read_text_file'));
  const count=store.getState().tabs.length;globalThis.__open=async()=>null;
  await act(async()=>app.openFile());assert.equal(store.getState().tabs.length,count);
});
test(5,'Fishbone cause folding controls stay on diagonal ribs above and below the spine',async()=>{
  for(const orientation of ['leftHeaded','rightHeaded']) {
    const sheet={id:'fish-controls',title:'Fish',rootTopic:{id:'fr',title:'Fish',structureClass:'org.xmind.ui.fishbone.'+orientation,children:{attached:[0,1].map(i=>({id:'fc'+i,title:'Cause',children:{attached:[{id:'fl'+i,title:'Detail'}]}}))}}};
    await mountXmind(true,zipSync({'content.json':strToU8(JSON.stringify([sheet]))}));
    for(const i of [0,1]) {
      const node=document.querySelector(`[data-topic="fc${i}"]`),hit=node.querySelector('[data-topic-hitbox]'),fold=node.querySelector('[data-fold]');
      const [,x,y]=/^translate\(([^,]+),([^\)]+)\)$/.exec(fold.getAttribute('transform'));
      assert.ok(orientation==='rightHeaded'?+x>+hit.getAttribute('width')/2:+x<+hit.getAttribute('width')/2);
      assert.ok(i===0?+y>+hit.getAttribute('height'):+y<0);
      await act(async()=>fold.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
      assert.equal(document.querySelector(`[data-topic="fl${i}"]`),null);
      await click('Undo');assert.ok(document.querySelector(`[data-topic="fl${i}"]`));
    }
  }
});
let failed = 0,
  passed = 0;
const round = process.argv.find((a) => a.startsWith("--round="))?.split("=")[1];
try {
  for (const t of tests.filter((t) => !round || String(t.round) === round)) {
    try {
      await t.fn();
      assert.deepEqual(browserErrors.splice(0), [], "No browser exceptions");
      console.log(`PASS round ${t.round}: ${t.name}`);
      passed++;
    } catch (err) {
      failed++;
      console.error(`FAIL round ${t.round}: ${t.name}`, err);
    } finally {
      if (root) {
        await act(async () => {
          root.unmount();
          await pause(10);
        });
        root = undefined;
      }
      document.getElementById("root").innerHTML = "";
    }
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
  dom.window.close();
}
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
