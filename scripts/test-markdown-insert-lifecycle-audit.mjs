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
const {flushSync}=await import('react-dom');
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-insert-lifecycle-audit.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile,closeActiveTab} from './src/lib/fileio';
export {default as EditorHost} from './src/components/EditorHost';
export {default as VisualSlot} from './src/components/MarkdownVisualSlot';
export {getActiveView,captureEditorTarget,insertLink} from './src/lib/editorBridge';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let pm;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{pm=ctx.get(editorViewCtx);});return result;};return editor;};
function Review(){const activeId=store(s=>s.activeId),mode=store(s=>s.markdownMode),theme=store(s=>s.theme);return React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.EditorHost,{activeId,theme,fontSize:14}),activeId&&React.createElement(app.VisualSlot,{key:activeId,tabId:activeId,active:mode==='visual',theme}));}
let serial=0, a, b, passed=0;
const original='before selected after\n\nTail untouched.\n';
const run=async(fn)=>act(async()=>{fn();await pause(30);});
const snapshot=()=>store.getState().tabs.map(t=>[t.id,t.content]);
const content=id=>store.getState().tabs.find(t=>t.id===id)?.content;
async function reset(mode){await act(async()=>root.render(null));a='insert-a-'+ ++serial;b='insert-b-'+serial;store.setState({tabs:[{id:a,filePath:'/generated/'+a+'.md',content:original,savedContent:original},{id:b,filePath:'/generated/'+b+'.md',content:'Other document.\n',savedContent:'Other document.\n'}],activeId:a,language:'en',markdownMode:mode,theme:'light',autoSave:'off'});await act(async()=>{root.render(React.createElement(Review));await pause(140);});await act(async()=>pause(80));}
async function select(){await run(()=>{if(store.getState().markdownMode==='visual'){pm.focus();pm.dispatch(pm.state.tr.setSelection(TextSelection.create(pm.state.doc,8,16)));}else{const cm=app.getActiveView();cm.focus();cm.dispatch({selection:{anchor:7,head:15}});}});}
const tool=kind=>{const label=({link:'Link',image:'Image',table:'Table',codeblock:'Code block'}[kind]);const item=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label||b.getAttribute('aria-label')?.startsWith(label+' ('));assert.ok(item,kind+' toolbar: '+[...document.querySelectorAll('button')].map(b=>b.getAttribute('aria-label')).join(','));return item;};
function setInput(input,value){Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));}
async function open(kind){await select();await run(()=>tool(kind).click());assert.ok(document.querySelector('[role="dialog"]'),kind+' open');if(kind==='link'||kind==='image')await run(()=>setInput(document.querySelectorAll('.md-insert-dialog input')[1],kind==='link'?'https://example.com/self-created':'assets/self-created.png'));}
const submit=()=>run(()=>document.querySelector('.md-insert-dialog form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
const cancel=()=>run(()=>document.querySelector('.md-insert-dialog button[type="button"]')?.click());
const filter=process.env.DEDITOR_TEST_FILTER?new RegExp(process.env.DEDITOR_TEST_FILTER):null;
async function check(name,fn){if(filter&&!filter.test(name))return;await fn();console.log('PASS '+name);passed++;}
try {
await check('insertion and cancel preserve captured selection with one-step history in source/split/visual',async()=>{
 for(const mode of ['source','split','visual'])for(const kind of ['link','image','table','codeblock']){
  await reset(mode);await open(kind);const before=snapshot();await cancel();assert.deepEqual(snapshot(),before,mode+' '+kind+' cancel');
  await open(kind);await submit();assert.equal(!!document.querySelector('.md-insert-dialog'),false,mode+' '+kind+' inserted');assert.notEqual(content(a),original);assert.equal(content(b),'Other document.\n');assert.ok(content(a).includes('Tail untouched.'));await run(()=>app.markdownHistory());assert.equal(content(a),original,mode+' '+kind+' undo');await run(()=>app.markdownHistory(true));assert.notEqual(content(a),original);
 }
});
await check('mode change while link/image/table dialog is open never edits an unintended selection',async()=>{
 for(const mode of ['source','visual'])for(const kind of ['link','image','table']){
  await reset(mode);await open(kind);await run(()=>store.setState({markdownMode:mode==='source'?'visual':'source'}));await act(async()=>pause(180));const before=snapshot();await submit();assert.deepEqual(snapshot(),before,mode+' '+kind+' stale target');assert.ok(document.querySelector('[role="alert"]')||!document.querySelector('.md-insert-dialog'));await cancel();
 }
});
await check('body replacement invalidates captured targets without adding an undo entry',async()=>{
 for(const mode of ['source','visual'])for(const kind of ['link','image','table']){
  await reset(mode);await open(kind);await run(()=>store.getState().setContent('NEW content before selected after\n\nTail untouched.\n',a,'command'));const before=snapshot();await submit();assert.deepEqual(snapshot(),before,mode+' '+kind+' edited target');assert.ok(document.querySelector('[role="alert"]'));await cancel();await run(()=>app.markdownHistory());assert.equal(content(a),original);
 }
});
await check('external content replacement immediately before confirmation cannot be overwritten by a stale view',async()=>{
 for(const mode of ['source','visual'])for(const kind of ['link','image','table']){
  await reset(mode);await open(kind);const fresh='Latest disk content\n';
  await run(()=>{store.getState().setContent(fresh,a,'command');document.querySelector('.md-insert-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  assert.equal(content(a),fresh,mode+' '+kind+' must retain pending source update');await cancel();
 }
});
await check('opening while source sync is pending refuses the old selection, then works after sync',async()=>{
 for(const mode of ['source','visual'])for(const kind of ['link','image','table']){
  await reset(mode);await select();const fresh='before selected after\n\nLatest disk tail.\n';
  await run(()=>{store.getState().setContent(fresh,a,'command');tool(kind).click();});
  assert.equal(!!document.querySelector('.md-insert-dialog'),false,mode+' '+kind+' pending open');assert.equal(content(a),fresh);
  await open(kind);await submit();assert.equal(!!document.querySelector('.md-insert-dialog'),false);assert.ok(content(a).includes('Latest disk tail.'));await run(()=>app.markdownHistory());assert.equal(content(a),fresh);
 }
});
await check('same-event tab/mode/close changes invalidate targets before UI effects run',async()=>{
 for(const mode of ['source','visual'])for(const action of ['switch','close','mode']){
  await reset(mode);await open('link');const fresh=content(a);
  await run(()=>{if(action==='switch')store.getState().setActive(b);else if(action==='close')store.getState().closeTab(a);else store.setState({markdownMode:mode==='source'?'split':'source'});document.querySelector('.md-insert-dialog form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  if(action!=='close')assert.equal(content(a),fresh);assert.equal(content(b),'Other document.\n');await cancel();
 }
});
await check('switching or closing the originating document dismisses insertion without touching the next document',async()=>{
 for(const mode of ['source','visual'])for(const kind of ['link','image','table'])for(const action of ['switch','close']){
  await reset(mode);await open(kind);const staleForm=document.querySelector('form');await run(()=>action==='switch'?store.getState().setActive(b):store.getState().closeTab(a));await act(async()=>pause(120));assert.equal(!!document.querySelector('.md-insert-dialog'),false);const before=snapshot();await run(()=>staleForm.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));assert.deepEqual(snapshot(),before,mode+' '+kind+' '+action);assert.equal(content(b),'Other document.\n');
 }
});
console.log('Passed '+passed+' insertion lifecycle groups');
assert.deepEqual(runtimeErrors,[]);
}finally{MilkdownEditor.make=make;await act(async()=>root.unmount());dom.window.close();}
