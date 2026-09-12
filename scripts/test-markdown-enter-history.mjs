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
const output=path.resolve('node_modules/.cache/deditor-markdown-enter-history.mjs');
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
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();await pause(40);});await act(async()=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
try {
 await test('Enter history: fence conversion always undoes to the complete marker, independent of timing',async()=>{
  const clock=Date.now;let now=clock();Date.now=()=>now;
  try {
   for(const gap of [0,1000]) {
    await reset('搜索定位目标。\n\n\\`\\`\\`\n');await select('```');
    for(const char of 'json')await act(async()=>{view.dispatch(view.state.tr.insertText(char));await pause(10);});
    const before=content();now+=gap;
    await key('Enter');assert.equal(view.state.selection.$head.parent.type.name,'code_block');
    const converted=content();
    assert.ok(view.dom.contains(document.activeElement));
    await act(async()=>{app.markdownHistory(false,'a');await pause(70);});
    assert.equal(document.activeElement,view.dom,'undo must return focus from the removed code editor');
    assert.equal(view.state.selection.$head.parent.textContent,'```json');
    assert.equal(view.state.selection.$head.parentOffset,7,'undo restores the caret after the language');
    assert.equal(content(),before,'Enter must not absorb language typing at gap '+gap);
    await act(async()=>{app.markdownHistory(true,'a');await pause(70);});assert.equal(content(),converted);
    assert.equal(view.state.selection.$head.parent.type.name,'code_block');
    assert.equal(view.state.selection.$head.parentOffset,0);
    await act(async()=>{view.dispatch(view.state.tr.insertText('42'));await pause(30);});
    await act(async()=>{app.markdownHistory(false,'a');await pause(70);});assert.equal(content(),converted,'code typing is separate from conversion');
    await act(async()=>{app.markdownHistory(false,'a');await pause(70);});assert.equal(content(),before);
    assert.equal(view.state.selection.$head.parentOffset,7);
    await key('Enter');assert.equal(content(),converted,'conversion can be repeated after undo');
   }
  }finally{Date.now=clock;}
 });

 for(const [name,initial,text,modifiers] of [
  ['paragraph','原文\n','原文',{}],
  ['list','* 原文\n','原文',{}],
  ['hard break','原文\n','原文',{shiftKey:true}],
 ])await test(`Enter history: ${name} splits from surrounding typing`,async()=>{
  await reset(initial);await select(text);
  await act(async()=>{view.dispatch(view.state.tr.insertText('新增'));await pause(20);});
  const before=content(),caret=view.state.selection.head;
  await key('Enter',modifiers);const after=content();assert.notEqual(after,before);
  await act(async()=>{view.dispatch(view.state.tr.insertText('后续'));await pause(20);});
  await act(async()=>{app.markdownHistory(false,'a');await pause(60);});assert.equal(content(),after);
  await act(async()=>{app.markdownHistory(false,'a');await pause(60);});assert.equal(content(),before);
  assert.equal(view.state.selection.head,caret);
  await act(async()=>{app.markdownHistory(true,'a');await pause(60);});assert.equal(content(),after);
 });
 await test('Enter history: beforeinput without a keydown creates the same boundary',async()=>{
  await reset('原文\n');await select('原文');
  await act(async()=>{view.dispatch(view.state.tr.insertText('新增'));await pause(20);});const before=content();
  await act(async()=>{
   view.dom.dispatchEvent(new dom.window.InputEvent('beforeinput',{inputType:'insertParagraph',bubbles:true,cancelable:true}));
   const {splitBlock}=await import('@milkdown/kit/prose/commands');splitBlock(view.state,view.dispatch);await pause(20);
  });
  assert.notEqual(content(),before);
  await act(async()=>{app.markdownHistory(false,'a');await pause(60);});assert.equal(content(),before);assert.equal(view.state.selection.$head.parentOffset,4);
 });

 await test('Enter history: repeated empty paragraphs undo and redo their structure and caret',async()=>{
  await reset('原文\n');await select('原文');const initial=content();
  await key('Enter');const one=content();assert.equal(view.state.doc.childCount,2);
  await key('Enter');const two=content();assert.notEqual(two,one);assert.equal(view.state.doc.childCount,3);
  for(const [redo,expected,count] of [[false,one,2],[false,initial,1],[true,one,2],[true,two,3]]) {
   await act(async()=>{app.markdownHistory(redo,'a');await pause(50);});
   assert.equal(content(),expected);assert.equal(view.state.doc.childCount,count);
   assert.equal(view.state.selection.$head.index(0),count-1);
  }
 });
 await test('Enter history: embedded code newline uses the shared history boundary',async()=>{
  await reset('```json\n42\n```\n');await select('42');
  const {EditorView:CodeView}=await import('@codemirror/view');
  const cm=CodeView.findFromDOM(view.dom.querySelector('.cm-editor'));assert.ok(cm);
  await act(async()=>{cm.focus();cm.dispatch({selection:{anchor:2}});cm.dispatch({changes:{from:2,insert:'0'},selection:{anchor:3}});await pause(20);});
  const before=content();
  await act(async()=>{cm.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));await pause(30);});
  const after=content();assert.notEqual(after,before);
  await act(async()=>{app.markdownHistory(false,'a');await pause(50);});assert.equal(content(),before);assert.equal(view.state.selection.$head.parentOffset,3);
  await act(async()=>{app.markdownHistory(true,'a');await pause(50);});assert.equal(content(),after);
 });

 await test('Enter history: range replacement and remount retain original selection',async()=>{
  await reset('一二三四\n');await select('一二三四');
  await act(async()=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,4,2)));await pause(20);});
  const original=content();await key('Enter');const edited=content();
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);
  await act(async()=>root.render(null));await render();
  await act(async()=>{app.markdownHistory(false,'a');await pause(60);});assert.equal(content(),original);
  assert.equal(view.state.selection.anchor,4);assert.equal(view.state.selection.head,2);
  await act(async()=>{app.markdownHistory(true,'a');await pause(60);});assert.equal(content(),edited);
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} Enter history checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
