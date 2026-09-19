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
 await test('UX batch insert 1/3/100 rows and columns, including before header, is one reversible edit',async()=>{
  for(const axis of ['row','column']) for(const before of [true,false]) for(const count of [1,3,100]) {
   await reset(original);await select('A');
   await act(async()=>app.insertTableItems(view,axis,before,count));
   const m=matrix();assert.equal(m.length,3+(axis==='row'?count:0));assert.equal(m[0].length,2+(axis==='column'?count:0));
   assert.ok(m.flat().includes('one'));assert.ok(m.flat().includes('A'));await roundtrip(original,m);
  }
  await reset(original);await select('one');
  for(const n of [0,-1,101,1.5,NaN])assert.equal(app.insertTableItems(view,'row',true,n),false);
  assert.equal(content(),original);
 });
 await test('UX alignment persists in visual and preview, including empty and formatted cells; single undo',async()=>{
  for(const value of ['middle','bottom']) {
   await reset(original);await select('one');
   await act(async()=>app.alignTableCells(view,'vertical',value));
   assert.equal(table().node.child(1).child(0).attrs.verticalAlignment,value);
   assert.match(content(),new RegExp('deditor:valign='+value));
   const formatted=await app.formatBuffer(content(), '/generated/a.md');assert.match(formatted,new RegExp('deditor:valign='+value));
   const html=await app.renderMarkdown(content(), { theme: "light" });assert.match(html,new RegExp('vertical-align:'+value));assert.ok(!html.includes('deditor:valign'));
   await roundtrip(original);assert.equal(table().node.child(1).child(0).attrs.verticalAlignment,value);
   await select('one');await act(async()=>app.alignTableCells(view,'vertical','top'));assert.ok(!content().includes('deditor:valign'));
  }
  const complex=original.replace('one','**bold**<br>line').replace('two','');
  await reset(complex);await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,table().pos+1+TableMap.get(table().node).map[2]))));await act(async()=>app.alignTableCells(view,'vertical','middle'));await roundtrip(complex);assert.equal(table().node.child(1).child(0).firstChild.firstChild.marks[0].type.name,'strong');
  await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,table().pos+1+TableMap.get(table().node).map[3]))));
  const before=content();await act(async()=>app.alignTableCells(view,'vertical','bottom'));await roundtrip(before);assert.equal(table().node.child(1).child(1).attrs.verticalAlignment,'bottom');
  await select('three');const beforeHorizontal=content();await act(async()=>app.alignTableCells(view,'horizontal','center'));await roundtrip(beforeHorizontal);table().node.forEach(row=>assert.equal(row.child(0).attrs.alignment,'center'));
 });
 await test('UX text selection from a paragraph across a table remains intact in both directions',async()=>{
  await reset(original);await select('After unchanged',0);const end=view.state.selection.from;
  await select('one',1);const start=view.state.selection.from;
  for(const [anchor,head] of [[end,start],[start,end]]) {
   await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,anchor,head))));
   assert.equal(view.state.selection.anchor,anchor);assert.equal(view.state.selection.head,head);
  }
  const before=content();await key('Backspace');await exactHistory(before);await act(async()=>app.markdownHistory());assert.deepEqual(matrix(),[['A','B'],['one','two'],['three','four']]);
 });
 await test('UX menu batch quantity validates input, alignment groups and language update',async()=>{
  for(const language of ['en','zh']) {
   store.setState({language});await reset(original);await select('one');await key('F10',{shiftKey:true});
   const menu=document.querySelector('.md-table-menu');assert.ok(menu);
   const input=menu.querySelector('input');assert.equal(input.min,'1');assert.equal(input.max,'100');
   input.value='101';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(menu.querySelectorAll('button:disabled').length,4);
   input.value='3';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(menu.querySelectorAll('button:disabled').length,0);
   assert.equal(menu.querySelectorAll('[role="group"]').length,2);
   const label=language==='en'?'Insert row below':'在下方插入行';await act(async()=>[...menu.querySelectorAll('button')].find(b=>b.textContent===label).click());assert.equal(matrix().length,6);await roundtrip(original);
  }store.setState({language:'en'});
 });
 await test('F06 typed fence before/after tables preserves every untouched byte through save, undo and reopen',async()=>{
  const prefix='* item\n* [link][guide] and <kbd>Key</kbd>\n* item with ` code`\n\nBefore unchanged\n\n';
  const tableSource='| Left | Right | Extra | **First**<br>**Second** | Last |\n| --- | --- | --- | --- | --- |\n| lower | cell | third | text | end |\n| a | b | c | d | e |';
  const suffix='\n\nAfter unchanged\n\n```typescript\nconst bottom = 1;\n```\n\n<custom>raw block</custom>\n\n[guide]: https://example.com\n';
  const {parserCtx}=await import('@milkdown/kit/core');
  for(const language of ['plantuml','mermaid','html','typescript']) for(const place of ['before','after']) {
   const source=prefix+tableSource+suffix;
   await reset(source);store.setState({formatOnSave:false});const expected=matrix();
   await select(place==='before'?'Before unchanged':'After unchanged');await key('Enter');
   const assertIntact=()=>{
    assert.ok(content().includes(tableSource),`${language}/${place}: exact table bytes after each key`);
    assert.ok(content().endsWith(suffix.slice(suffix.indexOf('\n\n```typescript'))),`${language}/${place}: exact following blocks and reference`);
    assert.deepEqual(matrix(),expected);
   };
   for(const ch of '```'+language) {
    await act(async()=>{const {from,to}=view.state.selection;const handled=view.someProp('handleTextInput',fn=>fn(view,from,to,ch));if(!handled)view.dispatch(view.state.tr.insertText(ch));await pause(5);});
    assertIntact();
   }
   const literal=content();await key('Enter');assertIntact();
   assert.ok(view.state.doc.content.content.some(n=>n.type.name==='code_block'&&n.attrs.language===language));
   const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);
   const parsed=editorContext.get(parserCtx)(writes.at(-1).content);
   assert.equal(parsed.content.content.filter(n=>n.type.name==='table').length,1,'saved source independently reparses as a table');
   await act(async()=>app.markdownHistory());assert.equal(content(),literal,'undo only fence conversion');assertIntact();
   await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);
   await reset(edited);assertIntact();
   await select('lower');await act(async()=>view.dispatch(view.state.tr.insertText('Z')));assert.ok(content().includes('lowerZ'));
   await exactHistory(edited);await act(async()=>app.markdownHistory());assertIntact();
  }
 });
 await test('F06 fence typing with CRLF, footnotes, cell Enter and formatted saves preserves table structure',async()=>{
  for(const place of ['before','cell']) for(const formatOnSave of [false,true]) {
   const source=(original+'\nReference[^note] and [link][guide]\n\n[^note]: Footnote text.\n\n[guide]: https://example.com\n').replace(/\n/g,'\r\n');
   await reset(source);store.setState({formatOnSave});const expected=matrix();
   await select(place==='before'?'Before unchanged':'one');await key('Enter');
   for(const ch of '```plantuml') {
    await act(async()=>{const {from,to}=view.state.selection;const handled=view.someProp('handleTextInput',fn=>fn(view,from,to,ch));if(!handled)view.dispatch(view.state.tr.insertText(ch));await pause(5);});
    assert.ok(content().endsWith('[guide]: https://example.com\r\n'),'reference remains intact after each key');
    assert.ok(content().includes('[^note]: Footnote text.'));
    assert.equal(table().node.childCount,3);assert.deepEqual(matrix().map(row=>row[1]),expected.map(row=>row[1]));
   }
   await key('Enter');const beforeSave=content(), finalMatrix=matrix();
   await act(async()=>app.saveFile());const saved=writes.at(-1).content;
   if(!formatOnSave)assert.equal(saved,beforeSave);
   await reset(saved);assert.deepEqual(matrix(),finalMatrix);assert.ok(content().includes('[guide]: https://example.com'));
  }
  store.setState({formatOnSave:false});
 });
 const columnSource='Before unchanged\n\n| A | B | C |\n| :--- | :---: | ---: |\n| **甲** | 中间 | `代码` |\n| 一 | 二 | 三 |\n\nAfter unchanged\n';
 const openColumnMenu=async(cell)=>{await act(async()=>cell.dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:20})));const menu=document.querySelector('.md-table-menu');assert.ok(menu);return menu;};
 const deleteFromMenu=async(menu)=>{const button=[...menu.querySelectorAll('button')].find(b=>b.textContent==='Delete column');assert.ok(button);await act(async()=>button.click());assert.equal(document.querySelector('.md-table-menu'),null);assert.ok(view.hasFocus());};
 await test('F00col1 right-click deletes first, middle or last column, retaining marks and alignment',async()=>{
  for(const col of [0,1,2]){
   await reset(columnSource);const before=matrix(),attrs=Array.from({length:3},(_,i)=>table().node.firstChild.child(i).attrs.alignment);
   // The right-click destination, rather than the old caret, determines the column.
   await select('一');await deleteFromMenu(await openColumnMenu(view.dom.querySelectorAll('tr')[1].children[col]));
   assert.deepEqual(matrix(),before.map(row=>row.filter((_,i)=>i!==col)));
   table().node.forEach(row=>assert.deepEqual(Array.from({length:row.childCount},(_,i)=>row.child(i).attrs.alignment),attrs.filter((_,i)=>i!==col)));
   if(col!==0)assert.match(content(),/\*\*甲\*\*/);if(col!==2)assert.match(content(),/`代码`/);
   view.state.doc.check();await roundtrip(columnSource);
  }
 });
 await test('F00col2 multi-column selection via keyboard menu deletes once and supports exact undo',async()=>{
  await reset(columnSource);const {node,pos}=table(),map=TableMap.get(node);
  await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.colSelection(view.state.doc.resolve(pos+1+map.map[2]),view.state.doc.resolve(pos+1+map.map[1])))));
  await key('F10',{shiftKey:true});await deleteFromMenu(document.querySelector('.md-table-menu'));
  assert.deepEqual(matrix(),[['A'],['甲'],['一']]);await roundtrip(columnSource);
 });
 await test('F00col3 last column, header-only and all columns remove table; readonly and outside are inert',async()=>{
  for(const sample of ['Before unchanged\n\n| 唯一 |\n| --- |\n| 内容 |\n\nAfter unchanged\n','Before unchanged\n\n| 唯一 |\n| --- |\n\nAfter unchanged\n']){
   await reset(sample);await deleteFromMenu(await openColumnMenu(view.dom.querySelector('th')));assert.equal(table(),undefined);await exactHistory(sample);assert.ok(content().includes('Before unchanged'));assert.ok(content().includes('After unchanged'));
  }
  await reset(columnSource);const {node,pos}=table(),map=TableMap.get(node);
  await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.colSelection(view.state.doc.resolve(pos+1+map.map[0]),view.state.doc.resolve(pos+1+map.map[2])))));
  await deleteFromMenu(await openColumnMenu(view.dom.querySelector('th')));assert.equal(table(),undefined);await exactHistory(columnSource);
  await reset(columnSource);await select('中间');await render(true);await act(async()=>app.deleteTableColumns(view));assert.equal(content(),columnSource);
  await act(async()=>view.dom.querySelector('td').dispatchEvent(new dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));assert.equal(document.querySelector('.md-table-menu'),null);
  await reset(columnSource);await select('Before unchanged');await act(async()=>app.deleteTableColumns(view));assert.equal(content(),columnSource);
 });
 const menuAction=async(label)=>{await key('F10',{shiftKey:true});const menu=document.querySelector('.md-table-menu');const button=[...menu.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(button,label);await act(async()=>button.click());};
 await test('F07 menu selection, clearing and insertion preserve structure and independent history',async()=>{
  for(const label of ['Select column','Select table']){
   await reset(original);await select('one');await menuAction(label);assert.ok(view.state.selection instanceof CellSelection);
   assert.equal(content(),original);const expected=label==='Select table'?[['',''],['',''],['','']]:[['','B'],['','two'],['','four']];
   await menuAction('Clear cell contents');assert.deepEqual(matrix(),expected);await roundtrip(original);
  }
  for(const label of ['Insert row above','Insert row below','Insert column left','Insert column right']){
   await reset(original);await select('one');await menuAction(label);
   const expected=label==='Insert row above'?[['A','B'],['',''],['one','two'],['three','four']]:label==='Insert row below'?[['A','B'],['one','two'],['',''] ,['three','four']]:label==='Insert column left'?[['','A','B'],['','one','two'],['','three','four']]:[['A','','B'],['one','','two'],['three','','four']];
   assert.deepEqual(matrix(),expected);view.state.doc.check();await roundtrip(original);
  }
  await reset(original);await select('A');await menuAction('Insert row above');assert.deepEqual(matrix(),[['',''],['A','B'],['one','two'],['three','four']]);view.state.doc.check();await roundtrip(original);
  await reset(original);await select('one');await menuAction('Clear cell contents');assert.deepEqual(matrix(),[['A','B'],['','two'],['three','four']]);await roundtrip(original);
 });
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
  const menu=document.querySelector('.md-table-menu');assert.ok(menu);assert.equal([...menu.querySelectorAll('button')].find(b=>b.textContent==='Delete row').textContent,'Delete row');
  await act(async()=>[...menu.querySelectorAll('button')].find(b=>b.textContent==='Delete row').click());assert.equal(document.querySelector('.md-table-menu'),null);
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
 await test('F00g selected list column excludes adjacent blank cells in copy, delete and undo',async()=>{
  const text='Before unchanged\n\n| Work | Targets | Notes |\n| --- | --- | --- |\n| Left untouched | 1. 中文目标<br>2. **Second**<br>3. Last | Right untouched |\n|  | 1. Next<br>2. 😀 | Tail |\n\nAfter unchanged\n';
  for(const index of [0,1,2]){
   await reset(text);const loaded=content();await command('selectColCommand',{pos:table().pos+1,index});assert.equal(content(),loaded);
   const selection=view.state.selection;assert.ok(selection instanceof CellSelection);assert.ok(selection.isColSelection());
   const selected=[];selection.forEachCell((node,pos)=>selected.push({text:node.textContent,pos}));assert.equal(selected.length,3);
   const map=TableMap.get(table().node);assert.ok(selected.every(cell=>map.findCell(cell.pos-table().pos-1).left===index));
   const copied=selection.content();copied.content.forEach(row=>assert.equal(row.childCount,1));
   if(index===1){assert.ok(copied.content.textBetween(0,copied.content.size).includes('中文目标'));assert.ok(!copied.content.textBetween(0,copied.content.size).includes('untouched'));}
   await select('Left untouched',0);
   await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.from,view.state.selection.from+4))));
   assert.equal(view.dom.classList.contains('ProseMirror-hideselection'),false);assert.equal(view.state.selection.content().content.textBetween(0,view.state.selection.content().content.size),'Left');
   await command('selectColCommand',{pos:table().pos+1,index});
   const before=matrix(),expected=before.map(row=>row.filter((_,col)=>col!==index));
   await command('deleteSelectedCellsCommand');assert.deepEqual(matrix(),expected);await roundtrip(loaded);
  }
 });
 await test('F01 imported table formatting renders and keeps source/undo/caret mapping',async()=>{
  const source='Before unchanged\n\n| A | B |\n| --- | --- |\n| numbers | 1.\u00a0one<br>2.\u00a0two |\n| bullets | \\-\u00a0alpha<br>\\-\u00a0beta |\n| labels | * **情报运营：**为正文<br>    <br>* **项目(预计)：**继续正文 |\n\nAfter unchanged\n';
  for(const word of ['one','alpha','情报运营']){
   await reset(source);assert.equal(content(),source);
   assert.equal(view.dom.querySelectorAll('td li').length,6);
   assert.deepEqual([...view.dom.querySelectorAll('td strong')].map(n=>n.textContent),['情报运营：','项目(预计)：']);
   const offset=source.indexOf(word)+1,pre=source.slice(0,offset);await act(async()=>app.getVisualEditor().navigate(pre.split('\n').length,pre.length-pre.lastIndexOf('\n')));
   await act(async()=>view.dispatch(view.state.tr.insertText('X')));
   assert.ok(content().includes(word.slice(0,1)+'X'+word.slice(1)),word+' edits correct source position');
   assert.ok(content().startsWith('Before unchanged\n\n'));assert.ok(content().endsWith('\nAfter unchanged\n'));
   await exactHistory(source);
  }
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
 await test('F02 Enter stays in the cell; Mod Enter exits and Shift Enter still breaks inside',async()=>{
  await reset(original);await select('one',1);await key('Enter');assert.equal(view.state.selection.$head.depth,4);assert.match(content(),/o<br>ne/);assert.equal(matrix()[1][1],'two');await roundtrip(original);
  for(const modifier of [/Mac|iP(hone|[ao]d)/.test(navigator.platform)?'metaKey':'ctrlKey']) {await reset(original);await select('one',1);await key('Enter',{[modifier]:true});assert.equal(view.state.selection.$head.depth,1);await roundtrip(original);}
  await reset(original);await select('one',1);await key('Enter',{shiftKey:true});assert.equal(table().node.child(1).child(0).firstChild.childCount,3);assert.match(content(),/o<br>ne/);await roundtrip(original);
 });

 await test('F02 plain Enter handles headers, empty cells, edges, selections and repeated breaks',async()=>{
  for(const [text,offset] of [['A',0],['one',0],['one',3],['four',4]]) {
   await reset(original);await select(text,offset);const cell=view.state.selection.$head.before(3);await key('Enter');assert.equal(view.state.selection.$head.before(3),cell);await roundtrip(original);
  }
  const empty=original.replace('| one | two |','|  | two |');await reset(empty);const emptyCell=table().pos+1+table().node.firstChild.nodeSize+3;await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,emptyCell))));await key('Enter');assert.equal(matrix()[1][0],'\n');await roundtrip(empty);
  await reset(original);await select('one',1);await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.from,view.state.selection.from+1))));await key('Enter');assert.equal(matrix()[1][0],'o\ne');await roundtrip(original);
  await reset(original);await select('one');await key('Enter');await key('Enter');await act(async()=>view.dispatch(view.state.tr.insertText('中文😀')));assert.equal(matrix()[1][0],'one\n\n中文😀');await roundtrip(original,matrix(),3);
  const listed=original.replace('| one | two |','| - alpha<br>- beta | two |');await reset(listed);await select('alpha',2);const cell=view.state.selection.$head.before(3);await key('Enter');assert.equal(view.state.selection.$head.before(3),cell);assert.match(content(),/al<br>  pha/);await roundtrip(listed);
 });

 await test('F02 Enter on a cell selection starts editing without deleting cells; IME confirmation is ignored',async()=>{
  await reset(original);const {node,pos}=table(),map=TableMap.get(node);await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,pos+1+map.map[2],pos+1+map.map[3]))));await key('Enter');assert.ok(view.state.selection instanceof TextSelection);assert.equal(view.state.selection.$head.depth,4);assert.equal(content(),original);
  await select('one',1);await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));await key('Enter',{isComposing:true,keyCode:229});await act(async()=>{view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));await pause(30);});assert.equal(content(),original);assert.equal(view.state.selection.$head.depth,4);
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
 await test('F03 default added columns match toolbar tables without introducing explicit alignment',async()=>{
  const unaligned=original.replace('| :--- | ---: |','| --- | --- |');
  for(const [cell,name] of [['one','addColBeforeCommand'],['one','addColAfterCommand'],['two','addColAfterCommand']]) {
   await reset(unaligned);await select(cell);await command(name);
   table().node.forEach(row=>row.forEach(cell=>assert.equal(cell.attrs.alignment,null,'new cells keep default alignment')));
   const separator=content().split('\n').find(line=>/^\|[\s:|-]+\|$/.test(line));
   assert.ok(separator);assert.equal(separator.includes(':'),false,'default columns serialize without colon');
   await roundtrip(unaligned);
  }
 });
 await test('F03 adding a default column preserves explicit left, center and right columns across save and undo',async()=>{
  await reset(columnSource);await select('中间');await command('addColAfterCommand');
  const expected=['left','center',null,'right'];
  const check=()=>table().node.forEach(row=>assert.deepEqual(Array.from({length:row.childCount},(_,i)=>row.child(i).attrs.alignment),expected));
  check();await roundtrip(columnSource);check();
  for(const alignment of ['left','center','right']) {
   await command('selectColCommand',{pos:table().pos+1,index:2});await command('setAlignCommand',alignment);
   expected[2]=alignment;await act(async()=>app.saveFile());const saved=writes.at(-1).content;
   await reset(saved);check();
  }
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
