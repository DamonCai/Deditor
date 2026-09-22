import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// A deterministic component regression for explicit navigation during IME
// settlement. Synthetic events/geometry do not establish native candidate UI.
const output = path.resolve('node_modules/.cache/deditor-composition-navigation.mjs');
await build({ entryPoints: ['src/lib/markdownVisual/compositionViewport.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node', logLevel: 'silent' });
const { installCompositionViewport } = await import(pathToFileURL(output));
let passed = 0;
function test(name, run) {
  const dom = new JSDOM('<body><div id="scroll"><div id="editor" contenteditable="true"><p>组合位置</p><h2>目录目标</h2></div></div><button id="outline">目录目标</button></body>', { pretendToBeVisual: true });
  const win = dom.window, doc = win.document, scroller = doc.querySelector('#scroll'), editor = doc.querySelector('#editor'), outline = doc.querySelector('#outline');
  Object.defineProperties(scroller, { clientHeight: { value: 500 }, clientTop: { value: 0 }, scrollHeight: { value: 5000 } });
  scroller.getBoundingClientRect = () => ({ top: 100, bottom: 600, height: 500 });
  scroller.scrollTop = 1000;
  let nextFrame = 0;
  const frames = new Map();
  win.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
  win.cancelAnimationFrame = id => frames.delete(id);
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn(0)); };
  const text = editor.querySelector('p').firstChild, heading = editor.querySelector('h2').firstChild;
  win.Range.prototype.getClientRects = function () {
    const y = this.startContainer === heading ? 3000 : 1200;
    return [{ top: 100 + y - scroller.scrollTop, bottom: 120 + y - scroller.scrollTop, height: 20 }];
  };
  const selection = doc.getSelection();
  const select = node => { const range = doc.createRange(); range.setStart(node, 2); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); };
  select(text);
  const guard = installCompositionViewport(editor, scroller);
  const event = (target, type) => target.dispatchEvent(new win.Event(type, { bubbles: true }));
  try { run({ doc, editor, scroller, outline, guard, event, frame, frames, select, heading, selection }); passed++; console.log('PASS ' + name); }
  finally { guard.destroy(); dom.window.close(); }
}
try {
  test('outline navigation outside the scrolling editor wins over the queued IME anchor', ({ editor, scroller, outline, guard, event, frame, select, heading, selection }) => {
    event(editor, 'compositionstart');
    event(outline, 'pointerdown');
    event(editor, 'compositionend');
    // MarkdownVisualEditor.navigate first selects the heading and requests PM
    // scrollIntoView, then explicitly places the heading 16px below the top.
    select(heading); guard.handleScroll(); scroller.scrollTop = 3000 - 16;
    frame(); frame();
    assert.equal(scroller.scrollTop, 2984, 'settlement must not undo the explicit outline alignment');
    assert.equal(selection.focusNode, heading); assert.equal(selection.focusOffset, 2);
  });
  test('a pointer navigation after compositionend cancels its pending correction', ({ editor, scroller, outline, guard, event, frame }) => {
    event(editor, 'compositionstart'); event(editor, 'compositionend');
    event(outline, 'pointerdown'); scroller.scrollTop = 2500;
    frame(); frame(); assert.equal(scroller.scrollTop, 2500); assert.equal(guard.handleScroll(), false);
  });
  test('ordinary native auto-scroll remains protected until the two-frame settlement ends', ({ editor, scroller, guard, event, frame }) => {
    event(editor, 'compositionstart'); scroller.scrollTop = 1172;
    assert.equal(guard.handleScroll(), true); assert.equal(scroller.scrollTop, 1000);
    event(editor, 'compositionend'); scroller.scrollTop = 1172;
    frame(); assert.equal(scroller.scrollTop, 1000); frame(); assert.equal(guard.handleScroll(), false);
  });
  test('another document cannot release this window and a fresh composition gets its own anchor', ({ editor, scroller, outline, guard, event, frame }) => {
    event(editor, 'compositionstart');
    const other = new JSDOM('<body><button>Other window</button></body>');
    try { other.window.document.querySelector('button').dispatchEvent(new other.window.Event('pointerdown', { bubbles: true })); }
    finally { other.window.close(); }
    scroller.scrollTop = 1172; assert.equal(guard.handleScroll(), true); assert.equal(scroller.scrollTop, 1000);
    event(outline, 'pointerdown'); event(editor, 'compositionend');
    scroller.scrollTop = 1100; event(editor, 'compositionstart'); scroller.scrollTop = 1250;
    frame(); assert.equal(scroller.scrollTop, 1100); assert.equal(guard.handleScroll(), true);
  });
  test('destroy removes the document pointer listener and cancels its queued frame', ({ doc, editor, guard, event, frames, scroller, frame }) => {
    const removed = [], original = doc.removeEventListener;
    doc.removeEventListener = function (type, listener, capture) { removed.push([type, capture]); return original.call(this, type, listener, capture); };
    event(editor, 'compositionstart'); assert.equal(frames.size, 1); guard.destroy(); assert.equal(frames.size, 0);
    assert.ok(removed.some(([type, capture]) => type === 'pointerdown' && capture === true));
    scroller.scrollTop = 1500; event(editor, 'compositionstart'); frame(); assert.equal(scroller.scrollTop, 1500); assert.equal(guard.handleScroll(), false);
    doc.removeEventListener = original;
  });
  console.log(`${passed} composition navigation groups passed`);
} finally { fs.rmSync(output, { force: true }); }
