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
const output=path.resolve('node_modules/.cache/deditor-markdown-sequence-session.mjs');
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
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'})));await pause(120);});};
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

const range=async(text,start,end)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+start,at+end)));await pause(20);});};
const run=async(fn)=>act(async()=>{fn();await pause(40);});
const button=label=>{const item=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label || b.getAttribute('aria-label')?.startsWith(label+' ('));assert.ok(item,label);return item;};

const input=async(index,value)=>run(()=>{const el=document.querySelectorAll('[role="search"] input')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const searchButton=text=>{const b=[...document.querySelectorAll('[role="search"] button')].find(b=>b.textContent===text);assert.ok(b,text);return b;};
const count=()=>document.querySelector('[role="search"]').textContent;
const open=async()=>run(()=>app.getVisualEditor().find());

const close=async()=>run(()=>{const field=document.activeElement;assert.ok(field===document.querySelector('[role="search"] input'),'replace must keep a usable search field focused so Escape still works');field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});
const type=async(text)=>run(()=>view.dispatch(view.state.tr.insertText(text)));
try {
await test('SH01 remove the only match, Escape and type at its former position',async()=>{
 const original='before TARGET after\n\nTail unchanged.\n';await reset(original);await open();await input(0,'TARGET');await input(1,'');await run(()=>(searchButton('Replace current').focus(),searchButton('Replace current').click()));assert.equal(content(),'before  after\n\nTail unchanged.\n');await close();assert.equal(document.activeElement,view.dom);await type('NEW');assert.equal(content(),'before NEW after\n\nTail unchanged.\n');await exactHistory('before  after\n\nTail unchanged.\n');
});
await test('SH02 replace code content and undo keeps the fence and following paragraph',async()=>{
 const original='```js\nlet TARGET = 1;\n```\n\nTail unchanged.\n';await reset(original);await open();await input(0,'TARGET');await input(1,'renamed');await run(()=>(searchButton('Replace current').focus(),searchButton('Replace current').click()));assert.equal(content(),'```js\nlet renamed = 1;\n```\n\nTail unchanged.\n');await close();await exactHistory(original);
});
await test('SH03 empty a matched table cell, Escape and type in that same cell',async()=>{
 const original='| Head | Other |\n| --- | --- |\n| TARGET | stable |\n\nTail unchanged.\n';await reset(original);await open();await input(0,'TARGET');await input(1,'');await run(()=>(searchButton('Replace current').focus(),searchButton('Replace current').click()));const blank=content();await close();assert.equal(view.state.selection.$from.parent.type.name,'paragraph');await type('NEW');assert.ok(content().includes('NEW'));assert.equal(view.state.selection.$from.parent.textContent,'NEW');assert.ok(content().includes('stable'));assert.ok(content().endsWith('Tail unchanged.\n'));await exactHistory(blank);
});
await test('SH04 Replace All, undo, redo, Escape and continue without reselecting a stale match',async()=>{
 const original='TARGET one\n\nTARGET two\n\nTail unchanged.\n';await reset(original);await open();await input(0,'TARGET');await input(1,'');await run(()=>(searchButton('Replace All').focus(),searchButton('Replace All').click()));const edited=content();await run(()=>app.markdownHistory());assert.equal(content(),original);await run(()=>app.markdownHistory(true));assert.equal(content(),edited);await close();assert.ok(view.state.selection.empty);const before=view.state.selection.from;await type('NEW');assert.equal(view.state.selection.from,before+3);assert.equal((content().match(/NEW/g)||[]).length,1);assert.ok(content().endsWith('Tail unchanged.\n'));await exactHistory(edited);
});
await test('SH05 suspend reading, externally edit source, resume, undo and continue at restored caret',async()=>{
 const original='before body after\n\nTail unchanged.\n';await reset(original);await select('before body after',7);await type('X');const first=content();
 await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',active:false,theme:'light'}));await pause(80);});
 await run(()=>store.getState().setContent(first.replace('Tail','Source tail'),'a','command'));
 await render();await run(()=>app.markdownHistory());assert.equal(content(),first);const before=view.state.selection.from;await type('Y');assert.equal(view.state.selection.from,before+1);assert.ok(!content().includes('Source tail'));await exactHistory(first);
});
await test('SH06 tab roundtrip, undo and continued editing never change the other document',async()=>{
 const original='before body after\n\nTail unchanged.\n';await reset(original);await select('before body after',7);await type('X');await run(()=>store.getState().setContent('Other edited\n','b','command'));await act(async()=>{root.render(null);store.setState({activeId:'b'});});await act(async()=>pause(20));await act(async()=>store.setState({activeId:'a'}));await render();await run(()=>app.markdownHistory());assert.equal(content(),original);await type('Y');assert.equal(store.getState().tabs.find(t=>t.id==='b').content,'Other edited\n');assert.ok(content().includes('Y'));await exactHistory(original);
});
} finally {MilkdownEditor.make=make;await act(async()=>root.unmount());window.close();}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} session sequence groups`);
