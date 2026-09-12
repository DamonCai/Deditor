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
const mode = async name => run(()=>document.querySelector(`.md-diagram-modes [data-mode="${name}"]`).click());
const cmView = () => CMView.findFromDOM(document.querySelector('.md-code-editor .cm-editor'));
const diagramSource = (lang, code='graph LR\n A-->B') => `Before\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\nTail\n`;
try {
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
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} diagram mode groups`);
