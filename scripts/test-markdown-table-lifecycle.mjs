import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url: 'http://localhost', pretendToBeVisual: true });
for (const name of ['window', 'document', 'Node', 'HTMLElement', 'Element', 'SVGElement', 'MutationObserver', 'DOMParser', 'Text', 'CustomEvent', 'Event']) globalThis[name] = dom.window[name];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
for (const name of ['getComputedStyle', 'addEventListener', 'removeEventListener', 'dispatchEvent']) globalThis[name] = dom.window[name].bind(dom.window);
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
const frames = new Map();
let nextFrame = 0;
globalThis.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
const { Editor, rootCtx, defaultValueCtx, editorViewCtx } = await import('@milkdown/kit/core');
const { commonmark } = await import('@milkdown/kit/preset/commonmark');
const { gfm } = await import('@milkdown/kit/preset/gfm');
const { tableBlock } = await import('@milkdown/kit/component/table-block');
const output = path.resolve('node_modules/.cache/deditor-table-lifecycle.mjs');
await fs.mkdir(path.dirname(output), { recursive: true });
await build({ stdin: { contents: "export {stableTableView} from './src/lib/markdownVisual/tableView'; export {initialNodeViews} from './src/lib/markdownVisual/initialNodeViews';", resolveDir: process.cwd() }, outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external' });
const { stableTableView, initialNodeViews } = await import(pathToFileURL(output));
const makeSource = count => '# Tables\n\n' + Array.from({ length: count }, (_, i) => `| Name | Value |\n| --- | --- |\n| Row ${i} | 中文 |\n\nParagraph ${i}\n\n`).join('');
const source = makeSource(4);
const createEditor = (text, managed = true) => Editor.make().config(ctx => { ctx.set(rootCtx, document.getElementById('root')); ctx.set(defaultValueCtx, text); })
  .use(commonmark).use(gfm).use(tableBlock).use(initialNodeViews(originals => ({ ...originals, table: managed ? stableTableView(originals.table) : originals.table })));
const scheduler = globalThis.requestAnimationFrame;
try {
  if (process.argv.includes('--benchmark')) {
    assert.equal(typeof globalThis.gc, 'function', 'benchmark requires node --expose-gc');
    const results = [];
    for (const count of [4, 40, 100]) {
      for (const managed of [false, true]) {
        const runs = [];
        for (let round = 0; round < 3; round++) {
          globalThis.gc(); const beforeHeap = process.memoryUsage().heapUsed;
          const editor = createEditor(makeSource(count), managed), start = performance.now();
          await editor.create(); const created = performance.now();
          await editor.destroy(); const destroyed = performance.now();
          globalThis.gc();
          const retainedFrames = frames.size;
          assert.equal(retainedFrames, managed ? 0 : count);
          runs.push({ createMs: created - start, destroyMs: destroyed - created, retainedFrames, retainedHeapMiB: (process.memoryUsage().heapUsed - beforeHeap) / 1048576 });
          // Release the deliberately retained control callbacks between runs.
          frames.clear(); await new Promise(resolve => setImmediate(resolve));
        }
        const median = key => runs.map(r => r[key]).sort((a, b) => a - b)[1];
        results.push({ count, variant: managed ? 'managed lifecycle' : 'upstream control', createMs: median('createMs'), destroyMs: median('destroyMs'), retainedFrames: median('retainedFrames'), retainedHeapMiB: median('retainedHeapMiB') });
      }
    }
    console.log(JSON.stringify({ method: 'Real upstream tables; paused animation frames; three runs, explicit Node GC; not native WebView memory', results }, null, 2));
  } else {
    for (let round = 0; round < 4; round++) {
      let unrelatedRan = false;
      const unrelated = round === 2 ? requestAnimationFrame(() => { unrelatedRan = true; }) : null;
      const editor = createEditor(source);
      await editor.create();
      assert.equal(document.querySelectorAll('.milkdown-table-block').length, 4);
      assert.equal(globalThis.requestAnimationFrame, scheduler, 'table construction restores the global scheduler');
      assert.ok(frames.size >= 4, 'real upstream tables schedule mount callbacks');
      if (round === 1) {
        const ready = [...frames]; frames.clear();
        for (const [, callback] of ready) callback(16);
        editor.action(ctx => { const view = ctx.get(editorViewCtx); view.dispatch(view.state.tr.insertText('X', 2)); });
        assert.ok(document.querySelector('.ProseMirror').textContent.includes('TXables'));
      }
      if (round === 3) {
        editor.action(ctx => {
          const view = ctx.get(editorViewCtx);
          let firstTable = null;
          view.state.doc.forEach((node, pos) => { if (!firstTable && node.type.name === 'table') firstTable = { pos, size: node.nodeSize }; });
          assert.ok(firstTable);
          view.dispatch(view.state.tr.delete(firstTable.pos, firstTable.pos + firstTable.size));
        });
        assert.equal(document.querySelectorAll('.milkdown-table-block').length, 3);
        assert.equal(frames.size, 3, 'deleting one table releases its frame while the remaining tables stay alive');
      }
      await editor.destroy();
      assert.equal(frames.size, unrelated === null ? 0 : 1, 'closing real tables cancels only their own paused mount frames');
      if (unrelated !== null) {
        assert.ok(frames.has(unrelated), 'independent frame remains scheduled');
        const callback = frames.get(unrelated); frames.delete(unrelated); callback(32);
        assert.ok(unrelatedRan);
      }
      assert.equal(document.querySelectorAll('.milkdown-table-block').length, 0);
      console.log(`PASS real table lifecycle round ${round + 1}: paused/run frames, editing, destruction`);
    }
    assert.throws(() => stableTableView(() => {
      requestAnimationFrame(() => assert.fail('failed constructor callback must be cancelled'));
      throw new Error('generated constructor failure');
    })(null, null, null, null, null), /generated constructor failure/);
    assert.equal(frames.size, 0);
    assert.equal(globalThis.requestAnimationFrame, scheduler);
    console.log('PASS failed construction cancels its frame and restores the scheduler');
  }
} finally { dom.window.close(); }
