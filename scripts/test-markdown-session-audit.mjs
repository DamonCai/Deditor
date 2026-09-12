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
const output=path.resolve('node_modules/.cache/deditor-markdown-session-audit.mjs');
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
export {flushDocument} from './src/lib/documentFlush';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.split('?')[0].endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;await fn();passed++;console.log('PASS '+name);}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};
const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent===text);
const fixtureEntry={id:'saved-one',path:'/generated/a.md',timestamp:1000,draft:false,bytes:20};
const renderHistory=async()=>{await act(async()=>{root.render(React.createElement(app.HistoryDialog,{tabId:'a',onClose:()=>{}}));await pause(40);});};
try {
 await test('K01 loading toolbar does not expose history buttons that ignore clicks',async()=>{
  await act(async()=>{root.render(null);store.getState().setContent('Changed before mount\n','a','command');app.setVisualEditor(null);app.setActiveView(null);root.render(React.createElement(app.Toolbar));});
  assert.equal(document.querySelector('[aria-label="Undo"]').disabled,true,'Undo must reflect the unavailable editing bridge');
  await act(async()=>app.markdownHistory());assert.equal(document.querySelector('[aria-label="Redo"]').disabled,true,'Redo must reflect the unavailable editing bridge');await act(async()=>root.render(null));
 });
 await test('K05 switching to a failed draft listing never leaves saved versions selectable',async()=>{
  const previous=globalThis.mdInvoke;globalThis.mdInvoke=async(command,args)=>{if(command==='list_markdown_history'){if(args.path===null)throw Error('Draft read unavailable');return [fixtureEntry];}return previous(command,args);};
  try{await renderHistory();assert.equal(document.querySelectorAll('.md-history-list button').length,1);await act(async()=>{button('Recover drafts').click();await pause(30);});assert.match(document.querySelector('[role=alert]').textContent,/Draft read unavailable/);assert.equal(document.querySelectorAll('.md-history-list button').length,0,'Saved versions must not remain in failed draft listing');}finally{globalThis.mdInvoke=previous;await act(async()=>root.render(null));}
 });
 await test('K05 draft copy never overwrites current text and only matching document may restore',async()=>{
  const original='# Current\n';await reset(original);await act(async()=>root.render(null));const previous=globalThis.mdInvoke;
  globalThis.mdInvoke=async(command,args)=>{if(command==='list_markdown_history')return args.path===null?[{...fixtureEntry,id:'draft-other',path:'/generated/other.md',draft:true}, {...fixtureEntry,id:'draft-current',draft:true}]:[fixtureEntry];if(command==='read_markdown_history')return args.id==='draft-other'?'# Other draft\n':'# Current draft\n';return previous(command,args);};
  try{await renderHistory();await act(async()=>{button('Recover drafts').click();await pause(20);});await act(async()=>{document.querySelector('.md-history-list button').click();await pause(20);});assert.equal(button('Restore in editor (undoable)').disabled,true);assert.equal(document.querySelector('textarea').value,'# Other draft\n');await act(async()=>button('Open as new document').click());const opened=store.getState().tabs.find(t=>t.id===store.getState().activeId);assert.equal(opened.content,'# Other draft\n');assert.equal(opened.filePath,null);assert.equal(content(),original);
  }finally{globalThis.mdInvoke=previous;await act(async()=>{root.render(null);store.setState({activeId:'a'});});}
 });
 await test('K01/K03 histories stay isolated after repeated tab remount and mode suspension',async()=>{
  const baseA='Before A\n\nBody A\n',baseB='Before B\n\nBody B\n';await act(async()=>root.render(null));store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:baseA,savedContent:baseA},{id:'b',filePath:'/generated/b.md',content:baseB,savedContent:baseB}],activeId:'a'});
  const mount=async(id,active=true)=>{await act(async()=>{store.setState({activeId:id});root.render(React.createElement(app.Visual,{key:id,tabId:id,active,theme:'light'}));await pause(140);});await act(async()=>pause(50));};
  await mount('a');await act(async()=>app.getVisualEditor().insert('A edit ',false));const aEdited=content();await mount('b');await act(async()=>app.getVisualEditor().insert('B edit ',false));const bEdited=store.getState().tabs.find(t=>t.id==='b').content;
  for(let cycle=0;cycle<5;cycle++){for(const id of ['a','b']){await mount(id);const pm=document.querySelector('.ProseMirror');await mount(id,false);assert.equal(app.getVisualEditor(),null);await mount(id,true);assert.equal(document.querySelector('.ProseMirror'),pm);assert.equal(store.getState().tabs.find(t=>t.id===id).content,id==='a'?aEdited:bEdited);}}
  await act(async()=>app.markdownHistory(false,'b'));assert.equal(store.getState().tabs.find(t=>t.id==='b').content,baseB);assert.equal(content(),aEdited);await mount('a');await act(async()=>app.markdownHistory(false,'a'));assert.equal(content(),baseA);await act(async()=>app.markdownHistory(true,'a'));assert.equal(content(),aEdited);assert.equal(store.getState().tabs.find(t=>t.id==='b').content,baseB);await mount('b');await act(async()=>app.markdownHistory(true,'b'));assert.equal(store.getState().tabs.find(t=>t.id==='b').content,bEdited);assert.equal(content(),aEdited);
 });
 await test('K05 late list and preview responses cannot overwrite the active history category',async()=>{
  await act(async()=>root.render(null));const previous=globalThis.mdInvoke;let releaseList,releaseRead,first=true;
  globalThis.mdInvoke=async(command,args)=>{if(command==='list_markdown_history'){if(first){first=false;return new Promise(resolve=>releaseList=resolve);}return args.path===null?[{...fixtureEntry,id:'other-draft',path:'/generated/other.md',draft:true}]:[fixtureEntry];}if(command==='read_markdown_history')return new Promise(resolve=>releaseRead=resolve);return previous(command,args);};
  try{await renderHistory();await act(async()=>{button('Recover drafts').click();await pause(20);});await act(async()=>{releaseList([fixtureEntry]);await pause(20);});assert.match(document.querySelector('.md-history-list button').textContent,/other.md/);await act(async()=>{document.querySelector('.md-history-list button').click();await pause(20);});await act(async()=>{button('Document versions').click();await pause(20);});await act(async()=>{releaseRead('# Stale draft\n');await pause(20);});assert.equal(document.querySelector('textarea').value,'');assert.equal(button('Open as new document').disabled,true);assert.equal(button('Restore in editor (undoable)').disabled,true);assert.match(document.querySelector('.md-history-list button').textContent,/generated\/a.md/);}finally{globalThis.mdInvoke=previous;await act(async()=>root.render(null));}
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} session audit groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
