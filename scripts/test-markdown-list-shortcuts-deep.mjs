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
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-list-shortcuts-deep.mjs');
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
const failures=[];async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push([name,error]);console.error('FAIL '+name+'\n'+error.stack);}}
const {Editor:MilkdownEditor,editorViewCtx,parserCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view,context;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);context=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();await act(async()=>pause(80));assert.equal(content(),edited);};

// Synthetic browser editing path: dispatch keyboard/beforeinput/input events,
// perform only the default DOM text insertion missing from JSDOM, and let PM's
// real MutationObserver derive text/input-rule transactions. No list commands.
const type=async(text)=>{for(const character of text)await act(async()=>{
 const down=new dom.window.KeyboardEvent('keydown',{key:character,bubbles:true,cancelable:true});view.dom.dispatchEvent(down);
 if(down.defaultPrevented)return;
 const before=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:character});view.dom.dispatchEvent(before);
 if(before.defaultPrevented)return;
 const selection=window.getSelection(),range=selection.getRangeAt(0);range.deleteContents();
 const node=document.createTextNode(character);range.insertNode(node);selection.collapse(node,character.length);
 view.dom.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:character}));
 await pause(40);
});};
const shape=(doc=view.state.doc)=>{const items=[];doc.descendants((node,pos)=>{if(node.type.name==='list_item')items.push({text:node.firstChild.textContent,depth:doc.resolve(pos+1).depth,checked:node.attrs.checked});});return items;};
const rootTypes=()=>Array.from({length:view.state.doc.childCount},(_,i)=>view.state.doc.child(i).type.name);
const table='| A | B |\n| --- | --- |\n| C | D |\n';
const saved=async()=>{await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());};
try {
 await test('DOM typing list prefixes enters bullet, ordered and task lists without literal spaces',async()=>{
  for(const prefix of ['- ','* ','+ ','1. ','3. ','- [ ] ']){
   await reset('');await select('',0);await type(prefix);await type('Alpha');
   assert.ok(shape().some(item=>item.text==='Alpha'),prefix+': '+JSON.stringify(content()));
   assert.equal(view.state.selection.$from.parent.textContent,'Alpha');await saved();
  }
 });
 await test('Enter creates peers; empty Enter exits to a root paragraph before a neighboring table',async()=>{
  for(const prefix of ['- ','1. ','- [ ] ']){
   await reset(prefix+'Alpha\n\n'+table);await select('Alpha');await key('Enter');await type('Beta');
   assert.deepEqual(shape().map(item=>item.text),['Alpha','Beta']);
   await key('Enter');await key('Enter');assert.equal(view.state.selection.$from.depth,1);
   await type('Root');assert.equal(view.state.selection.$from.parent.textContent,'Root');
   assert.equal(rootTypes().filter(type=>type==='table').length,1);assert.ok(content().includes(table));await saved();
  }
 });
 await test('Tab and ShiftTab nest and lift an item with its subtree; one undo preserves exact source',async()=>{
  for(const prefix of ['- ','1. ','- [ ] ']){
   const indent=prefix==='1. '?'   ':'  ';const source=prefix+'Alpha\n'+prefix+'Beta\n'+indent+prefix+'Child\n'+prefix+'Gamma\n\n'+table;
   await reset(source);await select('Beta');const initial=shape();assert.equal((await key('Tab')).defaultPrevented,true);
   const nested=shape();assert.equal(nested.find(i=>i.text==='Beta').depth,initial.find(i=>i.text==='Beta').depth+2);
   assert.equal(nested.find(i=>i.text==='Child').depth,initial.find(i=>i.text==='Child').depth+2);await exactHistory(source);
   await select('Beta');await key('Tab',{shiftKey:true});assert.deepEqual(shape(),initial);assert.ok(content().includes(table));
  }
 });
 await test('first ordinary item Tab is a safe no-op and ShiftTab removes its list marker',async()=>{
  for(const prefix of ['- ','3. ']){
   const source=prefix+'Alpha\n\n'+table;await reset(source);await select('Alpha');await key('Tab');
   assert.equal(content(),source,'no previous sibling must not add literal indentation spaces');
   await key('Tab',{shiftKey:true});assert.equal(view.state.selection.$from.depth,1);assert.equal(view.state.selection.$from.parent.textContent,'Alpha');
   assert.ok(content().includes(table));await exactHistory(source);
  }
 });
 await test('forward and reverse multi-item selections indent as a group and keep a following table',async()=>{
  const source='- Alpha\n- Beta\n- Gamma\n- Delta\n\n'+table;
  for(const reverse of [false,true]){
   await reset(source);let from,to;view.state.doc.descendants((node,pos)=>{if(node.isTextblock&&node.textContent==='Beta')from=pos+1;if(node.isTextblock&&node.textContent==='Gamma')to=pos+1+node.content.size;});
   await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,reverse?to:from,reverse?from:to)));});
   await key('Tab');assert.deepEqual(shape().map(item=>[item.text,item.depth]),[['Alpha',2],['Beta',4],['Gamma',4],['Delta',2]]);
   assert.equal(view.state.selection.anchor>view.state.selection.head,reverse);assert.ok(content().includes(table));await exactHistory(source);
  }
 });
 await test('ShiftTab lifts only a list continuation before a table and keeps table ownership',async()=>{
  for(const middle of ['Continuation','## Continuation']) {
   const source='- Alpha\n\n  '+middle+'\n\n  | A | B |\n  | --- | --- |\n  | C | D |\n\n- Gamma\n';
   await reset(source);await select('Continuation');await key('Tab',{shiftKey:true});
   assert.equal(view.state.selection.$from.depth,1,'continuation must become root');assert.equal(view.state.selection.$from.parent.textContent,'Continuation');
   assert.equal(shape()[0].text,'Alpha');assert.equal(shape().at(-1).text,'Gamma');
   let tableDepth;view.state.doc.descendants((node,pos)=>{if(node.type.name==='table')tableDepth=view.state.doc.resolve(pos).depth;});
   assert.ok(tableDepth>0,'unselected table must retain its list ownership');await exactHistory(source);
  }
 });
 await test('Backspace retains ordinary continuation versus task lifting semantics without losing neighbors',async()=>{
  for(const prefix of ['- ','1. ','- [ ] ']) {
   const indent=prefix==='1. '?'   ':'  ';const source='Before\n\n'+prefix+'Alpha\n'+indent+prefix+'Beta\n'+indent+prefix+'Gamma\n\n'+table;
   await reset(source);await select('Beta',0);await key('Backspace');
   if(prefix==='- [ ] ')assert.equal(shape().find(i=>i.text==='Beta').depth,2,'nested task lifts one level');else {assert.equal(shape().find(i=>i.text==='Beta'),undefined,'ordinary first-child Backspace removes its marker');assert.equal(view.state.selection.$from.parent.textContent,'Beta');assert.equal(view.state.selection.$from.node(-1).firstChild.textContent,'Alpha','ordinary item becomes parent continuation');}assert.ok(shape().some(i=>i.text==='Gamma'));assert.ok(content().includes(table));await exactHistory(source);
  }
 });
 await test('list prefixes inside table cells retain lists through save/reparse and Tab navigates cells',async()=>{
  for(const prefix of ['- ','* ','1. ','- [ ] ']) {
   await reset('- Before\n\n'+table+'\nAfter\n');await select('C',0);await type(prefix);
   let cells=0,listsInTable=0;view.state.doc.descendants((node,pos)=>{if(node.type.name==='table_cell'||node.type.name==='table_header')cells++;if(node.type.name==='list_item'&&view.state.doc.resolve(pos).node(1)?.type.name==='table')listsInTable++;});
   assert.equal(cells,4);assert.equal(listsInTable,1);assert.deepEqual(shape(context.get(parserCtx)(content())),shape(),'persisted cell list must keep its shape');const before=content();await key('Tab');assert.equal(view.state.selection.$from.parent.textContent,'D');assert.equal(content(),before);await key('Tab',{shiftKey:true});assert.equal(view.state.selection.$from.parent.textContent,'C');assert.equal(content(),before);await saved();
  }
 });
 await test('ShiftEnter continuation then empty Enter exit allows a fresh list at root without Tab',async()=>{
  for(const prefix of ['- ','1. ','- [x] ']){
   await reset(prefix+'Alpha\n\n'+table);await select('Alpha');await key('Enter',{shiftKey:true});await type('Tail');
   assert.equal(shape().length,1);assert.equal(view.state.selection.$from.parent.textContent,'Alpha\nTail');
   await key('Enter');await type('Peer');assert.equal(shape().length,2);assert.equal(shape()[0].depth,shape()[1].depth);
   await key('Enter');await key('Enter');assert.equal(view.state.selection.$from.depth,1);
   await type('- Reentered');assert.equal(view.state.selection.$from.parent.textContent,'Reentered');assert.equal(shape().at(-1).depth,2);
   assert.equal(rootTypes().filter(type=>type==='table').length,1);assert.ok(content().includes(table));await saved();
  }
 });
 await test('lists after a table retain table cells through marker Backspace, Enter and re-entry',async()=>{
  for(const prefix of ['- ','3. ','- [ ] ']){
   await reset(table+'\n'+prefix+'Alpha\n');await select('Alpha',0);await key('Backspace');
   assert.equal(view.state.selection.$from.depth,1);assert.equal(view.state.selection.$from.parent.textContent,'Alpha');
   assert.ok(content().startsWith(table));await select('Alpha');await key('Enter');await type('- Beta');
   assert.ok(shape().some(item=>item.text==='Beta'));assert.ok(content().startsWith(table));await saved();
  }
 });
 await test('ordered tasks retain status and parent hierarchy through Tab, Enter and reverse Tab',async()=>{
  const source='1. Parent\n2. [x] Done\n3. [ ] Next\n\n'+table;await reset(source);await select('Done');await key('Tab');
  assert.equal(shape().find(item=>item.text==='Done').checked,true);assert.equal(shape().find(item=>item.text==='Done').depth,4);
  await key('Enter');await type('Fresh');const before=content();
  assert.equal(shape().find(item=>item.text==='Fresh').checked,false);assert.equal(shape().find(item=>item.text==='Fresh').depth,4);
  await key('Tab',{shiftKey:true});assert.equal(shape().find(item=>item.text==='Fresh').depth,2);assert.equal(shape().find(item=>item.text==='Done').checked,true);
  assert.ok(content().includes(table));await exactHistory(before);
 });
 await test('readonly and composition cannot invoke list indentation or exit commands',async()=>{
  const source='- Alpha\n- Beta\n';await reset(source);await select('Beta');await render(true);
  for(const [name,modifiers] of [['Tab',{}],['Tab',{shiftKey:true}],['Enter',{}],['Backspace',{}]]){await key(name,modifiers);assert.equal(content(),source);}
  await render(false);await select('Beta',0);
  await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
  for(const name of ['Tab','Enter','Backspace']){await key(name,{isComposing:true,keyCode:229});assert.equal(content(),source);}
  await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true})));
 });
 assert.deepEqual(runtimeErrors,[]);if(failures.length)throw new Error(`${failures.length} failed groups: ${failures.map(([name])=>name).join('; ')}`);
 console.log(`${passed} deep list shortcut groups passed (DOM input/keydown, not native IME)`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));dom.window.close();fs.rmSync(output,{force:true});}
