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
const output=path.resolve('node_modules/.cache/deditor-markdown-current.mjs');
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
export {renderMarkdown} from './src/lib/markdown';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:store.getState().theme}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}

// All paths/content are generated here; IPC never accesses user files or state.
const setSource = async value => {
 await act(async()=>store.getState().setContent(value,'a','command'));
 await render(false);
 assert.equal(content(),value);
 assert.ok(app.getVisualEditor()?.editable);
};
try {
 for (const [name,value] of [
  ['plain words','AT&T a_b 中文_测试'],
  ['literal entities','&copy; &#65; &unknown;'],
  ['backslashes','a\\_b a\\&b'],
  ['adjacent syntax','_literal_ *literal* [literal]'],
 ]) await test('format/save/history/remount: '+name,async()=>{
  // Insert Markdown through the live bridge, then convert the paragraph to a list.
  await setSource('Start\n');
  await act(async()=>{app.getVisualEditor().navigate(1,1);app.getVisualEditor().insert(value,false);});
  const before=content();
  const renderedBefore=await app.renderMarkdown(before,{theme:'light'});
  await act(async()=>app.getVisualEditor().prefix('- '));
  const after=content();assert.notEqual(after,before);
  const html=await app.renderMarkdown(after,{theme:'light'});
  const template=document.createElement('template');template.innerHTML=html;
  assert.ok(template.content.querySelector('li'),'list conversion');
  const original=document.createElement('template');original.innerHTML=renderedBefore;
  assert.equal(template.content.textContent.trim(),original.content.textContent.trim(),'text preserved by conversion');
  if(name==='plain words')assert.ok(after.includes(value),'readable text');
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,after);
  await act(async()=>app.markdownHistory());assert.equal(content(),before,'single undo');
  await act(async()=>app.markdownHistory(true));assert.equal(content(),after,'redo');
  await act(async()=>root.render(null));await render(false);
  assert.equal(content(),after,'remount keeps serialized source');
 });
 for(const theme of ['light','dark'])await test('whole table move/history: '+theme,async()=>{
  store.setState({theme});
  const value='Before\n\n| Name | Value |\n| :--- | ---: |\n| **AT&T** | a_b |\n| 中文 | [Link](https://example.com) |\n\nAfter\n';
  await setSource(value);
  const beforeTable=document.querySelector('.ProseMirror table').textContent;
  const handle=document.querySelector('.md-table-drag');assert.ok(handle);
  await act(async()=>handle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true})));
  const moved=content();assert.notEqual(moved,value);
  assert.ok(moved.indexOf('After')<moved.indexOf('| Name'),'table follows next paragraph');
  assert.equal(document.querySelector('.ProseMirror table').textContent,beforeTable);
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,moved);
  await act(async()=>app.markdownHistory());assert.equal(content(),value);
  await act(async()=>app.markdownHistory(true));assert.equal(content(),moved);
  await render(true);assert.equal(app.getVisualEditor()?.editable,false);
  const readonlyHandle=document.querySelector('.md-table-drag');
  if(readonlyHandle)await act(async()=>readonlyHandle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true})));
  assert.equal(content(),moved,'readonly does not move');
 });
 await test('save failure preserves dirty source',async()=>{
  await setSource('Generated unsaved text\n');failed=true;
  const before=content(),count=writes.length;
  try{await act(async()=>app.saveFile());}catch{}finally{failed=false;}
  assert.equal(content(),before);assert.equal(writes.length,count);
  assert.notEqual(store.getState().tabs[0].savedContent,before);
 });
 assert.deepEqual(runtimeErrors,[]);
 console.log(`${passed} live component groups passed (isolated IPC, no native acceptance)`);
} finally {
 await act(async()=>root.unmount());dom.window.close();
}
