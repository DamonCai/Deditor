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
const output=path.resolve('node_modules/.cache/deditor-markdown-input-clipboard-audit.mjs');
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
try {
 await test('B01 selected Unicode replacement preserves exact save/undo/redo',async()=>{
  for(const replacement of ['中文','👨‍👩‍👧‍👦','e\u0301','𠮷']) {
   const original='Before\n\nalpha beta gamma\n\nAfter\n';await reset(original);await range('alpha beta gamma',6,10);await input(replacement);assert.equal(visible(),'Before\nalpha '+replacement+' gamma\nAfter');await exactHistory(original);
  }
 });
 await test('B05 brackets auto-pair, skip closing, selection wraps, preference off',async()=>{
  for(const pair of ['()','[]','{}','""',"''"]) {
   await reset('alpha\n');await select('alpha');await input(' ');await input(pair[0]);assert.equal(visible(),'alpha '+pair);assert.equal(view.state.selection.$from.parentOffset,7);await input(pair[1]);assert.equal(visible(),'alpha '+pair);assert.equal(view.state.selection.$from.parentOffset,8);
  }
  for(const pair of ['()','[]','{}','""',"''",'**','__','``','$$','~~','==','^^']) {
   const original='alpha beta gamma\n';await reset(original);await range('alpha beta gamma',6,10);await input(pair[0]);assert.equal(visible(),'alpha '+pair[0]+'beta'+pair[1]+' gamma');assert.equal(view.state.doc.textBetween(view.state.selection.from,view.state.selection.to),'beta');await exactHistory(original);
  }
  await reset('alpha\n');store.setState({autoCloseBrackets:false});await select('alpha');await input(' ');await input('(');assert.equal(visible(),'alpha (');store.setState({autoCloseBrackets:true});
 });
 await test('B06 emoji candidates select with arrows and Tab then exact undo',async()=>{
  const original='alpha\n';await reset(original);await select('alpha');await input(' ');await input(':sm');const names=suggestions();assert.ok(names.length>1);await key('ArrowDown');await key('Tab');assert.ok(content().includes(names[1]));await exactHistory(original);
 });
 await test('B06 cancelling one emoji prefix does not hide a different prefix of equal length',async()=>{
  await reset('alpha\n');await select('alpha');await input(' ');await input(':sm');assert.ok(suggestions().length);await key('Escape');assert.equal(suggestions().length,0);await range('alpha :sm',7,9);await input('th');assert.ok(suggestions().length,'new :th prefix should reopen candidates');await key('Escape');await select('alpha :th');assert.equal(suggestions().length,0,'selection-only update stays dismissed');await range('alpha :th',7,9);await input('sm');assert.ok(suggestions().length,'retyped old prefix reopens after actual edit');
 });
 await test('C02 plain whitespace paste preserves edge line breaks, tabs and Unicode, save/undo/reopen',async()=>{
  for(const text of ['\nfirst','first\n','first\tsecond','first\rsecond','中文 👨‍👩‍👧‍👦 e\u0301']) {
   const original='Before\n\nalpha beta\n\nAfter\n';await reset(original);await select('alpha beta');await paste(text);assert.equal(visible(),'Before\nalpha beta'+text.replace(/\r\n?/g,'\n')+'\nAfter',JSON.stringify(text));await exactHistory(original);
  }
 });
 await test('C01 cross-block plain paste replaces only selected text with exact undo',async()=>{
  const original='Before\n\nalpha beta\n\ngamma delta\n\nAfter\n';await reset(original);await select('alpha beta',6);const from=view.state.selection.from;await select('gamma delta',5);const to=view.state.selection.from;await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,to))));await paste(' ONE\nTWO ');assert.equal(visible(),'Before\nalpha  ONE\nTWO  delta\nAfter');await exactHistory(original);
 });
 await test('B02 boundary Backspace/Delete merges paragraphs and retains undo/source',async()=>{
  for(const [text,offset,keyName] of [['gamma',0,'Backspace'],['alpha',5,'Delete']]) {
   const original='Before\n\nalpha\n\ngamma\n\nAfter\n';await reset(original);await select(text,offset);await key(keyName);assert.equal(visible(),'Before\nalphagamma\nAfter');await exactHistory(original);
  }
 });
 await test('B04 Enter splits at start/middle/end and Shift Enter keeps one paragraph',async()=>{
  for(const offset of [0,2,5]) {
   const original='Before\n\nalpha\n\nAfter\n';await reset(original);await select('alpha',offset);await key('Enter');assert.equal(visible(),'Before\n'+'alpha'.slice(0,offset)+'\n'+'alpha'.slice(offset)+'\nAfter');await exactHistory(original);
  }
  const original='Before\n\nalpha\n\nAfter\n';await reset(original);await select('alpha',2);await key('Enter',{shiftKey:true});assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(view.state.selection.$head.parent.childCount,3);assert.equal(visible(),'Before\nal\npha\nAfter');await exactHistory(original);
 });
 await test('B05 apostrophes and a word ahead do not gain unwanted pairing',async()=>{
  for(const [text,offset,typed,expected] of [['cant',3,"'","can't"],['abcd',2,'(','ab(cd'],['alpha',5,'"','alpha"']]) {
   await reset(text+'\n');await select(text,offset);await input(typed);assert.equal(visible(),expected);
  }
 });
 await test('C03 Markdown and HTML paste preserve semantic structure and exact history',async()=>{
  for(const [text,html,type] of [['**bold**','','strong'],['# title','','heading'],['- item','','bullet_list'],['bold','<p><strong>bold</strong></p>','strong']]) {
   const original='';await reset(original);await act(async()=>view.focus());await paste(text,html);await key('Escape');let found=false;view.state.doc.descendants(n=>{if(n.type.name===type||n.marks.some(m=>m.type.name===type))found=true;});assert.ok(found,type);await exactHistory(original);
  }
 });
 await test('C04 expanded inline source keeps exact multiline clipboard including blank lines',async()=>{
  for(const raw of ['**word**','`word`','[word](https://example.com)']) {
   const original='Before '+raw+' after.\n\nTail\n';await reset(original);await act(async()=>{app.getVisualEditor().navigate(1,original.indexOf('word')+2);await pause(30);});assert.ok(document.querySelector('[data-md-inline-source]'));await paste(' line one\n\nline two ');assert.ok(content().includes(' line one\n\nline two '));assert.ok(content().endsWith('\n\nTail\n'));assert.equal(document.querySelector('[data-md-inline-source]'),null);await exactHistory(original);
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} input/clipboard audit groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
