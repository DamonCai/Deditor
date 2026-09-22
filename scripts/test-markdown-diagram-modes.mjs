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
window.scrollBy=()=>{};
HTMLElement.prototype.scrollIntoView=function(){};
HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
// React DOM must detect the installed DOM before choosing its input event implementation.
const {createRoot}=await import('react-dom/client');
const {flushSync}=await import('react-dom');
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-diagram-modes.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 'mermaid':`export default {initialize(){}, async render(id,source){await new Promise(r=>setTimeout(r,source.includes('Slow')?500:5)); if(source.includes('INVALID'))throw new Error('Generated syntax error');return {svg:'<svg><text>'+source.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</text></svg>'};}};`,
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Confirm, chooseAction} from './src/components/ConfirmDialog';
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
export {commitWindowClose} from './src/lib/windowCloseGuard';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}),React.createElement(app.Confirm)));await pause(120);});};
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
const mode = async name => run(()=>document.querySelector(`.md-diagram-modes [data-mode="${name}"]`).click());
const cmView = () => CMView.findFromDOM(document.querySelector('.md-code-editor .cm-editor'));
const diagramSource = (lang, code='graph LR\n A-->B') => `Before\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\nTail\n`;
try {
await test('overview round 1: full view retains the same source editor through all modes and Escape returns inline',async()=>{
 const original=diagramSource('mermaid');await reset(original);await mode('split');const cm=cmView(),block=document.querySelector('.md-diagram-block');
 await run(()=>block.querySelector('.md-diagram-overview-toggle').click());assert.ok(block.querySelector('dialog[open]'));assert.equal(cmView(),cm);
 for(const value of ['edit','preview','split']){await mode(value);assert.ok(block.querySelector('dialog[open]'));assert.equal(cmView(),cm);assert.equal(content(),original);}
 await run(()=>cm.contentDOM.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 assert.equal(block.querySelector('dialog'),null);assert.equal(cmView(),cm);assert.equal(block.dataset.diagramMode,'split');assert.equal(block.style.height,'');
 assert.equal(document.activeElement,block.querySelector('.md-diagram-overview-toggle'));assert.equal(content(),original);
 await run(()=>block.querySelector('.md-diagram-overview-toggle').click());const reopened=block.querySelector('dialog');await run(()=>reopened.dispatchEvent(new Event('close')));assert.ok(reopened.open,'A delayed close event from an earlier session cannot close the new session');
 await run(()=>block.querySelector('.md-diagram-overview-toggle').click());
});
await test('overview round 2: Mermaid and PlantUML zoom, fit, edits and one-step undo never persist display state',async()=>{
 for(const lang of ['mermaid','plantuml']) {
  const original=diagramSource(lang);await reset(original);const block=document.querySelector('.md-diagram-block'),preview=block.querySelector('.md-code-preview');
  // Isolated SVG geometry: browser coverage exercises actual Mermaid rendering and PlantUML fixtures.
  preview.innerHTML=`<div class="${lang}-diagram"><svg viewBox="0 0 200 1000" style="width:200px;height:1000px"></svg></div>`;
  const svg=preview.querySelector('svg'),style=svg.getAttribute('style');
  Object.defineProperty(preview,'clientWidth',{configurable:true,value:800});Object.defineProperty(preview,'clientHeight',{configurable:true,value:600});
  await run(()=>block.querySelector('.md-diagram-overview-toggle').click());assert.equal(svg.style.height,'568px');
  await run(()=>button('Zoom in').click());assert.equal(svg.style.height,'710px');await run(()=>button('Actual size (100%)').click());assert.equal(svg.style.height,'1000px');
  await run(()=>button('Fit to view').click());assert.equal(svg.style.height,'568px');assert.equal(content(),original);
  const wheel=new window.WheelEvent('wheel',{ctrlKey:true,deltaY:-100,cancelable:true,bubbles:true});await run(()=>preview.dispatchEvent(wheel));assert.equal(wheel.defaultPrevented,true);assert.ok(parseFloat(svg.style.height)>568);
  await mode('edit');const cm=cmView();await run(()=>cm.dispatch({changes:{from:cm.state.doc.length,insert:'\n%% new'}}));
  assert.ok(block.querySelector('dialog[open]'));await run(()=>app.saveFile());assert.equal(writes.at(-1).content,content());await run(()=>app.markdownHistory());assert.equal(content(),original);
  await run(()=>block.querySelector('.md-diagram-overview-toggle').click());assert.equal(block.querySelector('dialog'),null);assert.equal(svg.getAttribute('style'),style);
 }
});
await test('overview round 3: context menu stays inside the modal and its Escape only dismisses the menu',async()=>{
 await reset(diagramSource('mermaid'));await mode('edit');const block=document.querySelector('.md-diagram-block');
 await run(()=>block.querySelector('.md-diagram-overview-toggle').click());
 await run(()=>cmView().contentDOM.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})));
 const menu=block.querySelector('dialog .md-editor-menu');assert.ok(menu);
 await run(()=>menu.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.querySelector('.md-editor-menu'),null);assert.ok(block.querySelector('dialog[open]'));
 await run(()=>block.querySelector('.md-diagram-overview-toggle').click());
});
await test('overview round 4: readonly allows viewing, empty/error disables zoom, deletion and unmount close the modal',async()=>{
 await reset(diagramSource('mermaid',''));await render(true);const block=document.querySelector('.md-diagram-block');
 await run(()=>block.querySelector('.md-diagram-overview-toggle').click());assert.ok(block.querySelector('dialog[open]'));assert.equal(block.querySelector('.md-diagram-modes').hidden,true);assert.equal(button('Zoom in').disabled,true);
 await run(()=>document.dispatchEvent(new Event('deditor-close-diagram-overview')));assert.equal(document.querySelector('dialog[open]'),null);
 await reset(diagramSource('mermaid'));await run(()=>document.querySelector('.md-diagram-overview-toggle').click());
 await run(()=>document.querySelector('.md-diagram-delete').click());assert.equal(document.querySelector('dialog[open]'),null);await run(()=>app.markdownHistory());assert.ok(document.querySelector('.md-diagram-block'));
 await run(()=>document.querySelector('.md-diagram-overview-toggle').click());await act(async()=>root.render(null));assert.equal(document.querySelector('dialog[open]'),null);
});
await test('overview round 5: background tabs release top layer and labels follow language',async()=>{
 for(const language of ['zh','en']) {
  store.setState({language});await reset(diagramSource('mermaid'));const block=document.querySelector('.md-diagram-block');
  const label=language==='zh'?'全览':'Full view';assert.equal(block.querySelector('.md-diagram-overview-toggle').textContent,label);
  await run(()=>block.querySelector('.md-diagram-overview-toggle').click());assert.ok(block.querySelector('dialog[open]'));
  await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',active:false,theme:'light'}),React.createElement(app.Confirm)));await pause(40);});assert.equal(document.querySelector('dialog[open]'),null);
 }
 store.setState({language:'en'});
});
await test('overview round 5: an app confirmation releases the native top layer before taking focus',async()=>{
 await reset(diagramSource('mermaid'));await run(()=>document.querySelector('.md-diagram-overview-toggle').click());assert.ok(document.querySelector('dialog[open]'));
 let answer;await run(()=>{answer=app.chooseAction({title:'Generated save failure',message:'Generated message',buttons:[{label:'Close generated error',value:'close'}]});});
 assert.equal(document.querySelector('dialog[open]'),null);assert.equal(document.activeElement.textContent,'Close generated error');
 await run(()=>document.activeElement.click());assert.equal(await answer,'close');assert.equal(document.querySelector('[role="dialog"]'),null);
});
await test('UX diagram deletion works in all modes, including sole block and aliases; one undo',async()=>{
 for(const lang of ['mermaid','plantuml','puml','uml']) for(const display of ['edit','split','preview']) {
  const original=diagramSource(lang);await reset(original);await mode(display);
  await run(()=>document.querySelector('.md-diagram-delete').click());assert.equal(document.querySelector('.md-diagram-block'),null);assert.ok(content().includes('Before'));assert.ok(content().includes('Tail'));await exactHistory(original);await run(()=>app.markdownHistory());assert.ok(document.querySelector('.md-diagram-block'));
 }
 const only='```mermaid\ngraph LR\n A-->B\n```';await reset(only);await run(()=>document.querySelector('.md-diagram-delete').click());assert.ok(view.state.doc.firstChild.isTextblock);await exactHistory(only);
});
await test('UX localized context menu, keyboard dismissal, readonly and diagram actions',async()=>{
 for(const [language,removeLabel,copyLabel] of [['zh','删除图表','复制'],['en','Delete diagram','Copy']]) {
  store.setState({language});const original=diagramSource('mermaid');await reset(original);
  await run(()=>document.querySelector('.md-code-preview').dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  let menu=document.querySelector('.md-editor-menu');assert.ok(menu);assert.ok(menu.textContent.includes(copyLabel));assert.ok(menu.textContent.includes(removeLabel));
  await run(()=>menu.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(document.querySelector('.md-editor-menu'),null);
  await run(()=>document.querySelector('.md-code-preview').dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  await run(()=>[...document.querySelectorAll('.md-editor-menu button')].find(b=>b.textContent===removeLabel).click());assert.equal(document.querySelector('.md-diagram-block'),null);await exactHistory(original);
  await reset(original);await render(true);assert.equal(document.querySelector('.md-diagram-delete').hidden,true);
  await run(()=>view.dom.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})));
  menu=document.querySelector('.md-editor-menu');assert.ok(menu);assert.ok(menu.querySelectorAll('button:disabled').length>=4);
 }store.setState({language:'en'});
});
await test('UX system spelling escape preserves localized menus and excludes embedded code',async()=>{
 await reset(diagramSource('mermaid'));await range('Before',0,6);
 const prose=view.dom.querySelector('p');assert.ok(prose);
 const context=async(target,altKey=false)=>{const event=new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,altKey});await run(()=>target.dispatchEvent(event));return event;};
 const before=content();view.dom.spellcheck=true;
 assert.equal((await context(prose)).defaultPrevented,true);assert.ok(document.querySelector('.md-editor-menu'));
 const selection=view.state.selection;
 assert.equal((await context(prose,true)).defaultPrevented,false);assert.equal(document.querySelector('.md-editor-menu'),null);assert.ok(view.state.selection.eq(selection));
 const keyboard=new window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,altKey:true,bubbles:true,cancelable:true});
 await run(()=>view.dom.dispatchEvent(keyboard));assert.equal(keyboard.defaultPrevented,false);assert.equal(document.querySelector('.md-editor-menu'),null);
 view.dom.spellcheck=false;assert.equal((await context(prose,true)).defaultPrevented,true);assert.ok(document.querySelector('.md-editor-menu'));
 view.dom.spellcheck=true;await mode('edit');assert.equal((await context(cmView().contentDOM,true)).defaultPrevented,true);assert.ok(document.querySelector('.md-editor-menu'));
 assert.equal(content(),before);
});
await test('UX ordinary code stays open while its keyboard menu is focused and dismisses safely',async()=>{
 store.setState({language:'en'});await reset(diagramSource('typescript','const value = 1;'));
 await run(()=>document.querySelector('.md-code-preview').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true})));
 const cm=cmView();assert.ok(cm);await run(()=>cm.contentDOM.dispatchEvent(new window.KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true,cancelable:true})));
 assert.equal(document.querySelector('.md-code-editor').hidden,false);assert.ok(document.querySelector('.md-editor-menu'));
 await run(()=>document.querySelector('.md-editor-menu').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 assert.equal(document.querySelector('.md-code-editor').hidden,false);assert.ok(cm.hasFocus);
});
await test('UX nested source context clipboard is local, undoable and safe on denied access',async()=>{
 const original=diagramSource('mermaid');await reset(original);await mode('edit');
 const cm=cmView();await run(()=>cm.dispatch({selection:{anchor:0,head:cm.state.doc.length}}));
 let copied='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{copied=text;},readText:async()=>'graph LR\n C-->D'},configurable:true});
 const open=async()=>run(()=>cm.contentDOM.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
 const click=async label=>run(()=>[...document.querySelectorAll('.md-editor-menu button')].find(b=>b.textContent===label).click());
 await open();await click('Copy');assert.equal(copied,'graph LR\n A-->B');assert.equal(content(),original);
 await open();await click('Paste');assert.ok(content().includes('C-->D'));assert.ok(content().includes('Before'));await exactHistory(original);
 await reset(original);await mode('edit');const deny=cmView();await run(()=>deny.dispatch({selection:{anchor:0,head:deny.state.doc.length}}));
 Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied');}},configurable:true});
 await run(()=>deny.contentDOM.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await click('Cut');assert.equal(content(),original);
 for(const change of ['selection','readonly']) {
  await reset(original);await mode('edit');const current=cmView();let resolve;
  Object.defineProperty(navigator,'clipboard',{value:{readText:()=>new Promise(done=>{resolve=done;})},configurable:true});
  await run(()=>current.contentDOM.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await click('Paste');
  if(change==='selection')await run(()=>current.dispatch({selection:{anchor:current.state.doc.length}}));else await render(true);
  await act(async()=>{resolve('stale paste');await pause(40);});assert.equal(content(),original);
 }

});
await test('split round 1: mode labels reuse document labels in both languages',async()=>{
 for(const [language,labels] of [['zh',['编辑','实时预览','阅读']],['en',['Edit','Live Preview','Reading']]]) {
  store.setState({language});await reset(diagramSource('mermaid'));
  assert.deepEqual([...document.querySelectorAll('.md-diagram-modes button')].map(b=>b.textContent),labels);
 }
});
await test('split round 2: drag limits, keyboard resizing and reset do not edit Markdown',async()=>{
 const original=diagramSource('mermaid');await reset(original);await mode('split');
 const divider=document.querySelector('.md-diagram-divider'),body=divider.parentElement;
 body.getBoundingClientRect=()=>({left:100,width:1000});
 const pointer=(pointerId,clientX=0,button=0)=>({pointerId,clientX,button,preventDefault(){},stopPropagation(){}});
 divider.onpointerdown(pointer(1));divider.onpointermove(pointer(1,800));assert.equal(divider.getAttribute('aria-valuenow'),'70');
 divider.onpointermove(pointer(2,0));assert.equal(divider.getAttribute('aria-valuenow'),'70');
 divider.onpointermove(pointer(1,2000));assert.equal(divider.getAttribute('aria-valuenow'),'80');
 divider.onpointermove(pointer(1,-200));assert.equal(divider.getAttribute('aria-valuenow'),'20');
 divider.onpointerup(pointer(1));assert.equal(body.classList.contains('md-diagram-resizing'),false);
 await run(()=>divider.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true})));
 assert.equal(divider.getAttribute('aria-valuenow'),'22');
 await run(()=>divider.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true,cancelable:true})));
 assert.equal(divider.getAttribute('aria-valuenow'),'50');assert.equal(content(),original);
 await mode('edit');assert.equal(divider.hidden,true);await mode('split');assert.equal(divider.getAttribute('aria-valuenow'),'50');
});
await test('split round 3: mode change cancels a drag and separators stay local to each block',async()=>{
 await reset(diagramSource('mermaid')+'\n'+diagramSource('plantuml','@startuml\nA -> B\n@enduml'));
 const dividers=[...document.querySelectorAll('.md-diagram-divider')];await mode('split');
 const divider=dividers[0];divider.parentElement.getBoundingClientRect=()=>({left:0,width:1000});
 divider.onpointerdown({button:0,pointerId:1,preventDefault(){},stopPropagation(){}});
 divider.onpointermove({pointerId:1,clientX:650});assert.equal(divider.getAttribute('aria-valuenow'),'65');
 await mode('preview');assert.equal(divider.parentElement.classList.contains('md-diagram-resizing'),false);
 divider.onpointermove({pointerId:1,clientX:300});assert.equal(divider.getAttribute('aria-valuenow'),'65');
 assert.equal(dividers[1].getAttribute('aria-valuenow'),'50');assert.equal(dividers[1].hidden,true);
 await mode('split');assert.equal(divider.getAttribute('aria-valuenow'),'65');
});
await test('reading mode does not select the whole block; explicit block selection still works',async()=>{
 const original=diagramSource('mermaid');await reset(original);
 for(const previous of ['edit','split']) {
  await mode(previous);await mode('preview');
  const block=document.querySelector('.md-code-block');
  assert.equal(block.classList.contains('ProseMirror-selectednode'),false);
  assert.equal(view.state.selection.constructor.name,'TextSelection');
  assert.equal(document.activeElement,block.querySelector('[data-mode="preview"]'));
  assert.equal(content(),original);
 }
 await run(()=>document.querySelector('.md-code-select').click());
 assert.equal(view.state.selection.constructor.name,'NodeSelection');
 assert.equal(document.querySelector('.md-code-block').classList.contains('ProseMirror-selectednode'),true);
 await mode('preview');assert.equal(document.querySelector('.md-code-block').classList.contains('ProseMirror-selectednode'),false);
 assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'preview');assert.equal(content(),original);
});
await test('round 1: all supported languages expose three modes and preserve exact source', async()=>{
 for (const lang of ['mermaid','plantuml','puml','uml']) {
  const original=diagramSource(lang, lang==='mermaid'?'graph LR\n A-->B':'@startuml\nAlice -> Bob: Hello\n@enduml');await reset(original);
  const block=document.querySelector('.md-code-block');
  assert.equal(block.dataset.diagramMode,'preview');assert.equal(document.querySelector('.md-code-editor').hidden,true);
  for (const name of ['edit','split','preview','split','edit','preview']) {
   await mode(name);assert.equal(block.dataset.diagramMode,name);
   assert.equal(document.querySelector('.md-code-editor').hidden,name==='preview');
   assert.equal(document.querySelector('.md-code-preview').hidden,name==='edit');
   assert.equal(block.querySelectorAll('[aria-pressed="true"]').length,1);
   assert.equal(content(),original);
  }
 }
});
await test('round 1: click selects display, double-click enters split and Escape returns to display',async()=>{
 await reset(diagramSource('mermaid'));const preview=document.querySelector('.md-code-preview');
 await run(()=>preview.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0})));
 assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'preview');
 await run(()=>preview.dispatchEvent(new window.MouseEvent('dblclick',{bubbles:true,cancelable:true})));
 assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'split');
 await run(()=>runScopeHandlers(cmView(),new window.KeyboardEvent('keydown',{key:'Escape'}),'editor'));
 assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'preview');
});
await test('round 2: blank and Unicode input, mode switch, save and exact undo/redo',async()=>{
 for(const code of ['', 'graph LR\n A[中文]-->B[组合字符 é]']) {
  const original=diagramSource('mermaid',code);await reset(original);await mode('edit');
  const cm=cmView();await run(()=>cm.dispatch({changes:{from:cm.state.doc.length,insert:'\n%% 中文注释'},selection:{anchor:cm.state.doc.length}}));
  await mode('split');await mode('preview');assert.ok(content().includes('%% 中文注释'));await exactHistory(original);
 }
});
await test('round 2: empty source has an actionable placeholder instead of endless loading',async()=>{
 await reset(diagramSource('mermaid',''));await mode('split');
 assert.equal(document.querySelector('.md-code-preview [role="status"]').textContent,'Enter code to preview the diagram');
});
await test('round 4: live preview keeps the latest source after slow rendering and recovers from errors',async()=>{
 await reset(diagramSource('mermaid'));await mode('split');const cm=cmView();
 const replace=async text=>run(()=>cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:text}}));
 await replace('graph LR\n Slow-->B');await act(async()=>pause(280));
 await replace('graph LR\n Latest-->B');await act(async()=>pause(900));
 assert.ok(document.querySelector('.md-code-preview svg').textContent.includes('Latest'));
 assert.ok(!document.querySelector('.md-code-preview svg').textContent.includes('Slow'));
 assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'split');
 await replace('INVALID');await act(async()=>pause(400));assert.ok(document.querySelector('.md-code-preview .error'));
 await replace('graph LR\n Recovered-->B');await act(async()=>pause(400));
 assert.ok(document.querySelector('.md-code-preview svg').textContent.includes('Recovered'));
 assert.equal(document.querySelector('.md-code-preview .error'),null);
});
await test('round 3: mode and editor selection survive focus leaving the block',async()=>{
 await reset(diagramSource('mermaid'));await mode('split');const cm=cmView();
 await run(()=>cm.dispatch({selection:{anchor:3,head:5}}));
 await select('Tail');assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'split');
 await mode('edit');assert.equal(cmView(),cm);assert.equal(cm.state.selection.main.anchor,3);assert.equal(cm.state.selection.main.head,5);
});
await test('round 3: two diagram blocks keep independent modes',async()=>{
 await reset(diagramSource('mermaid')+'\n'+diagramSource('plantuml','@startuml\nA -> B\n@enduml'));
 const blocks=[...document.querySelectorAll('.md-code-block')];assert.equal(blocks.length,2);
 await run(()=>blocks[0].querySelector('[data-mode="split"]').click());
 await run(()=>blocks[1].querySelector('[data-mode="edit"]').click());
 assert.equal(blocks[0].dataset.diagramMode,'split');assert.equal(blocks[1].dataset.diagramMode,'edit');
});
await test('round 4: read-only transition closes source and disables edit controls',async()=>{
 await reset(diagramSource('mermaid'));await mode('split');await render(true);
 assert.equal(document.querySelector('.md-code-block').dataset.diagramMode,'preview');
 assert.equal(document.querySelector('.md-diagram-modes').hidden,true);
 assert.ok([...document.querySelectorAll('.md-diagram-modes button')].every(b=>b.disabled));
});
await test('round 5: diagram modes have no copy action; ordinary code retains it',async()=>{
 for(const lang of ['mermaid','plantuml','puml','uml']){
  await reset(diagramSource(lang));
  for(const value of ['preview','edit','split']){await mode(value);assert.ok(![...document.querySelectorAll('.md-code-bar button')].some(button=>button.textContent==='Copy'));}
 }
 await reset(diagramSource('typescript','const x = 1;'));assert.ok([...document.querySelectorAll('.md-code-bar button')].some(button=>button.textContent==='Copy'));
});
await test('round 5: ordinary code and math retain existing editing behavior',async()=>{
 for (const lang of ['typescript','latex','flow','sequence']) {
  await reset(diagramSource(lang,'x'));
  assert.equal(document.querySelector('.md-diagram-modes').hidden,true);
  await run(()=>document.querySelector('.md-code-preview').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0})));
  assert.equal(document.querySelector('.md-code-editor').hidden,false);
  assert.equal(document.querySelector('.md-code-preview').hidden,true);
  await run(()=>runScopeHandlers(cmView(),new window.KeyboardEvent('keydown',{key:'Escape'}),'editor'));assert.equal(document.querySelector('.md-code-editor').hidden,true);
 }
});

const dragPointer=(target,type,x,y)=>{const event=new window.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,'pointerId',{value:7});target.dispatchEvent(event);};
const geometry=()=>{
 const bounds={left:0,right:800,top:0,bottom:700,width:800,height:700};
 document.querySelector('.md-visual-scroll').getBoundingClientRect=()=>bounds;
 view.dom.getBoundingClientRect=()=>bounds;
 view.state.doc.forEach((node,pos,index)=>{const element=view.nodeDOM(pos);if(element)element.getBoundingClientRect=()=>({left:20,right:760,top:30+index*90,bottom:100+index*90,width:740,height:70});});
};
await test('drag round 1: Mermaid and PlantUML pointer moves up/down with exact single undo and saved source',async()=>{
 for(const lang of ['mermaid','plantuml']) {
  const original=`Before\n\n${'```'}${lang}\n${lang==='mermaid'?'graph LR\n A --> B':'@startuml\nA -> B\n@enduml'}\n${'```'}\n\nAfter\n\nLast\n`;
  await reset(original);geometry();let handle=document.querySelector('.md-diagram-drag');assert.equal(handle.hidden,false);
  await run(()=>{dragPointer(handle,'pointerdown',35,140);dragPointer(window,'pointermove',35,390);});
  assert.ok(document.querySelector('.md-diagram-drop-line:not([hidden])'));
  await run(()=>dragPointer(window,'pointerup',35,390));assert.equal(view.state.doc.lastChild.type.name,'code_block');
  await exactHistory(original);geometry();handle=document.querySelector('.md-diagram-drag');
  await run(()=>{dragPointer(handle,'pointerdown',35,320);dragPointer(window,'pointermove',35,32);dragPointer(window,'pointerup',35,32);});
  assert.equal(view.state.doc.firstChild.type.name,'code_block');assert.equal(document.querySelector('.md-diagram-drop-line'),null);
 }
});
await test('drag round 2: cancel, outside, no-op and concurrent edits cannot move stale source',async()=>{
 const original=diagramSource('mermaid');await reset(original);geometry();
 const begin=()=>{const h=document.querySelector('.md-diagram-drag');dragPointer(h,'pointerdown',30,140);dragPointer(window,'pointermove',30,300);};
 await run(begin);await key('Escape');assert.equal(content(),original);assert.equal(document.querySelector('.md-diagram-drop-line'),null);
 await run(()=>{begin();dragPointer(window,'pointerup',900,300);});assert.equal(content(),original);
 await run(()=>{const h=document.querySelector('.md-diagram-drag');dragPointer(h,'pointerdown',30,140);dragPointer(window,'pointerup',30,141);});assert.equal(content(),original);
 await run(begin);await run(()=>view.dispatch(view.state.tr.insertText('Changed ',1)));const changed=content();
 await run(()=>dragPointer(window,'pointerup',30,300));assert.equal(content(),changed);assert.equal(document.querySelector('.md-diagram-drop-line'),null);
});
await test('drag round 3: keyboard moves in all modes; aliases, nested blocks and readonly remain safe',async()=>{
 for(const lang of ['mermaid','plantuml','puml','uml']) for(const value of ['preview','edit','split']) {
  await reset(diagramSource(lang));await mode(value);
  await run(()=>document.querySelector('.md-diagram-drag').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true})));
  assert.equal(view.state.doc.firstChild.type.name,'code_block');
  await run(()=>document.querySelector('.md-diagram-drag').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true})));
  assert.equal(view.state.doc.firstChild.type.name,'paragraph');
 }
 await reset('> Before\n>\n> ```mermaid\n> graph LR\n> A --> B\n> ```\n>\n> After\n');
 await run(()=>document.querySelector('.md-diagram-drag').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true})));
 assert.equal(view.state.doc.firstChild.type.name,'blockquote');assert.equal(view.state.doc.firstChild.lastChild.type.name,'code_block');
 await render(true);assert.equal(document.querySelector('.md-diagram-drag').hidden,true);
});

await test('drag round 4: list schema, close/readonly, capture loss and unmount reject late drops',async()=>{
 const original='- First paragraph\n\n  ```mermaid\n  graph LR\n  A --> B\n  ```\n\n  Last paragraph\n';
 await reset(original);
 await run(()=>document.querySelector('.md-diagram-drag').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true})));
 assert.equal(content(),original,'List item retains required leading paragraph');
 const fixture=diagramSource('mermaid');
 const begin=()=>{geometry();const h=document.querySelector('.md-diagram-drag');dragPointer(h,'pointerdown',30,140);dragPointer(window,'pointermove',30,300);return h;};
 for(const cancel of ['close','readonly','capture','unmount']) {
  await reset(fixture);let h;await run(()=>{h=begin();});let resume;
  if(cancel==='close')resume=app.commitWindowClose();
  if(cancel==='readonly')await render(true);
  if(cancel==='capture')await run(()=>h.dispatchEvent(new window.Event('lostpointercapture')));
  if(cancel==='unmount')await act(async()=>root.render(null));
  await run(()=>dragPointer(window,'pointerup',30,300));resume?.();assert.equal(content(),fixture,cancel);assert.equal(document.querySelector('.md-diagram-drop-line'),null,cancel);
 }
});
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} diagram mode groups`);
