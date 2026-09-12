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
const output=path.resolve('node_modules/.cache/deditor-markdown-image-clipboard-audit.mjs');
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
const input=async(text)=>{await act(async()=>{const {from,to}=view.state.selection;let handled=false;view.someProp('handleTextInput',fn=>{if(fn(view,from,to,text,()=>view.state.tr.insertText(text,from,to))){handled=true;return true;}});if(!handled)view.dispatch(view.state.tr.insertText(text,from,to));await pause(35);});};
const range=async(text,a,b)=>{await select(text,a);await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.from,view.state.selection.from+b-a))));};
const paste=async(text,html='')=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?text:type==='text/html'?html:''}});await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});};
const visible=()=>view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n');
const suggestions=()=>[...document.querySelectorAll('.md-emoji-suggestions button')].map(b=>b.textContent);

globalThis.ClipboardEvent=class extends dom.window.Event {};
globalThis.DragEvent=class extends dom.window.Event {};
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=';
const imageWrites=[];const invoke=globalThis.mdInvoke;
globalThis.mdInvoke=async(command,args)=>{if(command==='save_image'){imageWrites.push(args);return '/generated/'+args.folder+'/'+args.name;}return invoke(command,args);};
const imagePaste=async(count=1)=>{const bytes=Buffer.from(png,'base64');const file={name:'self-created.png',type:'image/png',arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};const files=Object.assign(Array.from({length:count},()=>({...file})),{item:i=>i<count?file:null});const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files,items:[{type:'image/png',kind:'file',getAsFile:()=>file}],getData:()=>''}});await act(async()=>{view.dom.dispatchEvent(event);await pause(80);});return event;};
try {
 await test('C05 PNG clipboard inserts at caret with exact byte reference and one undo',async()=>{
  const original='Before\n\nalpha beta\n\nAfter\n';await reset(original);await select('alpha beta',6);const event=await imagePaste();assert.equal(event.defaultPrevented,true);assert.equal(imageWrites.length,1);assert.equal(imageWrites[0].data,png);assert.equal(imageWrites[0].dir,'/generated');assert.equal(imageWrites[0].folder,'assets');assert.ok(content().includes('assets/'+imageWrites[0].name));assert.ok(content().indexOf('alpha')<content().indexOf('!['));assert.ok(content().indexOf('![')<content().indexOf('beta'));await exactHistory(original);
 });
 await test('C05 PNG clipboard replaces selected text',async()=>{
  const original='Before\n\nalpha beta gamma\n\nAfter\n';await reset(original);await range('alpha beta gamma',6,10);await imagePaste();assert.ok(!content().includes('beta'),'selected beta must be replaced');await exactHistory(original);
 });

 await test('C05 delayed paste follows earlier edits and moving caret; one undo retains concurrent prose',async()=>{
  const original='Before\n\nalpha beta gamma\n\nAfter\n';await reset(original);await range('alpha beta gamma',6,10);
  const previous=globalThis.mdInvoke;let release;globalThis.mdInvoke=async(command,args)=>command==='save_image'?new Promise(resolve=>{release=()=>resolve('/generated/'+args.folder+'/'+args.name);}):previous(command,args);
  try {await imagePaste();await select('Before',0);await input('New ');const concurrent=content();await select('After');await act(async()=>{release();await pause(70);});assert.ok(content().includes('New Before'));assert.ok(!content().includes('beta'));assert.ok(content().indexOf('![')<content().indexOf('gamma'));await act(async()=>app.markdownHistory());assert.equal(content(),concurrent);}finally{globalThis.mdInvoke=previous;}
 });
 await test('C05 editing pending replacement cancels late insertion without losing text',async()=>{
  const original='alpha beta gamma\n';await reset(original);await range('alpha beta gamma',6,10);const previous=globalThis.mdInvoke;let release;globalThis.mdInvoke=async(command,args)=>command==='save_image'?new Promise(resolve=>{release=resolve;}):previous(command,args);
  try{await imagePaste();await input('typed');const concurrent=content();await act(async()=>{release('/generated/assets/a.png');await pause(70);});assert.equal(content(),concurrent);assert.ok(content().includes('typed'));assert.ok(!content().includes('!['));}finally{globalThis.mdInvoke=previous;}
 });
 await test('C05 failed storage leaves selection text and history unchanged',async()=>{
  const original='alpha beta gamma\n';await reset(original);await range('alpha beta gamma',6,10);const previous=globalThis.mdInvoke;globalThis.mdInvoke=async(command,args)=>{if(command==='save_image')throw Error('generated image storage failure');return previous(command,args);};
  try{await imagePaste();assert.equal(content(),original);assert.equal(view.state.doc.textBetween(view.state.selection.from,view.state.selection.to),'beta');assert.ok(!view.dom.textContent.includes('Upload in progress'));}finally{globalThis.mdInvoke=previous;}
 });
 await test('C05 suspended Markdown cancels pending upload and leaves HTML/XMind documents untouched',async()=>{
  const original='alpha beta gamma\n';await reset(original);await select('alpha beta gamma',6);const previous=globalThis.mdInvoke;let release;globalThis.mdInvoke=async(command,args)=>command==='save_image'?new Promise(resolve=>{release=resolve;}):previous(command,args);
  store.setState({tabs:[...store.getState().tabs,{id:'x',filePath:'/generated/x.xmind',content:'generated-xmind',savedContent:'generated-xmind'}]});
  try{await imagePaste();await act(async()=>{store.setState({activeId:'b'});root.render(React.createElement(app.Visual,{tabId:'a',active:false,readonly:false,theme:'light'}));await pause(30);});await act(async()=>{store.setState({activeId:'x'});release('/generated/assets/a.png');await pause(70);});assert.equal(content(),original);assert.equal(store.getState().tabs.find(t=>t.id==='b').content,'<h1>HTML</h1>');assert.equal(store.getState().tabs.find(t=>t.id==='x').content,'generated-xmind');await act(async()=>store.setState({activeId:'a'}));await render();assert.equal(content(),original);}finally{globalThis.mdInvoke=previous;}
 });
 await test('C05 HTML clipboard preserves HTML route instead of uploading bitmap files',async()=>{
  const original='alpha\n';await reset(original);await select('alpha');const before=imageWrites.length;const file={type:'image/png'};const event=new ClipboardEvent('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:Object.assign([file],{item:()=>file}),getData:type=>type==='text/html'?'<strong>Rich text</strong>':''}});await act(async()=>{view.dom.dispatchEvent(event);await pause(60);});assert.equal(imageWrites.length,before);assert.ok(content().includes('Rich text'));assert.ok(!content().includes('!['));await exactHistory(original);
 });

 await test('C05 multiple PNGs all survive empty document, end of document, and selected text with one undo',async()=>{
  for(const [original,selected] of [['',false],['alpha\n',false],['alpha beta gamma\n',true]]) {
   await reset(original);if(selected)await range('alpha beta gamma',6,10);else if(original)await select('alpha');
   const before=imageWrites.length;await imagePaste(3);const files=imageWrites.slice(before);assert.equal(files.length,3);const images=[];view.state.doc.descendants(node=>{if(node.type.name==='image-block')images.push(node.attrs.src);});assert.equal(images.length,3,'all three images survive for '+JSON.stringify(original));assert.deepEqual(images,files.map(file=>'assets/'+file.name),'clipboard order retained');for(const file of files)assert.ok(content().includes(file.name));if(selected)assert.ok(!content().includes('beta'));await exactHistory(original);
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} image clipboard audit groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
