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
const output=path.resolve('node_modules/.cache/deditor-markdown-basic-operations.mjs');
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
try {
 await test('basic shortcuts: modified Backspace is not consumed by auto-pair deletion',async()=>{
  for(const modifiers of [{metaKey:true},{ctrlKey:true},{altKey:true}]) {
   await reset('Before\n\nalpha beta()\n\nAfter\n');await select('alpha beta()',11);
   const plugin=view.state.plugins.find(p=>p.spec.props?.handleTextInput && p.spec.appendTransaction);
   assert.ok(plugin,'input helpers installed');
   const event=new dom.window.KeyboardEvent('keydown',{key:'Backspace',...modifiers});let handled;
   await act(async()=>{handled=plugin.props.handleKeyDown.call(plugin,view,event);});
   assert.equal(handled,false,JSON.stringify(modifiers)+' must reach native word/line deletion');
   assert.equal(content(),'Before\n\nalpha beta()\n\nAfter\n');
  }
 });
 await test('basic shortcuts: ordinary Backspace removes a pair with exact undo and save',async()=>{
  for(const pair of ['()','[]','{}','""',"''"]) {
   const original='Before\n\nalpha '+pair+'\n\nAfter\n';await reset(original);await select('alpha '+pair,7);await key('Backspace');
   assert.equal(view.state.selection.$head.parent.textContent,'alpha ');await exactHistory(original);
  }
 });
 await test('basic tasks: Enter starts an unchecked task after a completed task',async()=>{
  const original='Before\n\n- [x] completed\n- [ ] pending\n\nAfter\n';await reset(original);await select('completed');await key('Enter');
  const tasks=[];view.state.doc.descendants(n=>{if(n.type.name==='list_item')tasks.push([n.textContent,n.attrs.checked]);});
  assert.deepEqual(tasks,[['completed',true],['',false],['pending',false]]);
  assert.equal(view.state.selection.$head.parent.textContent,'');await exactHistory(original);
 });
 await test('basic tasks: splitting and nested tasks retain previous status and reset only the new item',async()=>{
  for(const original of ['- [x] completed\n','- [x] outer\n  - [x] completed\n  - [x] sibling\n']) {
   await reset(original);await select('completed',4);await key('Enter');
   const tasks=[];view.state.doc.descendants(n=>{if(n.type.name==='list_item')tasks.push([n.firstChild.textContent,n.attrs.checked]);});
   const index=tasks.findIndex(([text])=>text==='comp');assert.ok(index>=0);assert.deepEqual(tasks.slice(index,index+2),[['comp',true],['leted',false]]);
   assert.equal(view.state.selection.$head.parent.textContent,'leted');await exactHistory(original);
  }
 });
 await test('basic tasks: Shift Enter remains a soft break and ordinary lists remain ordinary',async()=>{
  await reset('- [x] completed\n');await select('completed');await key('Enter',{shiftKey:true});
  const tasks=[];view.state.doc.descendants(n=>{if(n.type.name==='list_item')tasks.push(n);});assert.equal(tasks.length,1);assert.equal(tasks[0].attrs.checked,true);assert.equal(tasks[0].firstChild.lastChild.type.name,'hardbreak');
  for(const original of ['- ordinary\n','3. ordinary\n','- [ ] ordinary\n']) {
   await reset(original);await select('ordinary');await key('Enter');
   const items=[];view.state.doc.descendants(n=>{if(n.type.name==='list_item')items.push(n);});assert.equal(items.length,2);assert.equal(items[0].attrs.checked,items[1].attrs.checked);await exactHistory(original);
  }
 });
 await test('basic tasks: Enter on an empty task exits the list and IME Enter is ignored',async()=>{
  await reset('- [x] completed\n');await select('completed');await key('Enter');await key('Enter');assert.equal(view.state.selection.$head.depth,1);
  await reset('- [x] completed\n');await select('completed');const original=content();await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));await key('Enter',{isComposing:true,keyCode:229});assert.equal(content(),original);await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true})));
 });
 await test('basic toolbar: converting nested items to tasks preserves completed ancestors and siblings',async()=>{
  for(const original of ['- [x] parent\n  - child\n  - sibling\n\nTail\n','- [x] grandparent\n  - [x] parent\n    1. child\n    2. sibling\n\nTail\n']) {
   await reset(original);await select('child',2);
   await act(async()=>app.getVisualEditor().prefix('- [ ] '));
   const items=[];view.state.doc.descendants(n=>{if(n.type.name==='list_item')items.push([n.firstChild.textContent,n.attrs.checked]);});
   assert.deepEqual(items.filter(([text])=>text==='parent'||text==='grandparent').map(([,checked])=>checked),original.includes('grandparent')?[true,true]:[true]);
   assert.deepEqual(items.find(([text])=>text==='child'),['child',false]);
   assert.deepEqual(items.find(([text])=>text==='sibling'),['sibling',null]);
   assert.equal(view.state.selection.$head.parent.textContent,'child');await exactHistory(original);
  }
 });
 await test('basic toolbar: converting a mixed task selection retains completion and changes only selected items',async()=>{
  const original='- [x] done\n- plain\n- untouched\n\nTail\n';await reset(original);
  let from,to;view.state.doc.descendants((n,pos)=>{if(n.isTextblock&&n.textContent==='done')from=pos+1;if(n.isTextblock&&n.textContent==='plain')to=pos+1+n.content.size;});
  await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,to)));});
  await act(async()=>app.getVisualEditor().prefix('- [ ] '));
  const items=[];view.state.doc.descendants(n=>{if(n.type.name==='list_item')items.push([n.firstChild.textContent,n.attrs.checked]);});
  assert.deepEqual(items,[['done',true],['plain',false],['untouched',null]]);await exactHistory(original);
 });
 await test('basic toolbar: task list toggles off without changing completed ancestors',async()=>{
  await reset('plain\n');await select('plain',2);await act(async()=>app.getVisualEditor().prefix('- [ ] '));
  await act(async()=>app.getVisualEditor().prefix('- [ ] '));assert.equal(content(),'plain\n');
  const original='- [x] parent\n  - [x] child\n  - sibling\n\nTail\n';await reset(original);await select('child',2);
  await act(async()=>app.getVisualEditor().prefix('- [ ] '));
  let parent,child;view.state.doc.descendants(n=>{if(n.type.name==='list_item'&&n.firstChild.textContent==='parent')parent=n;if(n.type.name==='list_item'&&n.firstChild.textContent==='child')child=n;});
  assert.equal(parent.attrs.checked,true);assert.equal(child.attrs.checked,null);assert.equal(view.state.selection.$head.parent.textContent,'child');await exactHistory(original);
 });
 await test('basic code: Tab and Shift Tab indent within the block using the writing preference',async()=>{
  const {EditorView}=await import('@codemirror/view');
  const original='# Top\n\n```js\nfirst\nsecond\n```\n\nTail\n';
  const previous=store.getState().markdownSettings;
  try {for(const size of [2,4,8]) {
   await act(async()=>store.setState({markdownSettings:{...previous,codeIndent:size}}));await reset(original);
   await act(async()=>document.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true,cancelable:true})));
   const cm=EditorView.findFromDOM(document.querySelector('.md-code-editor .cm-editor'));
   await act(async()=>{cm.focus();cm.dispatch({selection:{anchor:0,head:cm.state.doc.length}});});
   const press=async(shiftKey=false)=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey,bubbles:true,cancelable:true});cm.contentDOM.dispatchEvent(event);});return event;};
   assert.equal((await press()).defaultPrevented,true,'Tab must indent rather than move to the next language field');
   const indented=' '.repeat(size)+'first\n'+' '.repeat(size)+'second';assert.equal(cm.state.doc.toString(),indented);
   assert.equal(content(),original.replace('first\nsecond',indented));assert.equal(cm.hasFocus,true);
   await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
   await act(async()=>app.markdownHistory());assert.equal(content(),original);
   await act(async()=>app.markdownHistory(true));assert.equal(cm.state.doc.toString(),indented);
   await act(async()=>{cm.focus();cm.dispatch({selection:{anchor:0,head:cm.state.doc.length}});});
   assert.equal((await press(true)).defaultPrevented,true);assert.equal(cm.state.doc.toString(),'first\nsecond');assert.equal(content(),original);
  }}finally{await act(async()=>store.setState({markdownSettings:previous}));}
 });
 await test('basic search: replace all preserves untouched blocks, gaps and trailing spaces',async()=>{
  for(const eol of ['\n','\r\n']) {
   const original=('# Search\n\n+ [x] target task\n\n\n| A | B |\n| :--- | ---: |\n| same | table |\n\n[link][ref]\n\n[ref]: https://example.com "target title"\n\nEnd target   \n').replaceAll('\n',eol);
   await reset(original);await act(async()=>app.getVisualEditor().find());
   const input=async(index,value)=>act(async()=>{const element=document.querySelectorAll('[role="search"] input')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});
   await input(0,'target');await input(1,'result');
   await act(async()=>[...document.querySelectorAll('[role="search"] button')].find(b=>b.textContent==='Replace All').click());
   assert.equal(content(),original.replaceAll('target','result'));await exactHistory(original);
  }
 });
 await test('basic clipboard: ordinary text preserves boundary spaces, repeated spaces and line breaks',async()=>{
  for(const pasted of [' first', '  first  ', ' first\nsecond ', 'first  second', ' \n ', ' first\r\nsecond ']) {
   const original='Before\n\nalpha beta\n\nAfter\n';await reset(original);await select('alpha beta');
   const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?pasted:''}});
   await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});
   const visible=view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n');
   assert.equal(visible,'Before\nalpha beta'+pasted.replace(/\r\n?/g,'\n')+'\nAfter',JSON.stringify(pasted));
   await exactHistory(original);
  }
 });
 await test('basic clipboard: Markdown and HTML formatting still paste as structure',async()=>{
  for(const [text,html,type] of [['**bold**','','strong'],['# Heading','','heading'],['- item','','bullet_list'],['code','<p><strong>bold</strong></p>','strong']]) {
   await reset('');
   const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:kind=>kind==='text/plain'?text:kind==='text/html'?html:''}});
   await act(async()=>{view.focus();view.dom.dispatchEvent(event);await pause(40);});await key('Escape');
   let found=false;view.state.doc.descendants(n=>{if(n.type.name===type||n.marks.some(m=>m.type.name===type))found=true;});assert.equal(found,true,type);
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} basic operation checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
