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
const output=path.resolve('node_modules/.cache/deditor-markdown-table-indent-roundtrip.mjs');
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
export {renderMarkdown} from './src/lib/markdown';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {writeMarkdownClipboard} from './src/lib/markdownClipboard';
export {saveFile} from './src/lib/fileio';
export {normalizeMarkdownPreferences} from './src/lib/markdownPreferences';
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
const failedCases=[];
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failedCases.push(name);console.error('FAIL '+name+'\n'+error.stack);}}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection,AllSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};
const input=async(text)=>{await act(async()=>{const {from,to}=view.state.selection;let handled=false;view.someProp('handleTextInput',fn=>{if(fn(view,from,to,text,()=>view.state.tr.insertText(text,from,to))){handled=true;return true;}});if(!handled)view.dispatch(view.state.tr.insertText(text,from,to));await pause(35);});};
const range=async(text,a,b)=>{await select(text,a);await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.from,view.state.selection.from+b-a))));};
const paste=async(text,html='')=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?text:type==='text/html'?html:''}});await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});};
const visible=()=>view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n');
const suggestions=()=>[...document.querySelectorAll('.md-emoji-suggestions button')].map(b=>b.textContent);
// Heading IDs are generated by the display layer, not authored Markdown.
// Default table alignment and explicit left alignment are semantically equal.
// Compare persisted semantics, including all other node attributes and marks.
const semantics=()=>JSON.parse(JSON.stringify(view.state.doc.toJSON(),(key,value)=>{
 if(value?.type==='heading'&&value.attrs){const {id,...attrs}=value.attrs;return {...value,attrs};}
 if(['table_cell','table_header'].includes(value?.type)&&value.attrs)return {...value,attrs:{...value.attrs,alignment:value.attrs.alignment??'left'}};
 return value;
}));
// Exercise the editor's real copy/cut handlers; only the OS clipboard is mocked.
const copySelection=async(type='copy')=>{
 const data=new Map();
 const event=new dom.window.Event(type,{bubbles:true,cancelable:true});
 Object.defineProperty(event,'clipboardData',{value:{clearData:()=>data.clear(),setData:(kind,value)=>data.set(kind,value),getData:kind=>data.get(kind)||''}});
 await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});
 assert.equal(event.defaultPrevented,true,type+' must be handled');
 assert.ok(data.has('text/plain'));assert.ok(data.has('text/html'));
 return {text:data.get('text/plain'),html:data.get('text/html')};
};
const selectDocument=async()=>{
 await act(async()=>view.focus());await key('a',{ctrlKey:true});
 assert.equal(view.state.selection.from,0,'select all starts at document boundary');
 assert.equal(view.state.selection.to,view.state.doc.content.size,'select all includes final block');
};
const selectClipboardDocument=async()=>act(async()=>{
 view.focus();view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
});
const {CellSelection,TableMap}=await import('@milkdown/kit/prose/tables');
const tableInfo=()=>{let found;view.state.doc.descendants((node,pos)=>{if(node.type.name==='table'&&!found)found={node,pos};});assert.ok(found);return found;};
const selectCells=async(first,last)=>{const {node,pos}=tableInfo(),map=TableMap.get(node);await act(async()=>{view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,pos+1+map.map[first],pos+1+map.map[last])));view.focus();});};
const plain='| Header A | Header B |\n| --- | --- |\n| 中文 one | two |\n';
const marked=plain.replace('Header A','<!-- deditor:table-indent=2 --><!-- deditor:valign=middle -->Header A');
try {
 await test('preview consumes first-header indent metadata and preserves vertical alignment',async()=>{
  const html=await app.renderMarkdown(marked,{theme:'light'}),doc=new JSDOM(html).window.document,table=doc.querySelector('table');
  assert.equal(table.dataset.deditorTableIndent,'2');assert.match(table.getAttribute('style'),/margin-inline-start:calc\(4em \/ var\(--md-table-font-scale, 1\)\)/);
  assert.equal(doc.querySelector('th').style.verticalAlign,'middle');assert.equal(doc.querySelector('th').textContent,'Header A');assert.ok(!html.includes('<!-- deditor:table-indent='));
 });
 await test('preview indent is local to each table and ignores misplaced/invalid markers',async()=>{
  for(const theme of ['light','dark']){
   const html=await app.renderMarkdown(marked+'\nAfter\n\n'+plain,{theme});const doc=new JSDOM(html).window.document,tables=[...doc.querySelectorAll('table')];
   assert.equal(tables.length,2);assert.equal(tables[0].dataset.deditorTableIndent,'2');assert.equal(tables[1].dataset.deditorTableIndent,undefined);
  }
  for(const source of [plain.replace('two','<!-- deditor:table-indent=4 -->two'),plain.replace('Header B','<!-- deditor:table-indent=4 -->Header B'),plain.replace('Header A','<!-- deditor:table-indent=9007199254740992 -->Header A')]){
   const doc=new JSDOM(await app.renderMarkdown(source,{theme:'light'})).window.document;assert.equal(doc.querySelector('table').dataset.deditorTableIndent,undefined);
  }
 });
 await test('preview indented first-header lists and explicit whitespace remain content',async()=>{
  const source='| <!-- deditor:table-indent=3 -->- first<br>- second | B |\n| --- | --- |\n| &#32;left&#32; | value |\n';
  const doc=new JSDOM(await app.renderMarkdown(source,{theme:'light'})).window.document;assert.equal(doc.querySelector('table').dataset.deditorTableIndent,'3');assert.deepEqual([...doc.querySelectorAll('th li')].map(n=>n.textContent),['first','second']);assert.equal(doc.querySelector('td').textContent,' left ');
 });
 await test('full-table clipboard retains indent, visible text and HTML paste roundtrip',async()=>{
  await reset(marked);assert.equal(tableInfo().node.attrs.indent,2);await selectCells(0,3);
  const payload=app.getVisualEditor().clipboard();assert.match(payload.markdown,/<!-- deditor:table-indent=2 -->/);assert.match(payload.html,/data-deditor-table-indent="2"/);assert.ok(!payload.text.includes('deditor:'));assert.equal(payload.tsv,'Header A\tHeader B\n中文 one\ttwo');
  await reset('Destination\n');await select('Destination');await paste(payload.text,payload.html);
  assert.equal(tableInfo().node.attrs.indent,2);assert.match(content(),/<!-- deditor:table-indent=2 -->/);assert.equal(tableInfo().node.firstChild.firstChild.attrs.verticalAlignment,'middle');assert.ok(!visible().includes('deditor:'));
  const saved=content();await reset(saved);assert.equal(tableInfo().node.attrs.indent,2);
 });
 await test('partial rectangle clipboard drops whole-table indent while keeping cell metadata',async()=>{
  await reset(marked);await selectCells(0,2);const payload=app.getVisualEditor().clipboard();
  assert.ok(!payload.markdown.includes('table-indent'));assert.ok(!payload.html.includes('data-deditor-table-indent'));assert.match(payload.markdown,/deditor:valign=middle/);
  await reset('Destination\n');await select('Destination');await paste(payload.text,payload.html);assert.equal(tableInfo().node.attrs.indent,0);assert.equal(tableInfo().node.firstChild.firstChild.attrs.verticalAlignment,'middle');
 });
 await test('whole-document rich copy preserves indented and plain tables independently',async()=>{
  await reset(marked+'\nAfter\n\n'+plain);await selectClipboardDocument();const payload=app.getVisualEditor().clipboard();
  const doc=new JSDOM(payload.html).window.document,tables=[...doc.querySelectorAll('table')];assert.deepEqual(tables.map(t=>t.dataset.deditorTableIndent??'0'),['2','0']);
  await reset('Destination\n');await select('Destination');await paste(payload.text,payload.html);const levels=[];view.state.doc.descendants(n=>{if(n.type.name==='table')levels.push(n.attrs.indent)});assert.deepEqual(levels,[2,0]);
 });
 await test('ordinary copy event and table-node selection retain whole-table indent',async()=>{
  await reset(marked);await selectCells(0,3);const copied=await copySelection();assert.match(copied.html,/data-deditor-table-indent="2"/);assert.ok(!copied.text.includes('deditor:'));
  await reset('Destination\n');await select('Destination');await paste(copied.text,copied.html);assert.equal(tableInfo().node.attrs.indent,2);
  await reset(marked);const {NodeSelection}=await import('@milkdown/kit/prose/state');await act(async()=>view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,tableInfo().pos))));
  const nodePayload=app.getVisualEditor().clipboard();assert.match(nodePayload.html,/data-deditor-table-indent="2"/);assert.match(nodePayload.markdown,/table-indent=2/);
 });
 await test('rendered preview HTML pasted back retains indentation and ordinary table content',async()=>{
  const html=await app.renderMarkdown(marked,{theme:'dark'});await reset('Destination\n');await select('Destination');await paste('Header A Header B 中文 one two',html);
  assert.equal(tableInfo().node.attrs.indent,2);assert.equal(tableInfo().node.firstChild.firstChild.textContent,'Header A');assert.equal(tableInfo().node.firstChild.firstChild.attrs.verticalAlignment,'middle');
 });
} finally {await act(async()=>root.unmount());dom.window.close();}
assert.deepEqual(runtimeErrors,[]);assert.deepEqual(failedCases,[]);console.log(`PASS ${passed} table-indent preview/clipboard roundtrip cases`);
