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
const output=path.resolve('node_modules/.cache/deditor-markdown-integration.mjs');
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
export {default as EditorHost} from './src/components/EditorHost';
export {getActiveView} from './src/lib/editorBridge';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {default as Preview} from './src/components/Preview';
export {markdownDisplayHtml,hydrateMarkdownDisplay} from './src/lib/markdownDisplay';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {installMarkdownAccessibility} from './src/lib/markdownVisual/accessibility';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile,saveFileAs,saveAllDirty,renamePath} from './src/lib/fileio';
export {renderMarkdown} from './src/lib/markdown';
export {installCompositionViewport} from './src/lib/markdownVisual/compositionViewport';
export {loadPersisted,schedulePersist} from './src/lib/persistence';
export {default as HistoryDialog} from './src/components/MarkdownHistoryDialog';
export {localMarkdownTarget,headingSourcePosition} from './src/lib/markdownLinks';
export {default as WritingSettings} from './src/components/MarkdownWritingSettings';
export {default as ModeSwitch} from './src/components/PreviewModeSwitch';
export {collectMarkdownImages} from './src/lib/markdownImageCollect';
export {documentImageDirectory,documentImageRoot,resolveMarkdownImage,markdownImageReference} from './src/lib/markdownImageSettings';
export {hydrateLocalImages} from './src/lib/localImgHydrate';
export {rebaseMarkdownImages} from './src/lib/markdownImagePaths';
export {installTypewriter} from './src/lib/markdownVisual/typewriter';
export {normalizeMarkdownPreferences,defaultMarkdownPreferences} from './src/lib/markdownPreferences';
export {getBlockHint} from './src/lib/markdownVisual/blockHint';
export {flushDocument} from './src/lib/documentFlush';
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
await render();
await test('round 1: initial render and readonly transitions are exact no-ops',async()=>{assert.equal(content(),source);await render(true);assert.equal(document.querySelector('.ProseMirror').getAttribute('contenteditable'),'false');await render(false);assert.equal(content(),source);});
await test('heading hints: only the caret heading is decorated across H1–H6, without changing source or history',async()=>{
 const headings=Array.from({length:6},(_,i)=>'#'.repeat(i+1)+' 标题 '+(i+1)+'\n\n正文 '+(i+1)+'\n').join('\n');
 await act(async()=>store.getState().setContent(headings,'a','command'));
 for(let level=1;level<=6;level++){
  await act(async()=>app.getVisualEditor().navigate((level-1)*4+1,level+2));
  const active=document.querySelectorAll('.md-heading-active');
  assert.equal(active.length,1);assert.equal(active[0].tagName,'H'+level);
  await act(async()=>app.getVisualEditor().navigate((level-1)*4+3,2));
  assert.equal(document.querySelectorAll('.md-heading-active').length,0);
 }
 assert.equal(content(),headings);
 await act(async()=>app.markdownHistory());assert.equal(content(),source);
 await act(async()=>app.markdownHistory(true));assert.equal(content(),headings);
 await act(async()=>app.markdownHistory());assert.equal(content(),source);
});
await test('heading hints: empty and nested headings track the caret through readonly and remount',async()=>{
 const headings='## \n\n> ### 引用标题\n\n正文\n';
 await act(async()=>store.getState().setContent(headings,'a','command'));
 await act(async()=>app.getVisualEditor().navigate(1,4));assert.equal(document.querySelector('.md-heading-active')?.tagName,'H2');
 await act(async()=>app.getVisualEditor().navigate(3,8));assert.equal(document.querySelector('.md-heading-active')?.tagName,'H3');
 await render(true);assert.equal(document.querySelector('.md-visual-shell').dataset.readonly,'true');
 await render(false);
 await act(async()=>root.render(null));await render();
 await act(async()=>app.getVisualEditor().navigate(5,2));assert.equal(document.querySelectorAll('.md-heading-active').length,0);
 assert.equal(content(),headings);await act(async()=>app.markdownHistory());assert.equal(content(),source);
});
const complexMarkdown=fs.readFileSync('tests/fixtures/markdown-complex.md','utf8');
await test('block hint selections: clicking a table paragraph, atomic image/rule, and selecting text',async()=>{
 const {Schema}=await import('@milkdown/kit/prose/model');
 const {EditorState,NodeSelection,TextSelection}=await import('@milkdown/kit/prose/state');
 const schema=new Schema({nodes:{doc:{content:'block+'},text:{group:'inline'},paragraph:{content:'inline*',group:'block'},table:{content:'table_row+',group:'block'},table_row:{content:'table_cell+'},table_cell:{content:'paragraph+'},'image-block':{group:'block',atom:true},hr:{group:'block',atom:true}}});
 const doc=schema.node('doc',null,[schema.node('table',null,[schema.node('table_row',null,[schema.node('table_cell',null,[schema.node('paragraph',null,[schema.text('cell')])])])]),schema.node('image-block'),schema.node('hr')]);
 const hint=selection=>app.getBlockHint(EditorState.create({doc,selection}));
 assert.equal(hint(TextSelection.create(doc,4)).label,'| |');
 assert.equal(hint(NodeSelection.create(doc,3)).label,'| |');
 assert.equal(hint(NodeSelection.create(doc,doc.child(0).nodeSize)).label,'IMG');
 assert.equal(hint(NodeSelection.create(doc,doc.child(0).nodeSize+1)).label,'---');
 assert.equal(hint(TextSelection.create(doc,4,6)),null);
});
const navigateMarker=async(marker)=>{
 const index=content().indexOf(marker);assert.notEqual(index,-1,marker);
 const before=content().slice(0,index);
 await act(async()=>{app.getVisualEditor().navigate(before.split('\n').length,index-before.lastIndexOf('\n')+1);await pause(25);});
};
await test('complex document: contextual hints cover paragraphs, nested structures, code, math, diagrams and raw blocks',async()=>{
 await act(async()=>store.getState().setContent(complexMarkdown,'a','command'));
 for(const [marker,label] of [
  ['正文定位点','¶'],['综合文档 H1','H1'],['项目说明 H2','H2'],['方案设计 H3','H3'],['接口约定 H4','H4'],['边界条件 H5','H5'],['补充说明 H6','H6'],
  ['引用定位点','>'],['深层引用定位点','>'],['引用内标题','H4'],['引用内列表定位点','-'],
  ['无序定位点','-'],['子列表定位点','-'],['有序定位点','1.'],['深层有序定位点','1.'],['任务定位点','[ ]'],['子任务定位点','[ ]'],
  ['表格定位点','| |'],['代码定位点','</>'],['E &= mc','$$'],['flowchart TD','UML'],['sequenceDiagram','UML'],['HTML 定位点','HTML'],['owner: 自建','YAML'],['文末定位点','¶'],
 ]){
  await navigateMarker(marker);
  const active=document.querySelectorAll('[data-md-block-hint]');
  assert.equal(active.length,1,marker);assert.equal(active[0].getAttribute('data-md-block-hint'),label,marker);
 }
 assert.equal(content(),complexMarkdown);
 await act(async()=>app.markdownHistory());assert.equal(content(),source);
});
await test('complex document: edits at the top, inside nested list/table and at the end save and undo exactly',async()=>{
 await act(async()=>store.getState().setContent(complexMarkdown,'a','command'));
 for(const marker of ['正文定位点','子列表定位点','表格定位点','文末定位点']){
  await navigateMarker(marker);
  await act(async()=>app.getVisualEditor().insert('新增中文',false));
 }
 const edited=content();assert.equal((edited.match(/新增中文/g)??[]).length,4);
 await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);
 await render(true);await act(async()=>pause(30));assert.equal(document.querySelector('.md-block-hint').hidden,true);
 await render(false);assert.equal(content(),edited);
 for(let i=0;i<4;i++) await act(async()=>app.markdownHistory());
 assert.equal(content(),complexMarkdown);
 for(let i=0;i<4;i++) await act(async()=>app.markdownHistory(true));
 assert.equal(content(),edited);
 for(let i=0;i<5;i++) await act(async()=>app.markdownHistory());
 assert.equal(content(),source);
});
await test('round 1: DOM text edit synchronously feeds shared source and save',async()=>{
 await act(async()=>{const paragraph=document.querySelector('.ProseMirror > p');paragraph.firstChild.textContent='Edited paragraph';paragraph.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
 assert.equal(content(),source.replace('Original','Edited'));
 await act(async()=>{await app.saveFile();});assert.equal(writes.at(-1).content,content());assert.equal(store.getState().tabs[0].savedContent,content());
});
await test('round 2: source edit and undo update visual document without creating history echoes',async()=>{
 const visual=content();await act(async()=>{store.getState().setContent(visual.replace('Edited','Source'),'a','source');});
 assert.match(document.querySelector('.ProseMirror').textContent,/Source paragraph/);
 await act(async()=>{app.markdownHistory();});assert.equal(content(),visual);
 await act(async()=>{app.markdownHistory();});assert.equal(content(),source);
 await act(async()=>{app.markdownHistory(true);app.markdownHistory(true);});assert.match(content(),/Source paragraph/);
});
await test('round 3: save-as changes Markdown path and rebuilds view without losing edits',async()=>{
 const expected=content();await act(async()=>{await app.saveFileAs();await pause(120);});assert.equal(store.getState().tabs[0].filePath,'/generated/renamed.md');assert.equal(content(),expected);assert.equal(writes.at(-1).content,expected);
});
await test('round 3: save-all writes Markdown and HTML separately',async()=>{
 await act(async()=>{store.getState().setContent(content()+'\nMore','a','source');store.getState().setContent('<h1>Changed</h1>','b');});
 const count=writes.length;await act(async()=>{await app.saveAllDirty();});assert.equal(writes.length-count,2);assert.equal(writes.at(-1).content,'<h1>Changed</h1>');
});
await test('round 4: failed save retains the unsaved Markdown buffer',async()=>{
 await act(async()=>{store.getState().setContent(content()+'\nUnsaved','a','source');});const expected=content();failed=true;
 await act(async()=>{await assert.rejects(app.saveFile(), /generated disk failure/);});failed=false;assert.equal(content(),expected);assert.notEqual(store.getState().tabs[0].savedContent,expected);
});
await test('round 5: visual toolbar toggles and converts lists through shared history',async()=>{
 await act(async()=>store.getState().setContent('plain\n','a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,2);app.getVisualEditor().prefix('- ');});
 assert.match(content(),/^[-*] plain/);
 await act(async()=>app.getVisualEditor().prefix('1. '));assert.match(content(),/^1[.)] plain/);
 await act(async()=>app.getVisualEditor().prefix('1. '));assert.equal(content().trim(),'plain');
 await act(async()=>app.markdownHistory());assert.match(content(),/^1[.)] plain/);
});
await test('round 5: readonly empty code block cannot insert a paragraph with ArrowDown',async()=>{
 const codeSource='# Code\n\n```\n\n```\n';
 await act(async()=>store.getState().setContent(codeSource,'a','command'));
 await act(async()=>document.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true})));await render(true);
 await act(async()=>{document.querySelector('.md-code-block .cm-content').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));});
 assert.equal(content(),codeSource);await render(false);
});
await test('round 5: table Tab navigates and appends an editable empty row',async()=>{
 const tableSource='# Table\n\n| A | B |\n| --- | --- |\n| one | two |\n';
 await act(async()=>store.getState().setContent(tableSource,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(6,10);});
 await act(async()=>{document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));});
 assert.equal(document.querySelectorAll('.ProseMirror tr').length,3);
 assert.doesNotMatch(content(),/<br/);
 await render(true);await render(false);assert.equal(document.querySelectorAll('.ProseMirror tr').length,3);
 await act(async()=>app.markdownHistory());assert.equal(content(),tableSource);
});
await test('round 4: unmount/remount retains content and history',async()=>{
 const expected=content();await act(async()=>{root.render(null);});assert.equal(app.getVisualEditor(),null);await render();assert.equal(content(),expected);await act(async()=>app.markdownHistory());assert.notEqual(content(),expected);
});
function RetainedEditors() {
 const activeId=store(s=>s.activeId),mode=store(s=>s.markdownMode);
 const visual=activeId==='a' && mode==='visual';
 return React.createElement(React.Fragment,null,
  React.createElement('div',{style:{display:visual?'none':'block'}},React.createElement(app.EditorHost,{activeId,theme:'light',fontSize:14})),
  visual?React.createElement(app.Visual,{tabId:'a',theme:'light'}):null);
}
await test('round 5: retained source editor relinquishes commands to visual mode and shares native undo events',async()=>{
 await act(async()=>{root.render(null);store.setState({activeId:'a',markdownMode:'visual'});store.getState().setContent('# Retained\n\nbody\n','a','command');});
 await act(async()=>{root.render(React.createElement(RetainedEditors));await pause(120);});
 assert.equal(app.getActiveView(),null);assert.equal(app.getVisualEditor().tabId,'a');
 const {EditorView:SourceView}=await import('@codemirror/view');
 const hidden=SourceView.findFromDOM(document.querySelector('.cm-editor'));
 const hiddenBefore=hidden.state.doc.toString();
 const before=content();await act(async()=>{app.getVisualEditor().navigate(3,5);app.getVisualEditor().insert(' visual',false);});
 const visual=content();assert.notEqual(visual,before);
 assert.equal(hidden.state.doc.toString(),hiddenBefore,'hidden Markdown source does not process each visual edit');
 await app.saveFile();assert.equal(writes.at(-1).content,visual,'saving reads current visual content while source is deferred');
 await act(async()=>store.setState({markdownMode:'source'}));
 assert.equal(app.getVisualEditor(),null);const view=app.getActiveView();assert.equal(view.state.doc.toString(),visual);
 await act(async()=>view.dispatch({changes:{from:view.state.doc.length,insert:' source'}}));
 const undo=()=>view.contentDOM.dispatchEvent(new dom.window.InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}));
 await act(async()=>undo());assert.equal(content(),visual);
 await act(async()=>undo());assert.equal(content(),before);assert.equal(view.state.doc.toString(),before);
});
await test('round 5: HTML retained editor keeps its own undo while Markdown source is hidden',async()=>{
 const markdown=content();await act(async()=>store.setState({activeId:'b',markdownMode:'visual'}));
 const html=store.getState().tabs.find(t=>t.id==='b').content,view=app.getActiveView();assert.ok(view);assert.equal(app.getVisualEditor(),null);
 await act(async()=>view.dispatch({changes:{from:view.state.doc.length,insert:'<p>independent</p>'}}));
 const {undo}=await import('@codemirror/commands');await act(async()=>undo(view));
 assert.equal(store.getState().tabs.find(t=>t.id==='b').content,html);assert.equal(content(),markdown);
 await act(async()=>{store.setState({activeId:'a',markdownMode:'visual'});await pause(120);});
 assert.equal(app.getActiveView(),null);assert.equal(content(),markdown);assert.equal(app.getVisualEditor().tabId,'a');
});
await test('deferred source: latest replacements and visual cursor survive hidden editor disposal',async()=>{
 const {EditorView:SourceView}=await import('@codemirror/view');
 const hidden=SourceView.findFromDOM(document.querySelector('.cm-editor')),old=hidden.state.doc.toString();
 for(const text of ['first','second','latest']) await act(async()=>store.getState().setContent('# Deferred\n\n'+text+'\n','a','command'));
 assert.equal(hidden.state.doc.toString(),old);
 await act(async()=>app.getVisualEditor().navigate(3,4));
 const cursor=store.getState().tabPositions.a.cursor,latest=content();
 await act(async()=>{root.render(null);await pause(240);});
 assert.equal(store.getState().tabPositions.a.cursor,cursor,'stale hidden source position must not replace the visual caret');
 await act(async()=>{store.setState({markdownMode:'source'});root.render(React.createElement(RetainedEditors));await pause(120);});
 assert.equal(app.getActiveView().state.doc.toString(),latest);assert.equal(content(),latest);
});
await test('reported editing bug: a closed or open search never steals the caret on document changes',async()=>{
 await act(async()=>{root.render(null);store.setState({activeId:'a',markdownMode:'visual'});store.getState().setContent('# Top\n\nbody\n\nBottom target\n','a','command');});await render();
 await act(async()=>{app.getVisualEditor().find();});
 const input=document.querySelector('[role="search"] input');
 await act(async()=>{
   Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Bottom');
   input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 });
 assert.equal(input.value,'Bottom');assert.equal(app.getVisualEditor().selected,'Bottom');
 const editTop=async(label)=>{
   await act(async()=>app.getVisualEditor().navigate(1,4));
   await act(async()=>{const heading=document.querySelector('.ProseMirror h1');heading.firstChild.textContent=label;heading.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
   assert.ok(store.getState().tabPositions.a.cursor < label.length+5,'caret stays in heading');
   assert.equal(app.getVisualEditor().selected,'');assert.ok(content().includes('Bottom target'));
 };
 await editTop('Top while searching');
 await act(async()=>document.querySelector('[role="search"] button:last-child').click());
 await editTop('Top after closing search');
});
await test('search: Unicode offsets and reopening after long-document edits use current positions',async()=>{
 const original=Array.from({length:100},(_,i)=>`## Section ${i}\n\nİ 😀 **target** paragraph ${i}\n`).join('\n');
 await act(async()=>{root.render(null);store.setState({activeId:'a'});store.getState().setContent(original,'a','command');});await render();
 await act(async()=>app.getVisualEditor().find());
 const query=async()=>act(async()=>{
  const input=document.querySelector('[role="search"] input');
  Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'target');
  input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 });
 await query();assert.equal(app.getVisualEditor().selected,'target');
 assert.match(document.querySelector('[role="search"]').textContent,/1 \/ 100/);
 await act(async()=>document.querySelector('[role="search"] button:last-child').click());
 await act(async()=>app.getVisualEditor().navigate(1,4));
 await act(async()=>app.getVisualEditor().insert('prefix',false));
 await act(async()=>app.getVisualEditor().find());
 assert.equal(app.getVisualEditor().selected,'target');
 await act(async()=>app.markdownHistory(false,'a'));assert.equal(content(),original);
 await act(async()=>document.querySelector('[role="search"] button:last-child').click());
});
await test('search replace: capture groups, styles, undo/redo and invalid regex',async()=>{
 const original='# Search\n\n**item12** item34 scatter cat Cat\n';
 await act(async()=>{root.render(null);store.getState().setContent(original,'a','command');});await render();
 await act(async()=>app.getVisualEditor().find());
 const input=async(index,value)=>act(async()=>{const element=document.querySelectorAll('[role="search"] input')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});
 const button=label=>[...document.querySelectorAll('[role="search"] button')].find(button=>button.textContent===label);
 await input(0,'item(\\d+)');await act(async()=>button('Regex').click());await input(1,'value$1');
 await act(async()=>button('Replace All').click());
 assert.match(content(),/\*\*value12\*\* value34/);
 await act(async()=>app.markdownHistory(false,'a'));assert.equal(content(),original);
 await act(async()=>app.markdownHistory(true,'a'));assert.match(content(),/value34/);
 await input(0,'[');assert.ok(document.querySelector('[role="search"] [role="alert"]'));assert.equal(button('Replace All').disabled,true);
 await act(async()=>document.querySelector('[role="search"] button:last-child').click());
});
await test('links: editable body follows modifier-click only, including malformed anchors',async()=>{
 await act(async()=>{root.render(null);store.getState().setContent('# Destination\n\n[Jump](#destination) [Malformed](#%broken)\n','a','command');});await render();
 let jumps=0;const heading=document.querySelector('.ProseMirror h1');heading.scrollIntoView=()=>jumps++;
 const link=document.querySelector('.ProseMirror a');
 await act(async()=>link.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true})));assert.equal(jumps,0);
 await act(async()=>link.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,metaKey:true})));assert.equal(jumps,1);
 await act(async()=>document.querySelectorAll('.ProseMirror a')[1].dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true})));
});
await test('accessibility: unchanged controls produce no repeated attribute mutations',async()=>{
 const host=document.createElement('div');host.innerHTML='<div class="handle" data-show="false"></div><div class="milkdown-list-item-block"><div class="label-wrapper"><span class="unchecked"></span></div><div data-content-dom>Task text</div></div>';
 document.body.append(host);const fake={dom:host,editable:true};const dispose=app.installMarkdownAccessibility(fake);
 const observer=new MutationObserver(()=>{});observer.observe(host,{subtree:true,attributes:true});
 host.dispatchEvent(new Event('deditor-editable-change'));
 assert.equal(observer.takeRecords().length,0,'unchanged semantics do not cause ProseMirror DOM reconciliation');
 host.querySelector('.unchecked').className='checked';await pause(10);
 assert.equal(host.querySelector('.label-wrapper').getAttribute('aria-checked'),'true');
 fake.editable=false;host.dispatchEvent(new Event('deditor-editable-change'));
 assert.equal(host.querySelector('.label-wrapper').tabIndex,-1);
 assert.equal(host.querySelector('.label-wrapper').getAttribute('aria-readonly'),'true');
 observer.disconnect();dispose();host.remove();
});
await test('accessibility: local mutations never rescan the document and nested task names stay current',async()=>{
 const host=document.createElement('div');
 const task=text=>`<div class="milkdown-list-item-block"><div class="label-wrapper"><span class="unchecked"></span></div><div data-content-dom>${text}</div><div class="handle" data-show="false"></div></div>`;
 host.innerHTML='<p>plain</p>'+Array.from({length:500},(_,i)=>task('Task '+i)).join('')+'<div class="milkdown-list-item-block"><div class="label-wrapper" role="button" tabindex="0">Other control</div></div>';document.body.append(host);
 const dispose=app.installMarkdownAccessibility({dom:host,editable:true});
 let scans=0;const query=host.querySelectorAll;host.querySelectorAll=function(...args){scans++;return query.apply(this,args);};
 try {
  const handle=host.querySelector('.handle');handle.dataset.show='true';
  host.querySelector('p').firstChild.data='plain edited';await pause(10);
  assert.equal(scans,0);assert.equal(handle.getAttribute('aria-hidden'),'false');
  const block=host.querySelector('.milkdown-list-item-block'),body=block.querySelector('[data-content-dom]'),label=block.querySelector('.label-wrapper');
  body.firstChild.data='Renamed';await pause(10);assert.equal(label.getAttribute('aria-label'),'Renamed');
  body.insertAdjacentHTML('beforeend',task('Nested'));await pause(10);
  const nested=body.querySelector('[data-content-dom]');nested.firstChild.data='Child changed';await pause(10);
  assert.match(label.getAttribute('aria-label'),/Child changed/);assert.equal(body.querySelector('.label-wrapper').getAttribute('aria-label'),'Child changed');
  nested.parentElement.remove();await pause(10);assert.equal(label.getAttribute('aria-label'),'Renamed');
  label.querySelector('span').className='bullet';await pause(10);assert.equal(label.hasAttribute('role'),false);assert.equal(label.hasAttribute('tabindex'),false);
  assert.equal(scans,0);
  assert.equal(host.lastElementChild.firstElementChild.getAttribute('role'),'button');
  assert.equal(host.lastElementChild.firstElementChild.tabIndex,0);
 } finally {dispose();host.remove();}
});
await test('outline: opening after edits reads current headings and positions',async()=>{
 await act(async()=>store.getState().setContent('# First\n\nbody\n\n## Second\n','a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,3);app.getVisualEditor().insert('New',false);});
 const toggle=()=>[...document.querySelectorAll('.md-visual-controls button')].at(-1).click();
 await act(async()=>toggle());assert.match(document.querySelector('.md-visual-toc').textContent,/NewFirst/);
 await act(async()=>toggle());
 await act(async()=>store.getState().setContent('# Replacement\n\n### Third\n','a','command'));
 await act(async()=>toggle());assert.equal(document.querySelectorAll('.md-outline-row button[data-size="sm"]').length,2);assert.match(document.querySelector('.md-visual-toc').textContent,/Replacement.*Third/);
 await act(async()=>document.querySelectorAll('.md-outline-row button[data-size="sm"]')[1].click());
 assert.equal(app.getVisualEditor().heading,3);
 await act(async()=>toggle());
});
await test('outline: collapse, filter and selection highlight keep document unchanged',async()=>{
 const original='# Parent\n\n## Child\n\n# Other\n';await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>document.querySelector('.md-visual-controls button:last-child').click());
 await act(async()=>document.querySelector('.md-visual-toc [aria-expanded]').click());
 assert.equal([...document.querySelectorAll('.md-outline-row')].some(row=>row.textContent==='Child'),false);
 await act(async()=>{const input=document.querySelector('.md-visual-toc input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Child');input.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.match(document.querySelector('.md-visual-toc').textContent,/Child/);
 await act(async()=>document.querySelector('.md-outline-row button').click());assert.ok(document.querySelector('.md-visual-toc [aria-current="location"]'));
 assert.equal(content(),original);await act(async()=>document.querySelector('.md-visual-controls button:last-child').click());
});
await test('local links: Unicode, duplicates and escaped filename delimiters',async()=>{
 assert.deepEqual(app.localMarkdownTarget('next%23part.md#中文','/generated/a.md'),{path:'/generated/next#part.md',anchor:'中文'});
 assert.equal(app.localMarkdownTarget('literal%2520.md','/generated/a.md').path,'/generated/literal%20.md');
 assert.equal(app.headingSourcePosition('# 中文\n\n## 中文\n','%E4%B8%AD%E6%96%87-1').line,3);
});
await test('lazy code: long documents create code editors only when a block is edited',async()=>{
 const original=Array.from({length:100},(_,i)=>'```js\nconst value = '+i+';\n```\n').join('\n');
 await act(async()=>store.getState().setContent(original,'a','command'));
 assert.ok(document.querySelectorAll('.md-code-editor .cm-editor').length<=1,'only an actively restored code caret may instantiate an editor');
 await act(async()=>document.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true})));
 assert.equal(document.querySelectorAll('.md-code-editor .cm-editor').length,1);assert.equal(content(),original);
});
await test('reported editing bug: lower reference list text is directly editable',async()=>{
 const original='# Top\n\n+ plain\n+ [label][r] <kbd>key</kbd><br>next\n+ lower\n\n[r]: https://example.com\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 assert.equal(document.querySelectorAll('.ProseMirror li').length,3);
 assert.equal(document.querySelector('.ProseMirror li .md-raw-block'),null);
 await act(async()=>{const p=[...document.querySelectorAll('.ProseMirror li p')].find(p=>p.textContent==='lower');p.firstChild.textContent='lower edited';p.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
 assert.equal(content(),original.replace('lower','lower edited'));
});
await test('reported editing bug: clicking a preserved block edits in place and retains inner selection',async()=>{
 await act(async()=>store.getState().setContent('# Top\n\n<custom>raw text</custom>\n\nBottom\n','a','command'));
 await act(async()=>{await pause(40);document.querySelector('.md-raw-preview').click();await pause(40);});
 const {EditorView}=await import('@codemirror/view');
 const cm=EditorView.findFromDOM(document.querySelector('.md-raw-source .cm-editor'));assert.ok(cm);
 assert.equal(document.querySelector('.md-raw-preview').hidden,true);
 await act(async()=>{cm.focus();cm.dispatch({selection:{anchor:8,head:11}});});
 assert.equal(app.getVisualEditor().selected,'raw');
 await act(async()=>cm.dispatch({changes:{from:8,to:11,insert:'changed'},selection:{anchor:15}}));
 assert.match(content(),/<custom>changed text<\/custom>/);assert.ok(content().endsWith('Bottom\n'));
 await act(async()=>{cm.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(40);});
 assert.equal(document.querySelector('.md-raw-source .cm-editor'),null,'Escape closes block source');
 await act(async()=>document.querySelector('.md-raw-preview').click());
 await render(true);assert.equal(document.querySelector('.md-raw-source .cm-editor'),null);
 assert.equal(document.querySelector('.md-raw-preview').hidden,false);await render(false);
});
await test('reported editing bug: code caret stays in its block and readonly history cannot mutate text',async()=>{
 const original='# Top\n\n```js\nconst value = 1;\n```\n\nBottom\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 const {EditorView}=await import('@codemirror/view');
 await act(async()=>document.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true})));
 const cm=EditorView.findFromDOM(document.querySelector('.md-code-block .cm-editor'));
 await act(async()=>{cm.focus();cm.dispatch({selection:{anchor:6,head:11}});});assert.equal(app.getVisualEditor().selected,'value');
 await act(async()=>cm.dispatch({changes:{from:6,to:11,insert:'count'},selection:{anchor:11}}));
 const expected=content();assert.equal(expected,original.replace('value','count'));
 await render(true);
 await act(async()=>{
   cm.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true,cancelable:true}));
   cm.contentDOM.dispatchEvent(new dom.window.InputEvent('beforeinput',{inputType:'historyUndo',bubbles:true,cancelable:true}));
 });assert.equal(content(),expected);
 await render(false);await act(async()=>app.markdownHistory());assert.equal(content(),original);
});
await test('shared display: sanitized renderer metadata, image roots and cancellation use one lifecycle',async()=>{
 const raw='<p data-line="4"><strong>Safe</strong><img src="/a.svg" onerror="alert(1)"></p><script>alert(1)</script><div class="mermaid-diagram" data-mermaid-source="A --&gt; B"></div>';
 const html=app.markdownDisplayHtml(raw), host=document.createElement('div');host.innerHTML=html;
 assert.equal(host.querySelector('script'),null);assert.equal(host.querySelector('img').hasAttribute('onerror'),false);
 assert.equal(host.querySelector('[data-line]').dataset.line,'4');assert.equal(host.querySelector('.mermaid-diagram').dataset.mermaidSource,'A --> B');
 host.querySelector('.mermaid-diagram').remove();
 const display=app.hydrateMarkdownDisplay(host,{theme:'light',filePath:'/doc/a.md',imageRoot:'/site'});
 await display.done;assert.equal(host.querySelector('img').dataset.absPath,'/site/a.svg');display.abort();assert.equal(display.signal.aborted,true);
});
await test('shared surface: display settings preserve the editable DOM, source and selection session',async()=>{
 const original='# Shared surface\n\nBody **emphasis**.\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 await act(async()=>app.getVisualEditor().navigate(3,3));
 const caret=document.getSelection();const caretNode=caret.anchorNode,caretOffset=caret.anchorOffset;
 const editor=document.querySelector('.ProseMirror');const previousFont=store.getState().editorFontSize;
 await act(async()=>store.setState({editorFontSize:18,markdownSettings:{...store.getState().markdownSettings,documentTheme:'compact'}}));
 assert.equal(document.querySelector('.ProseMirror'),editor);assert.equal(content(),original);
 assert.equal(document.getSelection().anchorNode,caretNode);assert.equal(document.getSelection().anchorOffset,caretOffset);
 const surface=document.querySelector('.md-surface');assert.equal(surface.dataset.mdTheme,'compact');assert.equal(surface.style.getPropertyValue('--md-document-zoom'),'4px');
 await act(async()=>root.render(React.createElement(app.Preview,{tabId:'a',theme:'light'})));await pause(180);
 assert.equal(document.querySelector('.preview.md-surface').dataset.mdTheme,'compact');assert.equal(document.querySelector('.preview').style.getPropertyValue('--md-document-zoom'),'4px');
 assert.equal(content(),original);
 await act(async()=>store.setState({editorFontSize:previousFont,markdownSettings:{...store.getState().markdownSettings,documentTheme:'default'}}));await render(false);
});
await test('presentation: consecutive headings survive DOM reparse and undo without spacing changes',async()=>{
 const original='# First\n## Second\n### Third\n#### Fourth\n##### Fifth\n###### Sixth\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(4,6);app.getVisualEditor().prefix("# ");});
 await act(async()=>{app.markdownHistory();await pause(60);});
 assert.equal(content(),original);
 // Exercise browser DOM round-trip: generated IDs must not become semantic attributes.
 await act(async()=>{const h=document.querySelector('.ProseMirror h4');h.firstChild.textContent='Fourth!';h.dispatchEvent(new Event('input',{bubbles:true}));await pause(60);});
 assert.equal(content(),original.replace('Fourth','Fourth!'));
 await act(async()=>{app.markdownHistory();await pause(60);});assert.equal(content(),original);
});
await test('presentation: scroll between undo and React sync cannot clear redo history',async()=>{
 const original=content();await act(async()=>{app.getVisualEditor().navigate(1,4);app.getVisualEditor().insert('new',false);});
 const edited=content();assert.notEqual(edited,original);
 await act(async()=>{
   app.markdownHistory();
   document.querySelector('.md-visual-scroll').dispatchEvent(new Event('scroll',{bubbles:true}));
   app.markdownHistory(true);
 });assert.equal(content(),edited);
});
await test('presentation: code uses the same rendered HTML as preview without changing Markdown', async()=>{
 const original='# Code\n\n```typescript\nconst label = "中文";\n```\n\nBottom\n';
 await act(async()=>{store.getState().setContent(original,'a','command');await pause(150);});
 const expected=await app.renderMarkdown('```typescript\nconst label = "中文";\n```',{theme:'light'});
 const fragment=document.createElement('div');fragment.innerHTML=expected;
 assert.equal(document.querySelector('.md-code-preview pre').innerHTML,fragment.querySelector('pre').innerHTML);
 assert.equal(document.querySelector('.md-code-editor').hidden,true);
 assert.equal(content(),original);
 assert.ok(document.querySelector('.ProseMirror.md-document'));
});
await test('presentation: click code, edit, Escape, undo and redo retain shared content',async()=>{
 const original=content();
 await act(async()=>{document.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,clientX:-1,clientY:-1,bubbles:true,cancelable:true}));});
 assert.equal(document.querySelector('.md-code-editor').hidden,false);
 const {EditorView}=await import('@codemirror/view');
 const cm=EditorView.findFromDOM(document.querySelector('.md-code-editor .cm-editor'));
 await act(async()=>cm.dispatch({changes:{from:6,to:11,insert:'title'},selection:{anchor:11}}));
 assert.equal(content(),original.replace('label','title'));
 await act(async()=>{cm.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(100);});
 assert.equal(document.querySelector('.md-code-editor').hidden,true);
 assert.match(document.querySelector('.md-code-preview pre').textContent,/title/);
 await act(async()=>{app.markdownHistory();await pause(100);});assert.equal(content(),original);
 await act(async()=>{app.markdownHistory(true);await pause(100);});assert.equal(content(),original.replace('label','title'));
});
await test('presentation: keyboard Enter opens code and blur restores the rendered block',async()=>{
 const original=content();
 await act(async()=>{document.querySelector('.md-code-preview pre').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
 assert.equal(document.querySelector('.md-code-editor').hidden,false);
 await act(async()=>{document.querySelector('.md-code-editor .cm-content').dispatchEvent(new dom.window.FocusEvent('focusout',{relatedTarget:document.body,bubbles:true}));await pause(80);});
 assert.equal(document.querySelector('.md-code-editor').hidden,true);assert.equal(content(),original);
});
await test('presentation: readonly code clicks do not open editing or alter source',async()=>{
 const original=content();await render(true);
 await act(async()=>{document.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,bubbles:true,cancelable:true}));});
 assert.equal(document.querySelector('.md-code-editor').hidden,true);assert.equal(content(),original);
 await render(false);
});
await test('scroll stability: source mode retains block height and unchanged preview DOM',async()=>{
 const block=document.querySelector('.md-code-block'),preview=block.querySelector('.md-code-preview');
 const before=preview.firstElementChild,original=content();
 const measure=block.getBoundingClientRect;
 block.getBoundingClientRect=()=>({height:512,left:0,top:0,right:600,bottom:512,width:600});
 await act(async()=>{preview.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});
 assert.equal(block.querySelector('.md-code-editor').style.minHeight,'512px');
 await act(async()=>{block.querySelector('.cm-content').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(80);});
 assert.equal(preview.firstElementChild,before,'focus-only toggles reuse rendered DOM');assert.equal(content(),original);
 block.getBoundingClientRect=measure;
});
await test('scroll stability: typing changes source immediately and defers preview replacement until exit',async()=>{
 const block=document.querySelector('.md-code-block'),preview=block.querySelector('.md-code-preview');
 const before=preview.firstElementChild;
 await act(async()=>preview.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 const {EditorView}=await import('@codemirror/view');const cm=EditorView.findFromDOM(block.querySelector('.cm-editor'));
 await act(async()=>{cm.dispatch({changes:{from:cm.state.doc.length,insert:' // pending'}});await pause(80);});
 assert.match(content(),/pending/);assert.equal(preview.firstElementChild,before);assert.doesNotMatch(before.textContent,/pending/);
 await act(async()=>{cm.contentDOM.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(100);});
 assert.match(preview.textContent,/pending/);
});
await test('scroll stability: rapid source changes cannot publish a stale preview after undo',async()=>{
 const original=content();
 await act(async()=>{app.getVisualEditor().navigate(1,1);});
 const before=document.querySelector('.md-code-preview').textContent;
 await act(async()=>{
   flushSync(()=>store.getState().setContent(original.replace('pending','stale preview'),'a','source'));
   flushSync(()=>store.getState().setContent(original,'a','source'));
   await pause(120);
 });
 assert.equal(document.querySelector('.md-code-preview').textContent,before);assert.equal(content(),original);
});
await test('scroll stability: preserved HTML blocks reserve their preview height during editing',async()=>{
 await act(async()=>{store.getState().setContent('# Raw\n\n<custom>tall raw block</custom>\n\nEnd\n','a','command');await pause(80);});
 const block=document.querySelector('.md-raw-block');block.getBoundingClientRect=()=>({height:480,left:0,top:0,right:600,bottom:480,width:600});
 await act(async()=>block.querySelector('.md-raw-preview').click());assert.equal(block.style.minHeight,'480px');
 await act(async()=>block.querySelector('.cm-content').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 assert.equal(block.style.minHeight,'');
});

await test('P2 syntax: YAML, TOC, alerts and contextual footnotes share preview rendering and preserve source',async()=>{
 const original='---\ntitle: 自建语法样例\n---\n\n[TOC]\n\n# 第一章\n\n正文[^b] 和另一个[^a]。\n\n> [!WARNING]\n> 注意 **数据**。\n\n[^a]: 第一条定义。\n\n[^b]: 第二条定义。\n';
 await act(async()=>{store.getState().setContent(original,'a','command');await pause(200);});
 await render(true);await pause(80);
 assert.ok(document.querySelector('.ProseMirror .md-frontmatter'));assert.equal(document.querySelector('.ProseMirror .md-frontmatter').tagName,'DETAILS');
 assert.equal(document.querySelector('.ProseMirror .md-toc a').textContent,'第一章');
 assert.equal(document.querySelector('.ProseMirror .md-callout-title').textContent,'WARNING');
 const refs=[...document.querySelectorAll('.ProseMirror .footnote-ref')].map(e=>e.textContent);assert.deepEqual(refs,['[1]','[2]']);
 assert.equal(document.querySelector('.ProseMirror [data-footnote-label="b"]').id,'fn1');assert.equal(document.querySelector('.ProseMirror [data-footnote-label="a"]').id,'fn2');
 const html=await app.renderMarkdown(original,{theme:'light'});assert.match(html,/class="md-frontmatter"/);assert.match(html,/md-callout-warning/);assert.match(html,/data-footnote-label="b" id="fn1"/);
 assert.equal(content(),original);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,original);
 await render(true);await render(false);assert.equal(content(),original);
});
await test('structured footnotes: direct edits update hover, preserve identifiers and undo across modes',async()=>{
 const original='正文[^b] 和另一个[^a]。\n\n> [!TIP]\n> 普通提示 **重点**。\n\n[^a]: 第一条解释。\n\n[^b]: 第二条解释。\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 assert.equal(document.querySelectorAll('.ProseMirror .md-raw-block').length,0);
 const ref=document.querySelector('.ProseMirror .footnote-ref');assert.equal(ref.title,'第二条解释。');
 await act(async()=>{app.getVisualEditor().navigate(8,7);app.getVisualEditor().insert('补充',false);});
 assert.equal(content(),original.replace('第二条解释','补充第二条解释'));
 assert.equal(document.querySelector('.ProseMirror .footnote-ref').title,'补充第二条解释。');
 const edited=content();await render(true);await render(false);assert.equal(content(),edited);
 await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
 await act(async()=>{app.getVisualEditor().navigate(4,3);app.getVisualEditor().insert('新的',false);});
 assert.equal(content(),original.replace('普通提示','新的普通提示'));
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
});
await test('structured footnotes: navigation, repeated references and renumbering stay synchronized',async()=>{
 const original='B[^b] A[^a] B[^b]\n\n[^a]: definition A\n\n[^b]: definition B\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 assert.deepEqual([...document.querySelectorAll('.ProseMirror .footnote-ref')].map(e=>e.textContent),['[1]','[2]','[1:1]']);
 await act(async()=>document.querySelector('.ProseMirror .footnote-ref a').click());
 assert.equal(document.querySelector('.md-block-active').textContent,'definition B');assert.equal(content(),original);
 await act(async()=>store.getState().setContent(original.replace('B[^b] ',''),'a','source'));await pause(50);
 assert.deepEqual([...document.querySelectorAll('.ProseMirror .footnote-ref')].map(e=>e.textContent),['[1]','[2]']);
 assert.equal(document.querySelector('.ProseMirror [data-footnote-label="a"]').id,'fn1');
 assert.equal(document.querySelector('.ProseMirror .footnote-ref').title,'definition A');
});
await test('structured footnotes: nested references and every backlink agree with Preview',async()=>{
 const original='Body[^a] again[^a].\n\n[^a]: Alpha[^b]\n\n[^b]: Beta.\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const template=document.createElement('template');template.innerHTML=await app.renderMarkdown(original,{theme:'light'});
 assert.deepEqual([...document.querySelectorAll('.ProseMirror .footnote-ref')].map(e=>e.textContent),[...template.content.querySelectorAll('.footnote-ref')].map(e=>e.textContent));
 const links=document.querySelectorAll('.ProseMirror [data-footnote-label="a"] a');assert.equal([...links].filter(e=>e.textContent.includes('↩︎')).length,2);
 assert.equal(document.querySelector('.ProseMirror .footnote-ref[title="Beta."]').textContent,'[2]');
 await act(async()=>document.querySelector('.ProseMirror [data-md-footnote-back="1"]').click());assert.equal(content(),original);
 await act(async()=>store.getState().setContent(original.replace('again[^a]','again'),'a','source'));await pause(60);
 assert.equal(document.querySelectorAll('.ProseMirror [data-md-footnote-back]').length,0);
});
await test('shorthand parity: complex fixture renders semantic marks, alerts and emoji in both modes',async()=>{
 const original=fs.readFileSync('tests/fixtures/markdown-complex.md','utf8');
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const template=document.createElement('template');template.innerHTML=await app.renderMarkdown(original,{theme:'light'});
 for(const selector of ['mark','sub','sup','.md-callout-title']) {
  assert.equal([...document.querySelectorAll('.ProseMirror '+selector)].map(e=>e.textContent).join(''),[...template.content.querySelectorAll(selector)].map(e=>e.textContent).join(''),selector);
 }
 assert.ok(document.querySelector('[data-md-emoji="smile"]'));assert.ok(template.content.textContent.includes('😄'));
 assert.equal(document.querySelector('.ProseMirror .md-callout-content > p').textContent.trim(),template.content.querySelector('.md-callout-content > p').textContent.trim());
 assert.equal(content(),original);await render(true);await render(false);assert.equal(content(),original);
});
await test('image metadata: per-document scalar folder rules support templates and reject malformed YAML',async()=>{
 const folder=app.documentImageDirectory;
 assert.equal(folder('---\ntypora-copy-images-to: "./${filename}.assets"\n---\ntext','C:\\docs\\中文.md','images'),'中文.assets');
 for(const value of ['../escape','~/images','[bad]','*missing','"a:bad"']) assert.equal(folder('---\ntypora-copy-images-to: '+value+'\n---\n','/doc/a.md','images'),'images');
 assert.equal(folder('---\nother: &a { k: v }\ntypora-copy-images-to: *a\n---\n','/doc/a.md','images'),'images');
 assert.equal(folder('```yaml\ntypora-copy-images-to: ignored\n```','/doc/a.md','images'),'images');
});
await test('image collection: copies once, patches Markdown/HTML/references, keeps failures and undo',async()=>{
 const original='---\ntypora-copy-images-to: media\n---\n\n![one](../old/pic.png) ![again][img]\n\n<img src="../old/pic.png" width="120" alt="html">\n\n![missing](missing.png) ![web](https://example.com/a.png)\n\n`![code](../old/pic.png)`\n\n[img]: ../old/pic.png "title"\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const oldInvoke=globalThis.mdInvoke,copied=[];globalThis.mdInvoke=async(command,args)=>{
  if(command==='read_binary_as_base64'){if(args.path.endsWith('missing.png'))throw new Error('missing');return 'cGljdHVyZQ==';}
  if(command==='save_image'){copied.push(args);return '/generated/'+args.folder+'/'+args.name;}
  return oldInvoke(command,args);
 };
 try {
  let result;await act(async()=>{result=await app.collectMarkdownImages('a');});
  assert.equal(result.copied,1);assert.equal(result.failures.length,1);assert.equal(result.skipped,1);assert.equal(copied.length,1);assert.equal(copied[0].folder,'media');
  assert.ok(content().includes('`![code](../old/pic.png)`'));assert.ok(content().includes('![missing](missing.png)'));assert.ok(content().includes('title'));
  assert.equal(content().split('media/'+copied[0].name).length-1,3);
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 } finally {globalThis.mdInvoke=oldInvoke;}
});
await test('rich footnote preview: shared formatted content, scoped IDs, navigation, Escape and live invalidation',async()=>{
 const original='Text[^note] repeated[^note].\n\n[^note]: **Rich** and `code`.\n\n    second paragraph\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const check=async(container)=>{
  let link=container.querySelector('.footnote-ref a');assert.ok(link);
  const before=content();await act(async()=>{link.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true}));await pause(0);});
  let popup=document.querySelector('.md-footnote-preview');assert.ok(popup);assert.ok(popup.querySelector('strong'));assert.ok(popup.querySelector('code'));assert.ok(popup.textContent.includes('second paragraph'));
  assert.equal(popup.querySelectorAll('[id]').length,0);assert.equal(container.contains(popup),false);assert.equal(content(),before);
  assert.equal(link.getAttribute('aria-describedby'),popup.id);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(document.querySelector('.md-footnote-preview'),null);assert.equal(link.hasAttribute('aria-describedby'),false);
  await act(async()=>link.focus());assert.ok(document.querySelector('.md-footnote-preview'));
  await act(async()=>link.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
  assert.ok(document.activeElement.closest('.md-footnote-preview'));
  await act(async()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  assert.equal(document.querySelector('.md-footnote-preview'),null);assert.equal(document.activeElement,link);
  await act(async()=>link.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true})));
  await act(async()=>document.querySelector('.md-footnote-preview-jump').click());
  assert.equal(document.querySelector('.md-footnote-preview'),null);assert.equal(content(),before);
 };
 await check(document.querySelector('.ProseMirror'));
 await act(async()=>root.render(React.createElement(app.Preview,{tabId:'a',theme:'light'})));await act(async()=>pause(150));
 await check(document.querySelector('.preview'));
 const link=document.querySelector('.preview .footnote-ref a');
 await act(async()=>link.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true})));assert.ok(document.querySelector('.md-footnote-preview'));
 await act(async()=>store.getState().setContent(original.replace('**Rich**','**Changed**'),'a','command'));await act(async()=>pause(150));
 assert.equal(document.querySelector('.md-footnote-preview'),null);
 const changed=document.querySelector('.preview .footnote-ref a');await act(async()=>changed.dispatchEvent(new window.MouseEvent('pointerover',{bubbles:true})));
 assert.ok(document.querySelector('.md-footnote-preview').textContent.includes('Changed'));
 await act(async()=>root.render(null));assert.equal(document.querySelector('.md-footnote-preview'),null);await render(false);
});
await test('external image folders: per-document absolute targets and encoded references survive collection',async()=>{
 const ref=app.markdownImageReference;
 assert.equal(ref('media # 中文%20','a(1).png'),'media%20%23%20%E4%B8%AD%E6%96%87%2520/a%281%29.png');
 assert.equal(ref('/images # %20','a.png'),'file:///images%20%23%20%2520/a.png');
 assert.equal(ref('D:/images','a.png'),'file:///D:/images/a.png');
 assert.equal(ref('//server/share/images','a.png'),'file://server/share/images/a.png');
 assert.equal(app.documentImageDirectory('---\ntypora-copy-images-to: /outside/images\n---\n','/doc/a.md','assets'),'/outside/images');
 const original='---\ntypora-copy-images-to: /outside/images # comment\n---\n\n![a](local.png)\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const old=globalThis.mdInvoke,calls=[];globalThis.mdInvoke=async(command,args)=>{
  if(command==='read_binary_as_base64')return 'aQ==';
  if(command==='save_image_to_directory'){calls.push(args);return args.directory+'/'+args.name;}
  return old(command,args);
 };
 try {
  await act(async()=>app.collectMarkdownImages('a'));assert.equal(calls.length,1);assert.equal(calls[0].directory,'/outside/images');
  assert.ok(content().includes('file:///outside/images/'+calls[0].name));
  await act(async()=>{const again=await app.collectMarkdownImages('a');assert.equal(again.copied,0);assert.equal(again.skipped,1);});
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 } finally {globalThis.mdInvoke=old;}
});
await test('remote images: download once per URL, preserve fragments, failures, code and one-step undo',async()=>{
 const original='![a](https://example.test/a?size=2#one) ![b][remote]\n\n<img src="https://example.test/a?size=2#two">\n\n![failed](https://example.test/fail) ![local](local.png)\n\n`![code](https://example.test/code)`\n\n[remote]: https://example.test/a?size=2#two "title"\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const old=globalThis.mdInvoke,calls=[],saved=[];
 globalThis.mdInvoke=async(command,args)=>{
  if(command==='download_markdown_image'){calls.push(args);if(args.url.endsWith('/fail'))throw new Error('offline');return {data:'cGljdHVyZQ==',extension:'svg'};}
  if(command==='save_image'){saved.push(args);return '/generated/'+args.folder+'/'+args.name;}
  return old(command,args);
 };
 try {
  let outcome;await act(async()=>{outcome=await app.collectMarkdownImages('a',{kind:'download'});});
  assert.equal(outcome.copied,1);assert.equal(outcome.skipped,1);assert.equal(outcome.failures.length,1);assert.equal(calls.length,2);assert.equal(saved.length,1);
  assert.equal(calls[0].url,'https://example.test/a?size=2');assert.ok(content().includes(saved[0].name+'#one'));assert.ok(content().includes(saved[0].name+'#two'));
  assert.ok(content().includes('![failed](https://example.test/fail)'));assert.ok(content().includes('`![code](https://example.test/code)`'));assert.ok(!content().includes(saved[0].name+'?'));
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 } finally {globalThis.mdInvoke=old;}
});
await test('PicGo upload: resolved files are deduplicated and signed results survive roundtrip and undo',async()=>{
 const original='---\ntypora-root-url: /site\n---\n\n![a](/img/a.svg#one) ![b](file:///site/img/a.svg#two) ![web](https://example.test/keep)\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const old=globalThis.mdInvoke,calls=[];globalThis.mdInvoke=async(command,args)=>{
  if(command==='upload_markdown_image'){calls.push(args);return 'https://host.test/hello image.svg?signature=abc&v=2';}return old(command,args);
 };
 try {
  let outcome;await act(async()=>{outcome=await app.collectMarkdownImages('a',{kind:'upload',endpoint:'http://127.0.0.1:36677/upload',token:'test-only'});});
  assert.equal(outcome.copied,1);assert.equal(calls.length,1);assert.equal(calls[0].path,'/site/img/a.svg');assert.equal(calls[0].token,'test-only');
  assert.ok(content().includes('https://host.test/hello%20image.svg?signature=abc&v=2#one'));assert.ok(content().includes('![web](https://example.test/keep)'));
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 } finally {globalThis.mdInvoke=old;}
});
await test('image transfers: concurrent edits survive, stop keeps completed results, duplicate runs are rejected',async()=>{
 const original='![a](https://example.test/a) ![b](https://example.test/b)\n\nOriginal body\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const old=globalThis.mdInvoke;let stop=false,calls=0;
 globalThis.mdInvoke=async(command,args)=>{
  if(command==='download_markdown_image'){
   calls++;await assert.rejects(app.collectMarkdownImages('a',{kind:'download'}),/already running/);
   store.getState().setContent(original.replace('Original body','Concurrent body'),'a','command');stop=true;return {data:'aQ==',extension:'png'};
  }
  if(command==='save_image')return '/generated/'+args.folder+'/'+args.name;return old(command,args);
 };
 try {
  let outcome;await act(async()=>{outcome=await app.collectMarkdownImages('a',{kind:'download'},()=>stop);});
  assert.equal(calls,1);assert.equal(outcome.stopped,true);assert.equal(outcome.copied,1);assert.ok(content().includes('Concurrent body'));assert.ok(content().includes('![b](https://example.test/b)'));
  await act(async()=>app.markdownHistory());assert.equal(content(),original.replace('Original body','Concurrent body'));
 } finally {globalThis.mdInvoke=old;}
});
await test('image transfer failures never inject unsafe URLs or filenames',async()=>{
 const original='![a](local.png) ![b](https://example.test/b)\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const old=globalThis.mdInvoke;let writes=0;
 globalThis.mdInvoke=async(command,args)=>{
  if(command==='upload_markdown_image')return 'javascript:alert(1)';
  if(command==='download_markdown_image')return {data:'aQ==',extension:'../unsafe'};
  if(command==='save_image')writes++;return old(command,args);
 };
 try {
  for(const operation of [{kind:'upload',endpoint:'http://127.0.0.1:36677/upload'},{kind:'download'}]) await act(async()=>{const result=await app.collectMarkdownImages('a',operation);assert.equal(result.failures.length,1);assert.equal(result.copied,0);});
  assert.equal(content(),original);assert.equal(writes,0);
 } finally {globalThis.mdInvoke=old;}
});
await test('PicGo settings: migration retains a local endpoint and drops credentials',async()=>{
 assert.equal(app.normalizeMarkdownPreferences({}).picgoEndpoint,'http://127.0.0.1:36677/upload');
 assert.equal(app.normalizeMarkdownPreferences({picgoEndpoint:'http://localhost:3000/upload',token:'secret'}).picgoEndpoint,'http://localhost:3000/upload');
 assert.ok(!('token' in app.normalizeMarkdownPreferences({token:'secret'})));
 for(const value of ['https://example.com/upload','http://u:p@localhost/upload','http://localhost/upload?secret=x','http://localhost.evil.test/upload']) assert.equal(app.normalizeMarkdownPreferences({picgoEndpoint:value}).picgoEndpoint,'http://127.0.0.1:36677/upload');
});
await test('image root paths: website roots, encoded filenames, explicit files, Windows and UNC',async()=>{
 const resolve=app.resolveMarkdownImage,header=value=>'---\ntypora-root-url: '+value+'\n---\n';
 assert.equal(app.documentImageRoot(header('../site'),'/docs/posts/a.md'),'/docs/site');
 assert.equal(app.documentImageRoot(header('"D:\\\\site"'),'C:\\docs\\a.md'),'D:\\site');
 for(const value of ['[bad]','*missing','https://example.com','""']) assert.equal(app.documentImageRoot(header(value),'/docs/a.md'),null);
 assert.equal(resolve('/img/a%20%E4%B8%AD%23%3F.png?v=2#part','/docs/a.md','/site'),'/site/img/a 中#?.png');
 assert.equal(resolve('./img/a.png','/docs/a.md','/site'),'/docs/img/a.png');
 assert.equal(resolve('file:///absolute/a%23.png','/docs/a.md','/site'),'/absolute/a#.png');
 assert.equal(resolve('file:///C:/images/a%20b.png','D:\\docs\\a.md','D:\\site'),'C:/images/a b.png');
 assert.equal(resolve('C:\\images\\a.png','D:\\docs\\a.md','D:\\site'),'C:\\images\\a.png');
 assert.equal(resolve('/img/a.png','D:\\docs\\a.md','D:\\site'),'D:\\site\\img\\a.png');
 assert.equal(resolve('a.png','\\\\server\\share\\a.md'),'\\\\server\\share\\a.png');
 assert.equal(resolve('file://server/share/a.png',null),'//server/share/a.png');
 assert.equal(resolve('a.png','/a.md'),'/a.png');
 assert.equal(resolve('a%2520.png','/draft%20/a.md'),'/draft%20/a%20.png');
 const literalRoot=app.documentImageRoot(header('"/draft%20/#assets"'),'/docs/a.md');
 assert.equal(literalRoot,'/draft%20/#assets');assert.equal(resolve('/a.png','/docs/a.md',literalRoot),'/draft%20/#assets/a.png');
 for(const url of ['https://example.com/a','//cdn.example.com/a','#part','data:image/png;base64,a']) assert.equal(resolve(url,'/a.md','/site'),null);
});
await test('image root views: Preview, block/inline/HTML images update together without source writes',async()=>{
 const original='---\ntypora-root-url: /site-one\n---\n\n![block](/img/block.png)\n\nText ![inline](/img/inline.png) end\n\n<figure><img src="/img/raw.png" alt="raw"></figure>\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(false);
 const previewHost=document.createElement('div');document.body.append(previewHost);const previewRoot=createRoot(previewHost);
 try {
  await act(async()=>{previewRoot.render(React.createElement(app.Preview,{tabId:'a',active:false,theme:'light'}));await pause(200);});
  await act(async()=>{await pause(150);});
  const targets=scope=>[...scope.querySelectorAll('img')].map(img=>img.getAttribute('src')).filter(src=>src?.includes('/img/')).sort();
  const expected=root=>['block','inline','raw'].map(name=>root+'/img/'+name+'.png').sort();
  assert.deepEqual(targets(document.querySelector('.ProseMirror')),expected('/site-one'));
  assert.deepEqual(targets(previewHost),expected('/site-one'));
  assert.equal(previewHost.querySelector('img[alt="inline"]').dataset.mdInline,'true');
  assert.equal(previewHost.querySelector('img[alt="block"]').dataset.mdInline,undefined);
  assert.equal(content(),original);
  const changed=original.replace('/site-one','/site-two');
  await act(async()=>{store.getState().setContent(changed,'a','command');await pause(160);});
  await act(async()=>{await pause(160);});
  assert.deepEqual(targets(document.querySelector('.ProseMirror')),expected('/site-two'));
  assert.deepEqual(targets(previewHost),expected('/site-two'));assert.equal(content(),changed);
  await act(async()=>app.markdownHistory());await act(async()=>{await pause(160);});
  assert.deepEqual(targets(document.querySelector('.ProseMirror')),expected('/site-one'));assert.equal(content(),original);
 } finally {await act(async()=>previewRoot.unmount());previewHost.remove();}
});
await test('image root collection: resolves actual files, preserves suffixes, aborts stale root changes',async()=>{
 const original='---\ntypora-root-url: /website\n---\n\n![site](/img/a%23.png?v=1)\n\nText\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 const oldInvoke=globalThis.mdInvoke,reads=[];let changeRoot=false,changeBody=false;
 globalThis.mdInvoke=async(command,args)=>{
  if(command==='read_binary_as_base64'){reads.push(args.path);return 'cGljdHVyZQ==';}
  if(command==='save_image'){
   if(changeRoot)store.getState().setContent(content().replace('/website','/new-site'),'a','command');
   if(changeBody)store.getState().setContent(content().replace('Text','Updated while copying'),'a','command');
   return '/generated/'+args.folder+'/'+args.name;
  }
  return oldInvoke(command,args);
 };
 try {
  await act(async()=>{const result=await app.collectMarkdownImages('a');assert.equal(result.copied,1);});
  assert.deepEqual(reads,['/website/img/a#.png']);assert.match(content(),/!\[site\]\(assets\/image-[^)]*\.png\?v=1\)/);
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
  changeBody=true;
  await act(async()=>app.collectMarkdownImages('a'));
  assert.ok(content().includes('Updated while copying'));assert.ok(content().includes('](assets/'));
  changeBody=false;await act(async()=>store.getState().setContent(original,'a','command'));
  changeRoot=true;
  await act(async()=>assert.rejects(app.collectMarkdownImages('a'),/image root changed/));
  assert.equal(content(),original.replace('/website','/new-site'));
 } finally {globalThis.mdInvoke=oldInvoke;}
});
await test('image root Save As: relative roots and moved images preserve the resolved destination',async()=>{
 const original='---\ntypora-root-url: ../site\n---\n\n![site](/img/a%20b.png#part)\n\n![local](local.png)\n';
 const next=app.rebaseMarkdownImages(original,'/docs/posts/a.md','/elsewhere/posts/a.md');
 assert.ok(next.includes('![site](file:///docs/site/img/a%20b.png#part)'));
 assert.ok(next.includes('![local](../../docs/posts/local.png)'));
 assert.ok(next.startsWith('---\ntypora-root-url: ../site\n---'));
 const absolute=original.replace('../site','/site');
 assert.ok(app.rebaseMarkdownImages(absolute,'/docs/a.md','/other/a.md').includes('![site](/img/a%20b.png#part)'));
 const moved=app.rebaseMarkdownImages(absolute,'/docs/a.md','/docs/a.md',{from:'/site/img/a b.png',to:'/site/img/renamed.png'});
 assert.ok(moved.includes('![site](file:///site/img/renamed.png#part)'));
});
await test('P2 nested diagrams: preserved callouts retain inert diagram source after sanitization',async()=>{
 const original='> [!NOTE]\n> ```mermaid\n> flowchart TD\n> A --> B\n> ```\n> <img src="invalid" onerror="window.bad=1">\n\nTail\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(true);await pause(120);
 const diagram=document.querySelector('.md-raw-preview .mermaid-diagram');
 assert.ok(diagram);assert.equal(diagram.dataset.mermaidSource,'flowchart TD\nA --> B\n');assert.equal(diagram.dataset.mermaidHydrated,'1');
 assert.equal(document.querySelector('.md-raw-preview img')?.getAttribute('onerror'),null);assert.equal(content(),original);
 await render(false);
});
await test('P2 anchors: duplicate and nested headings have the same link destinations as Preview',async()=>{
 const original='[TOC]\n\n# Same **title**\n\n# Same **title**\n\n> ## Nested\n';
 await act(async()=>store.getState().setContent(original,'a','command'));await render(true);await pause(100);
 const html=await app.renderMarkdown(original,{theme:'light'}),template=document.createElement('template');template.innerHTML=html;
 const ids=[...template.content.querySelectorAll('h1,h2')].map(e=>e.id);
 assert.deepEqual([...document.querySelectorAll('.ProseMirror h1,.ProseMirror h2')].map(e=>e.id),ids);
 assert.equal(ids[1],'same-title-1');assert.deepEqual([...document.querySelectorAll('.ProseMirror .md-toc a')].map(e=>e.textContent),['Same title','Same title','Nested']);
 assert.equal(content(),original);await render(false);
});
await test('P1 table/list: spreadsheet paste grows a rectangle and keeps nested list keyboard editing',async()=>{
 const original='| A | B |\n| :--- | ---: |\n| one | two |\n\nTail\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>app.getVisualEditor().navigate(3,3));
 const clipboard=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(clipboard,'clipboardData',{value:{getData:type=>type==='text/plain'?'中文\t"带\n换行"\tthree\nnext\tvalue\textra\n':''}});
 await act(async()=>document.querySelector('.ProseMirror').dispatchEvent(clipboard));
 assert.equal(document.querySelectorAll('.ProseMirror tr').length,3);assert.equal(document.querySelectorAll('.ProseMirror tr:last-child td').length,3);
 assert.match(content(),/中文/);assert.match(content(),/带<br>换行/);assert.ok(content().endsWith('\n\nTail\n'));
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
 const list='- one\n- two\n\nTail\n';await act(async()=>{store.getState().setContent(list,'a','command');await pause(40);});
 await act(async()=>app.getVisualEditor().navigate(2,4));
 const key=(key,shiftKey=false)=>document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,shiftKey,bubbles:true,cancelable:true}));
 await act(async()=>key('Tab'));assert.ok(document.querySelector('.ProseMirror li li'));
 await act(async()=>key('Tab',true));assert.equal(document.querySelector('.ProseMirror li li'),null);
 await act(async()=>{app.getVisualEditor().navigate(2,6);key('Enter');});
 assert.equal(document.querySelectorAll('.ProseMirror li').length,3);
 await act(async()=>key('Enter'));assert.equal(document.querySelectorAll('.ProseMirror li').length,2);
});
await test('P1 inline source: entering, editing, exiting and undo preserve surrounding Markdown',async()=>{
 for(const [raw,word] of [['**bold**','bold'],['_em_','em'],['~~gone~~','gone'],['`code`','code'],['[label](https://example.com "title")','label'],['**bold _nested_**','bold']]){
  const original='Before '+raw+' after.\n\nUnchanged **tail**.\n';
  await act(async()=>store.getState().setContent(original,'a','command'));
  await act(async()=>{app.getVisualEditor().navigate(1,original.indexOf(word)+2);await pause(30);});
  let active=document.querySelector('[data-md-inline-source]');assert.ok(active,raw);assert.equal(active.textContent,raw);assert.equal(content(),original);
  const updated=raw.replace(word,word+'中文');
  await act(async()=>{active.firstChild.textContent=updated;document.getSelection().collapse(active.firstChild,updated.indexOf(word)+word.length+2);active.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
  assert.equal(content(),original.replace(raw,updated));
  await act(async()=>{document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(40);});
  assert.equal(document.querySelector('[data-md-inline-source]'),null);assert.equal(content(),original.replace(raw,updated));
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 }
});
await test('terminal inline HTML: outside caret, input, save and undo never leak its view-only anchor',async()=>{
 const original='* [引用文字][guide] 和 <kbd>Ctrl</kbd>\n\n[guide]: https://example.com\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,original.indexOf('Ctrl')+5);await pause(30);});
 const key=name=>document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true}));
 await act(async()=>key('ArrowRight'));
 const boundary=document.querySelector('[data-md-mark-boundary]');assert.ok(boundary);
 assert.equal(content(),original);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,original);
 await act(async()=>{
  const text=document.createTextNode('Z');boundary.after(text);document.getSelection().collapse(text,1);
  document.querySelector('.ProseMirror').dispatchEvent(new Event('input',{bubbles:true}));await pause(40);
 });
 assert.match(content(),/<kbd>Ctrl<\/kbd>Z/);assert.ok(!content().includes('\u200b'));
 await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
});
await test('P1 inline source: cross-block selection, readonly and formatting leave a coherent projection',async()=>{
 const original='Before **word** after.\n\nEnd paragraph.\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,11);await pause(30);});
 const active=document.querySelector('[data-md-inline-source]'),tail=document.querySelector('.ProseMirror > p:last-child');
 await act(async()=>{document.getSelection().setBaseAndExtent(active.firstChild,3,tail.firstChild,3);document.dispatchEvent(new Event('selectionchange'));await pause(60);});
 assert.equal(document.querySelector('[data-md-inline-source]'),null);assert.equal(app.getVisualEditor().selected,'ord after.\nEnd');assert.equal(content(),original);
 await act(async()=>{app.getVisualEditor().navigate(1,11);await pause(30);});
 await render(true);assert.equal(document.querySelector('[data-md-inline-source]'),null);assert.equal(content(),original);await render(false);
 await act(async()=>{app.getVisualEditor().navigate(1,11);await pause(30);app.getVisualEditor().prefix('## ');await pause(40);});
 assert.match(content(),/^## Before/);assert.ok(document.querySelector('.ProseMirror h2'));
});
await test('P1 inline source: incomplete delimiters stay editable and survive save/reload',async()=>{
 const original='Before **word** after.\n';await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,11);await pause(30);});
 const active=document.querySelector('[data-md-inline-source]');assert.ok(active);
 await act(async()=>{active.firstChild.textContent='**word*';document.getSelection().collapse(active.firstChild,7);active.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
 await act(async()=>{app.saveFile();document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(40);});
 assert.equal(content(),'Before **word* after.\n');assert.equal(writes.at(-1).content,content());
 await act(async()=>root.render(null));await render();assert.equal(content(),'Before **word* after.\n');
});

await test('P2 images: width persists through save, mode switches, undo and source reload',async()=>{
 const original='Before\n\n![中文说明](assets/test.svg "title")\n\nTail\n';
 await act(async()=>store.getState().setContent(original,'a','command'));
 const input=document.querySelector('.md-image-width input');assert.ok(input);
 await act(async()=>{input.value='320';input.dispatchEvent(new Event('blur'));await pause(40);});
 assert.match(content(),/<img src="assets\/test.svg" alt="中文说明" width="320" title="title">/);
 assert.ok(content().endsWith('\n\nTail\n'));const resized=content();
 await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,resized);
 await render(true);assert.equal(document.querySelector('.md-image-width').hidden,true);
 await act(async()=>root.render(null));await render();assert.equal(content(),resized);
 assert.equal(document.querySelector('.md-image-width input').value,'320');
 assert.equal(document.querySelector('.md-persisted-image img')?.style.width,'320px');
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
 await act(async()=>app.markdownHistory(true));assert.equal(content(),resized);
 const html=await app.renderMarkdown(resized,{theme:'light'});assert.match(html,/width="320"/);
});
await test('P2 paths: Save As relocates only image destinations across POSIX and Windows folders',async()=>{
 const markdown='![a](assets/a(1).png "title")\n\n![b][pic]\n\n[pic]: <assets/b two.png> "caption"\n\n[link](assets/other.png)\n\n`![literal](assets/code.png)`\n\n<img src="assets/c.png" alt="c">\n\n![url](https://example.com/x.png)\n';
 const result=app.rebaseMarkdownImages(markdown,'/docs/note.md','/docs/sub/note.md');
 assert.match(result,/\.\.\/assets\/a%281%29\.png/);assert.match(result,/<\.\.\/assets\/b%20two.png>/);assert.match(result,/src="\.\.\/assets\/c.png"/);
 assert.ok(result.includes('[link](assets/other.png)'));assert.ok(result.includes('`![literal](assets/code.png)`'));assert.ok(result.includes('https://example.com/x.png'));
 assert.equal(app.rebaseMarkdownImages('![x](assets/x.png)','C:\\Docs\\a.md','C:\\Docs\\sub\\b.md'),'![x](../assets/x.png)');
 assert.equal(app.rebaseMarkdownImages('![x](assets/x.png)','C:\\Docs\\a.md','D:\\Other\\b.md'),'![x](C:/Docs/assets/x.png)');
 assert.equal(app.rebaseMarkdownImages('![x](assets/x.png)','/docs/a.md','/new/a.md',{from:'/docs',to:'/new'}),'![x](assets/x.png)');
 assert.equal(app.rebaseMarkdownImages('![x](assets/x.png)','/docs/a.md','/docs/a.md',{from:'/docs/assets/x.png',to:'/docs/assets/renamed.png'}),'![x](assets/renamed.png)');
 assert.equal(app.rebaseMarkdownImages('![x](assets/old%20image.png)','/docs/a.md','/docs/a.md',{from:'/docs/assets/old image.png',to:'/docs/assets/new image.png'}),'![x](assets/new%20image.png)');
 await act(async()=>{store.getState().setContent('![x](assets/x.png)\n','a','command');store.setState(s=>({tabs:s.tabs.map(t=>t.id==='a'?{...t,filePath:'/generated/sub/original.md'}:t)}));});
 await render();await act(async()=>app.saveFileAs());assert.equal(writes.at(-1).content,'![x](sub/assets/x.png)\n');
 assert.equal(content(),writes.at(-1).content);
});
await test('image path audit: escaped Markdown, HTML attributes, encoded folders and Windows case remain valid',async()=>{
 const r=app.rebaseMarkdownImages;
 const escaped=String.raw`![x](assets/a\(1\).png)`;
 assert.equal(r(escaped,'/docs/a.md','/docs/a.md',{from:'/docs/assets/a(1).png',to:'/docs/assets/new.png'}),'![x](assets/new.png)');
 assert.equal(r(escaped,'/docs/a.md','/docs/a.md',{from:'/docs/other.png',to:'/docs/new.png'}),escaped);
 const brackets=r('![x](assets/a.png)','/docs/a.md','/docs/a.md',{from:'/docs/assets/a.png',to:'/docs/assets/unclosed(.png'});
 assert.equal(brackets,'![x](assets/unclosed%28.png)');
 assert.ok((await app.renderMarkdown(brackets,{theme:'light'})).includes('<img '));
 const quoted=r('<img src="assets/a.png" alt="keep">','/docs/a.md','/docs/a.md',{from:'/docs/assets/a.png',to:'/docs/assets/b"quote.png'});
 const template=document.createElement('template');template.innerHTML=quoted;
 assert.equal(template.content.querySelector('img').getAttribute('src'),'assets/b"quote.png');assert.equal(template.content.querySelector('img').getAttribute('alt'),'keep');
 assert.equal(r(quoted,'/docs/a.md','/docs/a.md',{from:'/docs/assets/b"quote.png',to:'/docs/assets/final.png'}),'<img src="assets/final.png" alt="keep">');
 assert.equal(r('![x](old%20dir/a.png)','/docs/a.md','/docs/old dir/a.md'),'![x](a.png)');
 assert.equal(r('![x](assets/a.png)','C:/Docs/a.md','C:/Docs/a.md',{from:'c:/docs/assets/a.png',to:'C:/Docs/assets/b.png'}),'![x](assets/b.png)');
 const posix='![x](assets/a.png)';assert.equal(r(posix,'/Docs/a.md','/Docs/a.md',{from:'/docs/assets/a.png',to:'/docs/assets/b.png'}),posix);
});
await test('P2 move: application rename updates open Markdown image targets with undo and save',async()=>{
 const before='![x](assets/old.png)\n';await act(async()=>{store.getState().setContent(before,'a','command');await pause(40);});
 const path=store.getState().tabs.find(t=>t.id==='a').filePath,base=path.slice(0,path.lastIndexOf('/'));
 await act(async()=>app.renamePath(base+'/assets/old.png',base+'/assets/new.png'));
 assert.equal(content(),'![x](assets/new.png)\n');
 await act(async()=>app.markdownHistory());assert.equal(content(),before);
 await act(async()=>app.markdownHistory(true));await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
});
await test('P2 context: TOC refreshes after heading text changes without rewriting the directive',async()=>{
 const original='[TOC]\n\n# First\n\nTail\n';await act(async()=>store.getState().setContent(original,'a','command'));await render(true);await pause(80);
 assert.equal(document.querySelector('.md-toc a').textContent,'First');await render(false);
 await act(async()=>{const heading=document.querySelector('.ProseMirror h1');heading.firstChild.textContent='First updated';heading.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);});
 assert.equal(document.querySelector('.md-toc a').textContent,'First updated');assert.ok(content().startsWith('[TOC]\n\n'));
 const toc=document.querySelector('.md-toc'), link=toc.querySelector('a');
 await act(async()=>{const tail=[...document.querySelectorAll('.ProseMirror p')].find(p=>p.textContent==='Tail');tail.firstChild.textContent='Tail body edit';tail.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);});
 assert.equal(document.querySelector('.md-toc'),toc);assert.equal(document.querySelector('.md-toc a'),link);
 await act(async()=>store.getState().setContent(content().replace('# First updated','# External heading'),'a','command'));
 await pause(100);assert.equal(document.querySelector('.md-toc a').textContent,'External heading');
 await act(async()=>app.markdownHistory());await pause(100);
 assert.equal(document.querySelector('.md-toc a').textContent,'First updated');

});
await test('P1 inline source: multiline clipboard text survives projection closure and undo',async()=>{
 const original='Before **word** after.\n\nTail\n';await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>{app.getVisualEditor().navigate(1,11);await pause(30);});
 assert.ok(document.querySelector('[data-md-inline-source]'));
 const clipboard=new Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(clipboard,'clipboardData',{value:{getData:t=>t==='text/plain'?'line one\n\nline two':''}});
 await act(async()=>{document.querySelector('.ProseMirror').dispatchEvent(clipboard);await pause(40);});
 assert.ok(content().includes('line one\n\nline two'));assert.ok(content().endsWith('\n\nTail\n'));assert.equal(document.querySelector('[data-md-inline-source]'),null);
 const pasted=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,pasted);
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
});
await test('P1 enclosing block parse: multiline, quote and table preserve references, siblings, reload and undo',async()=>{
 for(const block of ['First **word** [reference][ref]\nSecond line[^note]', '> First **word** [reference][ref]\n>\n> - nested item', '| A | B |\n| --- | --- |\n| **word** [reference][ref] | other |']) {
  const original='# Before\n\n'+block+'\n\nTail **unchanged**\n\n[ref]: https://example.com/path "title"\n\n[^note]: Definition\n';
  await act(async()=>store.getState().setContent(original,'a','command'));
  const before=original.slice(0,original.indexOf('word')+1),lines=before.split('\n');
  await act(async()=>{app.getVisualEditor().navigate(lines.length,lines.at(-1).length+1);await pause(30);});
  const active=document.querySelector('[data-md-inline-source]');assert.ok(active,block);
  await act(async()=>{active.firstChild.textContent='**word中文**';document.getSelection().collapse(active.firstChild,8);active.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);});
  await act(async()=>{document.querySelector('.ProseMirror').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await pause(40);});
  assert.equal(content(),original.replace('word','word中文'));
  const shape=()=>[...document.querySelectorAll('.ProseMirror p,.ProseMirror h1,.ProseMirror td,.ProseMirror a[href]')].map(e=>[e.tagName,e.textContent,e.getAttribute('href')]);
  const closed=shape();assert.ok(document.querySelector('.ProseMirror a[href="https://example.com/path"]'));
  await act(async()=>root.render(null));await render();assert.deepEqual(shape(),closed);
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 }
});
await test('math: chemistry, document numbering and cross references share renderer output',async()=>{
 const source='$$\nE=mc^2 \\label{energy}\n$$\n\nChemistry $\\ce{H2O}$ and reference $\\eqref{energy}$\n'.replaceAll('\\n','\n');
 const html=await app.renderMarkdown(source,{theme:'light',mathAutoNumber:true});
 const host=document.createElement('div');host.innerHTML=html;
 assert.equal(host.querySelector('.katex-error'),null,html);
 assert.ok(host.querySelector('#md-equation-energy'));assert.ok(host.querySelector('a[href="#md-equation-energy"]'));assert.ok(host.querySelector('.tag'));
 const legacy=await app.renderMarkdown('```flow\nst=>start: Start\n```\n\n```sequence\nA->B: Hello\n```\n'.replaceAll('\\n','\n'),{theme:'light'});
 const clean=document.createElement('div');clean.innerHTML=app.markdownDisplayHtml(legacy);
 assert.equal(clean.querySelectorAll('.legacy-diagram').length,2);assert.equal(clean.querySelector('[data-legacy-kind="sequence"]').dataset.legacySource.trim(),'A->B: Hello');
});
await test('P3 typewriter: default off, explicit centering and composition exclusion',async()=>{
 const element=document.createElement('div'),scroller=document.createElement('div');document.body.append(scroller);scroller.append(element);
 Object.defineProperties(scroller,{clientHeight:{value:400},scrollHeight:{value:2000}});scroller.scrollTop=200;scroller.getBoundingClientRect=()=>({top:0,bottom:400});
 const view={dom:element,editable:true,composing:false,hasFocus:()=>true,state:{selection:{head:1}},coordsAtPos:()=>({top:300,bottom:320})};
 const controller=app.installTypewriter(view,scroller);
 const update=patch=>store.setState(s=>({markdownSettings:{...s.markdownSettings,...patch}}));
 update({typewriter:false});controller.update();await pause(30);assert.equal(scroller.scrollTop,200);
 update({typewriter:true});controller.update();await pause(30);assert.equal(scroller.scrollTop,310);
 element.dispatchEvent(new Event('compositionstart'));controller.update();await pause(30);assert.equal(scroller.scrollTop,310);
 element.dispatchEvent(new Event('compositionend'));controller.update();await pause(30);assert.equal(scroller.scrollTop,310);
 await pause(40);controller.update();await pause(30);assert.equal(scroller.scrollTop,420);
 controller.destroy();update({typewriter:false});scroller.remove();
});
await test('P3 preferences: invalid old values restore defaults and writing styles stay Markdown-only',async()=>{
 const htmlBefore=store.getState().tabs.find(t=>t.id==='b').content;
 assert.deepEqual(app.normalizeMarkdownPreferences(null),app.defaultMarkdownPreferences);
 assert.equal(app.normalizeMarkdownPreferences({documentTheme:'serif'}).documentTheme,'default');
 assert.equal(app.normalizeMarkdownPreferences({imageDirectory:'../private',typewriter:'true',documentTheme:'unknown'}).imageDirectory,'assets');
 assert.equal(app.normalizeMarkdownPreferences({imageDirectory:'media\\images'}).imageDirectory,'media/images');
 await act(async()=>store.setState(s=>({markdownSettings:{...s.markdownSettings,documentTheme:'compact',focusParagraph:true}})));
 assert.equal(document.querySelector('.md-visual-shell').dataset.mdTheme,'compact');assert.equal(document.querySelector('.md-visual-shell').dataset.mdFocus,'true');
 assert.equal(store.getState().tabs.find(t=>t.id==='b').content,htmlBefore);
 await act(async()=>store.setState({markdownSettings:{...app.defaultMarkdownPreferences}}));
});

await test('P0 composition: slow candidate replacement and cancellation in paragraph and table preserve history',async()=>{
 for(const table of [false,true]){
  const original=table?'| 单元格 |\n| --- |\n| 正文 |\n':'正文\n';
  await act(async()=>store.getState().setContent(original,'a','command'));
  await act(async()=>app.getVisualEditor().navigate(table?3:1,table?5:3));
  const paragraph=document.querySelector(table?'.ProseMirror td p':'.ProseMirror > p');
  const editor=paragraph.closest('.ProseMirror');
  await act(async()=>paragraph.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
  for(const text of ['正文n','正文ni','正文你']){
   await act(async()=>{const current=document.querySelector(table?'.ProseMirror td p':'.ProseMirror > p');current.firstChild.textContent=text;document.getSelection().collapse(current.firstChild,text.length);current.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertCompositionText',isComposing:true,bubbles:true}));await pause(800);});
  }
  await act(async()=>{editor.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));await pause(70);});
  const confirmed=content();assert.equal(confirmed,original.replace('正文','正文你'));
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,confirmed);
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
  await act(async()=>app.getVisualEditor().navigate(table?3:1,table?5:3));
  const restored=document.querySelector(table?'.ProseMirror td p':'.ProseMirror > p');
  await act(async()=>restored.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
  for(const text of ['正文zhong','正文']) await act(async()=>{const current=document.querySelector(table?'.ProseMirror td p':'.ProseMirror > p');current.firstChild.textContent=text;document.getSelection().collapse(current.firstChild,text.length);current.dispatchEvent(new Event('input',{bubbles:true}));await pause(30);});
  await act(async()=>{editor.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));await pause(70);app.markdownHistory(true);});
  assert.equal(content(),confirmed);
 }
});
await test('P0 composition: undo during composition settlement cannot be overwritten by the stale view',async()=>{
 const original='正文\n';await act(async()=>store.getState().setContent(original,'a','command'));
 await act(async()=>app.getVisualEditor().navigate(1,3));
 const editor=document.querySelector('.ProseMirror'),paragraph=editor.querySelector('p');
 await act(async()=>editor.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
 await act(async()=>{paragraph.firstChild.textContent='正文ni';document.getSelection().collapse(paragraph.firstChild,4);paragraph.dispatchEvent(new dom.window.InputEvent('input',{inputType:'insertCompositionText',isComposing:true,bubbles:true}));await pause(40);});
 await act(async()=>app.markdownHistory());assert.equal(content(),original);
 await act(async()=>{editor.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));await pause(80);});
 assert.equal(content(),original);assert.equal(editor.textContent.trim(),'正文');
});
await test('P0 composition: nested code/raw editors and Markdown source capture IME as one edit',async()=>{
 const {EditorView}=await import('@codemirror/view');
 for(const kind of ['code','raw','source']){
  const original=kind==='raw'?'<div>正文</div>\n':kind==='code'?'```text\n正文\n```\n':'正文\n';
  await act(async()=>store.getState().setContent(original,'a','command'));
  let cm;
  if(kind==='source'){
   await act(async()=>{root.render(React.createElement(RetainedEditors));store.setState({activeId:'a',markdownMode:'source'});await pause(120);});
   cm=app.getActiveView();
  }else{
   await act(async()=>{await pause(80);document.querySelector(kind==='raw'?'.md-raw-edit':'.md-code-preview').dispatchEvent(new dom.window.MouseEvent(kind==='raw'?'click':'mousedown',{button:0,clientX:-1,clientY:-1,bubbles:true,cancelable:true}));});
   cm=EditorView.findFromDOM(document.querySelector(kind==='raw'?'.md-raw-source .cm-editor':'.md-code-editor .cm-editor'));
  }
  const initial=cm.state.doc.toString();
  await act(async()=>cm.contentDOM.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
  const originalNow=Date.now;let time=originalNow();Date.now=()=>time;
  try {for(const text of ['n','ni','你']){time+=1500;await act(async()=>cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:initial.replace('正文','正文'+text)}}));}}
  finally {Date.now=originalNow;}
  await act(async()=>{cm.contentDOM.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));await pause(80);});
  assert.equal(content(),original.replace('正文','正文你'),kind);
  await act(async()=>app.markdownHistory());assert.equal(content(),original,kind);
  await act(async()=>app.markdownHistory(true));assert.equal(content(),original.replace('正文','正文你'),kind);
 }
 await act(async()=>{root.render(null);store.setState({markdownMode:'visual'});});await render();
});

// Native layout is covered separately. These geometry-controlled tests exercise
// composition events and the scroll policy, including an IME-generated scroll.
async function imeGeometry(run) {
 const scroller=document.createElement('div'),editor=document.createElement('div');
 const text=document.createTextNode('中文输入');editor.append(text);scroller.append(editor);document.body.append(scroller);
 Object.defineProperties(scroller,{clientHeight:{value:500},clientTop:{value:0},scrollHeight:{value:5000}});
 scroller.getBoundingClientRect=()=>({top:100,bottom:600,height:500,left:0,right:600,width:600});
 scroller.scrollTop=1000;
 let caretY=1200;
 const original=window.Range.prototype.getClientRects;
 window.Range.prototype.getClientRects=()=>[{top:100+caretY-scroller.scrollTop,bottom:120+caretY-scroller.scrollTop,height:20}];
 const selection=document.getSelection(),range=document.createRange();range.setStart(text,2);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
 const guard=app.installCompositionViewport(editor,scroller);
 const event=type=>editor.dispatchEvent(new dom.window.CompositionEvent(type,{bubbles:true}));
 try {await run({scroller,editor,guard,event,caret:y=>caretY=y});}
 finally {guard.destroy();scroller.remove();window.Range.prototype.getClientRects=original;selection.removeAllRanges();}
}
await test('IME round 1: native scroll during marked text does not move an already visible caret',async()=>imeGeometry(async({scroller,guard,event})=>{
 event('compositionstart');scroller.scrollTop=1172;
 assert.equal(guard.handleScroll(),true);assert.equal(scroller.scrollTop,1000);
 scroller.scrollTop=1172;scroller.dispatchEvent(new Event('scroll'));await pause(40);assert.equal(scroller.scrollTop,1000);
}));
await test('IME round 2: wrapping beyond the bottom reveals only the required distance',async()=>imeGeometry(async({scroller,guard,event,caret})=>{
 event('compositionstart');caret(1500);guard.handleScroll();assert.equal(scroller.scrollTop,1025);
 caret(990);guard.handleScroll();assert.equal(scroller.scrollTop,985);
}));
await test('IME geometry: missing collapsed caret rectangles use adjacent text without changing the selection',async()=>imeGeometry(async({scroller,guard,event})=>{
 const selection=document.getSelection(),node=selection.focusNode,offset=selection.focusOffset;
 const original=window.Range.prototype.getClientRects;
 window.Range.prototype.getClientRects=function(){return this.collapsed?[]:original.call(this);};
 try {event('compositionstart');scroller.scrollTop=1172;guard.handleScroll();assert.equal(scroller.scrollTop,1000);assert.equal(selection.focusNode,node);assert.equal(selection.focusOffset,offset);}
 finally {window.Range.prototype.getClientRects=original;}
}));
await test('IME geometry: empty paragraphs retain the viewport when WebKit has no range rectangle',async()=>imeGeometry(async({scroller,editor,guard,event})=>{
 editor.innerHTML='<p><br></p>';const paragraph=editor.firstChild;
 paragraph.getBoundingClientRect=()=>({top:1300-scroller.scrollTop,bottom:1320-scroller.scrollTop,height:20});
 const selection=document.getSelection(),range=document.createRange();range.setStart(paragraph,0);range.collapse(true);selection.removeAllRanges();selection.addRange(range);
 const original=window.Range.prototype.getClientRects;window.Range.prototype.getClientRects=()=>[];
 try {event('compositionstart');scroller.scrollTop=1172;guard.handleScroll();assert.equal(scroller.scrollTop,1000);assert.equal(selection.focusNode,paragraph);}
 finally {window.Range.prototype.getClientRects=original;}
}));
await test('IME round 3: wheel and pointer navigation override the composition anchor',async()=>imeGeometry(async({scroller,guard,event})=>{
 event('compositionstart');scroller.dispatchEvent(new dom.window.WheelEvent('wheel'));scroller.scrollTop=1400;
 assert.equal(guard.handleScroll(),false);await pause(40);assert.equal(scroller.scrollTop,1400);
 event('compositionstart');scroller.dispatchEvent(new Event('pointerdown',{bubbles:true}));assert.equal(guard.handleScroll(),false);
}));
await test('IME round 4: confirmation is protected and ordinary input resumes afterwards',async()=>imeGeometry(async({scroller,guard,event})=>{
 event('compositionstart');event('compositionend');scroller.scrollTop=1172;guard.handleScroll();assert.equal(scroller.scrollTop,1000);
 await pause(65);scroller.scrollTop=1300;assert.equal(guard.handleScroll(),false);
 event('compositionstart');event('compositionend');event('compositionstart');await pause(65);assert.equal(guard.handleScroll(),true);
}));
await test('IME round 5: leaving the editor and destroying the view cannot pull scrolling back',async()=>imeGeometry(async({scroller,editor,guard,event})=>{
 event('compositionstart');document.getSelection().removeAllRanges();scroller.scrollTop=1250;guard.handleScroll();assert.equal(scroller.scrollTop,1250);
 guard.destroy();scroller.scrollTop=1450;editor.dispatchEvent(new Event('input',{bubbles:true}));await pause(40);assert.equal(scroller.scrollTop,1450);
}));
await test('P3 settings UI and persistence: explicit options survive reload, old snapshots use safe defaults',async()=>{
 await act(async()=>root.render(React.createElement(app.WritingSettings)));
 await act(async()=>document.querySelector('.md-writing-settings button').click());
 const theme=document.querySelector('select[aria-label="Document theme"]');assert.ok(theme);
 await act(async()=>{theme.value='compact';theme.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(store.getState().markdownSettings.documentTheme,'compact');
 const typewriter=[...document.querySelectorAll('.md-writing-panel label')].find(e=>e.textContent==='Typewriter mode').querySelector('input');
 assert.equal(typewriter.checked,false);await act(async()=>typewriter.click());assert.equal(store.getState().markdownSettings.typewriter,true);
 app.schedulePersist({sidebarPx:230,previewPct:50});await pause(750);
 assert.equal(JSON.parse(persistedState).markdownSettings.typewriter,true);assert.equal(JSON.parse(persistedState).markdownSettings.documentTheme,'compact');
 await act(async()=>{store.setState({markdownSettings:{...app.defaultMarkdownPreferences}});await app.loadPersisted();});
 assert.equal(store.getState().markdownSettings.typewriter,true);assert.equal(store.getState().markdownSettings.documentTheme,'compact');
 const oldTheme=JSON.parse(persistedState);oldTheme.markdownSettings.documentTheme='serif';persistedState=JSON.stringify(oldTheme);
 await act(async()=>app.loadPersisted());assert.equal(store.getState().markdownSettings.documentTheme,'default');
 assert.equal(document.querySelector('option[value="serif"]'),null);
 await act(async()=>store.setState({markdownMode:'visual'}));
 assert.equal([...document.querySelectorAll('.md-writing-panel button')].find(button=>button.textContent==='Download remote images').disabled,false);

 const legacy=JSON.parse(persistedState);delete legacy.markdownSettings;persistedState=JSON.stringify(legacy);
 await act(async()=>app.loadPersisted());assert.deepEqual(store.getState().markdownSettings,app.defaultMarkdownPreferences);
});
await test('removed read mode: legacy restore opens editable visual mode, preserves draft and saves the new mode',async()=>{
 const draft='# Migrated draft\n\nKeep **this** source.\n';
 const legacy=JSON.parse(persistedState);legacy.markdownMode='read';legacy.showPreview=false;legacy.previewMaximized=true;
 legacy.tabs=[{filePath:null,content:draft,savedContent:'',cursor:4,scrollTopLine:1}];legacy.activeIndex=0;persistedState=JSON.stringify(legacy);
 await act(async()=>{root.render(null);await app.loadPersisted();});
 assert.equal(store.getState().markdownMode,'visual');const id=store.getState().activeId;
 const current=()=>store.getState().tabs.find(tab=>tab.id===id).content;
 assert.equal(current(),draft);
 await act(async()=>{root.render(React.createElement(app.Visual,{tabId:id,theme:'light'}));await pause(120);});
 assert.equal(document.querySelector('.ProseMirror').getAttribute('contenteditable'),'true');
 await act(async()=>{app.getVisualEditor().navigate(3,1);app.getVisualEditor().insert('EDIT',false);});
 assert.equal(current(),draft.replace('Keep','EDITKeep'));
 await act(async()=>app.markdownHistory(false,id));assert.equal(current(),draft);
 app.schedulePersist({sidebarPx:230,previewPct:50});await pause(750);
 assert.equal(JSON.parse(persistedState).markdownMode,'visual');assert.equal(JSON.parse(persistedState).tabs[0].content,draft);
 assert.equal(store.getState().showPreview,false);assert.equal(store.getState().previewMaximized,true);
});
await test('view selector: three Markdown modes leave HTML preview flags independent in both languages',async()=>{
 for(const language of ['en','zh']) {
  await act(async()=>{store.setState({language});root.render(React.createElement(app.ModeSwitch,{markdown:true}));});
  const buttons=[...document.querySelectorAll('button')];assert.equal(buttons.length,3);
  assert.deepEqual(buttons.map(b=>b.textContent),language==='zh'?['编辑','实时预览','阅读编辑']:['Edit','Live Preview','Visual']);
  for(const [index,mode] of ['source','split','visual'].entries()) {
   await act(async()=>buttons[index].click());assert.equal(store.getState().markdownMode,mode);
   assert.equal(store.getState().showPreview,false);assert.equal(store.getState().previewMaximized,true);
  }
 }
 await act(async()=>root.render(React.createElement(app.ModeSwitch)));
 assert.deepEqual([...document.querySelectorAll('button')].map(b=>b.textContent),['编辑','实时预览','阅读']);
});
await test('history UI: restore is undoable and opening a copy preserves the current document',async()=>{
 const original='# Current version\n';
 await act(async()=>{root.render(null);store.setState({tabs:[{id:'a',filePath:'/generated/history.md',content:original,savedContent:original}],activeId:'a',language:'en'});});
 const previous=globalThis.mdInvoke;
 globalThis.mdInvoke=async(command,args)=>command==='list_markdown_history'?[{id:'123-1',path:store.getState().tabs.find(tab=>tab.id==='a').filePath,timestamp:1000,draft:false,bytes:7}]:command==='read_markdown_history'?'# Older\n':previous(command,args);
 try {
  await act(async()=>{root.render(React.createElement(app.HistoryDialog,{tabId:'a',onClose:()=>{}}));await pause(30);});
  await act(async()=>{document.querySelector('.md-history-list button').click();await pause(30);});
  assert.equal(document.querySelector('.md-history-body textarea').value,'# Older\n');
  await act(async()=>[...document.querySelectorAll('.md-history-actions button')].find(button=>button.textContent==='Restore in editor (undoable)').click());
  assert.equal(content(),'# Older\n');await act(async()=>app.markdownHistory(false,'a'));assert.equal(content(),original);
 } finally {globalThis.mdInvoke=previous;await act(async()=>root.render(null));}
});
await test('shared surface: HTML preview and editable children switch safely with custom document CSS',async()=>{
 await act(async()=>root.render(null));const original=content(),settings=store.getState().markdownSettings;
 const Sheet=globalThis.CSSStyleSheet,Rule=globalThis.CSSRule;
 globalThis.CSSRule=dom.window.CSSRule;
 globalThis.CSSStyleSheet=class {replaceSync(text){const style=document.createElement('style');style.textContent=text;document.head.append(style);this.cssRules=style.sheet.cssRules;style.remove();}};
 try {
  for(const css of ['', 'p { color: #123456; }']) {
   await act(async()=>store.setState({markdownSettings:{...settings,customCss:css}}));
   for(const component of [app.Preview,app.Visual,app.Preview]) {
    await act(async()=>{root.render(React.createElement(component,{tabId:'a',theme:'light'}));await pause(160);});
    await act(async()=>pause(120));
    const surface=document.querySelector('.md-surface');assert.ok(surface);assert.equal(surface.querySelector('style'),null);
    if(css) assert.equal(surface.previousElementSibling.tagName,'STYLE');
    assert.equal(content(),original);
   }
  }
 } finally {globalThis.CSSStyleSheet=Sheet;globalThis.CSSRule=Rule;await act(async()=>{root.render(null);store.setState({markdownSettings:settings});});}
});
await test('lifecycle: cancelled startup finishes before disposal and cannot clear the replacement editor',async()=>{
 const {Editor:MilkdownEditor}=await import('@milkdown/kit/core');
 await act(async()=>root.render(null));
 const make=MilkdownEditor.make;let release,started=false,destroys=0,first=true;
 const gate=new Promise(resolve=>release=resolve);
 MilkdownEditor.make=function(...args){
  const editor=make.apply(this,args);if(first){first=false;const create=editor.create,destroy=editor.destroy;
   editor.create=async()=>{const result=await create();started=true;await gate;return result;};
   editor.destroy=async(...args)=>{destroys++;return destroy(...args);};
  }return editor;
 };
 try {
  await render();assert.equal(started,true);
  await act(async()=>root.render(null));assert.equal(destroys,0,'never destroy while create is outstanding');
  await render();const replacement=app.getVisualEditor();assert.ok(replacement);
  await act(async()=>{release();await pause(70);});
  assert.equal(destroys,1);assert.equal(app.getVisualEditor(),replacement);assert.equal(document.querySelectorAll('.ProseMirror').length,1);
 } finally {release();MilkdownEditor.make=make;await act(async()=>root.render(null));}
});
await test('lifecycle: missing context failure can retry without losing source or polling destroy forever',async()=>{
 const {Editor:MilkdownEditor,EditorStatus}=await import('@milkdown/kit/core');
 const {createSlice}=await import('@milkdown/kit/ctx');
 await act(async()=>root.render(null));const original=content();
 const make=MilkdownEditor.make;let first=true,broken,destroys=0;
 MilkdownEditor.make=function(...args){
  const editor=make.apply(this,args);
  if(first){first=false;broken=editor;const destroy=editor.destroy;
   editor.destroy=async(...args)=>{destroys++;return destroy(...args);};
   // Same display name, different identity: reproduce a second core module.
   const otherNodes=createSlice([], 'nodes');
   editor.use(ctx=>async()=>{assert.ok(ctx.get('nodes'));ctx.get(otherNodes);});
  }return editor;
 };
 try {
  await render();assert.equal(broken.status,EditorStatus.OnCreate);
  assert.match(document.querySelector('[role=alert]').textContent,/Context "nodes" not found/);
  assert.equal(content(),original);assert.equal(app.getVisualEditor(),null);assert.equal(destroys,0);
  await act(async()=>{[...document.querySelectorAll('button')].find(button=>button.textContent==='Reload editor').click();await pause(150);});
  assert.equal(document.querySelector('[role=alert]'),null);assert.ok(app.getVisualEditor());
  assert.equal(content(),original);assert.equal(document.querySelectorAll('.ProseMirror').length,1);assert.equal(destroys,0);
  await act(async()=>{app.getVisualEditor().navigate(1,1);app.getVisualEditor().insert('RECOVERED ',false);});
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
  await act(async()=>app.markdownHistory());assert.equal(content(),original);
 } finally {MilkdownEditor.make=make;await act(async()=>root.render(null));}
});
await test('lifecycle: StrictMode never creates the abandoned editor or duplicates live views',async()=>{
 const {Editor:MilkdownEditor}=await import('@milkdown/kit/core');
 await act(async()=>root.render(null));
 const make=MilkdownEditor.make;let creates=0;
 MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{creates++;return create();};return editor;};
 try {
  await act(async()=>{root.render(React.createElement(React.StrictMode,null,React.createElement(app.Visual,{tabId:'a',theme:'light'})));await pause(150);});
  assert.equal(creates,1,'StrictMode cleanup must cancel parsing before a detached editor is created');
  assert.equal(document.querySelectorAll('.ProseMirror').length,1);
  await act(async()=>{root.render(null);await pause(80);});
  assert.equal(app.getVisualEditor(),null);assert.equal(document.querySelectorAll('.ProseMirror').length,0);
 } finally {MilkdownEditor.make=make;}
});
await act(async()=>root.unmount());assert.deepEqual(runtimeErrors,[]);dom.window.close();console.log(`${passed} integration tests passed`);
