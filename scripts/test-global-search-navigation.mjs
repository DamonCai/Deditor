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
 '@tauri-apps/api/event':'export const listen=async()=>()=>{};',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as FindInFiles} from './src/components/FindInFiles';
export {default as EditorGroups} from './src/components/EditorGroups';
export {default as EditorSlot} from './src/components/EditorSlot';
export {getActiveView} from './src/lib/editorBridge';
export {highlightSourceHit} from './src/lib/previewSearch';
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
   React.createElement(app.EditorGroups,{initialPreviewPct:50}),
   open && React.createElement(app.FindInFiles,{open,onClose:()=>setOpen(false)}));
}
const run=async(fn,ms=40)=>{await act(async()=>{fn();await pause(ms);});};
const waitFor=async(fn,timeout=5000)=>{const start=Date.now();while(!fn()){assert.ok(Date.now()-start<timeout,'timed out waiting for editor/result');await run(()=>{},30);}};
async function reset(mode='visual',delay=0){
 await run(()=>root.render(null)); startupDelay=delay;
 store.setState({tabs:[],activeId:null,panes:null,activePane:'left',language:'en',markdownMode:mode,csvMode:'source',showPreview:false,previewMaximized:false,autoSave:'off',workspaces:['/generated']});
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
 await test('Audit: preview mapping preserves token spans and avoids source-only or Unicode offset mistakes',async()=>{
  await reset();
  const preview=document.createElement('div');
  preview.innerHTML='<pre data-line="1"><code><span>const </span><span>target</span><span> = 1;</span>\n</code></pre>';
  assert.equal(app.highlightSourceHit(preview,'```target\nconst target = 1;\n```',2,7,6).map(x=>x.textContent).join(''),'target');
  preview.innerHTML='<p data-line="1"><strong>İ中</strong><em>文目标</em></p>';
  assert.equal(app.highlightSourceHit(preview,'**İ中**文目标',1,7,3).map(x=>x.textContent).join(''),'文目标');
  preview.innerHTML='<p data-line="1"><a href="target">label</a> target target</p>';
  assert.deepEqual(app.highlightSourceHit(preview,'[label](target) target target',1,9,6),[],'a hidden URL must not highlight a different visible occurrence');
 });
 await test('Actual panes: search a never-opened code file from an existing focused reading tab',async()=>{
  files={'/generated/starter.md':'# Open document\n\nCurrent paragraph\n','/generated/new.md':'before\n\n```sh\nopenclaw onboard --flow quickstart\n```\n\nafter\n'};await reset();await run(()=>store.getState().openTab('/generated/starter.md',files['/generated/starter.md']));
  await waitFor(()=>app.getVisualEditor()?.tabId===store.getState().activeId);await run(()=>app.getVisualEditor().focus());
  await search('quickstart');await hit();await waitFor(()=>app.getVisualEditor()?.tabId===store.getState().activeId);await run(()=>{},300);
  assert.equal(app.getVisualEditor().selected,'quickstart');assert.equal(window.getSelection().toString(),'quickstart');
  assert.ok(document.querySelector('[data-search-current]'),'reading code has a persistent search highlight');
  await run(()=>document.activeElement.blur());assert.ok(document.querySelector('[data-search-current]'),'code highlight survives blur/collapse');
 });
 await test('Round 1: first-open reading result survives startup longer than 120 frames',async()=>{
  files={'/generated/slow.md':'# Generated\n\n😀 prefix 定位目标 suffix\n'};await reset('visual',2400);await search('定位目标');await hit();
  await waitFor(()=>app.getVisualEditor()?.tabId===store.getState().activeId);await run(()=>{},150);
  assert.equal(app.getVisualEditor().selected,'定位目标');assert.equal(window.getSelection().toString(),'定位目标');
  assert.equal(document.querySelector('.preview-search-match.current')?.textContent,'定位目标','new reading document paints the match');
  await run(()=>window.getSelection().removeAllRanges());assert.equal(document.querySelector('.preview-search-match.current')?.textContent,'定位目标','native selection loss does not clear painted match');
  await run(()=>document.querySelector('.ProseMirror').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('.preview-search-match.current'),null,'manual document interaction clears navigation highlight');
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
 await test('Audit: split preview paints the requested repeated code occurrence',async()=>{
  files={'/generated/split.md':'before target\n\n```js\nconst target = 1;\nconst target = 2;\n```\n'};await reset('split');await search('target');await hit(2);
  await waitFor(()=>app.getActiveView()?.state.selection.main.from===files['/generated/split.md'].lastIndexOf('target'));
  await run(()=>{},500);
  const mark=document.querySelector('.preview .preview-search-match.current');
  assert.equal(mark?.textContent,'target','split preview must paint the result');
  assert.equal(mark.closest('.line').textContent,'const target = 2;','only requested code line is marked');
  await run(()=>store.setState({theme:'dark'}));await waitFor(()=>document.querySelector('.preview .preview-search-match.current')?.textContent==='target');
  await run(()=>app.getActiveView().dom.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('.preview .preview-search-match.current'),null,'manual editing clears preview marker');
  await search('target');await hit(2);await waitFor(()=>document.querySelector('.preview .preview-search-match.current'));
  await run(()=>app.getActiveView().dom.dispatchEvent(new window.WheelEvent('wheel',{deltaY:100,bubbles:true})));
  assert.equal(document.querySelector('.preview .preview-search-match.current'),null,'manual source scrolling releases centering');
 });
 await test('Audit: HTML and CSV reading results reveal source, including attributes and escaped cells',async()=>{
  for (const [ext,source] of [['html','<main data-test="attribute-target">visible content</main>'],['csv','name,value\nrow,"quoted ""cell-target"""\n']]) {
   files={[`/generated/new.${ext}`]:source};await reset();await run(()=>store.setState({showPreview:true,previewMaximized:true,csvMode:'read'}));
   const query=ext==='html'?'attribute-target':'cell-target';await search(query);await hit();
   await waitFor(()=>app.getActiveView()?.state.sliceDoc(app.getActiveView().state.selection.main.from,app.getActiveView().state.selection.main.to)===query);
   assert.equal(app.getActiveView().dom.closest('[style*="display: none"]'),null,'source result is visible');
   assert.equal(ext==='html'?store.getState().previewMaximized:store.getState().csvMode,ext==='html'?false:'split');
   await search(query);await hit(0,'Enter');assert.equal(store.getState().tabs.length,1);
  }
 });
 await test('Audit: plain text and first/last-line Unicode results',async()=>{
  files={'/generated/plain.txt':'首行😀目标\nsecond\n末行目标'};await reset();await search('首行😀目标');await hit();
  await waitFor(()=>app.getActiveView()?.state.selection.main.from===0 && app.getActiveView()?.state.selection.main.to===6);
  await search('末行目标');await hit();await waitFor(()=>app.getActiveView()?.state.selection.main.to===files['/generated/plain.txt'].length);
 });
 await test('Audit: right-pane reading result does not steal the left source selection',async()=>{
  files={'/generated/shared.md':'left content\n','/generated/right.md':'# Heading\n\n| Name | Value |\n| --- | --- |\n| 数据 | 中文目标 |\n'};await reset('source');
  await run(()=>store.getState().openTab('/generated/shared.md',files['/generated/shared.md']));await waitFor(()=>app.getActiveView());
  const left=app.getActiveView();await run(()=>left.dispatch({selection:{anchor:0,head:4}}));
  await run(()=>store.getState().splitRight());await run(()=>store.setState({markdownMode:'visual'}));await waitFor(()=>app.getVisualEditor());
  await search('中文目标');await hit();await waitFor(()=>app.getVisualEditor()?.selected==='中文目标');
  assert.equal(store.getState().activePane,'right');assert.equal(left.state.selection.main.to,4);
  assert.equal(document.querySelector('[data-editor-pane="right"] .preview-search-match.current')?.textContent,'中文目标');
  assert.equal(document.querySelector('[data-editor-pane="left"] .preview-search-match.current'),null);
  await run(()=>store.setState({markdownMode:'split'}));await waitFor(()=>app.getActiveView()?.state.doc.toString()===files['/generated/right.md']);
  await search('中文目标');await hit();await waitFor(()=>document.querySelector('[data-editor-pane="right"] .preview .preview-search-match.current'));
  assert.equal(document.querySelector('[data-editor-pane="left"] .preview-search-match.current'),null);
  await run(()=>store.getState().activatePane('left'));assert.equal(document.querySelector('.preview .preview-search-match.current'),null,'switching focus retires the preview navigation');
 });
} finally {await run(()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} global search navigation groups`);
