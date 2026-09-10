import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
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
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-integration.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false;
globalThis.mdInvoke=async(command,args)=>{
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as EditorHost} from './src/components/EditorHost';
export {getActiveView} from './src/lib/editorBridge';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile,saveFileAs,saveAllDirty} from './src/lib/fileio';
export {flushDocument} from './src/lib/documentFlush';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
await render();
await test('round 1: initial render and readonly transitions are exact no-ops',async()=>{assert.equal(content(),source);await render(true);assert.equal(document.querySelector('.ProseMirror').getAttribute('contenteditable'),'false');await render(false);assert.equal(content(),source);});
await test('round 1: DOM text edit synchronously feeds shared source and save',async()=>{
 await act(async()=>{const paragraph=document.querySelector('.ProseMirror > p');paragraph.firstChild.textContent='Edited paragraph';paragraph.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
 assert.equal(content(),source.replace('Original','Edited'));
 await act(async()=>{await app.saveFile();});assert.equal(writes.at(-1).content,content());assert.equal(store.getState().tabs[0].savedContent,content());
});
await test('round 2: source edit and undo update visual document without creating history echoes',async()=>{
 const visual=content();await act(async()=>{store.getState().setContent(visual.replace('Edited','Source'),'a','source');});
 assert.match(document.querySelector('.ProseMirror').textContent,/Source paragraph/);
 await act(async()=>{app.markdownHistory();});assert.equal(content(),visual);
 await act(async()=>{app.markdownHistory();});assert.equal(content(),source);
 await act(async()=>{app.markdownHistory(true);app.markdownHistory(true);});assert.match(content(),/Source paragraph/);
});
await test('round 3: save-as changes Markdown path and rebuilds view without losing edits',async()=>{
 const expected=content();await act(async()=>{await app.saveFileAs();await pause(120);});assert.equal(store.getState().tabs[0].filePath,'/generated/renamed.md');assert.equal(content(),expected);assert.equal(writes.at(-1).content,expected);
});
await test('round 3: save-all writes Markdown and HTML separately',async()=>{
 await act(async()=>{store.getState().setContent(content()+'\nMore','a','source');store.getState().setContent('<h1>Changed</h1>','b');});
 const count=writes.length;await act(async()=>{await app.saveAllDirty();});assert.equal(writes.length-count,2);assert.equal(writes.at(-1).content,'<h1>Changed</h1>');
});
await test('round 4: failed save retains the unsaved Markdown buffer',async()=>{
 await act(async()=>{store.getState().setContent(content()+'\nUnsaved','a','source');});const expected=content();failed=true;
 await act(async()=>{await assert.rejects(app.saveFile(), /generated disk failure/);});failed=false;assert.equal(content(),expected);assert.notEqual(store.getState().tabs[0].savedContent,expected);
});
await test('round 5: visual toolbar toggles and converts lists through shared history',async()=>{
 await act(async()=>store.getState().setContent('plain\n','a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,2);app.getVisualEditor().prefix('- ');});
 assert.match(content(),/^[-*] plain/);
 await act(async()=>app.getVisualEditor().prefix('1. '));assert.match(content(),/^1[.)] plain/);
 await act(async()=>app.getVisualEditor().prefix('1. '));assert.equal(content().trim(),'plain');
 await act(async()=>app.markdownHistory());assert.match(content(),/^1[.)] plain/);
});
await test('round 5: readonly empty code block cannot insert a paragraph with ArrowDown',async()=>{
 const codeSource='# Code\n\n```\n\n```\n';
 await act(async()=>store.getState().setContent(codeSource,'a','command'));await render(true);
 await act(async()=>{document.querySelector('.md-code-block .cm-content').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));});
 assert.equal(content(),codeSource);await render(false);
});
await test('round 5: table Tab navigates and appends an editable empty row',async()=>{
 const tableSource='# Table\n\n| A | B |\n| --- | --- |\n| one | two |\n';
 await act(async()=>store.getState().setContent(tableSource,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(6,10);});
 await act(async()=>{document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));});
 assert.equal(document.querySelectorAll('.ProseMirror tr').length,3);
 assert.doesNotMatch(content(),/<br/);
 await render(true);await render(false);assert.equal(document.querySelectorAll('.ProseMirror tr').length,3);
 await act(async()=>app.markdownHistory());assert.equal(content(),tableSource);
});
await test('round 4: unmount/remount retains content and history',async()=>{
 const expected=content();await act(async()=>{root.render(null);});assert.equal(app.getVisualEditor(),null);await render();assert.equal(content(),expected);await act(async()=>app.markdownHistory());assert.notEqual(content(),expected);
});
function RetainedEditors() {
 const activeId=store(s=>s.activeId),mode=store(s=>s.markdownMode);
 const visual=activeId==='a' && ['visual','read'].includes(mode);
 return React.createElement(React.Fragment,null,
  React.createElement('div',{style:{display:visual?'none':'block'}},React.createElement(app.EditorHost,{activeId,theme:'light',fontSize:14})),
  visual?React.createElement(app.Visual,{tabId:'a',readonly:mode==='read',theme:'light'}):null);
}
await test('round 5: retained source editor relinquishes commands to visual mode and shares native undo events',async()=>{
 await act(async()=>{root.render(null);store.setState({activeId:'a',markdownMode:'visual'});store.getState().setContent('# Retained\n\nbody\n','a','command');});
 await act(async()=>{root.render(React.createElement(RetainedEditors));await pause(120);});
 assert.equal(app.getActiveView(),null);assert.equal(app.getVisualEditor().tabId,'a');
 const before=content();await act(async()=>{app.getVisualEditor().navigate(3,5);app.getVisualEditor().insert(' visual',false);});
 const visual=content();assert.notEqual(visual,before);
 await act(async()=>store.setState({markdownMode:'source'}));
 assert.equal(app.getVisualEditor(),null);const view=app.getActiveView();assert.equal(view.state.doc.toString(),visual);
 await act(async()=>view.dispatch({changes:{from:view.state.doc.length,insert:' source'}}));
 const undo=()=>view.contentDOM.dispatchEvent(new dom.window.InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}));
 await act(async()=>undo());assert.equal(content(),visual);
 await act(async()=>undo());assert.equal(content(),before);assert.equal(view.state.doc.toString(),before);
});
await test('round 5: HTML retained editor keeps its own undo while Markdown source is hidden',async()=>{
 const markdown=content();await act(async()=>store.setState({activeId:'b',markdownMode:'read'}));
 const html=store.getState().tabs.find(t=>t.id==='b').content,view=app.getActiveView();assert.ok(view);assert.equal(app.getVisualEditor(),null);
 await act(async()=>view.dispatch({changes:{from:view.state.doc.length,insert:'<p>independent</p>'}}));
 const {undo}=await import('@codemirror/commands');await act(async()=>undo(view));
 assert.equal(store.getState().tabs.find(t=>t.id==='b').content,html);assert.equal(content(),markdown);
 await act(async()=>{store.setState({activeId:'a',markdownMode:'visual'});await pause(120);});
 assert.equal(app.getActiveView(),null);assert.equal(content(),markdown);assert.equal(app.getVisualEditor().tabId,'a');
});
await act(async()=>root.unmount());assert.deepEqual(runtimeErrors,[]);dom.window.close();console.log(`${passed} integration tests passed`);
