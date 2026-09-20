import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url:'http://localhost', pretendToBeVisual:true });
for (const key of ['window','Window','document','Node','NodeFilter','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLDivElement','Element','Text','SVGElement','MutationObserver','DOMParser','DOMRect','Event','CustomEvent','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
for (const key of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) globalThis[key]=dom.window[key].bind(dom.window);
globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
globalThis.IntersectionObserver=class{observe(){} unobserve(){} disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
HTMLElement.prototype.scrollIntoView=function(){};
HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// React DOM must detect the installed DOM before choosing its input event implementation.
const {createRoot}=await import('react-dom/client');
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-global-search-navigation.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as FindInFiles} from './src/components/FindInFiles';
export {default as EditorSlot} from './src/components/EditorSlot';
export {getActiveView} from './src/lib/editorBridge';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {Editor:MilkdownEditor}=await import('@milkdown/kit/core');
const make=MilkdownEditor.make;
let startupDelay=0;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{await pause(startupDelay);return create();};return editor;};
let files={}, openSearch;
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_text_file') {if(!(args.path in files))throw Error('generated missing file');return files[args.path];}
 if(command==='find_in_files')return {hits:Object.entries(files).flatMap(([path,source])=>source.split('\n').flatMap((text,index)=>{const col=text.indexOf(args.query);return col<0?[]:[{path,text,line:index+1,col:col+1}];})),truncated:false,files_scanned:Object.keys(files).length};
};
function Harness(){
 const [open,setOpen]=React.useState(false);openSearch=()=>setOpen(true);
 const id=store(s=>s.activeId), mode=store(s=>s.markdownMode);
 return React.createElement(React.Fragment,null,
   id && (mode==='visual'?React.createElement(app.Visual,{key:id,tabId:id,active:true,theme:'light'}):React.createElement(app.EditorSlot,{key:id,tabId:id,active:true,theme:'light',fontSize:14})),
   open && React.createElement(app.FindInFiles,{open,onClose:()=>setOpen(false)}));
}
const run=async(fn,ms=40)=>{await act(async()=>{fn();await pause(ms);});};
const waitFor=async(fn,timeout=5000)=>{const start=Date.now();while(!fn()){assert.ok(Date.now()-start<timeout,'timed out waiting for editor/result');await run(()=>{},30);}};
async function reset(mode='visual',delay=0){
 await run(()=>root.render(null)); startupDelay=delay;
 store.setState({tabs:[],activeId:null,panes:null,activePane:'left',language:'en',markdownMode:mode,autoSave:'off',workspaces:['/generated']});
 await run(()=>root.render(React.createElement(Harness)));
}
async function search(query){
 await run(()=>openSearch());
 await run(()=>{const field=document.querySelector('[role=dialog] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,query);field.dispatchEvent(new Event('input',{bubbles:true}));},350);
 await waitFor(()=>document.querySelector('[role=dialog] [role=button]'));
}
async function hit(index=0,key){await run(()=>{const item=document.querySelectorAll('[role=dialog] [role=button]')[index];if(key)item.dispatchEvent(new window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));else item.click();});}
let passed=0;
async function test(name,fn){await fn();assert.equal(store.getState().tabs.every(tab=>tab.content===files[tab.filePath]),true,'source stays exact');passed++;console.log('PASS '+name);}
try {
 await test('Round 1: first-open reading result survives startup longer than 120 frames',async()=>{
  files={'/generated/slow.md':'# Generated\n\n😀 prefix 定位目标 suffix\n'};await reset('visual',2400);await search('定位目标');await hit();
  await waitFor(()=>app.getVisualEditor()?.tabId===store.getState().activeId);await run(()=>{},150);
  assert.equal(app.getVisualEditor().selected,'定位目标');assert.equal(window.getSelection().toString(),'定位目标');
 });
 await test('Round 2: new Unicode/code result and already-open result via Enter/Space',async()=>{
  files={'/generated/code.md':'before\n\n```js\nconst value = "😀定位目标";\n```\n\nafter\n'};await reset();await search('😀定位目标');await hit(0,'Enter');
  await waitFor(()=>app.getVisualEditor()?.selected==='😀定位目标');await run(()=>{},80);assert.equal(window.getSelection().toString(),'😀定位目标');
  await search('value');await hit(0,' ');await waitFor(()=>app.getVisualEditor()?.selected==='value');assert.equal(store.getState().tabs.length,1);
 });
 await test('Round 3: leaving a pending document prevents its late search from stealing selection',async()=>{
  files={'/generated/slow.md':'slow target\n','/generated/other.md':'other content\n'};await reset('visual',2400);await search('target');await hit();
  startupDelay=0;await run(()=>store.getState().openTab('/generated/other.md',files['/generated/other.md']));
  await waitFor(()=>app.getVisualEditor()?.tabId===store.getState().activeId);await run(()=>{},2600);
  assert.equal(app.getVisualEditor().selected,'');assert.equal(store.getState().tabs.find(t=>t.id===store.getState().activeId).filePath,'/generated/other.md');
 });
 await test('Round 3b: a new search supersedes the pending match in the same initializing document',async()=>{
  files={'/generated/research.md':'first target\n\nsecond result\n'};await reset('visual',2400);await search('target');await hit();
  await search('result');await hit();await waitFor(()=>app.getVisualEditor()?.selected==='result');await run(()=>{},100);
  assert.equal(window.getSelection().toString(),'result');assert.equal(store.getState().tabs.length,1);
 });
 await test('Round 4: new and already-open source documents select exact matches',async()=>{
  files={'/generated/source.md':'first\n\n😀 prefix 定位目标 suffix\n'};await reset('source');await search('定位目标');await hit();
  await waitFor(()=>app.getActiveView()?.state.sliceDoc(app.getActiveView().state.selection.main.from,app.getActiveView().state.selection.main.to)==='定位目标');
  await search('prefix');await hit(0,'Enter');await waitFor(()=>app.getActiveView()?.state.sliceDoc(app.getActiveView().state.selection.main.from,app.getActiveView().state.selection.main.to)==='prefix');
 });
} finally {await run(()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} global search navigation groups`);
