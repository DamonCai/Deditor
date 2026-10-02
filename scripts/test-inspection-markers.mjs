import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'Node', 'HTMLElement', 'Element', 'Text', 'MutationObserver', 'DOMRect']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
dom.window.Range.prototype.getClientRects = () => [];
dom.window.Range.prototype.getBoundingClientRect = () => new dom.window.DOMRect();
const output = resolve('node_modules/.cache/deditor-inspection-markers.mjs');
mkdirSync(resolve('node_modules/.cache'), { recursive: true });
await build({ stdin: { contents: `export * from './src/lib/inspectionMarkers'; export * from './src/lib/bookmarks';`, resolveDir: process.cwd() }, outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', logLevel: 'silent' });
const { inspectionMarkers, bookmarkExtension, toggleBookmarkEffect, clearBookmarks } = await import(pathToFileURL(output));
const { EditorView } = await import('@codemirror/view');
const views = [];
function create(doc) {
  const parent = document.body.appendChild(document.createElement('div'));
  const view = new EditorView({ doc, extensions: [bookmarkExtension(), inspectionMarkers()], parent });
  views.push(view);
  return view;
}
const strip = view => view.dom.querySelector('.cm-inspection-strip');
const add = (view, line) => view.dispatch({ effects: toggleBookmarkEffect.of({ from: view.state.doc.line(line).from }) });
try {
  const source = JSON.stringify(Array.from({ length: 3000 }, (_, id) => ({ id, name: `自建 ${id}`, color: '#336699' })), null, 2);
  const large = create(source);
  assert.equal(getComputedStyle(strip(large)).pointerEvents, 'none', 'empty overlay must not intercept the scrollbar');
  add(large, 9000);
  const marker = strip(large).firstElementChild;
  assert.equal(getComputedStyle(marker).pointerEvents, 'auto', 'bookmark remains a hit target');
  marker.click();
  assert.equal(large.state.doc.lineAt(large.state.selection.main.head).number, 9000);
  assert.equal(large.state.doc.toString(), source);
  clearBookmarks(large);
  assert.equal(strip(large).children.length, 0);
  assert.equal(getComputedStyle(strip(large)).pointerEvents, 'none');
  console.log('PASS round 1: large JSON, transparent track, bookmark click and clear preserve document');

  for (const text of ['', '{}', JSON.stringify({ text: '中文 '.repeat(100000) })]) {
    const view = create(text);
    assert.equal(getComputedStyle(strip(view)).pointerEvents, 'none');
    add(view, 1);
    strip(view).firstElementChild.click();
    assert.equal(view.state.selection.main.head, 0);
    assert.equal(view.state.doc.toString(), text);
    clearBookmarks(view);
    assert.equal(strip(view).children.length, 0);
  }
  console.log('PASS round 2: empty, single-line and long Unicode JSON with bookmarks');

  const left = create('first\nsecond\nthird'), right = create('other\nlast');
  add(left, 2); add(right, 2);
  left.dispatch({ changes: { from: 0, insert: 'new\n' } });
  strip(left).firstElementChild.click();
  assert.equal(left.state.doc.lineAt(left.state.selection.main.head).number, 3);
  assert.equal(right.state.selection.main.head, 0);
  strip(right).firstElementChild.click();
  assert.equal(right.state.doc.lineAt(right.state.selection.main.head).number, 2);
  clearBookmarks(left);
  assert.equal(strip(right).children.length, 1);
  const oldStrip = strip(left);
  left.destroy();
  assert.equal(oldStrip.isConnected, false);
  assert.equal(getComputedStyle(strip(right)).pointerEvents, 'none');
  console.log('PASS round 3: independent editors, mapped bookmarks after edits and teardown');
} finally {
  for (const view of views) if (!view.destroyed) view.destroy();
  dom.window.close();
}
