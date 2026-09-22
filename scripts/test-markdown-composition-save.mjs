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
const output=path.resolve('node_modules/.cache/deditor-markdown-composition-save.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file')writes.push(args);
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
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='Body\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const failedCases=[];
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failedCases.push(name);console.error('FAIL '+name+'\n'+error.stack);}}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

// Synthetic composition drives the real DOM observer and save implementation.
// These regressions do not claim native input-method or candidate-window acceptance.
const startComposition=async()=>act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
const candidate=async(text,finish=false)=>act(async()=>{
 const p=view.dom.querySelector('p');p.firstChild.textContent=text;window.getSelection().collapse(p.firstChild,text.length);
 p.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertCompositionText',isComposing:!finish,bubbles:true}));
 if(finish)view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{data:text.slice(4),bubbles:true}));
 await pause(finish?80:30);
});
try {
 await test('manual save during active composition preserves candidate and subsequent single history',async()=>{
  await reset('Body\n');await select('Body');await startComposition();await candidate('Bodyni');
  assert.equal(view.composing,true);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,'Bodyni\n');
  await candidate('Body你好',true);assert.equal(content(),'Body你好\n');
  assert.equal(store.getState().tabs.find(t=>t.id==='a').savedContent,'Bodyni\n');
  await exactHistory('Body\n');
 });
 await test('pending native write preserves later composition replacement as dirty',async()=>{
  await reset('Body\n');await select('Body');await startComposition();await candidate('Bodyni');
  const invoke=globalThis.mdInvoke;let resume,started;const issued=new Promise(r=>started=r);const gate=new Promise(r=>resume=r);
  globalThis.mdInvoke=async(command,args)=>{if(command==='write_text_file'){started(args);await gate;}return invoke(command,args);};
  let saving;try{
   await act(async()=>{saving=app.saveFile();await Promise.race([issued,pause(1500).then(()=>{throw new Error('write was not issued');})]);});
   await candidate('Body你好',true);resume();await act(async()=>assert.equal(await saving,false));
   assert.equal(content(),'Body你好\n');assert.equal(writes.at(-1).content,'Bodyni\n');
   assert.equal(store.getState().tabs.find(t=>t.id==='a').savedContent,'Bodyni\n');
  }finally{resume?.();globalThis.mdInvoke=invoke;}
  await exactHistory('Body\n');
 });
 await test('save then cancelled composition restores source without hidden committed candidate',async()=>{
  await reset('Body\n');await select('Body');await startComposition();await candidate('Bodyni');
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,'Bodyni\n');
  await candidate('Body',true);assert.equal(content(),'Body\n');
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,'Body\n');
  await act(async()=>root.render(null));await render();assert.equal(content(),'Body\n');
 });
 await test('final composition mutation is included by save in the same task',async()=>{
  await reset('Body\n');await select('Body');await startComposition();await candidate('Bodyni');
  await act(async()=>{
   const p=view.dom.querySelector('p');p.firstChild.textContent='Body你好';window.getSelection().collapse(p.firstChild,6);
   p.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertCompositionText',isComposing:false,bubbles:true}));
   view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{data:'你好',bubbles:true}));
   await app.saveFile();await pause(80);
  });
  assert.equal(content(),'Body你好\n');assert.equal(writes.at(-1).content,'Body你好\n');await exactHistory('Body\n');
 });
} finally {await act(async()=>root.unmount());dom.window.close();}
assert.equal(runtimeErrors.length,0);assert.deepEqual(failedCases,[]);console.log(`Passed ${passed} composition save groups`);
