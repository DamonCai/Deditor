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
const output=path.resolve('node_modules/.cache/deditor-markdown-special-blocks-audit.mjs');
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

const {EditorView:CMView,runScopeHandlers}=await import('@codemirror/view');
try {
await test('I06 preserved block: Tab indents within its editor and Shift Tab removes indentation',async()=>{
 const original='<details>\n<summary>Details</summary>\n\nBody\n</details>\n\nTail\n';await reset(original);
 await run(()=>document.querySelector('.md-raw-edit').click());const cm=CMView.findFromDOM(document.querySelector('.md-raw-source .cm-editor'));assert.ok(cm);const initialRaw=cm.state.doc.toString();
 const event=new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});let handled;await run(()=>{handled=runScopeHandlers(cm,event,'editor');});assert.equal(handled,true);assert.ok(cm.state.doc.toString().startsWith('  <details>'));
 await run(()=>runScopeHandlers(cm,new window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true}),'editor'));assert.equal(cm.state.doc.toString(),initialRaw);
 await run(()=>runScopeHandlers(cm,new window.KeyboardEvent('keydown',{key:'Escape'}),'editor'));assert.equal(!!document.querySelector('.md-raw-source .cm-editor'),false);assert.equal(content(),original);
});

await test('I06 raw HTML and YAML: edit, Escape, save, undo and redo preserve neighboring text',async()=>{
 for(const original of ['Before\n\n<custom>raw text</custom>\n\nTail\n','---\ntitle: original\n---\n\nTail\n']){
  await reset(original);await run(()=>document.querySelector('.md-raw-edit').click());const cm=CMView.findFromDOM(document.querySelector('.md-raw-source .cm-editor'));assert.ok(cm);const before=cm.state.doc.toString();const offset=before.indexOf(before.includes('original')?'original':'raw');assert.ok(offset>=0);
  await run(()=>cm.dispatch({changes:{from:offset,to:offset+(before.includes('original')?8:3),insert:'changed'},selection:{anchor:offset+7}}));
  await run(()=>runScopeHandlers(cm,new window.KeyboardEvent('keydown',{key:'Escape'}),'editor'));assert.equal(!!document.querySelector('.md-raw-source .cm-editor'),false);assert.ok(content().includes('changed'));assert.ok(content().endsWith('Tail\n'));await exactHistory(original);
 }
});
await test('I05 callout body: direct edits, nested formats and undo preserve alert syntax',async()=>{
 const original='Before\n\n> [!TIP]\n> Body **strong** text.\n\nTail\n';await reset(original);await select('Body strong text.',5);await run(()=>view.dispatch(view.state.tr.insertText('new ')));await key('Escape');assert.ok(content().includes('[!TIP]'));assert.ok(content().includes('new '));assert.ok(content().endsWith('Tail\n'));await exactHistory(original);
});
await test('I03-I04 block math and Mermaid: enter source, edit, Escape and exact history',async()=>{
 for(const original of ['Before\n\n$$\nx^2\n$$\n\nTail\n','Before\n\n```mermaid\ngraph LR\n A-->B\n```\n\nTail\n']){
  await reset(original);const preview=document.querySelector('.md-code-preview');assert.ok(preview);await run(()=>document.querySelector(".md-code-toggle").click());const cm=CMView.findFromDOM(document.querySelector('.md-code-editor .cm-editor'));assert.ok(cm);const old=cm.state.doc.toString();await run(()=>cm.dispatch({changes:{from:old.length,insert:'\n'},selection:{anchor:old.length+1}}));await run(()=>runScopeHandlers(cm,new window.KeyboardEvent('keydown',{key:'Escape'}),'editor'));assert.ok(content().endsWith('Tail\n'));assert.ok(content().includes(old+'\n'));await exactHistory(original);
 }
});
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} special block audit groups`);
