import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
window.matchMedia = () => ({ matches: false });
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deditor-close-persistence-'));
fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
const stubs = {
  '@tauri-apps/api/core': 'export const invoke=(...args)=>globalThis.__invoke(...args); export const convertFileSrc=p=>p;',
  '@tauri-apps/plugin-dialog': 'export const open=async()=>null;export const save=async()=>null;',
  '@tauri-apps/plugin-opener': 'export const revealItemInDir=async()=>{};',
  '../components/ConfirmDialog': 'export const confirmUnsaved=async()=>globalThis.__choice;',
  './logger': 'export const logWarn=()=>{};export const logInfo=()=>{};export const logError=()=>{};',
  './format': 'export const formatBuffer=async()=>null;',
  './markdownImageStorage': 'export const saveMarkdownImage=async()=>null;',
  './feedback': 'export const showError=()=>{};',
};
await build({
  stdin: { contents: `export {closeActiveTab} from './src/lib/fileio'; export {schedulePersist,flushPersist,loadPersisted} from './src/lib/persistence'; export {useEditorStore} from './src/store/editor';`, resolveDir: process.cwd() },
  outfile: path.join(dir, 'app.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node',
  plugins: [{ name: 'ipc-boundary', setup(b) {
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  }}], logLevel: 'silent',
});
const app = await import(pathToFileURL(path.join(dir, 'app.mjs')));
const store = app.useEditorStore;
const initial = store.getState();
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
let timerId = 0;
const timers = new Map();
globalThis.setTimeout = (fn, ms, ...args) => ms === 500
  ? (timers.set(++timerId, () => fn(...args)), timerId) : realSetTimeout(fn, ms, ...args);
globalThis.clearTimeout = id => { if (!timers.delete(id)) realClearTimeout(id); };
let diskState = '', writes = [], interceptWrite;
globalThis.__choice = 'cancel';
globalThis.__invoke = async (cmd, args) => {
  if (cmd === 'write_app_state') {
    writes.push(JSON.parse(args.content));
    await interceptWrite?.(args.content);
    diskState = args.content;
    return;
  }
  if (cmd === 'read_app_state') return diskState;
  if (cmd === 'read_text_file') return 'new disk';
  if (cmd === 'record_markdown_draft') return;
  throw Error(cmd);
};
const extras = { sidebarPx: 271, previewPct: 43 };
const tab = { id: 'k03', filePath: '/self-created/k03.md', content: 'old dirty draft', savedContent: 'old disk', externalChange: 'new disk' };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function reset() {
  store.setState({ ...initial, tabs: [{ ...tab }], activeId: tab.id, tabPositions: {}, closedTabsStack: [] });
  writes = []; diskState = ''; interceptWrite = undefined;
}
function reload() {
  store.setState(s => ({ tabs: s.tabs.map(t => t.id === tab.id ? { ...t, content: 'new disk', savedContent: 'new disk', externalChange: undefined } : t) }));
}
const unsubscribe = store.subscribe(() => app.schedulePersist(extras));
try {
  reset();
  await app.flushPersist();
  assert.equal(JSON.parse(diskState).tabs[0].content, 'old dirty draft');
  reload();
  const gate = deferred();
  interceptWrite = () => gate.promise;
  let closed = false;
  const closing = app.closeActiveTab().then(result => { closed = true; return result; });
  await tick();
  assert.equal(timers.size, 0, 'close removes the debounce immediately');
  assert.equal(closed, false, 'close waits for durable state write');
  assert(!writes.at(-1).tabs.some(t => t.filePath === tab.filePath));
  gate.resolve();
  assert.equal(await closing, true);
  interceptWrite = undefined;
  await app.loadPersisted();
  assert(!store.getState().tabs.some(t => t.filePath === tab.filePath || t.content === tab.content));
  assert.equal(JSON.parse(diskState).sidebarPx, extras.sidebarPx);
  assert.equal(JSON.parse(diskState).previewPct, extras.previewPct);
  console.log('PASS close after reload persists before resolving, without running a 500ms timer; restart has no old draft');

  reset();
  const oldGate = deferred();
  interceptWrite = () => writes.length === 1 ? oldGate.promise : undefined;
  const oldWrite = app.flushPersist();
  await tick();
  reload();
  const queuedClose = app.closeActiveTab();
  await tick();
  assert.equal(writes.length, 1, 'close snapshot cannot race an older write');
  oldGate.resolve();
  await oldWrite;
  assert.equal(await queuedClose, true);
  assert.equal(writes.length, 2);
  assert(!JSON.parse(diskState).tabs.some(t => t.filePath === tab.filePath));
  console.log('PASS an older in-flight draft finishes before the close snapshot');

  reset();
  reload();
  interceptWrite = () => Promise.reject(Error('self-created write failure'));
  assert.equal(await app.closeActiveTab(), false, 'failed persistence cannot report successful close');
  await assert.rejects(app.flushPersist(), /self-created write failure/);
  interceptWrite = undefined;
  await app.flushPersist();
  assert(!JSON.parse(diskState).tabs.some(t => t.filePath === tab.filePath));
  console.log('PASS persistence errors are observable and do not poison later writes');

  reset();
  store.setState(s => ({ tabs: [...s.tabs, { id: 'other', filePath: '/self-created/other.md', content: 'keep dirty', savedContent: 'new disk' }] }));
  await app.flushPersist();
  const writeCount = writes.length;
  assert.equal(await app.closeActiveTab(), false);
  assert.equal(writes.length, writeCount, 'cancel does not write a close snapshot');
  reload();
  assert.equal(await app.closeActiveTab(), true);
  assert.deepEqual(JSON.parse(diskState).tabs.map(t => [t.filePath, t.content]), [['/self-created/other.md', 'keep dirty']]);
  await app.loadPersisted();
  assert.equal(store.getState().tabs[0].content, 'keep dirty');
  console.log('PASS cancellation and remaining dirty tabs are preserved');
} finally {
  unsubscribe();
  // Clear only this audit's fake persistence timers; no actual writes escape the IPC stub.
  timers.clear();
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
  dom.window.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
