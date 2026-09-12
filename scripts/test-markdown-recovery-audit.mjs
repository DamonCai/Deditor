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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deditor-recovery-audit-'));
fs.symlinkSync(path.resolve('node_modules'), path.join(dir, 'node_modules'), 'dir');
const stubs = {
  '@tauri-apps/api/core': 'export const invoke=(...args)=>globalThis.__invoke(...args); export const convertFileSrc=p=>p;',
  '@tauri-apps/plugin-dialog': 'export const open=async()=>null;export const save=async()=>globalThis.__savePath;',
  '@tauri-apps/plugin-opener': 'export const revealItemInDir=async()=>{};',
  '../components/ConfirmDialog': 'export const confirmUnsaved=async()=>globalThis.__choice;',
  './logger': 'export const logWarn=()=>{};export const logInfo=()=>{};export const logError=()=>{};',
  './format': 'export const formatBuffer=(...args)=>globalThis.__format(...args);',
  './markdownImageStorage': 'export const saveMarkdownImage=async()=>null;',
  './feedback': 'export const showError=async message=>{globalThis.__errors.push(message);};',
};
await build({
  stdin: { contents: `export {saveFile,saveAllDirty,saveFileAs,closeActiveTab,closeTabById} from './src/lib/fileio'; export {COMMANDS} from './src/lib/commands'; export {useEditorStore} from './src/store/editor';`, resolveDir: process.cwd() },
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
  writes=[];disk=tab.savedContent;interceptWrite=undefined;globalThis.__errors=[];
  globalThis.__format=async content=>content;
  globalThis.__choice='discard';globalThis.__savePath='/self-created/renamed.md';
}
function change(patch){store.setState(s=>({tabs:s.tabs.map(t=>t.id===tab.id?{...t,...patch}:t)}));}
let passed=0,failed=0;
async function test(name,fn){try{reset();await fn();passed++;console.log('PASS '+name);}catch(err){failed++;console.error('FAIL '+name+'\n'+err.stack);}}
try {
  await test('RC01 manual save failure reports a readable error and retains the dirty draft', async()=>{
    interceptWrite=()=>Promise.reject(Error('generated disk full'));
    assert.equal(await app.saveFile(),false);
    assert.equal(globalThis.__errors.length,1);assert.match(globalThis.__errors[0],/generated disk full/);
    assert.equal(store.getState().tabs[0].content,tab.content);assert.equal(store.getState().tabs[0].savedContent,tab.savedContent);
    assert.equal(disk,tab.savedContent);
  });
  await test('RC02 failed save, continued editing and retry writes the newest draft', async()=>{
    interceptWrite=()=>Promise.reject(Error('generated permission error'));
    assert.equal(await app.saveFile(),false);change({content:'# Updated after failure\n'});interceptWrite=undefined;
    assert.equal(await app.saveFile(),true);assert.equal(disk,'# Updated after failure\n');assert.equal(store.getState().tabs[0].savedContent,disk);
    assert.equal(globalThis.__errors.length,1);
  });
  await test('RC03 Save As target collision is visible and cannot overwrite the other tab', async()=>{
    store.getState().openTab(globalThis.__savePath,'# Other document\n');store.getState().setActive(tab.id);
    assert.equal(await app.saveFileAs(),false);assert.equal(writes.length,0);assert.equal(globalThis.__errors.length,1);
    assert.equal(store.getState().tabs.find(t=>t.id===tab.id).filePath,tab.filePath);
    assert.equal(store.getState().tabs.find(t=>t.id!==tab.id).content,'# Other document\n');
  });
  await test('RC04 close and choose Save: failed write reports error and leaves document open', async()=>{
    globalThis.__choice='save';interceptWrite=()=>Promise.reject(Error('generated close-save failure'));
    assert.equal(await app.closeActiveTab(),false);assert.equal(store.getState().tabs.length,1);
    assert.equal(store.getState().tabs[0].content,tab.content);assert.equal(globalThis.__errors.length,1);
    interceptWrite=undefined;assert.equal(await app.saveFile(),true);
  });
  await test('RC05 canceled Save As preserves the draft without an error notification', async()=>{
    globalThis.__savePath=null;assert.equal(await app.saveFileAs(),false);
    assert.equal(writes.length,0);assert.deepEqual(globalThis.__errors,[]);assert.equal(store.getState().tabs[0].content,tab.content);
  });
  await test('RC06 command-palette save handles rejection and remains usable for retry', async()=>{
    const unhandled=[];const listener=error=>unhandled.push(error);process.on('unhandledRejection',listener);
    try {
      interceptWrite=()=>Promise.reject(Error('generated command-save failure'));
      app.COMMANDS.find(c=>c.id==='cmd.file.save').run();await tick();await tick();
      assert.deepEqual(unhandled,[]);assert.equal(globalThis.__errors.length,1);
      change({content:'# Command retry\n'});interceptWrite=undefined;
      app.COMMANDS.find(c=>c.id==='cmd.file.save').run();await tick();await tick();assert.equal(disk,'# Command retry\n');
    } finally {process.off('unhandledRejection',listener);}
  });
  await test('RC07 delayed failure while switching tabs does not change either document', async()=>{
    const gate=deferred();interceptWrite=()=>gate.promise;
    const saving=app.saveFile();await tick();store.getState().openTab('/self-created/other.md','# Other\n');
    gate.reject(Error('generated delayed failure'));assert.equal(await saving,false);
    assert.equal(store.getState().tabs.find(t=>t.id===tab.id).content,tab.content);
    assert.equal(store.getState().tabs.find(t=>t.id!==tab.id).content,'# Other\n');assert.equal(globalThis.__errors.length,1);
    store.getState().setActive(tab.id);interceptWrite=undefined;assert.equal(await app.saveFile(),true);
  });
  await test('RC08 automatic failure does not block saving another dirty document', async()=>{
    store.getState().openTab('/self-created/other.md','# Other clean\n');
    const other=store.getState().activeId;store.getState().setContent('# Other dirty\n',other,'command');
    interceptWrite=args=>args.path===tab.filePath?Promise.reject(Error('generated first-file failure')):undefined;
    await app.saveAllDirty();assert.equal(store.getState().tabs.find(t=>t.id===tab.id).savedContent,tab.savedContent);
    assert.equal(store.getState().tabs.find(t=>t.id===other).savedContent,'# Other dirty\n');
    assert.deepEqual(globalThis.__errors,[]);
  });
  console.log(`${passed} recovery groups passed, ${failed} failed`);
  if(failed)process.exitCode=1;
} finally {dom.window.close();fs.rmSync(dir,{recursive:true,force:true});}
