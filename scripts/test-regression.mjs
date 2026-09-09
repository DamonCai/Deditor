import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
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
  "@tauri-apps/api/core":
    "export const invoke=(...args)=>globalThis.__invoke(...args); export const convertFileSrc=(p)=>p;",
  "@tauri-apps/plugin-dialog":
    "export const save=(...args)=>globalThis.__save(...args); export const open=async()=>null;",
  "@tauri-apps/plugin-opener":
    "export const revealItemInDir=async()=>{}; export const openUrl=async()=>{}; export const openPath=async()=>{};",
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
export {useEditorStore} from './src/store/editor';
export * from './src/lib/documentStats';
export * from './src/lib/editorBridge';
export * from './src/lib/editorStateCache';
export * from './src/lib/bookmarks';
export * from './src/lib/retainedTabs';
export {default as EditorHost} from './src/components/EditorHost';
export {default as PreviewHost} from './src/components/PreviewHost';
export {default as MarkdownToolbar} from './src/components/MarkdownToolbar';
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
    window.HTMLInputElement.prototype,
    "value",
  ).set.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}
const tests = [];
const test = (round, name, fn) => tests.push({ round, name, fn });

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
      document.querySelector('button[title="Toggle replace input"]').click(),
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
