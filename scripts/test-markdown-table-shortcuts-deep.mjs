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
const output=path.resolve('node_modules/.cache/deditor-markdown-table-shortcuts-deep.mjs');
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
export {insertTableItems,alignTableCells} from './src/lib/markdownVisual/tableOperations';
export {formatBuffer} from './src/lib/format';
export {renderMarkdown} from './src/lib/markdown';
export {deleteTableRows,deleteTableColumns} from './src/lib/markdownVisual/tableMenu';
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
const {TextSelection,NodeSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view, editorContext;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);editorContext=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original,steps=1)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory());assert.equal(content(),original);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

const {commandsCtx}=await import('@milkdown/kit/core');
const gfm=await import('@milkdown/kit/preset/gfm');
const {CellSelection,TableMap,moveTableColumn}=await import('@milkdown/kit/prose/tables');
const original='Before unchanged\n\n| A | B |\n| :--- | ---: |\n| one | two |\n| three | four |\n\nAfter unchanged\n';
const table=()=>{let result;view.state.doc.descendants((n,p)=>{if(n.type.name==='table')result={node:n,pos:p};});return result;};
const matrix=()=>{const rows=[];table().node.forEach(row=>{const cells=[];row.forEach(cell=>cells.push(cell.textBetween(0,cell.content.size,"\n\n","\n")));rows.push(cells);});return rows;};
const paste=async(text,html='')=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:kind=>kind==='text/plain'?text:kind==='text/html'?html:''}});await act(async()=>{view.focus();view.dom.dispatchEvent(event);await pause(30);});};
const command=async(name,payload)=>{await act(async()=>{editorContext.get(commandsCtx).call(gfm[name].key,payload);await pause(20);});};
const roundtrip=async(before,expected=matrix(),steps=1)=>{const edited=content();await exactHistory(before,steps);assert.deepEqual(matrix(),expected);assert.equal(content(),edited);assert.ok(edited.startsWith('Before unchanged\n\n'));assert.ok(edited.endsWith('\n\nAfter unchanged\n'));};
const cellLocation=()=>{const s=view.state.selection.$head;for(let d=s.depth;d>0;d--)if(['table_cell','table_header'].includes(s.node(d).type.name))return s.before(d);return null;};
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
const wholeCell=async(index,other=index)=>{const {node,pos}=table(),map=TableMap.get(node);await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,pos+1+map.map[index],pos+1+map.map[other]))));};
const blank=original.replace('| one | two |','|  | two |');
const selectCell=async(index,offset=0)=>{const {node,pos}=table(),map=TableMap.get(node);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,pos+1+map.map[index]+2+offset)));await pause(20);});};
try {
 await test('T01 Tab and ShiftTab traverse every cell, stop at first and append one row at last',async()=>{
  for(const source of [original,original.replace('| one | two |\n| three | four |\n','')]) {
   await reset(source);const initial=matrix();await select('A',0);const start=view.state.selection;
   await key('Tab',{shiftKey:true});assert.ok(view.state.selection.eq(start));assert.equal(content(),source);
   for(const word of initial.flat().slice(1)){await key('Tab');assert.equal(view.state.selection.$head.parent.textContent,word);assert.equal(content(),source);}
   await key('Tab');assert.deepEqual(matrix(),[...initial,['','']]);assert.equal(view.state.selection.$head.parent.textContent,'');await exactHistory(source);
  }
 });
 await test('T02 modified and composing Tab never navigates or appends rows',async()=>{
  for(const modifiers of [{ctrlKey:true},{metaKey:true},{altKey:true},{ctrlKey:true,shiftKey:true}]) {
   await reset(original);await select('four');const before=view.state.selection;
   await key('Tab',modifiers);assert.ok(view.state.selection.eq(before),JSON.stringify(modifiers));assert.equal(content(),original,JSON.stringify(modifiers));
  }
 });
 await test('T03 last-cell Tab insertion and subsequent typing have independent single undo',async()=>{
  await reset(original);await select('four');await key('Tab');const grown=content();await type('中文😀');const typed=content();
  await act(async()=>app.markdownHistory());assert.equal(content(),grown);await act(async()=>app.markdownHistory());assert.equal(content(),original);
  await act(async()=>app.markdownHistory(true));assert.equal(content(),grown);await act(async()=>app.markdownHistory(true));assert.equal(content(),typed);await exactHistory(grown);
 });
 await test('T04 Enter and ShiftEnter insert durable breaks in headers, empty/body/last cells',async()=>{
  for(const shifted of [false,true])for(const [index,offset] of [[0,0],[0,1],[2,0],[3,1],[5,4]]) {
   await reset(blank);await selectCell(index,offset);const cell=cellLocation(),before=matrix();const event=await key('Enter',{shiftKey:shifted});
   assert.equal(event.defaultPrevented,true);assert.equal(cellLocation(),cell);const after=matrix();assert.equal(after.flat().filter((v,i)=>v!==before.flat()[i]).length,1);assert.ok(after.flat()[index].includes('\n'));await exactHistory(blank);assert.deepEqual(matrix(),after);
  }
 });
 await test('T05 Enter on rectangular selections enters head cell without clearing; Delete and Backspace clear rectangle once',async()=>{
  for(const name of ['Enter','Backspace','Delete'])for(const pair of [[2,3],[3,2],[0,5]]) {
   await reset(original);await wholeCell(...pair);const before=matrix();await key(name);
   if(name==='Enter'){assert.ok(view.state.selection instanceof TextSelection);assert.deepEqual(matrix(),before);assert.equal(content(),original);}
   else {assert.ok(matrix().flat().some(x=>x===''));assert.equal(matrix().length,3);assert.equal(matrix()[0].length,2);await exactHistory(original);}
  }
 });
 await test('T06 cell paragraph NodeSelection deletion retains same editable cell',async()=>{
  for(const name of ['Backspace','Delete'])for(const index of [0,2,5]){
   await reset(original);await selectCell(index);const pos=view.state.selection.$head.before(),cell=cellLocation();
   await act(async()=>view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,pos))));await key(name);assert.equal(cellLocation(),cell);assert.equal(view.state.selection.$head.parent.textContent,'');await exactHistory(original);
  }
 });
 await test('T07 backward/forward deletion at text cell boundaries does not destroy adjacent cells',async()=>{
  for(const name of ['Backspace','Delete'])for(const index of [0,2,5]) {
   await reset(original);const word=matrix().flat()[index];await selectCell(index,name==='Backspace'?0:word.length);await key(name);assert.equal(content(),original);assert.equal(matrix().length,3);
  }
 });
 await test('T08 paragraph horizontal arrows enter neighboring table and do not mutate source',async()=>{
  for(const [word,keyName,target] of [['Before unchanged','ArrowRight','A'],['After unchanged','ArrowLeft','four']]){
   await reset(original);await select(word,keyName==='ArrowLeft'?0:word.length);await key(keyName);assert.equal(view.state.selection.$head.parent.textContent,target);assert.ok(cellLocation()!==null);assert.equal(content(),original);
  }
 });
 await test('T09 table nested in outer list keeps nesting, neighbors and exact undo after last-cell Tab',async()=>{
  const nested='- parent\n\n  | A | B |\n  | --- | --- |\n  | one | two |\n\n  following\n\n- sibling\n';
  await reset(nested);await select('two');await key('Tab');assert.equal(matrix().length,3);assert.equal(view.state.doc.firstChild.type.name,'bullet_list');assert.equal(view.state.doc.firstChild.firstChild.firstChild.textContent,'parent');assert.ok(content().includes('following'));assert.equal(view.state.doc.firstChild.lastChild.firstChild.textContent,'sibling');await exactHistory(nested);assert.equal(matrix().length,3);
 });
 await test('T10 lists within cells use Tab for cell navigation, and Enter for an in-cell break',async()=>{
  const listed=original.replace('| one | two |','| - alpha<br>  - nested<br>- beta | two |');
  await reset(listed);await select('nested');const cell=cellLocation();await key('Tab');assert.equal(view.state.selection.$head.parent.textContent,'two');assert.equal(content(),listed);await key('Tab',{shiftKey:true});assert.equal(cellLocation(),cell);
  await select('nested',3);await key('Enter');assert.equal(cellLocation(),cell);assert.match(content(),/nes<br>/);await exactHistory(listed);
 });
 await test('T11 Markdown list triggers in cells preserve structure and survive undo/reopen',async()=>{
  for(const marker of ['- ','+ ','1. ']) {
   await reset(blank);await selectCell(2);await type(marker);await type('item');assert.equal(table().node.childCount,3);assert.equal(matrix()[1][1],'two');const after=content();assert.match(after,/item/);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,after);await reset(after);assert.equal(matrix()[1][1],'two');assert.ok(matrix()[1][0].includes('item'));view.state.doc.check();
  }
 });
 await test('T12 readonly keys are inert across cells, cell selections and table boundaries',async()=>{
  for(const name of ['Tab','Enter','Backspace','Delete','ArrowLeft','ArrowRight']) {
   await reset(original);await select('four');await render(true);const before=view.state.selection;await key(name);assert.equal(content(),original);assert.ok(view.state.selection.eq(before),name);
  }
 });
 await test('T13 cross-table text selections consume forward/reverse Tab without source or selection changes',async()=>{
  for(const reverse of [false,true])for(const shiftKey of [false,true])for(const startWord of ['Before unchanged','one','list']){
   const source=startWord==='list'?original.replace('Before unchanged','- list'):original;await reset(source);await select(startWord,0);const before=view.state.selection.from;await select('four');const end=view.state.selection.from;
   await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,reverse?end:before,reverse?before:end))));const selected=view.state.selection;
   const event=await key('Tab',{shiftKey});assert.equal(event.defaultPrevented,true);assert.equal(matrix().length,3);assert.equal(content(),source);assert.ok(view.state.selection.eq(selected));
  }
 });
 await test('T14 whole-table NodeSelection and forward/reverse all-cell selection indent twice, outdent once, save and undo',async()=>{
  for(const source of [original,'Before unchanged\n\n| |\n| --- |\n\nAfter unchanged\n'])for(const kind of ['node','forward','reverse']) {
   await reset(source);const initial=matrix(),json=table().node.content.toJSON();
   if(kind==='node')await act(async()=>view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,table().pos))));
   else {const count=TableMap.get(table().node).map.length;await wholeCell(kind==='forward'?0:count-1,kind==='forward'?count-1:0);}
   const selected=()=>{assert.ok(kind==='node'?view.state.selection instanceof NodeSelection:view.state.selection instanceof CellSelection);assert.deepEqual(matrix(),initial);assert.deepEqual(table().node.content.toJSON(),json);};
   const start=content();await key('Tab',{shiftKey:true});assert.equal(content(),start);assert.equal(table().node.attrs.indent,0);
   const snapshots=[content()];for(const expected of [1,2,1]) {await key('Tab',{shiftKey:expected===1&&snapshots.length===3});assert.equal(table().node.attrs.indent,expected);selected();snapshots.push(content());}
   await exactHistory(snapshots[2]);assert.equal(table().node.attrs.indent,1);assert.deepEqual(matrix(),initial);
   await reset(snapshots[3]);assert.equal(table().node.attrs.indent,1);assert.deepEqual(matrix(),initial);assert.equal((content().match(/deditor:table-indent/g)||[]).length,1);
  }
 });
 await test('T15 formatted empty and vertically aligned headers preserve indent metadata through save/reparse',async()=>{
  for(const head of ['', '**bold**','<!-- deditor:valign=middle -->**bold**<br>next']){
   const sample=original.replace('| A | B |',`| ${head} | B |`);await reset(sample);const initial=matrix();await wholeCell(0,5);await key('Tab');const after=content();assert.equal(table().node.attrs.indent,1);await exactHistory(sample);await reset(after);assert.equal(table().node.attrs.indent,1);assert.deepEqual(matrix(),initial);assert.ok(!table().node.textContent.includes('deditor:'));
  }
 });
 await test('T16 ordinary 1x1 caret still appends row; partial rectangle still navigates without table indent',async()=>{
  const sample='Before unchanged\n\n| only |\n| --- |\n\nAfter unchanged\n';await reset(sample);await select('only');await key('Tab');assert.equal(matrix().length,2);assert.equal(table().node.attrs.indent,0);await exactHistory(sample);
  await reset(original);await wholeCell(2,3);await key('Tab');assert.equal(table().node.attrs.indent,0);assert.equal(matrix().length,3);assert.ok(view.state.selection instanceof TextSelection);
 });
 await test('T17 table indent survives row/column insertion deletion and alignment',async()=>{
  await reset(original);await wholeCell(0,5);await key('Tab');await select('one');await act(async()=>app.insertTableItems(view,'column',true,1));assert.equal(table().node.attrs.indent,1);
  const added=content();await exactHistory(original,2);assert.equal(table().node.attrs.indent,1);await reset(added);assert.equal(table().node.attrs.indent,1);
  await select('one');await act(async()=>app.deleteTableColumns(view));assert.equal(table().node.attrs.indent,1);const deleted=content();await reset(deleted);assert.equal(table().node.attrs.indent,1);assert.equal((content().match(/deditor:table-indent/g)||[]).length,1);
 });
 await test('T18 composition and readonly whole-table Tab leave indent and source intact',async()=>{
  await reset(original);await wholeCell(0,5);await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));const compositionSource=content();await key('Tab',{isComposing:true,keyCode:229});assert.equal(content(),compositionSource);assert.equal(table().node.attrs.indent,0);await act(async()=>{view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));await pause(30);});
  await reset(original);await wholeCell(0,5);await render(true);await key('Tab');assert.equal(content(),original);assert.equal(table().node.attrs.indent,0);
 });
 await test('T19 column move and new header row retain table-owned indentation and cell formatting',async()=>{
  await reset(original.replace('| A | B |','| **A** | B |'));await wholeCell(0,5);await key('Tab');await select('one');const before=matrix();
  await act(async()=>moveTableColumn({from:0,to:1})(view.state,view.dispatch));assert.equal(table().node.attrs.indent,1);assert.deepEqual(matrix(),before.map(row=>row.slice().reverse()));let saved=content();await reset(saved);assert.equal(table().node.attrs.indent,1);assert.deepEqual(matrix(),before.map(row=>row.slice().reverse()));assert.equal(table().node.firstChild.child(1).firstChild.firstChild.marks[0].type.name,'strong');
  await select('B');await act(async()=>app.insertTableItems(view,'row',true,1));assert.equal(table().node.attrs.indent,1);saved=content();await reset(saved);assert.equal(table().node.attrs.indent,1);assert.equal((saved.match(/deditor:table-indent/g)||[]).length,1);assert.equal(table().node.childCount,4);
 });
 await test('T20 whole-table node deletion is a single reversible edit and leaves surrounding paragraphs',async()=>{
  for(const name of ['Backspace','Delete']){
   await reset(original);await act(async()=>view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,table().pos))));await key(name);assert.equal(table(),undefined);assert.ok(content().includes('Before unchanged'));assert.ok(content().includes('After unchanged'));await exactHistory(original);
  }
 });
 await test('T21 typed Markdown markers and pipes remain valid inside cells and save without visible extension text',async()=>{
  for(const text of ['# heading','> quote','| pipe','- [ ] task']){
   await reset(blank);await selectCell(2);await type(text);const after=content(),expected=matrix();view.state.doc.check();assert.equal(matrix().length,3);assert.equal(matrix()[1][1],'two');await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,after);await reset(after);assert.deepEqual(matrix(),expected);assert.ok(!table().node.textContent.includes('deditor:'));
  }
 });
 await test('T22 format pairs in empty cells remain in their source cell, including after clearing text',async()=>{
  for(const typed of ['text','**bold**','`literal`'])for(const cleared of [false,true]) {
   await reset(cleared?original:blank);await selectCell(2);
   if(cleared){const from=view.state.selection.from;await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,from+3))));await key('Backspace');}
   const before=content(),expected=matrix();await type(typed);expected[1][0]=typed.replaceAll('*','').replaceAll('`','');assert.deepEqual(matrix(),expected);const edited=content();await exactHistory(before);await reset(edited);assert.deepEqual(matrix(),expected);
  }
 });
 await test('T23 empty first middle last and metadata-bearing cells map format pairs to their own source slot',async()=>{
  const empty='Before unchanged\n\n|  |  |  |\n| --- | :---: | ---: |\n|  |  |  |\n\nAfter unchanged\n';
  for(const variant of ['plain','metadata','nested','crlf'])for(const index of [0,1,2,3,4,5]){
   let source=variant==='metadata'?empty.replace('|  |  |  |','| <!-- deditor:table-indent=2 --><!-- deditor:valign=middle --> |  |  |'):variant==='nested'?'- parent\n\n'+empty.split('\n').map(line=>'  '+line).join('\n'):variant==='crlf'?empty.replace(/\n/g,'\r\n'):empty;
   await reset(source);await selectCell(index);const expected=matrix(),attrs=table().node.toJSON().attrs;await type('**X**');expected[Math.floor(index/3)][index%3]='X';assert.deepEqual(matrix(),expected,`${variant}/${index}`);assert.deepEqual(table().node.attrs,attrs);const edited=content();await exactHistory(source);await reset(edited);assert.deepEqual(matrix(),expected);assert.equal((content().match(/deditor:table-indent/g)||[]).length,variant==='metadata'?1:0);assert.ok(!table().node.textContent.includes('deditor:'));
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} deep table keyboard checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
