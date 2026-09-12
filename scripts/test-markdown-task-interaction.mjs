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
const output=path.resolve('node_modules/.cache/deditor-markdown-task-interaction.mjs');
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



const {parserCtx}=await import('@milkdown/kit/core');
const shape=(doc=view.state.doc)=>{const result=[];doc.descendants((n,pos)=>{if(n.type.name==='list_item')result.push({text:n.firstChild.textContent.replace(/^\n$/,''),checked:n.attrs.checked,depth:doc.resolve(pos+1).depth,indent:n.attrs.taskIndent??0});});return result;};
const parsed=()=>editorContext.get(parserCtx)(content());
const persisted=()=>assert.deepEqual(shape(parsed()),shape(),'saved Markdown must reproduce task text, status and indentation in a fresh parser');
const caret=async(predicate,offset=0)=>{let at;view.state.doc.descendants((n,p)=>{if(n.type.name==='list_item'&&predicate(n))at=p+2+offset;});assert.notEqual(at,undefined);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));});};
const operation=async(fn)=>act(async()=>{fn();await pause(40);});
const original='Before\n\n<br />\n\n* [x] <br />\n\n  * [ ] child one\n  * [x] child two\n  * [ ] child three\n\nAfter\n';
const neighbors='\n\nAfter\n';
try {
 for(const marker of ['<br />','<br>'])for(const action of ['Backspace','Enter'])for(const offset of marker?[0,1]:[0]){
  await test('empty task '+JSON.stringify(marker)+' '+action+' at '+offset,async()=>{
   const source=original.replace('[x] <br />','[x] '+marker);await reset(source);await caret(n=>n.attrs.checked===true&&n.firstChild.textContent.trim()==='',offset);await key(action);
   assert.deepEqual(shape().map(n=>[n.text,n.checked,n.depth]),[['child one',false,2],['child two',true,2],['child three',false,2]]);
   assert.equal(view.state.selection.$from.depth,1);assert.equal(view.state.selection.$from.parent.content.size,0);assert.ok(content().startsWith('Before\n\n<br />\n\n'));assert.ok(content().endsWith(neighbors));persisted();await exactHistory(source);
  });
 }
 await test('first task supports two Tabs, separate undos, two reverse Tabs and fresh reload',async()=>{
  await reset(original);await caret(n=>n.attrs.checked===true&&n.firstChild.textContent.trim()==='');await key('Tab');const one=content();assert.equal(shape()[0].indent,1);persisted();
  await key('Tab');assert.equal(shape()[0].indent,2);persisted();await exactHistory(one);assert.equal(shape()[0].indent,2);await caret(n=>n.attrs.checked===true&&n.firstChild.textContent.trim()==='');
  await key('Tab',{shiftKey:true});assert.equal(shape()[0].indent,1);persisted();await key('Tab',{shiftKey:true});assert.equal(shape()[0].indent,0);assert.ok(!content().includes('deditor-task-indent'));persisted();
 });
 await test('second task and its children sink, then continue indenting and lift without changing status',async()=>{
  const source='Before\n\n- [x] first\n- [ ] second\n  - [x] child\n- [ ] third\n\nAfter\n';await reset(source);await select('second');await key('Tab');
  assert.notEqual(content(),source);assert.deepEqual(shape().map(n=>[n.text,n.depth,n.checked]),[['first',2,true],['second',4,false],['child',6,true],['third',2,false]]);persisted();await exactHistory(source);
  await select('second');await key('Tab');assert.equal(shape()[1].indent,1);persisted();await key('Tab',{shiftKey:true});assert.equal(shape()[1].indent,0);await key('Tab',{shiftKey:true});assert.deepEqual(shape().map(n=>n.depth),[2,2,4,2]);persisted();
 });
 await test('selected first two tasks indent together and reverse without moving the third',async()=>{
  const source='Before\n\n- [x] first\n- [ ] second\n- [x] third\n\nAfter\n';await reset(source);let a,b;view.state.doc.descendants((n,p)=>{if(n.isTextblock&&n.textContent==='first')a=p+1;if(n.isTextblock&&n.textContent==='second')b=p+1+n.content.size;});await operation(()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,a,b))));await key('Tab');assert.deepEqual(shape().map(n=>n.indent),[1,1,0]);persisted();await key('Tab',{shiftKey:true});assert.deepEqual(shape().map(n=>n.indent),[0,0,0]);persisted();
 });
 await test('indented text stays editable and checkbox toggles preserve its depth',async()=>{
  const source='Before\n\n- [x] first\n  - [ ] child\n\nAfter\n';await reset(source);await select('first');await key('Tab');const indented=content();
  await operation(()=>view.dispatch(view.state.tr.insertText(' edited')));assert.ok(content().includes('first edited'));persisted();await exactHistory(indented);
  const before=content();let pos;view.state.doc.descendants((n,p)=>{if(n.type.name==='list_item'&&n.firstChild.textContent==='first edited')pos=p;});await operation(()=>view.dispatch(view.state.tr.setNodeAttribute(pos,'checked',false)));assert.equal(shape()[0].indent,1);assert.equal(shape()[1].indent,0);persisted();await exactHistory(before);
 });
 await test('Enter splits an indented completed task into unchecked continuation at the same depth',async()=>{
  await reset('- [x] completed\n');await select('completed');await key('Tab');const before=content();await select('completed',4);await key('Enter');assert.deepEqual(shape().map(n=>[n.text,n.checked,n.indent]),[['comp',true,1],['leted',false,1]]);persisted();await exactHistory(before);
 });
 await test('Backspace removes one indentation step before removing the task marker',async()=>{
  await reset('- [x] completed\n');await select('completed',0);await key('Tab');await key('Tab');await key('Backspace');assert.equal(shape()[0].indent,1);await key('Backspace');assert.equal(shape()[0].indent,0);const before=content();await key('Backspace');assert.equal(shape().length,0);assert.equal(view.state.selection.$from.parent.textContent,'completed');await exactHistory(before);
 });
 await test('ordinary nested tasks Shift Tab and Backspace lift once and keep descendants',async()=>{
  const source='- [x] parent\n  - [ ] child\n    - [x] grandchild\n  - [x] sibling\n';for(const action of ['Backspace','ShiftTab']){await reset(source);await select('child',0);await key(action==='ShiftTab'?'Tab':action,action==='ShiftTab'?{shiftKey:true}:{});assert.equal(shape().find(n=>n.text==='child').depth,2);assert.equal(shape().find(n=>n.text==='grandchild').checked,true);persisted();await exactHistory(source);}
 });
 await test('task formatting removal remains editable and does not retain invisible indentation metadata',async()=>{
  await reset('- [x] parent\n  - [ ] child\n');await select('child');await key('Tab');await operation(()=>app.getVisualEditor().prefix('- [ ] '));persisted();assert.ok(!content().includes('deditor-task-indent'));
 });
 await test('Delete at task end joins the next task and retains following content',async()=>{
  const source='Before\n\n- [x] first\n- [ ] second\n- [x] third\n\nAfter\n';await reset(source);await select('first');await key('Delete');assert.equal(shape()[0].text,'firstsecond');assert.equal(shape()[0].checked,true);assert.equal(shape().at(-1).text,'third');persisted();await exactHistory(source);
 });
 await test('Shift Enter stays inside a task and subsequent typing saves exactly',async()=>{
  await reset('- [x] first\n- [ ] second\n');await select('first');await key('Enter',{shiftKey:true});assert.equal(shape().length,2);await operation(()=>view.dispatch(view.state.tr.insertText('next')));assert.equal(shape()[0].text,'first\nnext');persisted();
 });
 await test('newly empty task removes its marker without depending on an imported br',async()=>{
  await reset('- [x] first\n  - [ ] child\n');await select('first');await operation(()=>{const p=view.state.selection.$from;view.dispatch(view.state.tr.delete(p.start(),p.end()));});const before=content();await key('Backspace');assert.deepEqual(shape().map(n=>[n.text,n.checked,n.depth]),[['child',false,2]]);persisted();await exactHistory(before);
 });
 await test('text selection inside a task replaces text without changing status or depth',async()=>{
  await reset('- [x] first\n- [ ] second\n');await select('first');await key('Tab');const before=content();const p=view.state.selection.$from;await operation(()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,p.start(),p.end())).insertText('replacement')));assert.deepEqual(shape().map(n=>[n.text,n.checked,n.indent]),[['replacement',true,1],['second',false,0]]);persisted();await exactHistory(before);
 });
 await test('DOM reparse and HTML copy retain task indentation without duplicating it in children',async()=>{
  await reset('- [x] first\n  - [ ] child\n');await select('first');await key('Tab');const {DOMParser,DOMSerializer}=await import('@milkdown/kit/prose/model');const host=document.createElement('div');host.append(DOMSerializer.fromSchema(view.state.schema).serializeFragment(view.state.doc.content));assert.deepEqual(shape(DOMParser.fromSchema(view.state.schema).parse(host)),shape());
 });
 await test('Tab advances one level even when the preceding task already has independent indentation',async()=>{
  await reset('- [x] first\n- [ ] second\n');await select('first');await key('Tab');await key('Tab');await select('second');await key('Tab');assert.deepEqual(shape().map(n=>[n.depth,n.indent]),[[2,2],[2,1]]);persisted();
 });
 await test('lifting a child preserves inherited indentation instead of jumping several visual levels',async()=>{
  for(const action of ['Tab','Backspace']){await reset('- [x] parent\n  - [ ] child\n');await select('parent');await key('Tab');await key('Tab');await select('child',0);const before=content();await key(action,action==='Tab'?{shiftKey:true}:{});assert.deepEqual(shape().map(n=>[n.depth,n.indent]),[[2,2],[2,2]]);persisted();await exactHistory(before);}
 });
 await test('mixed ordinary/task selection never adds unpersistable task metadata to ordinary items',async()=>{
  await reset('- [x] first\n- ordinary\n- [ ] third\n');await select('first');await key('Tab');let a,b;view.state.doc.descendants((n,p)=>{if(n.isTextblock&&n.textContent==='first')a=p+1;if(n.isTextblock&&n.textContent==='ordinary')b=p+1+n.content.size;});await operation(()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,a,b))));await key('Tab');assert.equal(shape().find(n=>n.text==='ordinary').indent,0);persisted();await key('Tab',{shiftKey:true});persisted();
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} task interaction groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
