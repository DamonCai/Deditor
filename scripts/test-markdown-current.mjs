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
const output=path.resolve('node_modules/.cache/deditor-markdown-current.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p; export const isTauri=()=>false;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {default as EditorPane} from './src/components/EditorPane';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {getActiveView} from './src/lib/editorBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
export {renderMarkdown} from './src/lib/markdown';
export {markdownDisplayHtml} from './src/lib/markdownDisplay';
export {SourceTreeCache} from './src/lib/markdownVisual/sourceTreeCache';
export {sourceTree,reuseStartupSourceTrees} from './src/lib/markdownVisual/document';
export {prepareSourceSyntax} from './src/lib/markdownVisual/sourceParser';
export {retainVisualTabs, VISUAL_OVERFLOW_BYTES, VISUAL_OVERFLOW_IDLE_MS} from './src/lib/retainedVisualTabs';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>/\.css(?:\?raw)?$/.test(a.path)?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:store.getState().theme}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}

// All paths/content are generated here; IPC never accesses user files or state.
const setSource = async value => {
 await act(async()=>store.getState().setContent(value,'a','command'));
 await render(false);
 assert.equal(content(),value);
 assert.ok(app.getVisualEditor()?.editable);
};
try {
 await test('source worker success, startup failure, invalid message and timeout all release requests',async()=>{
  const previous=globalThis.Worker, timeout=globalThis.setTimeout;
  const source='x'.repeat(50*1024);
  let instance, mode='success';
  globalThis.Worker=class {
   constructor(){instance=this;this.terminated=false;}
   postMessage({id}) {
    if(mode==='throw')throw Error('generated worker failure');
    queueMicrotask(()=>{
     if(mode==='success')this.onmessage?.({data:{id,tree:{type:'root',children:[]}}});
     else if(mode==='invalid')this.onmessageerror?.({});
    });
   }
   terminate(){this.terminated=true;}
  };
  try {
   assert.deepEqual(await app.prepareSourceSyntax(source),{type:'root',children:[]});
   instance.onerror({preventDefault(){}});
   assert.ok(instance.terminated);
   mode='throw';assert.equal(await app.prepareSourceSyntax(source),undefined);assert.ok(instance.terminated);
   mode='invalid';assert.equal(await app.prepareSourceSyntax(source),undefined);assert.ok(instance.terminated);
   mode='timeout';
   globalThis.setTimeout=(fn,ms,...args)=>timeout(fn,ms===1500?0:ms,...args);
   assert.equal(await app.prepareSourceSyntax(source),undefined);assert.ok(instance.terminated);
  } finally {globalThis.Worker=previous;globalThis.setTimeout=timeout;}
 });
 await test('startup parser reuse isolates transforms and releases on success and rejection',async()=>{
  const cache=new app.SourceTreeCache(), source='x'.repeat(50*1024);
  let parses=0;
  const parse=()=>{parses++;return {children:[{value:'original',position:{start:{offset:0}}}]};};
  await cache.during(async()=>{
   const first=cache.read(source,parse); first.children[0].value='changed'; first.children[0].position.start.offset=5;
   assert.deepEqual(cache.read(source,parse),{children:[{value:'original',position:{start:{offset:0}}}]});
   assert.equal(parses,1);
  });
  cache.read(source,parse); assert.equal(parses,2,'startup cache is released');
  await assert.rejects(cache.during(async()=>{cache.read(source,parse);throw Error('generated initialization failure');}),/generated/);
  cache.read(source,parse); assert.equal(parses,4,'failed startup releases cache');
  await cache.during(async()=>{
   for(const suffix of ['a','b','c','a'])cache.read(source+suffix,parse);
   assert.equal(parses,8,'bounded cache evicts the oldest source');
  });
  const concurrent=new app.SourceTreeCache(); let runs=0, finish;
  const blocked=new Promise(resolve=>{finish=resolve;});
  const pending=concurrent.during(async()=>{concurrent.read(source,()=>++runs);await blocked;});
  await concurrent.during(async()=>assert.equal(concurrent.read(source,()=>++runs),1));
  assert.equal(runs,1,'overlapping initialization shares one source');
  finish();await pending;
  concurrent.read(source,()=>++runs);assert.equal(runs,2,'last initialization releases cache');
  await concurrent.during(async()=>{
   concurrent.seed(source,{value:'prepared'});
   assert.deepEqual(concurrent.read(source,()=>{throw Error('seed was not reused');}),{value:'prepared'});
  });
  const full='# Source\r\n\r\n'+('中文 &copy; **strong** $x_1$ [link][ref]\r\n\r\n| 标题 | Value |\r\n| --- | --- |\r\n| **中文** | code |\r\n\r\n<details><summary>Details</summary>Body</details>\r\n\r\n').repeat(500)+'[ref]: https://example.com\r\n';
  const expected=app.sourceTree(full);
  await app.reuseStartupSourceTrees(async()=>{
   const first=app.sourceTree(full); assert.deepEqual(first,expected);
   first.children.length=0;
   assert.deepEqual(app.sourceTree(full),expected,'full Markdown AST and offsets are preserved');
  });
 });
 await test('visual cache respects pane budgets, expiry, close and media exclusions',async()=>{
  const ids=Array.from({length:12},(_,i)=>String(i));
  const costs=new Map(ids.filter(id=>id!=='1').map(id=>[id,app.VISUAL_OVERFLOW_BYTES/4]));
  const retain=(visits,active,live=ids,now=10,panes=1,enabled=true)=>app.retainVisualTabs(visits,active,live,costs,now,panes,enabled);
  const visits=ids.reduce((old,id,i)=>retain(old,id,ids,i),[]);
  assert.deepEqual(visits.filter(v=>v.extra).map(v=>v.id),['0','2','3']);
  assert.deepEqual(retain(visits,'11',ids,10,2).filter(v=>v.extra).map(v=>v.id),['2','3']);
  assert.deepEqual(retain(visits,null,['0','2','3','11']).map(v=>[v.id,!!v.extra]),[['0',true],['2',true],['3',true],['11',false]]);
  assert.deepEqual(retain(visits,'11',ids,app.VISUAL_OVERFLOW_IDLE_MS+11).map(v=>v.id),ids.slice(4));
  assert.deepEqual(retain(visits,'11',ids,10,1,false).map(v=>v.id),ids.slice(4));
 });
 for (const [name,value] of [
  ['plain words','AT&T a_b 中文_测试'],
  ['literal entities','&copy; &#65; &unknown;'],
  ['backslashes','a\\_b a\\&b'],
  ['adjacent syntax','_literal_ *literal* [literal]'],
 ]) await test('format/save/history/remount: '+name,async()=>{
  // Insert Markdown through the live bridge, then convert the paragraph to a list.
  await setSource('Start\n');
  await act(async()=>{app.getVisualEditor().navigate(1,1);app.getVisualEditor().insert(value,false);});
  const before=content();
  const renderedBefore=await app.renderMarkdown(before,{theme:'light'});
  await act(async()=>app.getVisualEditor().prefix('- '));
  const after=content();assert.notEqual(after,before);
  const html=await app.renderMarkdown(after,{theme:'light'});
  const template=document.createElement('template');template.innerHTML=html;
  assert.ok(template.content.querySelector('li'),'list conversion');
  const original=document.createElement('template');original.innerHTML=renderedBefore;
  assert.equal(template.content.textContent.trim(),original.content.textContent.trim(),'text preserved by conversion');
  if(name==='plain words')assert.ok(after.includes(value),'readable text');
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,after);
  await act(async()=>app.markdownHistory());assert.equal(content(),before,'single undo');
  await act(async()=>app.markdownHistory(true));assert.equal(content(),after,'redo');
  await act(async()=>root.render(null));await render(false);
  assert.equal(content(),after,'remount keeps serialized source');
 });
 for(const theme of ['light','dark'])await test('whole table move/history: '+theme,async()=>{
  store.setState({theme});
  const value='Before\n\n| Name | Value |\n| :--- | ---: |\n| **AT&T** | a_b |\n| 中文 | [Link](https://example.com) |\n\nAfter\n';
  await setSource(value);
  const beforeTable=document.querySelector('.ProseMirror table').textContent;
  const handle=document.querySelector('.md-table-drag');assert.ok(handle);
  await act(async()=>handle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowDown',altKey:true,bubbles:true,cancelable:true})));
  const moved=content();assert.notEqual(moved,value);
  assert.ok(moved.indexOf('After')<moved.indexOf('| Name'),'table follows next paragraph');
  assert.equal(document.querySelector('.ProseMirror table').textContent,beforeTable);
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,moved);
  await act(async()=>app.markdownHistory());assert.equal(content(),value);
  await act(async()=>app.markdownHistory(true));assert.equal(content(),moved);
  await render(true);assert.equal(app.getVisualEditor()?.editable,false);
  const readonlyHandle=document.querySelector('.md-table-drag');
  if(readonlyHandle)await act(async()=>readonlyHandle.dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true})));
  assert.equal(content(),moved,'readonly does not move');
 });
 await test('inline formula output repeats and equation references stay current',async()=>{
  const formula = number => '# Math\n\nInline $x_1$ and $x_1$. Reference $\\eqref{goal}$.\n\n$$\na \\tag{' + number + '}\\label{goal}\n$$\n';
  for (const number of [7, 9]) {
   const original = formula(number);
   await setSource(original);
   const editor = document.querySelector('.ProseMirror');
   const repeated = [...editor.querySelectorAll('[data-type="math_inline"][data-value="x_1"]')];
   assert.equal(repeated.length,2);
   assert.ok(repeated[0].querySelector('.katex'));
   assert.equal(repeated[0].innerHTML,repeated[1].innerHTML);
   const reference = editor.querySelector('[data-type="math_inline"] a[href="#md-equation-goal"]');
   assert.ok(reference?.textContent.includes(String(number)));
   assert.equal(content(),original);
  }
 });
 await test('fixed Markdown HTML stays in its own viewport',async()=>{
  const overlay = '<div style="position: fixed; inset: 0; z-index: 2147483647"><button>Example</button><iframe srcdoc="<p>Nested page</p>"></iframe></div>';
  const original = '# Before\n\n' + overlay + '\n\n<details style="position: relative"><summary>Details</summary>Ordinary markup</details>\n\n## After\n';
  await setSource(original);
  const editor = document.querySelector('.ProseMirror');
  const frame = editor.querySelector('iframe.md-html-document');
  assert.ok(frame?.srcdoc.includes('<button>Example</button>'));
  assert.match(frame.srcdoc, /srcdoc="[^"]*Nested page/);
  assert.ok(frame.getAttribute('sandbox').includes('allow-scripts'));
  assert.ok(editor.querySelector('details > summary'));
  assert.equal(editor.querySelector('h2').textContent,'After');
  assert.equal(content(),original);
  const inline = document.createElement('template');
  inline.innerHTML = app.markdownDisplayHtml(await app.renderMarkdown('Before <span style="POSITION: fixed !important">Overlay</span> after',{theme:'light'}));
  assert.equal(inline.content.querySelector('p').textContent,'Before  after');
  assert.ok(inline.content.querySelector('iframe[data-html-document]')?.dataset.htmlDocument.includes('Overlay'));
  const unclosed = '<div style="position:fixed">Overlay\n\n## Next heading\n';
  inline.innerHTML = app.markdownDisplayHtml(await app.renderMarkdown(unclosed,{theme:'light'}));
  assert.equal(inline.content.querySelector('h2')?.textContent,'Next heading');
  assert.ok(!inline.content.querySelector('iframe[data-html-document]')?.dataset.htmlDocument.includes('Next heading'));
  const exported = await app.renderMarkdown(unclosed,{theme:'light',isolateFixedHtml:false});
  assert.ok(exported.includes('<div style="position:fixed">Overlay'));
 });
 await test('diagram selection only suppresses native highlight while the block is selected',async()=>{
  const original = 'Text\n\n```mermaid\n```\n\nAfter\n';
  await setSource(original);
  const editor = document.querySelector('.ProseMirror');
  const diagram = editor.querySelector('.md-diagram-block');
  assert.ok(diagram);
  assert.equal(editor.classList.contains('md-diagram-selected'),false);
  await act(async()=>diagram.querySelector('.md-diagram-family').click());
  assert.ok(diagram.classList.contains('ProseMirror-selectednode'));
  assert.ok(editor.classList.contains('md-diagram-selected'));
  await act(async()=>app.getVisualEditor().navigate(1,1));
  assert.equal(editor.classList.contains('md-diagram-selected'),false);
  assert.equal(content(),original);
 });
 await test('select all and delete with a footnote preserves source gaps and history',async()=>{
  const original = 'Intro[^n]\r\n\r\nAnother paragraph\r\n\r\n[^n]: Note\r\n';
  await setSource(original);
  app.getVisualEditor().focus();
  const editor = document.querySelector('.ProseMirror');
  const keydown = (key, keyCode, ctrlKey = false) =>
    editor.dispatchEvent(new window.KeyboardEvent('keydown', { key, keyCode, ctrlKey, bubbles: true, cancelable: true }));
  await act(async()=>{keydown('a',65,true);keydown('Backspace',8);});
  const deleted = '\r\n'.repeat(5);
  assert.equal(content(),deleted);
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,deleted);
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
  await act(async()=>app.markdownHistory(true));assert.equal(content(),deleted);
 });
 await test('save failure preserves dirty source',async()=>{
  await setSource('Generated unsaved text\n');failed=true;
  const before=content(),count=writes.length;
  try{await act(async()=>app.saveFile());}catch{}finally{failed=false;}
  assert.equal(content(),before);assert.equal(writes.length,count);
  assert.notEqual(store.getState().tabs[0].savedContent,before);
 });
 await test('reading-only visits defer source views and preserve the cursor on first source edit',async()=>{
  const value=Array.from({length:180},(_,index)=>'Paragraph '+(index+1)).join('\n\n')+'\n';
  await act(async()=>{
   store.setState({tabs:[{id:'c',filePath:'/generated/c.md',content:value,savedContent:value}],activeId:'c',markdownMode:'visual'});
   root.render(React.createElement(app.EditorPane));
   await pause(120);
  });
  assert.equal(app.getVisualEditor()?.tabId,'c');
  assert.equal(document.querySelector('.cm-editor'),null,'visual-only file does not allocate a source view');
  await act(async()=>app.getVisualEditor().navigate(239,3));
  const cursor=store.getState().tabPositions.c?.cursor;
  assert.ok(cursor>1000);
  await act(async()=>{store.setState({markdownMode:'source'});await pause(120);});
  const sourceView=app.getActiveView();
  assert.ok(sourceView);
  assert.equal(sourceView.state.selection.main.head,cursor);
  assert.equal(sourceView.state.doc.toString(),value);
  await act(async()=>{store.setState({markdownMode:'visual'});await pause(120);});
  await act(async()=>{store.setState({markdownMode:'source'});await pause(120);});
  assert.equal(app.getActiveView(),sourceView,'an already visited source view is retained');
 });
 assert.deepEqual(runtimeErrors,[]);
 console.log(`${passed} live component groups passed (isolated IPC, no native acceptance)`);
} finally {
 await act(async()=>root.unmount());dom.window.close();
}
