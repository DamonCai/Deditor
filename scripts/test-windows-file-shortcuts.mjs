import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const output = path.resolve('node_modules/.cache/windows-file-shortcuts.mjs');
await build({ entryPoints: ['src/lib/windowsFileShortcuts.ts'], outfile: output, bundle: true, format: 'esm', platform: 'node' });
const { handleWindowsFileShortcut } = await import(pathToFileURL(output));
const { window } = new JSDOM('<textarea></textarea>');
const input = window.document.querySelector('textarea');
let actions = [], preferences = {}, windows = true;
window.addEventListener('keydown', event => handleWindowsFileShortcut(event, preferences, action => actions.push(action), windows), true);
const key = (name, extras = {}) => {
  const event = new window.KeyboardEvent('keydown', { key: name, ctrlKey: true, bubbles: true, cancelable: true, ...extras });
  input.dispatchEvent(event);
  return event;
};
assert.equal(key('S').defaultPrevented, true);
assert.deepEqual(actions, ['file_save']);
actions = []; key('s', { shiftKey: true }); key('o'); key('o', { shiftKey: true });
assert.deepEqual(actions, ['file_save_as', 'file_open', 'file_open_folder']);
actions = []; key('n'); key('n', { shiftKey: true }); key('w');
assert.deepEqual(actions, ['file_new', 'file_new_window', 'file_close_tab']);
actions = []; preferences = { file_save: false };
assert.equal(key('s').defaultPrevented, false); assert.deepEqual(actions, []);
preferences = {}; windows = false;
assert.equal(key('s').defaultPrevented, false); assert.deepEqual(actions, []);
windows = true;
for (const extras of [{ isComposing: true }, { altKey: true }, { metaKey: true }, { ctrlKey: false }]) {
  assert.equal(key('s', extras).defaultPrevented, false);
}
for (const name of ['z', 'f', 'a']) assert.equal(key(name).defaultPrevented, false);
assert.deepEqual(actions, []);
window.close();
console.log('PASS Windows file dispatch, shifted commands, window ownership, disabled preferences, composition and other-platform guards');
