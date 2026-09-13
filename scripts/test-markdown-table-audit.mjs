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
const output=path.resolve('node_modules/.cache/deditor-markdown-table-audit.mjs');
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
export {deleteTableRows} from './src/lib/markdownVisual/tableMenu';
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
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view, editorContext;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);editorContext=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original,steps=1)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory());assert.equal(content(),original);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

const {commandsCtx}=await import('@milkdown/kit/core');
const gfm=await import('@milkdown/kit/preset/gfm');
const {CellSelection,TableMap}=await import('@milkdown/kit/prose/tables');
const original='Before unchanged\n\n| A | B |\n| :--- | ---: |\n| one | two |\n| three | four |\n\nAfter unchanged\n';
const table=()=>{let result;view.state.doc.descendants((n,p)=>{if(n.type.name==='table')result={node:n,pos:p};});return result;};
const matrix=()=>{const rows=[];table().node.forEach(row=>{const cells=[];row.forEach(cell=>cells.push(cell.textBetween(0,cell.content.size,"\n\n","\n")));rows.push(cells);});return rows;};
const paste=async(text,html='')=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:kind=>kind==='text/plain'?text:kind==='text/html'?html:''}});await act(async()=>{view.focus();view.dom.dispatchEvent(event);await pause(30);});};
const command=async(name,payload)=>{await act(async()=>{editorContext.get(commandsCtx).call(gfm[name].key,payload);await pause(20);});};
const roundtrip=async(before,expected=matrix(),steps=1)=>{const edited=content();await exactHistory(before,steps);assert.deepEqual(matrix(),expected);assert.equal(content(),edited);assert.ok(edited.startsWith('Before unchanged\n\n'));assert.ok(edited.endsWith('\n\nAfter unchanged\n'));};
try {
 await test('F00 selection updates keep the table DOM stable',async()=>{
  const text='Before unchanged\n\n| A | B | C |\n| --- | --- | --- |\n'+Array.from({length:100},(_,i)=>`| row${i} | value${i} | end${i} |`).join('\n')+'\n\nAfter unchanged\n';
  const rounds=[];
  for(let round=0;round<3;round++){
   await reset(text);const positions=[];view.state.doc.descendants((n,p)=>{if(n.isTextblock&&n.textContent.startsWith('row'))positions.push(p+1);});
   let rebuilds=0;const start=performance.now();
   await act(async()=>{for(const pos of positions.slice(0,30)){const before=view.dom.querySelector('.milkdown-table-block');view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,pos)));if(before!==view.dom.querySelector('.milkdown-table-block'))rebuilds++;}});
   rounds.push({ms:Math.round((performance.now()-start)*100)/100,rebuilds});assert.equal(content(),text);
  }
  console.log('TABLE_SELECTION_BENCH '+JSON.stringify(rounds));
  if(!process.env.DEDITOR_BASELINE)assert.ok(rounds.every(r=>r.rebuilds===0));
 });
 await test('F00b right-click row deletion preserves history, focus and untouched rows',async()=>{
  await reset(original);await select('one');
  const cell=view.dom.querySelector('tbody tr:nth-child(2) td');
  await act(async()=>cell.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:20})));
  const menu=document.querySelector('.md-table-menu');assert.ok(menu);assert.equal(menu.querySelectorAll('button')[1].textContent,'Delete row');
  await act(async()=>menu.querySelectorAll('button')[1].click());assert.equal(document.querySelector('.md-table-menu'),null);
  assert.deepEqual(matrix(),[['A','B'],['three','four']]);assert.equal(view.state.selection.$head.parent.textContent,'three');
  await roundtrip(original);
 });
 await test('F00c deleting header promotes next row, preserving marks and alignment',async()=>{
  await reset(original);await select('A');await act(async()=>app.deleteTableRows(view));
  assert.deepEqual(matrix(),[['one','two'],['three','four']]);assert.equal(table().node.firstChild.type.name,'table_header_row');
  assert.equal(table().node.firstChild.firstChild.type.name,'table_header');await roundtrip(original);
 });
 await test('F00d delete multiple rows and last remaining header with exact undo',async()=>{
  await reset(original);const {node,pos}=table(),map=TableMap.get(node);
  await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.rowSelection(view.state.doc.resolve(pos+1+map.map[2]),view.state.doc.resolve(pos+1+map.map[4])))));
  await act(async()=>app.deleteTableRows(view));assert.deepEqual(matrix(),[['A','B']]);await roundtrip(original);
  const headerOnly='Before unchanged\n\n| A | B |\n| --- | --- |\n\nAfter unchanged\n';
  await reset(headerOnly);await select('A');await act(async()=>app.deleteTableRows(view));assert.equal(table(),undefined);await exactHistory(headerOnly);
 });
 await test('F00e keyboard row menu selects complete row and Escape restores focus',async()=>{
  await reset(original);await select('one');await key('F10',{shiftKey:true});
  let menu=document.querySelector('.md-table-menu');assert.ok(menu);await act(async()=>menu.querySelector('button').click());
  assert.ok(view.state.selection instanceof CellSelection);assert.ok(view.state.selection.isRowSelection());assert.equal(content(),original);
  await select('two');await key('F10',{shiftKey:true});menu=document.querySelector('.md-table-menu');
  await act(async()=>menu.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  assert.equal(document.querySelector('.md-table-menu'),null);assert.equal(view.hasFocus(),true);
 });
 await test('F00f cell mouse down never schedules a paragraph selection',async()=>{
  await reset(original);await select('one');const at=view.state.selection.head;const cell=view.dom.querySelector('tbody tr:nth-child(3) td');
  const nodeView=view.props.nodeViews.table(table().node,view,()=>table().pos,[],{find:()=>[]});
  const target=nodeView.contentDOM.appendChild(document.createElement('td'));
  const event=new dom.window.MouseEvent('mousedown',{bubbles:true});Object.defineProperty(event,'target',{value:target});
  assert.equal(nodeView.stopEvent(event),false);await pause(40);assert.equal(view.state.selection.head,at);nodeView.destroy();
 });
 await test('F01 cell edit/delete/format retains surrounding source and exact history',async()=>{
  await reset(original);await select('one',1);await act(async()=>view.dispatch(view.state.tr.insertText('X')));assert.equal(matrix()[1][0],'oXne');await roundtrip(original);
  await reset(original);await select('one',1);await act(async()=>view.dispatch(view.state.tr.delete(view.state.selection.from,view.state.selection.from+1)));assert.equal(matrix()[1][0],'oe');await roundtrip(original);
  await reset(original);await select('one',0);await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.from,view.state.selection.from+3))));await act(async()=>app.getVisualEditor().wrap('**'));assert.match(content(),/\*\*one\*\*/);await roundtrip(original);
 });
 await test('F02 Tab and reverse Tab traverse cells; last cell creates exactly one row',async()=>{
  await reset(original);await select('one');await key('Tab');assert.equal(view.state.selection.$head.parent.textContent,'two');await key('Tab',{shiftKey:true});assert.equal(view.state.selection.$head.parent.textContent,'one');
  await select('four');await key('Tab');assert.equal(table().node.childCount,4);assert.equal(view.state.selection.$head.parent.textContent,'');await roundtrip(original);
 });
 await test('F02 Enter exits table; Shift Enter makes a durable in-cell line break',async()=>{
  await reset(original);await select('one',1);await key('Enter');assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(view.state.selection.$head.depth,1);await roundtrip(original);
  await reset(original);await select('one',1);await key('Enter',{shiftKey:true});assert.equal(table().node.child(1).child(0).firstChild.childCount,3);assert.match(content(),/o<br>ne/);await roundtrip(original);
 });

 await test('F02 repeated softbreaks and lists inside cells preserve content across remount',async()=>{
  await reset(original);await select('one');await key('Enter',{shiftKey:true});await key('Enter',{shiftKey:true});await act(async()=>view.dispatch(view.state.tr.insertText('tail')));assert.match(content(),/one<br><br>tail/);await roundtrip(original,matrix(),3);
  const listed=original.replace('| one | two |','| - alpha<br>- beta | two |');await reset(listed);await select('alpha',2);await key('Enter',{shiftKey:true});assert.match(content(),/al<br>  pha/);await roundtrip(listed);
 });

 await test('F01 cell-list source navigation edits the intended item with reference definitions around the table',async()=>{
  const prefix='[first]: https://example.com/first\n\nBefore unchanged\n\n';
  const tableSource='| A | B |\n| --- | --- |\n| - alpha<br>- beta | two |\n| three | - gamma<br>- delta |\n';
  const suffix='\nAfter unchanged\n\n[last]: https://example.com/last\n';
  const source=prefix+tableSource+suffix;
  for(const word of ['alpha','beta','gamma','delta']){
   await reset(source);const offset=source.indexOf(word)+2;const preceding=source.slice(0,offset);const line=preceding.split('\n').length,col=preceding.length-preceding.lastIndexOf('\n');
   await act(async()=>{app.getVisualEditor().navigate(line,col);await pause(20);});assert.equal(view.state.selection.$head.parent.textContent,word,word+' maps into its list item');
   await act(async()=>view.dispatch(view.state.tr.insertText('X')));assert.ok(content().includes(word.slice(0,2)+'X'+word.slice(2)),word+' receives text');assert.ok(content().startsWith(prefix));assert.ok(content().endsWith(suffix));await exactHistory(source);
  }
 });

 await test('F01 source mapping after softbreak within a table list retains the continuation caret',async()=>{
  const source='Before unchanged\n\n| A | B |\n| --- | --- |\n| - al<br>  pha<br>- beta | two |\n\nAfter unchanged\n';
  await reset(source);const offset=source.indexOf('pha')+1;const before=source.slice(0,offset);await act(async()=>app.getVisualEditor().navigate(before.split('\n').length,before.length-before.lastIndexOf('\n')));await act(async()=>view.dispatch(view.state.tr.insertText('X')));assert.match(content(),/pXha/);await exactHistory(source);
 });
 await test('F04 row and column reordering commands preserve content and undo',async()=>{
  await reset(original);await command('selectRowCommand',{pos:table().pos+1,index:1});await command('moveRowCommand',{from:1,to:2,pos:table().pos+1});assert.deepEqual(matrix(),[['A','B'],['three','four'],['one','two']]);await roundtrip(original);
  await reset(original);await command('selectColCommand',{pos:table().pos+1,index:0});await command('moveColCommand',{from:0,to:1,pos:table().pos+1});assert.deepEqual(matrix(),[['B','A'],['two','one'],['four','three']]);await roundtrip(original);
 });
 await test('F03 add/remove rows and columns is undoable and preserves source',async()=>{
  for(const [name,rows,cols] of [['addRowBeforeCommand',4,2],['addRowAfterCommand',4,2],['addColBeforeCommand',3,3],['addColAfterCommand',3,3]]){
   await reset(original);await select('one');await command(name);assert.equal(table().node.childCount,rows);assert.equal(table().node.firstChild.childCount,cols);await roundtrip(original);
  }
  for(const [name,index,expected] of [['selectRowCommand',1,[['A','B'],['three','four']]],['selectColCommand',1,[['A'],['one'],['three']]]]){
   await reset(original);await command(name,{pos:table().pos+1,index});assert.ok(view.state.selection instanceof CellSelection);await command('deleteSelectedCellsCommand');assert.deepEqual(matrix(),expected);await roundtrip(original);
  }
 });
 await test('F03 left/center/right alignment applies to entire selected column',async()=>{
  const unaligned=original.replace('| :--- | ---: |','| --- | --- |');for(const alignment of ['left','center','right']){await reset(unaligned);await command('selectColCommand',{pos:table().pos+1,index:1});await command('setAlignCommand',alignment);table().node.forEach(row=>assert.equal(row.child(1).attrs.alignment,alignment));await roundtrip(unaligned);}
 });
 await test('F05 TSV extends table and preserves empty cells, Unicode, quoting, literal marks and pipes',async()=>{
  const cases=[['left\tright\nnext\tlast',[['left','right'],['next','last']]],['"a\tb"\t"c""d"\n中文\t😀',[['a\tb','c"d'],['中文','😀']]],[' first \t \n\t last ',[[' first ',' '],['',' last ']]],['**literal**\t| pipe\n`code`\t[link]',[['**literal**','| pipe'],['`code`','[link]']]],['a\tb\tc\nd\te\tf\ng\th\ti',[['a','b','c'],['d','e','f'],['g','h','i']]]];
  for(const [text,expected] of cases){await reset(original);await select('one',0);await paste(text);assert.deepEqual(matrix().slice(1),expected);await roundtrip(original);}
 });
 await test('F05 quoted newline survives save/reparse as an in-cell hardbreak',async()=>{
  await reset(original);await select('one',0);await paste('"line1\nline2"\tend');assert.match(content(),/line1<br>line2/);assert.equal(table().node.child(1).child(0).firstChild.child(1).type.name,'hardbreak');await roundtrip(original);
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} table operation checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
