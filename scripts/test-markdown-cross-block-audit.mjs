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
const output=path.resolve('node_modules/.cache/deditor-markdown-cross-block-audit.mjs');
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



const cases = [
 ['paragraph-heading','alpha middle\n\n## beta tail','alpha middle',6,'beta tail',5],
 ['heading-list','## alpha middle\n\n- beta tail\n- kept item','alpha middle',6,'beta tail',5],
 ['nested-list-quote','- parent\n  - alpha middle\n  - child kept\n\n> beta tail\n>\n> kept quote','alpha middle',6,'beta tail',5],
 ['quote-list','> alpha middle\n>\n> inner removed\n\n- beta tail\n- kept item','alpha middle',6,'beta tail',5],
 ['paragraph-table','alpha middle\n\n| H1 | H2 |\n| --- | --- |\n| beta tail | kept cell |','alpha middle',6,'beta tail',5],
 ['table-paragraph','| H1 | H2 |\n| --- | --- |\n| alpha middle | removed cell |\n\nbeta tail','alpha middle',6,'beta tail',5],
];
const range=async(a,ao,b,bo,reverse)=>{await select(a,ao);const from=view.state.selection.from;await select(b,bo);const to=view.state.selection.from;await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,reverse?to:from,reverse?from:to))));return [from,to];};
try {
 for (const [name,body,a,ao,b,bo] of cases) for (const reverse of [false,true]) for (const operation of ['Backspace','Delete','replace']) {
  await test(`${name} ${reverse?'reverse':'forward'} ${operation}, history then continued typing`,async()=>{
   const original=`Before untouched\n\n${body}\n\nAfter untouched\n\n[ref]: https://example.com/keep\n`;
   await reset(original);const [from,to]=await range(a,ao,b,bo,reverse);
   const left=view.state.doc.textBetween(0,from,''),right=view.state.doc.textBetween(to,view.state.doc.content.size,'');
   if(operation==='replace'){let event;await act(async()=>{event=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'NEW'});view.dom.dispatchEvent(event);});assert.equal(event.defaultPrevented,true,'cross-block beforeinput uses PM replacement');}else await key(operation);
   assert.equal(view.state.doc.textContent,left+(operation==='replace'?'NEW':'')+right,'only selected text removed');
   assert.ok(content().startsWith('Before untouched\n\n'));assert.ok(content().endsWith('\n\nAfter untouched\n\n[ref]: https://example.com/keep\n'));
   const edited=content(),editedDoc=view.state.doc.toJSON();await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);assert.deepEqual(view.state.doc.toJSON(),editedDoc);
   assert.equal(view.state.selection.empty,true,'redo leaves insertion caret');
   const cursor=view.state.selection.from,beforeTyping=view.state.doc.textBetween(0,cursor,''),afterTyping=view.state.doc.textBetween(cursor,view.state.doc.content.size,'');
   await act(async()=>view.dispatch(view.state.tr.insertText('Z')));assert.equal(view.state.doc.textContent,beforeTyping+'Z'+afterTyping);
   await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());const saved=content(),savedDoc=view.state.doc.toJSON();await act(async()=>root.render(null));await render();assert.equal(content(),saved);assert.deepEqual(view.state.doc.toJSON(),savedDoc,'reparse preserves edited structure');
  });
 }

 await test('table header formatting/alignment survives data edit, history and reparse',async()=>{
  const original='Before\n\n| **Left** | *Right* |\n| :--- | ---: |\n| first | second |\n\nAfter\n';await reset(original);let header;view.state.doc.descendants(n=>{if(n.type.name==='table_header_row')header=n.toJSON();});await select('first');await act(async()=>view.dispatch(view.state.tr.insertText('X')));await exactHistory(original);let reopenedHeader;view.state.doc.descendants(n=>{if(n.type.name==='table_header_row')reopenedHeader=n.toJSON();});assert.deepEqual(reopenedHeader,header);
 });
 await test('cross-block beforeinput preserves existing suffix marks',async()=>{
  const original='Before\n\n- alpha middle\n\n> beta **tail**\n\nAfter\n';await reset(original);await range('alpha middle',6,'beta tail',5,false);await act(async()=>view.dom.dispatchEvent(new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'NEW'})));assert.match(content(),/alpha NEW\*\*tail\*\*/);await exactHistory(original);
 });
 await test('ordinary same-block, composition and raw endpoint beforeinput stay with their existing handlers',async()=>{
  const original='Before\n\nalpha middle\n\nbeta tail\n\n[ref]: https://example.com/keep\n';
  for(const mode of ['same','composition','raw']){
   await reset(original);if(mode==='same')await select('alpha middle',6);else if(mode==='raw')await range('alpha middle',6,'[ref]: https://example.com/keep',4,false);else await range('alpha middle',6,'beta tail',5,false);
   let event;await act(async()=>{event=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:'NEW',isComposing:mode==='composition'});view.dom.dispatchEvent(event);});assert.equal(event.defaultPrevented,false,mode);assert.equal(content(),original);
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} cross-block checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
