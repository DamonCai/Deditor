import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';

// Exercise the Windows keymap in the actual reading component. All documents,
// clipboard values and IPC are generated here; this is not native IME testing.
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', {url: 'http://localhost', pretendToBeVisual: true});
for (const key of ['window','Window','document','Node','NodeFilter','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLDivElement','Element','Text','SVGElement','MutationObserver','DOMParser','DOMRect','Event','CustomEvent','localStorage']) Object.defineProperty(globalThis, key, {value: dom.window[key], configurable: true});
Object.defineProperty(dom.window.navigator, 'platform', {value: 'Win32'});
Object.defineProperty(dom.window.navigator, 'userAgent', {value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0'});
Object.defineProperty(globalThis, 'navigator', {value: dom.window.navigator, configurable: true});
for (const key of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) globalThis[key] = dom.window[key].bind(dom.window);
globalThis.ResizeObserver = class {observe() {} unobserve() {} disconnect() {}};
globalThis.IntersectionObserver = class {observe() {} unobserve() {} disconnect() {}};
window.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
window.Range.prototype.getClientRects = () => [];
window.Range.prototype.getBoundingClientRect = () => ({left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0});
HTMLElement.prototype.scrollIntoView = function() {};
HTMLElement.prototype.scrollTo = function({top = 0}) {this.scrollTop = top;};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {createRoot} = await import('react-dom/client');
let clipboard = '', reads = 0;
Object.defineProperty(navigator, 'clipboard', {value: {readText: async () => {reads++; return clipboard;}, writeText: async text => {clipboard = text;}}});
const errors = [];
window.addEventListener('error', event => errors.push(event.error));
const output = path.resolve('node_modules/.cache/deditor-markdown-windows.mjs');
fs.mkdirSync(path.dirname(output), {recursive: true});
const stubs = {
  '@tauri-apps/api/core': 'export const invoke=async()=>""; export const convertFileSrc=p=>p;',
  '@tauri-apps/plugin-dialog': 'export const save=async()=>null; export const open=async()=>null;',
  '@tauri-apps/plugin-opener': 'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin: {contents: `
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
`, resolveDir: process.cwd()}, outfile: output, bundle: true, format: 'esm', platform: 'node', packages: 'external', loader: {'.css': 'empty'}, plugins: [{name: 'isolated-io', setup(builder) {
  builder.onResolve({filter: /.*/}, args => args.path.endsWith('.css') ? {path: 'css', namespace: 'stub'} : stubs[args.path] ? {path: args.path, namespace: 'stub'} : args.path.endsWith('/feedback') ? {path: 'feedback', namespace: 'stub'} : undefined);
  builder.onLoad({filter: /.*/, namespace: 'stub'}, args => ({contents: args.path === 'css' ? '' : args.path === 'feedback' ? 'export const showError=async()=>{};' : stubs[args.path], loader: 'js'}));
}}], logLevel: 'silent'});
const app = await import(pathToFileURL(output));
const store = app.useEditorStore, root = createRoot(document.getElementById('root'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
store.setState({tabs: [{id: 'windows', filePath: 'C:\\generated\\windows.md', content: '', savedContent: ''}], activeId: 'windows', language: 'en', markdownMode: 'visual', autoSave: 'off'});
const content = () => store.getState().tabs[0].content;
const editor = () => document.querySelector('.ProseMirror');
const key = async (key, options = {}) => act(async () => {
  editor().dispatchEvent(new window.KeyboardEvent('keydown', {key, bubbles: true, cancelable: true, ...options}));
  await pause(10);
});
const source = async value => {
  await act(async () => {root.render(null);});
  await act(async () => {store.getState().setContent(value, 'windows', 'command');});
  await act(async () => {root.render(React.createElement(app.Visual, {tabId: 'windows', theme: 'light'})); await pause(120);});
  assert.ok(app.getVisualEditor()?.editable);
};
let passed = 0;
async function test(name, run) {await run(); passed++; console.log('PASS ' + name);}
try {
  await test('Windows Ctrl+B / Ctrl+Z / Ctrl+Y and literal copy', async () => {
    await source('AT&T a_b 中文\n');
    await act(async () => app.getVisualEditor().navigate(1, 1, {length: 4}));
    const before = content();
    await key('b', {ctrlKey: true, code: 'KeyB'});
    assert.match(content(), /\*\*AT&T\*\*/);
    assert.equal(app.getVisualEditor().clipboard().text, 'AT&T');
    const formatted = content();
    await key('z', {ctrlKey: true, code: 'KeyZ'});
    assert.equal(content(), before);
    await key('y', {ctrlKey: true, code: 'KeyY'});
    assert.equal(content(), formatted);
  });
  await test('Ctrl+Shift+V normalizes Windows CRLF while preserving literal syntax', async () => {
    await source('Start\n');
    await act(async () => app.getVisualEditor().navigate(1, 6));
    clipboard = '  a_b &copy;\r\n**literal**\r中文';
    await key('V', {ctrlKey: true, shiftKey: true, code: 'KeyV'});
    assert.equal(app.getVisualEditor().clipboard().text, 'Start  a_b &copy;\n**literal**\n中文');
    assert.equal(editor().querySelector('strong'), null);
    await key('z', {ctrlKey: true, code: 'KeyZ'});
    assert.equal(content(), 'Start\n');
  });
  await test('Ctrl+Shift+C copies visible text and composition defers clipboard shortcut', async () => {
    await source('**AT&T a_b 中文**\n');
    await act(async () => app.getVisualEditor().navigate(1, 3, {length: 11}));
    const expected = app.getVisualEditor().clipboard().text;
    await key('C', {ctrlKey: true, shiftKey: true, code: 'KeyC'});
    assert.equal(clipboard, expected);
    assert.ok(!clipboard.includes('\\_'));
    const before = content(), readCount = reads;
    await key('V', {ctrlKey: true, shiftKey: true, code: 'KeyV', isComposing: true, keyCode: 229});
    assert.equal(content(), before);
    assert.equal(reads, readCount);
  });
  await test('CRLF table reorder preserves source through Windows undo and redo', async () => {
    await source('Before\r\n\r\n| Name | Value |\r\n| --- | --- |\r\n| AT&T | a_b |\r\n\r\nAfter\r\n');
    const before = content(), text = document.querySelector('table').textContent;
    await act(async () => document.querySelector('.md-table-drag').dispatchEvent(new window.KeyboardEvent('keydown', {key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true})));
    const after = content();
    assert.ok(after.indexOf('After') < after.indexOf('| Name'));
    assert.equal(document.querySelector('table').textContent, text);
    await key('z', {ctrlKey: true, code: 'KeyZ'});
    assert.equal(content(), before);
    await key('Z', {ctrlKey: true, shiftKey: true, code: 'KeyZ'});
    assert.equal(content(), after);
  });
  assert.deepEqual(errors, []);
  console.log(`${passed} Windows reading component groups passed (isolated IPC; no native IME/clipboard acceptance)`);
} finally {
  await act(async () => root.unmount());
  dom.window.close();
}
