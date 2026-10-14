// Isolated acceptance entry only. Never imported by the production entry.
// Full App + actual Rust I/O, with synthetic DOM input/control clicks.
// This does not establish physical keyboard, IME or mouse-drag correctness.
import { invoke } from '@tauri-apps/api/core';
import { useEditorStore as store, DEFAULT_CONTENT } from '../../src/store/editor';
import { openFileByPath, saveFile, closeActiveTab, closeTabById } from '../../src/lib/fileio';
import { getVisualEditor } from '../../src/lib/markdownVisualBridge';
import { markdownHistory } from '../../src/lib/markdownHistory';

declare const __NATIVE_SOAK_ROOT__: string;
declare const __NATIVE_SOAK_MINUTES__: number;
declare const __NATIVE_SOAK_IDLE_SECONDS__: number;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const wait = async (condition: () => unknown, description: string) => {
  const start = performance.now();
  while (!condition()) { if (performance.now() - start > 60000) throw new Error('Timeout: ' + description); await pause(100); }
};
const mdPath = __NATIVE_SOAK_ROOT__ + '/long.md', xmPath = __NATIVE_SOAK_ROOT__ + '/large.xmind';
const reportPath = __NATIVE_SOAK_ROOT__ + '/native-results.json';
const status = document.createElement('output');
status.style.cssText = 'position:fixed;bottom:26px;right:6px;z-index:99999;background:#111;color:#fff;padding:6px;font:12px monospace;pointer-events:none';
document.body.append(status);
const errors: string[] = [], samples: unknown[] = [];
const viewportTimings: { action: string; milliseconds: number }[] = [];
const collected = { markdown: 0, xmind: 0 };
const finalized = new FinalizationRegistry<'markdown' | 'xmind'>(kind => { collected[kind]++; });
const pendingFrames = new Set<number>();
const nativeRequestFrame = globalThis.requestAnimationFrame.bind(globalThis);
const nativeCancelFrame = globalThis.cancelAnimationFrame.bind(globalThis);
globalThis.requestAnimationFrame = callback => {
  const id = nativeRequestFrame(time => { pendingFrames.delete(id); callback(time); });
  pendingFrames.add(id);
  return id;
};
globalThis.cancelAnimationFrame = id => { pendingFrames.delete(id); nativeCancelFrame(id); };
let checkpoint: unknown = null;
window.addEventListener('error', event => errors.push(String(event.error ?? event.message)));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
let rounds = 0;
const started = performance.now();
const write = async (phase: string, detail: unknown = null) => {
  const record = { phase, rounds, elapsedSeconds: (performance.now() - started) / 1000, minutes: __NATIVE_SOAK_MINUTES__,
    method: 'Full App in native WKWebView; actual Rust file I/O and recovery; synthetic DOM input, zoom/sheet clicks and wheel pan; no physical input claim',
    detail, samples, errors, checkpoint, viewportTimings, collected, pendingAnimationFrames: pendingFrames.size };
  status.textContent = `NATIVE SOAK ${phase} · ${rounds} rounds · ${Math.round(record.elapsedSeconds)}s`;
  await invoke('write_text_file', { path: reportPath, content: JSON.stringify(record, null, 2) });
};
const current = () => store.getState().tabs.find(tab => tab.id === store.getState().activeId)!;
const click = (selector: string, index = 0) => {
  const button = document.querySelectorAll<HTMLButtonElement>(selector)[index];
  assert(button && !button.disabled, 'Missing enabled control: ' + selector); button.click();
};
const viewport = () => document.querySelector('.xm-svg')?.getAttribute('viewBox') ?? null;
const waitViewport = async (before: string | null, action: string, sheet: number) => {
  const start = performance.now();
  checkpoint = { action, sheet, before, visibility: document.visibilityState };
  await wait(() => viewport() !== null && viewport() !== before, action);
  const milliseconds = performance.now() - start;
  // Keep exceptional render waits, not an ever-growing record of every action.
  if (milliseconds > 250) viewportTimings.push({ action, milliseconds });
  checkpoint = { action, sheet, before, after: viewport(), milliseconds, visibility: document.visibilityState };
};
async function run() {
  // Let the real App complete hydration before starting, using a fresh bundle ID.
  await pause(2500);
  const initialTabs = store.getState().tabs;
  assert(initialTabs.length === 1 && initialTabs.every(tab => !tab.filePath && tab.content === DEFAULT_CONTENT && tab.content === tab.savedContent), 'Fresh isolated app required');
  const sentinel = __NATIVE_SOAK_ROOT__ + '/idle.txt';
  await invoke('write_text_file', { path: sentinel, content: 'Native lifecycle idle view\n' });
  await openFileByPath(sentinel);
  assert(await closeTabById(initialTabs[0].id), 'Close generated welcome tab');
  store.setState({ markdownMode: 'visual', autoSave: 'off', language: 'en' });
  const source = await invoke<string>('read_text_file', { path: mdPath });
  const originalXmind = await invoke<string>('read_binary_as_base64', { path: xmPath });
  const changed = source.replace('\n', 'Z\n');
  await write('started', { markdownChars: source.length, xmindNodesPerSheet: 1001, sheets: 3, userAgent: navigator.userAgent });
  while (performance.now() - started < __NATIVE_SOAK_MINUTES__ * 60000) {
    await openFileByPath(mdPath);
    await wait(() => getVisualEditor()?.tabId === current()?.id && document.querySelector('.ProseMirror h1'), 'Markdown ready');
    const heading = document.querySelector('.ProseMirror h1')!;
    finalized.register(heading.closest('.ProseMirror')!, 'markdown');
    const leaf = heading.firstChild!;
    (heading.closest('[contenteditable]') as HTMLElement).focus();
    document.getSelection()!.collapse(leaf, leaf.textContent!.length);
    leaf.textContent += 'Z';
    document.getSelection()!.collapse(leaf, leaf.textContent!.length);
    heading.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'Z' }));
    await wait(() => current().content === changed, 'DOM edit reaches source');
    assert(await saveFile(), 'Save edited Markdown');
    assert(await invoke('read_text_file', { path: mdPath }) === changed, 'Exact edited disk bytes');
    markdownHistory(false); await wait(() => current().content === source, 'Undo exact source');
    markdownHistory(true); await wait(() => current().content === changed, 'Redo exact source');
    markdownHistory(false); await wait(() => current().content === source, 'Restore baseline');
    assert(await saveFile(), 'Save baseline');
    assert(await invoke('read_text_file', { path: mdPath }) === source, 'Baseline disk bytes');
    assert(await closeActiveTab(), 'Close Markdown');
    await openFileByPath(xmPath);
    await wait(() => document.querySelectorAll('.xm-sheets [role=tab]').length === 3 && document.querySelector('.xm-svg'), 'XMind ready');
    finalized.register(document.querySelector('.xm-canvas')!, 'xmind');
    const dataUrl = current().content;
    for (let sheet = 0; sheet < 3; sheet++) {
      click('.xm-sheets [role=tab]', sheet);
      await wait(() => document.querySelector('.xm-sheets [aria-selected=true]')?.textContent === 'Sheet ' + (sheet + 1), 'Sheet switch');
      const before = viewport();
      click('.xm-zoom button', 1);
      await waitViewport(before, 'Zoom in changes viewport', sheet);
      const zoomed = viewport();
      click('.xm-zoom button', 0);
      await waitViewport(zoomed, 'Zoom out changes viewport', sheet);
      const panBefore = viewport();
      document.querySelector('.xm-canvas')!.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 60, deltaY: 40 }));
      await waitViewport(panBefore, 'Wheel pan changes viewport', sheet);
    }
    assert(current().content === dataUrl, 'View operations preserve archive');
    assert(await invoke('read_binary_as_base64', { path: xmPath }) === originalXmind, 'XMind disk bytes unchanged');
    assert(await closeActiveTab(), 'Close XMind');
    store.setState(state => ({ theme: state.theme === 'dark' ? 'light' : 'dark' }));
    await pause(500);
    rounds++;
    const clean = { round: rounds, seconds: (performance.now() - started) / 1000,
      domNodes: document.querySelectorAll('*').length, tabs: store.getState().tabs.length,
      closed: store.getState().closedTabsStack.length, editors: document.querySelectorAll('.ProseMirror').length,
      canvases: document.querySelectorAll('.xm-canvas').length, bridge: getVisualEditor()?.tabId ?? null, pendingAnimationFrames: pendingFrames.size };
    assert(!clean.editors && !clean.canvases && !clean.bridge, 'Closed editor/canvas/bridge released');
    assert(!errors.length, 'Runtime errors: ' + errors.join(';'));
    samples.push(clean);
    await write('running', { last: clean });
  }
  const idleStart = performance.now();
  while (performance.now() - idleStart < __NATIVE_SOAK_IDLE_SECONDS__ * 1000) {
    await write('idle', { idleSeconds: (performance.now() - idleStart) / 1000, collected });
    await pause(5000);
  }
  await write('complete');
}
void run().catch(async error => { await write('failed', { message: String(error), stack: error?.stack, viewport: viewport(), visibility: document.visibilityState }); });
