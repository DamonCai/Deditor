// Component lifecycle coverage only; does not assert system candidate placement.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { pretendToBeVisual: true, url: 'http://localhost' });
for (const key of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLTextAreaElement', 'MutationObserver', 'Event']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLCanvasElement.prototype.getContext = () => null;
const observers = new Set();
globalThis.ResizeObserver = class {
  constructor(callback) { this.callback = callback; observers.add(this); }
  observe(target) { this.target = target; }
  disconnect() { observers.delete(this); }
};
let releaseFonts;
const fonts = new Promise(resolve => { releaseFonts = resolve; });
Object.defineProperty(document, 'fonts', { value: { load: () => fonts }, configurable: true });
const { createRoot } = await import('react-dom/client');
const output = path.resolve('node_modules/.cache/deditor-xmind-composition-target.mjs');
const stubs = {
  '../lib/i18n': 'export const useT=()=>key=>key; export const tStatic=key=>key;',
  '../lib/logger': 'export const logError=()=>{}; export const logWarn=()=>{};',
};
await build({ entryPoints: ['src/components/XmindCanvas.tsx'], outfile: output, bundle: true, packages: 'external', format: 'esm', platform: 'node',
  plugins: [{ name: 'boundaries', setup(b) {
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path] }));
  } }], logLevel: 'silent' });
const { default: Canvas } = await import(pathToFileURL(output));
const root = createRoot(document.getElementById('root'));
const commands = [], cameras = [];
const original = { id: 'sheet', title: 'Generated composition target', rootTopic: { id: 'root', title: 'Root', children: { attached: [{ id: 'child', title: 'Before' }] } } };
let props = { sheet: original, readonly: false, selected: ['child'], selectedGroup: null, selectedRelationship: null,
  onSelectRelationship() {}, onSelectGroup() {}, onSelect(ids) { props = { ...props, selected: ids }; render(); },
  onCommand: command => { commands.push(command); }, onUndo() {}, onRedo() {}, resources: {}, query: '',
  camera: { x: 0, y: 0, zoom: 1 }, onCamera: camera => { cameras.push(camera); }, onLink() {}, onInspect() {}, registerFlush: () => () => {} };
const render = () => root.render(React.createElement(Canvas, props));
const run = callback => act(async () => { callback(); await Promise.resolve(); });
try {
  await run(render);
  await run(() => document.querySelector('[data-topic="child"]').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })));
  const input = document.querySelector('textarea'); assert.ok(input);
  await run(() => {
    input.dispatchEvent(new dom.window.CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, 'nihao');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.setSelectionRange(2, 4);
  });
  const unchanged = label => {
    assert.equal(document.querySelector('textarea'), input, label + ': target identity');
    assert.equal(document.activeElement, input, label + ': focus');
    assert.equal(input.value, 'nihao', label + ': marked text');
    assert.deepEqual([input.selectionStart, input.selectionEnd], [2, 4], label + ': selection');
    assert.equal(commands.length, 0, label + ': no premature document commit');
  };
  let changes = 0;
  const change = async (label, callback) => { await run(callback); unchanged(label); changes++; };
  const svg = document.querySelector('.xm-svg');
  await change('zoom', () => svg.dispatchEvent(new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -100, clientX: 100, clientY: 100 })));
  await change('pan', () => svg.dispatchEvent(new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 80, deltaY: 90 })));
  await change('narrow resize', () => { for (const observer of observers) observer.callback([{ contentRect: { width: 320, height: 240 } }]); });
  await change('theme and sibling layout', () => {
    const sheet = structuredClone(original); sheet.rootTopic.style = { properties: { 'svg:fill': '#123456', 'fo:font-size': '36pt' } };
    sheet.rootTopic.children.attached.unshift({ id: 'extra', title: 'An inserted earlier sibling that changes the layout' });
    props = { ...props, sheet }; render();
  });
  await change('font readiness', releaseFonts);
  for (const key of ['Enter', 'Escape']) for (const extra of [{ isComposing: true }, { keyCode: 229 }]) {
    await change('composition ' + key, () => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })));
  }
  await run(() => {
    input.dispatchEvent(new dom.window.CompositionEvent('compositionend', { bubbles: true, data: '你好' }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(input, '你好');
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  assert.equal(document.querySelector('textarea'), input);
  await run(() => input.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
  assert.deepEqual(commands, [{ type: 'title', id: 'child', title: '你好' }]);
  await run(() => document.querySelector('[data-topic="child"]').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })));
  const nextInput = document.querySelector('textarea');
  assert.ok(nextInput);
  await run(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(nextInput, 'Second draft');
    nextInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await run(() => document.querySelector('.xm-canvas').focus());
  assert.deepEqual(commands.at(-1), { type: 'title', id: 'child', title: 'Second draft' });
  assert.equal(commands.length, 2, 'a fresh editing session still commits on blur');
  await run(() => document.querySelector('[data-topic="child"]').dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true })));
  await run(() => document.querySelector('textarea').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  assert.equal(commands.length, 2, 'Escape and its resulting blur do not commit');
  assert.equal(original.rootTopic.children.attached[0].title, 'Before');
  assert.ok(cameras.length >= 3, 'zoom and pan actually ran');
  console.log(`PASS ${changes} composition-time camera/layout/key updates preserve target, focus, selection and draft; final text commits once`);
  console.log('Native candidate window placement remains a separate acceptance requirement.');
} finally {
  await act(async () => root.unmount());
  assert.equal(observers.size, 0);
  dom.window.close();
}
