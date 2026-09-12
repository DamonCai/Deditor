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
const output=path.resolve('node_modules/.cache/deditor-markdown-round3-table.mjs');
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
const {TextSelection,NodeSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view, editorContext;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);editorContext=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original,steps=1)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory());assert.equal(content(),original);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};




const {commandsCtx}=await import('@milkdown/kit/core');
const gfm=await import('@milkdown/kit/preset/gfm');
const {CellSelection,TableMap}=await import('@milkdown/kit/prose/tables');
const table=()=>{let result;view.state.doc.descendants((n,p)=>{if(n.type.name==='table')result={node:n,pos:p};});return result;};
const matrix=()=>{const rows=[];table().node.forEach(row=>{const cells=[];row.forEach(cell=>cells.push(cell.textBetween(0,cell.content.size,'\n\n','\n')));rows.push(cells);});return rows;};
// JSDOM has no native character editing. Dispatch the real key handler first,
// then model only an unhandled single-character deletion/move, never a target state.
const editKey=async(name)=>{const prior=view.state.selection;const event=await key(name);if(event.defaultPrevented || !prior.eq(view.state.selection))return;const {from,to}=view.state.selection;await act(async()=>{const tr=view.state.tr;if(name==='ArrowLeft')tr.setSelection(TextSelection.near(tr.doc.resolve(Math.max(0,from-1)),-1));else tr.delete(from===to&&name==='Backspace'?from-1:from,from===to&&name==='Delete'?to+1:to);view.dispatch(tr);});};
const input=async(text)=>{await act(async()=>view.dispatch(view.state.tr.insertText(text)));};
const history=async(redo=false)=>{await act(async()=>app.markdownHistory(redo));};
const command=async(name,payload)=>{await act(async()=>{editorContext.get(commandsCtx).call(gfm[name].key,payload);await pause(20);});};
const fresh=async()=>{await reset('');await act(async()=>app.getVisualEditor().insert('| | |\n| --- | --- |\n| | |',true));assert.deepEqual(matrix(),[['',''],['','']]);await cell(0,0);};
const cell=async(row,col,offset=0)=>{const t=table(),map=TableMap.get(t.node),pos=t.pos+1+map.map[row*map.width+col]+2+offset;await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,pos)));});};
const currentCell=()=>{const {$from}=view.state.selection;for(let d=$from.depth;d>0;d--)if(['table_cell','table_header'].includes($from.node(d).type.name))return $from.before(d);};
const cellAt=(r,c)=>{const t=table(),map=TableMap.get(t.node);return t.pos+1+map.map[r*map.width+c];};
const paste=async(text)=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:kind=>kind==='text/plain'?text:''}});await act(async()=>{view.focus();view.dom.dispatchEvent(event);await pause(30);});};
const durable=async()=>{const saved=content(),doc=view.state.doc.toJSON();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,saved);await act(async()=>root.render(null));await render();assert.equal(content(),saved);assert.deepEqual(view.state.doc.toJSON(),doc);};
try {
 await test('T01 create, softbreak, delete every character, Tab return and type',async()=>{
  await fresh();await input('a');await key('Enter',{shiftKey:true});await input('b');assert.equal(matrix()[0][0],'a\nb');for(let i=0;i<3;i++)await editKey('Backspace');assert.equal(table().node.firstChild.firstChild.firstChild.childCount,0);await key('Tab');assert.equal(currentCell(),cellAt(0,1));await key('Tab',{shiftKey:true});assert.equal(currentCell(),cellAt(0,0));await input('fresh');assert.deepEqual(matrix(),[['fresh',''],['','']]);await durable();
 });
 await test('T02 create repeated softbreaks, delete visible text, clear remaining break content and traverse',async()=>{
  await fresh();await cell(1,0);await input('a');await key('Enter',{shiftKey:true});await key('Enter',{shiftKey:true});await input('b');await editKey('Backspace');assert.equal(matrix()[1][0],'a\n\n');await act(async()=>view.dispatch(view.state.tr.setSelection(new CellSelection(view.state.doc.resolve(cellAt(1,0))))));await key('Delete');assert.equal(table().node.child(1).firstChild.firstChild.childCount,0);await key('Tab');await input('neighbor');assert.deepEqual(matrix(),[['',''],['','neighbor']]);await durable();
 });
 await test('T03 last-cell Tab creates a row; undo redo and immediate typing stays in new row',async()=>{
  await fresh();await cell(1,1);const before=content();await key('Tab');assert.equal(matrix().length,3);await history();assert.equal(content(),before);await history(true);assert.equal(matrix().length,3);assert.equal(currentCell(),cellAt(2,0));await input('new');await key('Tab');assert.equal(currentCell(),cellAt(2,1));await input('next');assert.deepEqual(matrix().at(-1),['new','next']);await durable();
 });
 await test('T04 generated row and typed content survive repeated undo redo without duplicate row',async()=>{
  await fresh();await cell(0,0);await input('keep');await cell(1,1);await key('Tab');await input('tail');const edited=content();await history();await history(true);assert.equal(content(),edited);assert.equal(matrix().length,3);assert.equal(currentCell(),cellAt(2,0));await input('X');assert.equal(matrix()[2][0],'tailX');await durable();
 });
 await test('T05 expanded TSV rectangle can be cleared and typed into without losing row/column shape',async()=>{
  await fresh();await cell(1,0);await paste('a\tb\tc\nd\te\tf');assert.deepEqual(matrix(),[['','',''],['a','b','c'],['d','e','f']]);await act(async()=>view.dispatch(view.state.tr.setSelection(new CellSelection(view.state.doc.resolve(cellAt(1,0)),view.state.doc.resolve(cellAt(2,2))))));await key('Delete');assert.deepEqual(matrix(),[['','',''],['','',''],['','','']]);const empty=content();await input('new');assert.equal(matrix().flat().filter(Boolean).join(),'new');const typed=content();await history();assert.notEqual(content(),typed);await history(true);assert.equal(content(),typed);assert.equal(matrix().flat().filter(Boolean).join(),'new');await durable();
 });
 await test('T06 generated multiline TSV cell clears completely and accepts new text with adjacent whitespace intact',async()=>{
  await fresh();await cell(1,0);await paste('"a\nb"\t keep ');assert.deepEqual(matrix()[1],['a\nb',' keep ']);await act(async()=>view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,cellAt(1,0)+1))));await key('Backspace');assert.ok(view.state.selection instanceof TextSelection);assert.equal(currentCell(),cellAt(1,0));await input('new');assert.deepEqual(matrix()[1],['new',' keep ']);await durable();
 });
 await test('T07 generated table between paragraphs accepts horizontal entry at both boundaries',async()=>{
  await reset('Before');await select('Before');await key('Enter');await act(async()=>app.getVisualEditor().insert('| | |\n| --- | --- |\n| | |',true));await cell(0,0);await input('header');await cell(1,1);await input('last');await key('Enter');await input('After');const before=content();await select('Before');await key('ArrowRight');assert.equal(currentCell(),cellAt(0,0));await select('After',0);await key('ArrowLeft');assert.equal(currentCell(),cellAt(1,1));assert.equal(view.state.selection.$from.parentOffset,4);assert.equal(content(),before);await input('X');assert.equal(matrix()[1][1],'lastX');await durable();
 });
 await test('T08 generated final table exits by Enter and allows paragraph editing after history',async()=>{
  await fresh();await cell(1,1);await input('last');await key('Enter');assert.equal(view.state.selection.$from.depth,1);await input('after');const edited=content();await history();await history(true);assert.equal(content(),edited);await input('X');assert.equal(matrix()[1][1],'last');assert.match(content(),/afterX\n?$/);await durable();
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} round3 table sequence checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
