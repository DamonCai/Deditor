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
const output=path.resolve('node_modules/.cache/deditor-markdown-tab-switch.mjs');
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
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {setVisualEditor} from './src/lib/markdownVisualBridge';
export {setActiveView} from './src/lib/editorBridge';
export {default as HistoryDialog} from './src/components/MarkdownHistoryDialog';
export {default as VisualSlot} from './src/components/MarkdownVisualSlot';
export {default as VisualHost} from './src/components/MarkdownVisualHost';
export {markdownSession} from './src/lib/markdownSession';
export {flushDocument} from './src/lib/documentFlush';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.split('?')[0].endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let created=0,creationGate;const views=[];
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{views.push(ctx.get(editorViewCtx));created++;});if(creationGate)await creationGate;return result;};return editor;};
const legacy=process.argv.includes('--legacy');
const source=(id,count=2)=>`# ${id} 中文😀\n\n`+Array.from({length:count},(_,i)=>`Paragraph ${i} **bold** [link](https://example.com) 中文内容。\n\n`).join('');
const tab=(id,count=2)=>({id,filePath:`/generated/${id}.md`,content:source(id,count),savedContent:source(id,count)});
let commits=0;
function Harness(){const id=store(s=>s.activeId),mode=store(s=>s.markdownMode);return legacy?React.createElement(app.VisualSlot,{key:id,tabId:id,active:mode==='visual',theme:'light'}):React.createElement(app.VisualHost,{activeId:id,active:mode==='visual',theme:'light'});}
const current=()=>views.find(v=>!v.isDestroyed&&v.dom.closest('[aria-hidden="false"]'));
const text=id=>store.getState().tabs.find(t=>t.id===id)?.content;
async function settle(id){for(let i=0;i<200;i++){await act(async()=>pause(5));if(app.getVisualEditor()?.tabId===id && current()?.editable)return;}throw Error('Editor not ready: '+id);}
async function switchTo(id){const start=performance.now();await act(async()=>store.getState().setActive(id));await settle(id);return performance.now()-start;}
async function setup(tabs){await act(async()=>root.render(null));await act(async()=>{store.setState({tabs,activeId:tabs[0].id,language:'en',markdownMode:'visual',autoSave:'off'});root.render(React.createElement(React.Profiler,{id:'visual-host',onRender:()=>commits++},React.createElement(Harness)));});await settle(tabs[0].id);}
let passed=0;const pass=name=>{passed++;console.log('PASS '+name);};
try {
 for(const count of [10,150,600]){
  await setup([tab('perf-a-'+count,count),tab('perf-b-'+count,count)]);
  const [a,b]=store.getState().tabs.map(t=>t.id);await switchTo(b);await switchTo(a);
  const initial=created,initialCommits=commits,times=[];
  for(let i=0;i<6;i++)times.push(await switchTo(i%2?a:b));
  const sorted=[...times].sort((a,b)=>a-b);
  console.log(JSON.stringify({mode:legacy?'before':'after',paragraphs:count,samples:times.map(n=>+n.toFixed(2)),median:+((sorted[2]+sorted[3])/2).toFixed(2),creations:created-initial,commits:commits-initialCommits,live:views.filter(v=>!v.isDestroyed).length}));
  assert.equal(created-initial,legacy?6:0);
 }
 pass('warm switching across three document sizes');
 if(!legacy&&!process.argv.includes('--perf-only')){
  await setup([tab('a'),tab('b'),{...tab('html'),filePath:'/generated/sample.html'},...Array.from({length:9},(_,i)=>tab('extra'+i))]);
  const a=current(),original=text('a');
  await act(async()=>{a.dispatch(a.state.tr.setSelection(TextSelection.create(a.state.doc,2)));app.getVisualEditor().insert('A edit ',false);});
  const editedA=text('a'),selection=a.state.selection.head;
  const scroll=a.dom.closest('.md-visual-scroll');scroll.scrollTop=123;await act(async()=>scroll.dispatchEvent(new Event('scroll',{bubbles:true})));
  await switchTo('b');await act(async()=>app.getVisualEditor().insert('B edit ',false));const editedB=text('b');
  assert.equal(document.activeElement,current().dom,'switch must transfer native keyboard focus');
  await act(async()=>{a.dom.dispatchEvent(new dom.window.InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}));a.dom.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}));});
  assert.equal(text('a'),editedA,'hidden native responder cannot undo previous tab');assert.equal(text('b'),editedB);
  await switchTo('a');assert.equal(document.activeElement,a.dom);assert.equal(current(),a);assert.equal(a.state.selection.head,selection);assert.equal(scroll.scrollTop,123);
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,editedA);
  await act(async()=>app.markdownHistory());assert.equal(text('a'),original);assert.equal(text('b'),editedB);
  await act(async()=>app.markdownHistory(true));assert.equal(text('a'),editedA);
  pass('independent histories, active save, cursor and scroll');
  await act(async()=>store.setState({markdownMode:'source'}));assert.equal(app.getVisualEditor(),null);
  const replacement='# Replaced in source\n\n新内容😀\n';await act(async()=>store.getState().setContent(replacement,'a','command'));
  await act(async()=>app.flushDocument('a'));assert.equal(text('a'),replacement);
  await act(async()=>store.setState({markdownMode:'visual'}));await settle('a');assert.equal(current(),a);assert.match(a.state.doc.textContent,/新内容/);
  await act(async()=>store.getState().setActive('html'));assert.equal(app.getVisualEditor(),null);assert.equal(document.querySelectorAll('[aria-hidden="false"]').length,0);
  await switchTo('a');assert.equal(current(),a);assert.equal(text('a'),replacement);
  pass('source updates, suspended flush and HTML roundtrip');
  for(let i=0;i<9;i++)await switchTo('extra'+i);
  assert.equal(document.querySelectorAll('.ProseMirror').length,8);assert.equal(a.isDestroyed,true);
  await switchTo('a');assert.notEqual(current(),a);assert.equal(text('a'),replacement);
  await act(async()=>app.markdownHistory());assert.equal(text('a'),editedA);
  await act(async()=>store.setState(s=>({tabs:s.tabs.filter(t=>t.id!=='b')})));assert.equal(document.querySelectorAll('.ProseMirror').length,8);
  pass('bounded eight editors and history after eviction');
  await setup([tab('rapid-a',100),tab('rapid-b',100),tab('rapid-c',100)]);
  await act(async()=>store.getState().setActive('rapid-b'));
  await act(async()=>store.getState().setActive('rapid-c'));await settle('rapid-c');
  await act(async()=>pause(100));assert.equal(app.getVisualEditor().tabId,'rapid-c');assert.equal(current().state.doc.firstChild.textContent,'rapid-c 中文😀');
  const cold=current();await act(async()=>store.setState(s=>({tabs:s.tabs.filter(t=>t.id!=='rapid-c'),activeId:'rapid-a'})));await settle('rapid-a');assert.equal(cold.isDestroyed,true);
  pass('asynchronous initializations and closing active file');
  await act(async()=>root.render(null));const before=created;
  await act(async()=>{store.setState({tabs:[tab('source-only'),{...tab('diff'),diff:{original:'',modified:''}}],activeId:'source-only',markdownMode:'source'});root.render(React.createElement(Harness));});await act(async()=>pause(50));assert.equal(created,before);
  await act(async()=>store.setState({activeId:'diff',markdownMode:'visual'}));await act(async()=>pause(50));assert.equal(created,before);
  await setup([{...tab('empty'),content:'',savedContent:''},tab('nonempty')]);await switchTo('nonempty');await switchTo('empty');
  await act(async()=>app.getVisualEditor().insert('中文😀',false));assert.match(text('empty'),/中文😀/);await act(async()=>app.markdownHistory());assert.equal(text('empty'),'');
  pass('source-only and diff stay lazy; empty Unicode editing');
  const other=document.createElement('button');document.body.append(other);other.focus();
  await setup([tab('focus-a'),tab('focus-b')]);assert.equal(document.activeElement,other,'startup restoration must not steal focus');
  let release;creationGate=new Promise(resolve=>release=resolve);
  document.body.focus();other.blur();await act(async()=>store.getState().setActive('focus-b'));await act(async()=>pause(30));other.focus();
  await act(async()=>{release();creationGate=undefined;await pause(40);});await settle('focus-b');assert.equal(document.activeElement,other,'late editor must respect focus moved elsewhere');
  other.remove();pass('startup and delayed creation respect focus elsewhere');
 }
 assert.equal(runtimeErrors.length,0);console.log(`${passed} tab switching groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.unmount());await pause(100);dom.window.close();fs.rmSync(output,{force:true});}
