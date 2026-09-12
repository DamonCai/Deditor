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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deditor-save-races-'));
fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
const stubs = {
  '@tauri-apps/api/core': 'export const invoke=(...args)=>globalThis.__invoke(...args); export const convertFileSrc=p=>p;',
  '@tauri-apps/plugin-dialog': 'export const open=async()=>null;export const save=async()=>globalThis.__savePath;',
  '@tauri-apps/plugin-opener': 'export const revealItemInDir=async()=>{};',
  '../components/ConfirmDialog': 'export const confirmUnsaved=async()=>globalThis.__choice;',
  './logger': 'export const logWarn=()=>{};export const logInfo=()=>{};export const logError=()=>{};',
  './format': 'export const formatBuffer=(...args)=>globalThis.__format(...args);',
  './markdownImageStorage': 'export const saveMarkdownImage=async()=>null;',
  './feedback': 'export const showError=()=>{};',
};
await build({
  stdin: { contents: `export {saveFile,saveAllDirty,saveFileAs,closeActiveTab} from './src/lib/fileio'; export {useEditorStore} from './src/store/editor';`, resolveDir: process.cwd() },
  outfile: path.join(dir, 'app.mjs'), bundle: true, packages: 'external', format: 'esm', platform: 'node',
  plugins: [{ name: 'ipc-boundary', setup(b) {
    b.onResolve({ filter: /.*/ }, a => stubs[a.path] ? { path: a.path, namespace: 'stub' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({ contents: stubs[a.path], loader: 'js' }));
  }}], logLevel: 'silent',
});
const app = await import(pathToFileURL(path.join(dir, 'app.mjs')));
const store = app.useEditorStore;
const initial = store.getState();
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
let writes=[], disk='', interceptWrite;
globalThis.__invoke=async(cmd,args)=>{
  if(cmd==='write_text_file') { writes.push({...args}); await interceptWrite?.(args); disk=args.content; return; }
  if(cmd==='record_markdown_draft') return;
  throw Error(cmd);
};
const tab = {id:'save-race', filePath:'/self-created/save-race.md', content:'# Local draft\n', savedContent:'# Original\n'};
function reset(){
  store.setState({...initial,tabs:[{...tab}],activeId:tab.id,formatOnSave:true});
  writes=[];disk=tab.savedContent;interceptWrite=undefined;
  globalThis.__format=async content=>content;
  globalThis.__choice='discard';globalThis.__savePath='/self-created/renamed.md';
}
function change(patch){store.setState(s=>({tabs:s.tabs.map(t=>t.id===tab.id?{...t,...patch}:t)}));}
let passed=0,failed=0;
async function test(name,fn){try{reset();await fn();passed++;console.log('PASS '+name);}catch(err){failed++;console.error('FAIL '+name+'\n'+err.stack);}}
try {
  await test('automatic save cancels when an external conflict arrives during formatting',async()=>{
    const gate=deferred();globalThis.__format=()=>gate.promise;
    const saving=app.saveAllDirty();await tick();
    disk='# External edit\n';change({externalChange:disk});gate.resolve('# Formatted stale draft\n');await saving;
    assert.equal(writes.length,0);assert.equal(disk,'# External edit\n');
    assert.equal(store.getState().tabs[0].externalChange,disk);
    assert.equal(store.getState().tabs[0].content,tab.content);
  });
  await test('disk reload while formatting cancels the stale save and preserves the clean reloaded document',async()=>{
    const gate=deferred();globalThis.__format=()=>gate.promise;
    const saving=app.saveFile();await tick();
    disk='# Reloaded external\n';change({content:disk,savedContent:disk});
    gate.resolve('# Old formatted draft\n');assert.equal(await saving,false);
    assert.equal(writes.length,0);assert.equal(store.getState().tabs[0].savedContent,disk);
    assert.equal(store.getState().tabs[0].content,disk);
  });
  await test('closing and reopening a path before formatting finishes cannot write into the reopened file',async()=>{
    const gate=deferred();globalThis.__format=()=>gate.promise;
    const saving=app.saveAllDirty();await tick();
    assert.equal(await app.closeActiveTab(),true);
    store.getState().openTab(tab.filePath,'# Reopened\n');disk='# Reopened\n';
    gate.resolve('# Closed stale draft\n');await saving;
    assert.equal(writes.length,0);assert.equal(disk,'# Reopened\n');
    assert.equal(store.getState().tabs[0].content,disk);
  });
  await test('automatic save skips an obsolete snapshot after undo or new typing during formatting',async()=>{
    for(const content of [tab.savedContent,'# Newer typing\n']){
      const gate=deferred();globalThis.__format=()=>gate.promise;
      const saving=app.saveAllDirty();await tick();change({content});gate.resolve('# Stale formatted\n');await saving;
      assert.equal(writes.length,0);assert.equal(store.getState().tabs[0].content,content);
      change({content:tab.content});
    }
  });
  await test('manual save retains its requested snapshot while newer typing stays dirty',async()=>{
    const gate=deferred();globalThis.__format=()=>gate.promise;
    const saving=app.saveFile();await tick();change({content:'# Newer typing\n'});
    gate.resolve('# Formatted requested\n');assert.equal(await saving,false);
    assert.equal(disk,'# Formatted requested\n');assert.equal(store.getState().tabs[0].content,'# Newer typing\n');
    assert.equal(store.getState().tabs[0].savedContent,disk);
  });
  await test('explicit save of an already known conflict works, but a newly arriving conflict cancels',async()=>{
    change({externalChange:'# Known external\n'});assert.equal(await app.saveFile(),true);
    assert.equal(disk,tab.content);assert.equal(store.getState().tabs[0].externalChange,undefined);
    change({content:'# Next draft\n'});
    const gate=deferred();globalThis.__format=()=>gate.promise;
    const saving=app.saveFile();await tick();disk='# New external\n';change({externalChange:disk});
    const before=writes.length;gate.resolve('# Next formatted\n');assert.equal(await saving,false);
    assert.equal(writes.length,before);assert.equal(disk,'# New external\n');
  });
  await test('write failure permits a subsequent save, and already-started writes retain newer input',async()=>{
    interceptWrite=()=>Promise.reject(Error('self-created failure'));
    await assert.rejects(app.saveFile(),/self-created failure/);assert.equal(store.getState().tabs[0].savedContent,tab.savedContent);
    const gate=deferred();interceptWrite=()=>gate.promise;
    const saving=app.saveFile();await tick();change({content:'# Typed during IPC\n'});gate.resolve();
    assert.equal(await saving,false);assert.equal(disk,tab.content);
    assert.equal(store.getState().tabs[0].content,'# Typed during IPC\n');
  });
  await test('saving follows its own document when the active tab changes',async()=>{
    const gate=deferred();globalThis.__format=()=>gate.promise;
    const saving=app.saveAllDirty();await tick();
    store.getState().openTab('/self-created/other.md','# Other\n');
    gate.resolve(tab.content);await saving;
    assert.deepEqual(writes.map(w=>w.path),[tab.filePath]);
    assert.equal(store.getState().tabs.find(t=>t.filePath==='/self-created/other.md').content,'# Other\n');
  });
  console.log(`${passed} save-race groups passed, ${failed} failed`);
  if(failed)process.exitCode=1;
} finally { dom.window.close();fs.rmSync(dir,{recursive:true,force:true}); }
