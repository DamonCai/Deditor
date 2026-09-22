import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deditor-windows-'));
let calls = [], handlers = new Map(), pending = null, failSave = false, gate;
let draft = '中文草稿', snapshots = [];
let cachedDraft, cachedTabs;
globalThis.window = { __TAURI_INTERNALS__: { metadata: { currentWindow: { label: 'editor-42' } } } };
const root = { inert: false };
globalThis.document = { getElementById: () => root, body: root };
globalThis.__windows = {
  invoke: async (command, args) => { calls.push([command, args]); if (command === 'window_ready') return pending; },
  listen: async (name, handler, options) => { assert.equal(options.target.label, 'editor-42'); handlers.set(name, handler); return () => handlers.delete(name); },
  flush: async () => { calls.push(['persist']); snapshots.push(draft); if (failSave) throw Error('self-created failure'); if (gate) await gate; },
  documents: () => calls.push(['documents']),
  state: () => {
    if (cachedDraft !== draft) { cachedDraft = draft; cachedTabs = [{ content: draft, savedContent: '' }]; }
    return { tabs: cachedTabs };
  },
  error: async text => calls.push(['error', text]),
};
const stubs = {
  '@tauri-apps/api/core': 'export const invoke=(...args)=>globalThis.__windows.invoke(...args);',
  '@tauri-apps/api/event': 'export const listen=(...args)=>globalThis.__windows.listen(...args);',
  './documentFlush': 'export const flushDocuments=()=>globalThis.__windows.documents();',
  './persistence': 'export const flushPersist=()=>globalThis.__windows.flush(); export const pausePersistence=()=>()=>{};',
  '../store/editor': 'export const useEditorStore={getState:()=>globalThis.__windows.state()};',
  './feedback': 'export const showError=text=>globalThis.__windows.error(text);',
  './i18n': 'export const tStatic=(key,{err})=>`${key}: ${err}`;',
  './logger': 'export const logError=()=>{};',
};
try {
  await build({ entryPoints: ['src/lib/editorWindows.ts'], outfile: path.join(dir, 'app.mjs'), bundle: true, format: 'esm', platform: 'node', plugins: [{ name: 'boundaries', setup(b) {
    b.onResolve({filter: /.*/}, a => stubs[a.path] ? {path: a.path, namespace:'stub'} : undefined);
    b.onLoad({filter: /.*/, namespace:'stub'}, a => ({contents:stubs[a.path]}));
  }}] });
  const app = await import(pathToFileURL(path.join(dir, 'app.mjs')));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  await app.newWindow();
  assert.deepEqual(calls.map(c=>c[0]), ['documents', 'persist', 'new_window']);
  console.log('1. New window flushes editing and recovery state before opening: PASS');
  calls = []; failSave = true;
  await app.newWindow();
  assert(!calls.some(c=>c[0]==='new_window')); assert(calls.some(c=>c[0]==='error'));
  console.log('2. Failed persistence prevents creation and reports the error: PASS');
  failSave = false; calls = []; pending = true;
  let unlisten = await app.installWindowLifecycle(); await tick();
  assert.equal(calls.filter(c=>c[0]==='finish_window_close').length, 1);
  assert.equal(root.inert, true);
  assert.equal(app.isWindowCloseCommitted(), true);
  assert.equal(calls.find(c=>c[0]==='finish_window_close')[1].hasDirty, true);
  unlisten(); assert.equal(handlers.size, 0);
  assert.equal(root.inert, false);
  assert.equal(app.isWindowCloseCommitted(), false);
  console.log('3. Quit requested before hydration is drained and retains Unicode draft: PASS');
  calls = []; pending = null;
  let release; gate = new Promise(resolve => { release=resolve; });
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:false}); handlers.get('prepare-window-close')({payload:true});
  await tick(); assert.equal(calls.filter(c=>c[0]==='persist').length, 1);
  assert.equal(root.inert, false, 'slow write remains editable until its final snapshot');
  assert(!calls.some(c=>c[0]==='finish_window_close'));
  release(); await tick(); assert.equal(calls.filter(c=>c[0]==='finish_window_close').length, 1);
  gate = null; unlisten();
  console.log('4. Repeated close/quit while saving is deduplicated and waits for disk: PASS');
  calls = []; failSave = true;
  unlisten = await app.installWindowLifecycle(); handlers.get('prepare-window-close')({payload:false}); await tick();
  assert(calls.some(c=>c[0]==='cancel_window_close')); assert(!calls.some(c=>c[0]==='finish_window_close'));
  failSave = false; calls = [];
  handlers.get('prepare-window-close')({payload:false}); await tick();
  assert(calls.some(c=>c[0]==='finish_window_close')); unlisten();
  console.log('5. Failed close keeps the window open and can be retried: PASS');
  calls = []; snapshots = [];
  gate = new Promise(resolve => { release = resolve; });
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:true});
  await tick();
  handlers.get('window-close-cancelled')({});
  release(); await tick();
  assert(!calls.some(c=>c[0]==='finish_window_close'), 'a cancelled disk write must not acknowledge a later close');
  gate = null; unlisten();
  console.log('6. Cancellation invalidates an outstanding close acknowledgement: PASS');
  calls = [];
  gate = new Promise(resolve => { release = resolve; });
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:true});
  await tick();
  handlers.get('window-close-cancelled')({});
  draft = 'cancelled, then typed a new draft';
  handlers.get('prepare-window-close')({payload:true});
  release(); await tick(); await tick();
  assert.equal(calls.filter(c=>c[0]==='persist').length, 2, 'retry takes its own current snapshot');
  assert.equal(calls.filter(c=>c[0]==='finish_window_close').length, 1, 'only the new close may finish');
  assert.equal(snapshots.at(-1), draft, 'retry persists the edit made after cancellation');
  gate = null; unlisten();
  console.log('7. Immediate retry after cancellation waits then flushes a fresh snapshot: PASS');
  calls = []; snapshots = [];
  gate = new Promise(resolve => { release = resolve; });
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:false});
  await tick();
  draft = '最后一次输入：slow write must retain this';
  release(); await tick();
  assert.equal(calls.filter(c=>c[0]==='persist').length, 2);
  assert.equal(snapshots.at(-1), draft);
  assert.equal(calls.filter(c=>c[0]==='finish_window_close').length, 1);
  gate = null; unlisten();
  console.log('8. Input during a slow close is written before the window acknowledges closure: PASS');
  calls = [];
  gate = new Promise(resolve => { release = resolve; });
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:false});
  await tick();
  unlisten();
  release(); await tick();
  assert(!calls.some(c=>c[0]==='finish_window_close'));
  gate = null;
  console.log('9. Disposing the lifecycle invalidates an outstanding close acknowledgement: PASS');
  calls = [];
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:true}); await tick();
  assert.equal(root.inert, true);
  handlers.get('prepare-window-close')({payload:true}); await tick();
  handlers.get('prepare-window-close')({payload:false}); await tick();
  assert.equal(calls.filter(c=>c[0]==='finish_window_close').length, 1, 'repeated requests after acknowledgement stay deduplicated');
  handlers.get('window-close-cancelled')({});
  assert.equal(root.inert, false);
  assert.equal(app.isWindowCloseCommitted(), false);
  unlisten();
  root.inert = true;
  unlisten = await app.installWindowLifecycle();
  handlers.get('prepare-window-close')({payload:true}); await tick();
  handlers.get('window-close-cancelled')({});
  assert.equal(root.inert, true, 'preexisting inert state is restored');
  unlisten(); root.inert = false;
  console.log('10. Acknowledged windows freeze editing; cancellation restores the prior interaction state: PASS');
} finally { fs.rmSync(dir, {recursive:true, force:true}); }
