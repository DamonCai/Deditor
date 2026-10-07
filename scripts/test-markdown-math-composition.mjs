import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url:'http://localhost', pretendToBeVisual:true });
for (const key of ['window','Window','document','Node','NodeFilter','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLDivElement','Element','Text','SVGElement','MutationObserver','DOMParser','DOMRect','Event','InputEvent','CustomEvent','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
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
const output=path.resolve('node_modules/.cache/deditor-markdown-math-composition.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file')writes.push(args);
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
const source='Body\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const failedCases=[];
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failedCases.push(name);console.error('FAIL '+name+'\n'+error.stack);}}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};


// Exercise native-style DOM mutations through the real component/DOMObserver.
// Synthetic composition verifies event ownership, not a physical IME candidate UI.
const fixture='| **项目** |    | 合规： $\\color{#0089FF}{@xx(x舲)}$<br>后续文字**完成率 90 %**<br> |\n| :--- | :- | :--- |\n';
const atBoundary=async(leftType='math_inline')=>{
 let at;
 view.state.doc.descendants((node,pos)=>{if(at===undefined && node.type.name===leftType)at=pos+node.nodeSize;});
 assert.notEqual(at,undefined);
 await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(30);});
 assert.equal(view.state.selection.head,at);
 return at;
};
const compose=async(at,commit='你好')=>{
 await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
 assert.equal(view.composing,true);
 // The browser owns preedit and commit. No helper may prevent beforeinput and
 // manually insert its data or leave ProseMirror stuck composing afterwards.
 const preedit=new dom.window.InputEvent('beforeinput',{inputType:'insertCompositionText',data:'ni',isComposing:true,bubbles:true,cancelable:true});
 await act(async()=>view.dom.dispatchEvent(preedit));assert.equal(preedit.defaultPrevented,false);
 const point=view.domAtPos(at),text=document.createTextNode('ni');
 await act(async()=>{
  if(point.node.nodeType===3){const rest=point.node.splitText(point.offset);rest.before(text);}
  else point.node.insertBefore(text,point.node.childNodes[point.offset]??null);
  window.getSelection().collapse(text,2);
  view.dom.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertCompositionText',data:'ni',isComposing:true,bubbles:true}));await pause(30);
 });
 assert.equal(view.state.selection.head,at+2);
 await act(async()=>{
  text.data=commit;window.getSelection().collapse(text,commit.length);
  view.dom.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertCompositionText',data:commit,isComposing:false,bubbles:true}));
  view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{data:commit,bubbles:true}));await pause(80);
 });
 assert.equal(view.composing,false,'compositionend must reach ProseMirror cleanup');
 assert.equal(view.state.selection.head,at+commit.length,'caret stays at committed text');
};
try {
 await test('M01 colored name before table break: Chinese commit, save, undo/redo and reopen',async()=>{
  await reset(fixture);const at=await atBoundary();await compose(at);
  assert.ok(content().includes('$你好<br>后续文字**完成率 90 %**<br>'));
  await exactHistory(fixture);
 });
 await test('M02 repeated compositions continue at the same caret without duplication',async()=>{
  await reset(fixture);const at=await atBoundary();await compose(at,'你好');await compose(view.state.selection.head,'世界');
  assert.ok(content().includes('$你好世界<br>'));
  assert.equal(view.state.selection.head,at+4);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
 });
 await test('M03 cancelled preedit leaves formula and break intact and next composition works',async()=>{
  await reset(fixture);const at=await atBoundary();await compose(at,'');
  assert.ok(content().includes('$<br>后续文字'));assert.ok(!content().includes('ni'));
  await compose(at,'继续');assert.ok(content().includes('$继续<br>'));assert.equal(view.state.selection.head,at+2);
 });
 await test('M04 adjacent formula/footnote and paragraph terminal formula preserve atom boundaries',async()=>{
  for(const source of ['before $x$[^n] after\n\n[^n]: note\n','before $x$\n']){
   await reset(source);const at=await atBoundary();await compose(at,'中文');
   assert.ok(content().includes('$x$中文'));assert.ok(!content().includes('ni'));
   await exactHistory(source);
  }
 });
 await test('M05 footnote/break and consecutive breaks accept Chinese without moving cells',async()=>{
  for(const [source,type,expected] of [
   ['| A | B |\n| --- | --- |\n| ref[^n]<br>next | other |\n\n[^n]: note\n','footnote_reference','[^n]中文<br>'],
   ['| A | B |\n| --- | --- |\n| first<br><br>next | other |\n','hardbreak','<br>中文<br>'],
  ]){
   await reset(source);const at=await atBoundary(type);await compose(at,'中文');assert.ok(content().includes(expected),content());
   assert.equal(view.dom.querySelectorAll('td')[1].textContent,'other');await exactHistory(source);
  }
 });
 await test('M06 ordinary beforeinput after formula stays native, then accepts composition',async()=>{
  await reset(fixture);const at=await atBoundary();
  const event=new dom.window.InputEvent('beforeinput',{inputType:'insertText',data:'a',bubbles:true,cancelable:true});
  await act(async()=>view.dom.dispatchEvent(event));assert.equal(event.defaultPrevented,false);assert.equal(content(),fixture);
  await compose(at,'甲乙');assert.ok(content().includes('$甲乙<br>'));
 });
 await test('M07 after composition, navigation and subsequent edit stay in another cell',async()=>{
  await reset(fixture);const at=await atBoundary();await compose(at,'中文');
  let first;view.state.doc.descendants((n,p)=>{if(first===undefined&&n.type.name==='paragraph')first=p+1;});
  await act(async()=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,first)));await pause(30);});
  await act(async()=>{view.dispatch(view.state.tr.insertText('新'));await pause(30);});
  assert.ok(content().includes('新'));assert.ok(content().includes('$中文<br>'));assert.equal(store.getState().tabs.find(t=>t.id==='b').content,'<h1>HTML</h1>');
 });
 await test('M08 unmount after composition and reopen retains exact source and next input',async()=>{
  await reset(fixture.replaceAll('\n','\r\n'));const at=await atBoundary();await compose(at,'补充');const saved=content();
  await act(async()=>root.render(null));await render();assert.equal(content(),saved);assert.equal(view.composing,false);
  const next=await atBoundary();await compose(next,'再');assert.ok(content().includes('$再补充<br>'));
 });
 await test('M10 exact reported fixture preserves Chinese input and history after the formula',async()=>{
  const original=fs.readFileSync('tests/fixtures/markdown-math-caret.md','utf8');
  await reset(original);const at=await atBoundary();
  const caret=view.dom.querySelector('.md-atom-boundary-caret');assert.ok(caret);
  assert.equal(caret.contentEditable,'false');assert.equal(caret.textContent,'');
  assert.equal(caret.previousSibling?.getAttribute('data-type'),'math_inline');
  assert.equal(caret.nextSibling?.getAttribute('data-type'),'hardbreak');
  assert.equal(view.dom.getAttribute('data-md-atom-caret'),'true');
  assert.equal(view.state.doc.textContent.includes('\u200b'),false);assert.equal(content(),original);
  await compose(at,'补充');assert.ok(content().includes('$补充<br>端到端链路建设'));
  assert.equal(view.dom.querySelector('.md-atom-boundary-caret'),null);
  assert.equal(view.dom.getAttribute('data-md-atom-caret'),'false');
  assert.equal(content().includes('\u200b'),false);await exactHistory(original);
 });
 await test('M09 WebKit left-edge hit after formula is corrected only for the visible right-side gap',async()=>{
  await reset(fixture);const after=await atBoundary(),before=after-1;
  const atom=view.nodeDOM(before);atom.getBoundingClientRect=()=>({left:100,right:180,top:30,bottom:50,width:80,height:20});
  const click=async(x,y,modifiers={})=>{
   let handled=false;
   await act(async()=>{
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,before)));
    const event=new dom.window.MouseEvent('click',{clientX:x,clientY:y,...modifiers});
    view.someProp('handleClick',handler=>handled=!!handler(view,before,event));await pause(20);
   });return handled;
  };
  assert.equal(await click(185,40),true);assert.equal(view.state.selection.head,after);
  await compose(after,'点击');assert.ok(content().includes('$点击<br>'));
  await reset(fixture);await atBoundary();view.nodeDOM(before).getBoundingClientRect=atom.getBoundingClientRect;
  assert.equal(await click(175,40),false,'inside formula retains its existing selection/tooltip behavior');
  assert.equal(await click(185,65),false,'next line is not redirected');
  assert.equal(await click(185,40,{shiftKey:true}),false,'range selection is not replaced');
  await render(true);assert.equal(await click(185,40),false,'read-only remains inert');
 });

} finally {await act(async()=>root.unmount());dom.window.close();}
assert.deepEqual(runtimeErrors,[]);assert.deepEqual(failedCases,[]);console.log(`Passed ${passed} inline atom composition groups`);
