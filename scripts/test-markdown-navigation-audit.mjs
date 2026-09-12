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
const output=path.resolve('node_modules/.cache/deditor-markdown-navigation-audit.mjs');
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
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'})));await act(async()=>pause(180));};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;await fn();passed++;console.log('PASS '+name);}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view, editorContext;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);editorContext=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original,steps=1)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory());assert.equal(content(),original);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};


const listItems=()=>{const result=[];view.state.doc.descendants((n,pos)=>{if(n.type.name==='list_item')result.push({text:n.firstChild.textContent,pos,depth:view.state.doc.resolve(pos+1).depth});});return result;};
const baseline='Before\n\n- first\n- second\n- third\n\nAfter\n';
try {
 await test('E03 second item Tab nests under previous item and Shift Tab reverses without losing text',async()=>{
  await reset(baseline);await select('second');await key('Tab');assert.deepEqual(listItems().map(n=>[n.text,n.depth]),[['first',2],['second',4],['third',2]]);await exactHistory(baseline);
  await select('second');const before=content();await key('Tab',{shiftKey:true});assert.deepEqual(listItems().map(n=>[n.text,n.depth]),[['first',2],['second',2],['third',2]]);await exactHistory(before);
 });
 await test('E03 first item Tab is a no-op; multi-item selection nests and lifts together',async()=>{
  await reset(baseline);await select('first');await key('Tab');assert.equal(content(),baseline);
  let from,to;view.state.doc.descendants((n,p)=>{if(n.isTextblock&&n.textContent==='second')from=p+1;if(n.isTextblock&&n.textContent==='third')to=p+1+n.content.size;});await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,to))));await key('Tab');assert.deepEqual(listItems().map(n=>[n.text,n.depth]),[['first',2],['second',4],['third',4]]);await exactHistory(baseline);
 });
 await test('E02 nested empty item Enter lifts once then exits the list; typing stays at the exit',async()=>{
  const original='Before\n\n- first\n  - nested\n\nAfter\n';await reset(original);await select('nested');await key('Enter');await key('Enter');assert.equal(view.state.selection.$head.depth,3);await key('Enter');assert.equal(view.state.selection.$head.depth,1);const before=content();await act(async()=>view.dispatch(view.state.tr.insertText('exit text')));assert.match(content(),/\n\nexit text\n\nAfter/);await exactHistory(before);
 });
 await test('E06 quote Enter at end, second Enter exits quote and Backspace can rejoin',async()=>{
  const original='Before\n\n> alpha\n\nAfter\n';await reset(original);await select('alpha');await key('Enter');assert.equal(view.state.selection.$head.depth,2);await key('Enter');assert.equal(view.state.selection.$head.depth,1);const emptyOutside=content();await act(async()=>view.dispatch(view.state.tr.insertText('outside')));assert.match(content(),/\n\noutside\n\nAfter/);await exactHistory(emptyOutside);
  await reset(original);await select('alpha',0);await key('Backspace');assert.equal(view.state.selection.$head.depth,1);assert.equal(view.state.selection.$head.parent.textContent,'Beforealpha');await exactHistory(original);
 });
 await test('E06 nested quote start Backspace joins previous paragraph and preserves adjacent definitions',async()=>{
  const original='Before\n\n> > alpha\n\nAfter\n\n[ref]: https://example.com\n';await reset(original);await select('alpha',0);await key('Backspace');assert.equal(view.state.selection.$head.depth,1);assert.equal(view.state.selection.$head.parent.textContent,'Beforealpha');assert.ok(content().endsWith('\n\nAfter\n\n[ref]: https://example.com\n'));await exactHistory(original);
 });

 await test('E03 Shift Tab lifts first root item; first task Tab retains status and source',async()=>{
  await reset(baseline);await select('first');await key('Tab',{shiftKey:true});assert.equal(view.state.selection.$head.depth,1);assert.equal(view.state.selection.$head.parent.textContent,'first');await exactHistory(baseline);
  const original='Before\n\n- [x] first\n- [ ] second\n\nAfter\n';await reset(original);await select('first');await key('Tab');assert.equal(content(),original);
 });
 await test('E03 table-cell lists retain table Tab navigation',async()=>{
  const original='Before\n\n| A | B |\n| --- | --- |\n| - first<br>- second | other |\n\nAfter\n';await reset(original);await select('first');await key('Tab');assert.equal(view.state.selection.$head.parent.textContent,'other');assert.equal(content(),original);await key('Tab',{shiftKey:true});assert.equal(view.state.selection.$head.parent.textContent,'second');assert.equal(content(),original);
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} navigation operation checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
