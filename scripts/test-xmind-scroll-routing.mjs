// Real canvas event routing with generated data; native scrolling is verified in the browser fixture.
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
const fonts = Promise.resolve([]);
Object.defineProperty(document, 'fonts', { value: { load: () => fonts }, configurable: true });
const { createRoot } = await import('react-dom/client');
const output = path.resolve('node_modules/.cache/deditor-xmind-scroll-routing.mjs');
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
const original = { id: 'sheet', title: 'Generated scroll routing', rootTopic: { id: 'root', title: 'Root', children: { attached: [{ id: 'child', title: 'Before' }] } } };
let props = { sheet: original, readonly: false, selected: ['child'], selectedGroup: null, selectedRelationship: null,
  onSelectRelationship() {}, onSelectGroup() {}, onSelect(ids) { props = { ...props, selected: ids }; render(); },
  onCommand: command => { commands.push(command); }, onUndo() {}, onRedo() {}, resources: {}, query: '',
  camera: { x: 0, y: 0, zoom: 1 }, onCamera: camera => { cameras.push(camera); }, onLink() {}, onInspect() {}, registerFlush: () => () => {} };
const render = () => root.render(React.createElement(Canvas, props));
const run = callback => act(async () => { callback(); await Promise.resolve(); });
const wheel = async (target, props = {}) => {
  const event = new dom.window.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100, ...props });
  await run(() => target.dispatchEvent(event));
  return event;
};
const openMenu = async () => {
  await run(() => document.querySelector('.xm-svg').dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })));
  const menu = document.querySelector('.xm-context'); assert.ok(menu); return menu;
};
try {
  await run(render);
  const menu = await openMenu();
  const before = cameras.at(-1);
  for (const target of [menu, menu.querySelector('button')]) {
    assert.equal((await wheel(target)).defaultPrevented, false, 'menu wheel retains native scrolling');
    assert.deepEqual(cameras.at(-1), before, 'menu wheel must not pan canvas');
  }
  assert.equal(commands.length, 0);
  console.log('PASS round 1: menu background and button wheel preserve native scroll and camera');

  for (const options of [{deltaY:0,deltaX:100},{deltaY:-100},{deltaY:100,ctrlKey:true},{deltaY:100,metaKey:true},{deltaY:3,deltaMode:1}]) {
    assert.equal((await wheel(menu.querySelector('button'), options)).defaultPrevented, false);
    assert.deepEqual(cameras.at(-1), before);
  }
  // Native scrolling may already be at either edge; routing must remain local.
  menu.scrollTop = 100;
  await wheel(menu);
  assert.deepEqual(cameras.at(-1), before);
  console.log('PASS round 2: horizontal, reverse, modifier, line-mode and menu-edge wheel do not move the map');

  await run(() => document.querySelector('.xm-canvas').dispatchEvent(new dom.window.KeyboardEvent('keydown', {key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('.xm-context'), null);
  assert.equal((await wheel(document.querySelector('.xm-svg'), {deltaX:25,deltaY:80})).defaultPrevented, true);
  assert.notEqual(cameras.at(-1).y, before.y);
  const zoom = cameras.at(-1).zoom;
  assert.equal((await wheel(document.querySelector('.xm-svg'), {ctrlKey:true,deltaY:-50})).defaultPrevented, true);
  assert.notEqual(cameras.at(-1).zoom, zoom);
  await run(() => document.querySelector('[data-topic="child"]').dispatchEvent(new dom.window.MouseEvent('dblclick', {bubbles:true})));
  const input = document.querySelector('textarea'); assert.ok(input);
  const inputCamera = cameras.at(-1);
  assert.equal((await wheel(input)).defaultPrevented, false);
  assert.deepEqual(cameras.at(-1), inputCamera);
  assert.equal(commands.length, 0);
  await run(() => root.render(null)); await run(render);
  const reopened = await openMenu(), reopenedCamera = cameras.at(-1);
  assert.equal((await wheel(reopened)).defaultPrevented, false);
  assert.deepEqual(cameras.at(-1), reopenedCamera);
  console.log('PASS round 3: Escape, canvas pan/zoom, text input and remount keep their own wheel behavior');
} finally {
  await run(() => root.unmount()); dom.window.close();
}
