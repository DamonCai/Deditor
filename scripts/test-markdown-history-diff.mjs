import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body><button id="opener">History</button><div id="root"></div></body>', {url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','Node','HTMLElement','Element','MutationObserver','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.getComputedStyle=window.getComputedStyle.bind(window);
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.requestAnimationFrame=window.requestAnimationFrame.bind(window);
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const resizeObservers=new Set();
globalThis.ResizeObserver=class { constructor(callback){this.callback=callback;} observe(){resizeObservers.add(this.callback);} disconnect(){resizeObservers.delete(this.callback);} };
const scrolls=[];
HTMLElement.prototype.scrollTo=function(options){scrolls.push(options);this.scrollTop=options.top;};
const {createRoot}=await import('react-dom/client');
const output=path.resolve('node_modules/.cache/deditor-history-diff.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
let invoke=async()=>[];
globalThis.historyDiffInvoke=(...args)=>invoke(...args);
await build({stdin:{contents:`export {default as Diff} from './src/components/DiffView'; export {default as History} from './src/components/MarkdownHistoryDialog'; export {useEditorStore as store} from './src/store/editor'; export * from './src/lib/diff';`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolate-history',setup(b){b.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'ipc',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const invoke=(...a)=>globalThis.historyDiffInvoke(...a); export const convertFileSrc=p=>p;'}));}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const root=createRoot(document.getElementById('root'));
app.store.setState({language:'en',tabs:[],activeId:null});
let passed=0;
async function test(name,fn){await act(async()=>root.render(null));await fn();console.log(`PASS ${++passed} ${name}`);}
const spec=(a,b)=>({leftPath:'old.md',rightPath:'current.md',leftContent:a,rightContent:b});
const render=async(a,b,navigation=true)=>act(async()=>root.render(React.createElement(app.Diff,{spec:spec(a,b),navigation})));
const click=async(el)=>{assert.ok(el);assert.equal(el.disabled,false);await act(async()=>el.click());};
const button=label=>Array.from(document.querySelectorAll('button')).find(el=>el.textContent===label || el.getAttribute('aria-label')===label);
const base=Array.from({length:100},(_,i)=>`原文第 ${i+1} 行`).join('\n')+'\n';
const changed=base.replace('原文第 10 行','修改第 10 行').replace('原文第 50 行','修改第 50 行').replace('原文第 90 行','修改第 90 行');
try {
 await test('round 1: three differences, next/previous, overview selection, scoped scrolling',async()=>{
  await render(base,changed);assert.equal(document.querySelectorAll('.diff-overview-marker').length,3);assert.equal(button('Previous difference').disabled,true);
  await click(button('Next difference'));assert.match(document.querySelector('.diff-position').textContent,/2 \/ 3/);assert.equal(document.querySelector('.diff-row-active').dataset.diffRow,'49');
  await click(button('Next difference'));assert.equal(button('Next difference').disabled,true);await click(button('Previous difference'));assert.equal(document.querySelector('.diff-row-active').dataset.diffRow,'49');
  await click(document.querySelector('.diff-overview-marker'));assert.equal(document.querySelector('.diff-row-active').dataset.diffRow,'9');assert.ok(scrolls.length>=5);
 });
 await test('round 1: fold unchanged runs, preserve context and original line numbers, expand independently',async()=>{
  await render(base,changed);assert.equal(button('Collapse unchanged content').getAttribute('aria-pressed'),'true');assert.equal(document.querySelectorAll('.diff-fold').length,4);assert.equal(document.querySelectorAll('[data-diff-row]').length,9);
  assert.equal(document.querySelector('[data-diff-row="49"]').children[0].textContent,'50');const beforeExpand=scrolls.length;await click(document.querySelector('.diff-fold button'));assert.equal(scrolls.length,beforeExpand,'Expanding an unchanged range must not jump back to a different active hunk');assert.equal(document.querySelectorAll('.diff-fold').length,3);assert.equal(document.activeElement,document.querySelector('.diff-scroll'));
  await click(button('Next difference'));assert.equal(document.querySelector('.diff-row-active').dataset.diffRow,'49');await click(button('Collapse unchanged content'));assert.equal(document.querySelectorAll('[data-diff-row]').length,100);
 });
 await test('round 2: empty/identical, pure additions/deletions, Unicode and one-line change',async()=>{
  for(const [a,b,count] of [['','',0],[base,base,0],['','中文 👨‍👩‍👧‍👦\n',1],['删除\n','',1],['旧','新',1]]){
   await render(a,b);assert.equal(document.querySelectorAll('.diff-overview-marker').length,count);assert.equal(button('Previous difference').disabled,true);assert.equal(button('Next difference').disabled,true);
   assert.equal(button('Collapse unchanged content').disabled,!app.computeDiff(a,b).rows.some(row=>row.changeType==='eq'));if(!count)assert.match(document.querySelector('.diff-identical').textContent,/identical/);
  }
 });
 await test('round 2: identical documents start fully folded and can expand and collapse again',async()=>{
  await render(base,base);assert.equal(document.querySelectorAll('[data-diff-row]').length,0);assert.equal(document.querySelectorAll('.diff-fold').length,1);assert.match(document.querySelector('.diff-fold').textContent,/100/);
  await click(document.querySelector('.diff-fold button'));assert.equal(document.querySelectorAll('[data-diff-row]').length,100);await click(button('Collapse unchanged content'));await click(button('Collapse unchanged content'));assert.equal(document.querySelectorAll('[data-diff-row]').length,0);
 });
 await test('round 2: short equal gaps collapse while nearest context and both changes remain',async()=>{
  const a='old A\ncontext A\nhide me\ncontext B\nold B\n';const b=a.replace('old A','new A').replace('old B','new B');await render(a,b);
  assert.equal(document.querySelectorAll('.diff-fold').length,1);assert.match(document.querySelector('.diff-fold').textContent,/1 unchanged/);assert.equal(document.querySelector('[data-diff-row="2"]'),null);assert.equal(document.querySelectorAll('[data-diff-row]').length,4);
  await click(button('Next difference'));assert.equal(document.querySelector('.diff-row-active').dataset.diffRow,'4');await click(document.querySelector('.diff-fold button'));assert.equal(document.querySelectorAll('[data-diff-row]').length,5);
 });
 await test('round 2: 10,000 lines retain every difference and restore every original row',async()=>{
  const left=Array.from({length:10000},(_,i)=>`line ${i}`).join('\n');const right=left.replace('line 5000\n','新文字\n额外行\n');const {rows}=app.computeDiff(left,right);
  const display=app.diffDisplayRows(rows,true,new Set());const visible=display.filter(x=>x.kind==='line').map(x=>x.index);
  rows.forEach((row,index)=>{if(row.changeType!=='eq')assert.ok(visible.includes(index));});assert.ok(display.length<15);
  const expanded=new Set(display.filter(x=>x.kind==='fold').map(x=>x.start));assert.deepEqual(app.diffDisplayRows(rows,true,expanded).map(x=>x.index),rows.map((_,i)=>i));
 });
 await test('round 3: replace comparison and switch language without stale navigation',async()=>{
  await render(base,changed);await click(button('Next difference'));await click(button('Next difference'));await click(button('Collapse unchanged content'));await render('old\n','new\n');assert.match(document.querySelector('.diff-position').textContent,/1 \/ 1/);assert.equal(document.querySelectorAll('.diff-fold').length,0);
  await act(async()=>app.store.setState({language:'zh'}));assert.ok(button('上一处差异'));assert.ok(button('下一处差异'));assert.ok(button('折叠未变更内容'));await act(async()=>app.store.setState({language:'en'}));
 });
 await test('round 3: full view, version switch, draft isolation, closing restores focus',async()=>{
  app.store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:changed,savedContent:base}],activeId:'a'});
  invoke=async(command,args)=>command==='list_markdown_history'?[{id:'one',path:args.path ?? '/generated/other.md',timestamp:1000,draft:args.path===null,bytes:100},{id:'two',path:'/generated/a.md',timestamp:2000,draft:false,bytes:100}]:command==='read_markdown_history'?(args.id==='one'?base:changed):undefined;
  let closed=0;document.getElementById('opener').focus();await act(async()=>root.render(React.createElement(app.History,{tabId:'a',onClose:()=>closed++})));
  await click(button('Full view'));assert.ok(document.querySelector('.md-history-dialog--overview'));await click(document.querySelector('.md-history-list button'));await click(button('Compare with current content'));await click(button('Next difference'));
  const diffBeforeExit=document.querySelector('.diff-view');
  assert.equal(button('Collapse unchanged content').getAttribute('aria-pressed'),'true');
  await click(button('Comparison full view'));await act(async()=>new Promise(r=>setTimeout(r,30)));
  assert.ok(document.querySelector('.md-history-dialog--comparison-overview'));
  assert.equal(document.querySelector('.md-history-list').hidden,true);assert.equal(document.activeElement,button('Close'));
  assert.equal(document.querySelector('.diff-view'),diffBeforeExit);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await act(async()=>new Promise(r=>setTimeout(r,30)));
  assert.equal(closed,0);assert.ok(document.querySelector('.md-history-dialog--overview'));assert.equal(document.querySelector('.md-history-dialog--comparison-overview'),null);
  assert.equal(document.activeElement,button('Comparison full view'));assert.equal(document.querySelector('.md-history-list').hidden,false);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.equal(closed,0);assert.equal(document.querySelector('.md-history-dialog--overview'),null);assert.equal(document.querySelector('.diff-view'),diffBeforeExit);assert.match(document.querySelector('.diff-position').textContent,/2 \/ 3/);assert.equal(button('Collapse unchanged content').getAttribute('aria-pressed'),'true');assert.equal(document.querySelector('.md-history-list button').getAttribute('aria-pressed'),'true');
  await click(button('Comparison full view'));await click(button('Close'));assert.equal(closed,0);assert.equal(document.querySelector('.md-history-dialog--overview'),null);assert.equal(document.querySelector('.diff-view'),diffBeforeExit);
  await click(button('Full view'));await click(button('Close'));assert.equal(closed,0);assert.equal(document.querySelector('.md-history-dialog--overview'),null);assert.equal(document.querySelector('.diff-view'),diffBeforeExit);
  await click(button('Full view'));
  await click(document.querySelectorAll('.md-history-list button')[1]);assert.match(document.querySelector('.diff-position').textContent,/0 \/ 0/);assert.equal(document.querySelectorAll('[data-diff-row]').length,0);assert.equal(button('Collapse unchanged content').getAttribute('aria-pressed'),'true');await click(button('Recover drafts'));assert.equal(button('Open as new document').disabled,true);await click(document.querySelector('.md-history-list button'));assert.match(document.querySelector('.diff-position').textContent,/1 \/ 3/);assert.equal(button('Restore in editor (undoable)').disabled,true);
  assert.equal(app.store.getState().tabs[0].content,changed);await click(button('Exit full view'));assert.equal(document.querySelector('.md-history-dialog--overview'),null);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(closed,1);await act(async()=>root.render(null));assert.equal(document.activeElement.id,'opener');
 });
 await test('round 3: full view and window resize re-center the selected difference after wrapping',async()=>{
  await render(base,changed);await click(button('Next difference'));const before=scrolls.length;
  for(const callback of resizeObservers)callback();assert.ok(scrolls.length>before);assert.equal(document.querySelector('.diff-row-active').dataset.diffRow,'49');
  await act(async()=>root.render(null));assert.equal(resizeObservers.size,0);
 });
 await test('round 4: late and failed reads clear old comparison and recover with another version',async()=>{
  let release;
  invoke=async(command,args)=>command==='list_markdown_history'?[{id:'slow',path:'/generated/a.md',timestamp:1},{id:'fail',path:'/generated/a.md',timestamp:2},{id:'ok',path:'/generated/a.md',timestamp:3}]:command==='read_markdown_history'?(args.id==='slow'?new Promise(r=>release=r):args.id==='fail'?Promise.reject(Error('Generated read failure')):base):undefined;
  await act(async()=>root.render(React.createElement(app.History,{tabId:'a',onClose:()=>{}})));await click(document.querySelectorAll('.md-history-list button')[0]);await click(document.querySelectorAll('.md-history-list button')[1]);assert.match(document.querySelector('[role=alert]').textContent,/Generated read failure/);assert.equal(button('Compare with current content').disabled,true);
  await click(document.querySelectorAll('.md-history-list button')[2]);await act(async()=>release('STALE'));assert.equal(document.querySelector('textarea').value,base);await click(button('Compare with current content'));assert.equal(document.querySelectorAll('.diff-overview-marker').length,3);
 });
 await test('round 5: ordinary file comparison keeps its existing controls and full rows',async()=>{
  await render(base,changed,false);assert.equal(document.querySelector('.diff-navigation'),null);assert.equal(document.querySelector('.diff-overview'),null);assert.equal(document.querySelectorAll('[data-diff-row]').length,100);
 });
 console.log(`${passed} history diff groups passed`);
}finally{await act(async()=>root.unmount());window.close();}
