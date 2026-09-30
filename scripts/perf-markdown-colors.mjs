import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
assert.equal(typeof globalThis.gc,'function','Run with --expose-gc to measure retained history memory');
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
const output=path.resolve('node_modules/.cache/deditor-colors-performance.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
// All persistence stays in memory; benchmarks never touch user documents or preferences.
let persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state')persistedState=args.content;
};
const stubs={
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
export {setBlockBackground} from './src/lib/editorBridge';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
// Real component/transaction costs in JSDOM; excludes native layout and IME.
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const {CellSelection}=await import('@milkdown/kit/prose/tables');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const source=()=>store.getState().tabs[0].content;
const quantiles=values=>{const sorted=[...values].sort((a,b)=>a-b);return {medianMs:+sorted[Math.floor(sorted.length/2)].toFixed(2),p95Ms:+sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))].toFixed(2),runs:values.length};};
const timed=async action=>{const start=performance.now();await act(async()=>{await action();});return performance.now()-start;};
const results=[];
for(const kind of ['plain-paragraphs','shaded-paragraphs','shaded-table']){
 const marker='<span data-deditor-background="#FFF2CC"></span>';
 const original=kind==='shaded-table'?'| '+Array.from({length:20},(_,i)=>`column ${i}`).join(' | ')+' |\n| '+Array(20).fill('---').join(' | ')+' |\n'+Array.from({length:50},(_,r)=>'| '+Array.from({length:20},(_,c)=>(c%4===0?marker:'')+`cell ${r}-${c}`).join(' | ')+' |').join('\n')+'\n'
 :Array.from({length:1000},(_,i)=>(kind==='shaded-paragraphs'&&i%4===0?marker:'')+`Generated paragraph ${i}: `+'自建长文内容与连续输入核对。'.repeat(18)).join('\n\n')+'\n';
 await act(async()=>{root.render(null);store.setState({tabs:[{id:'perf-colors',filePath:'/generated/colors-perf.md',content:original,savedContent:original}],activeId:'perf-colors',language:'en',markdownMode:'visual',autoSave:'off'});});
 const start=performance.now();
 await act(async()=>root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'perf-colors',theme:'light'}))));
 for(let i=0;i<500&&!app.getVisualEditor();i++)await act(async()=>pause(20));
 assert.ok(app.getVisualEditor(),'component ready');assert.equal(source(),original);
 const readyMs=performance.now()-start;
 const paragraphs=[];view.state.doc.descendants((n,p)=>{if(n.type.name==='paragraph')paragraphs.push({pos:p+1,text:n.textContent});});
 const target=paragraphs[Math.floor(paragraphs.length/2)];
 const select=async()=>act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,target.pos+3))));
 const inputTimes=[],backgroundTimes=[],foregroundTimes=[],highlightTimes=[];
 for(let i=0;i<25;i++){
  await select();const before=source();
  const elapsed=await timed(()=>view.dispatch(view.state.tr.insertText('x')));if(i>=5)inputTimes.push(elapsed);
  assert.equal(view.state.doc.textBetween(target.pos,target.pos+target.text.length+1),target.text.slice(0,3)+'x'+target.text.slice(3));
  await act(async()=>app.markdownHistory());assert.equal(source(),before,'single input undo');
 }
 for(let i=0;i<15;i++){
  await select();const before=source();
  const elapsed=await timed(()=>app.setBlockBackground('#D9E2F3'));if(i>=3)backgroundTimes.push(elapsed);
  assert.notEqual(source(),before);await act(async()=>app.markdownHistory());assert.equal(source(),before,'single shade undo');
  for(const [property,samples] of [['color',foregroundTimes],['background',highlightTimes]]){
   await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,target.pos,target.pos+3))));
   const ms=await timed(()=>app.getVisualEditor().color(property,'#C00000'));if(i>=3)samples.push(ms);
   assert.notEqual(source(),before);await act(async()=>app.markdownHistory());assert.equal(source(),before,'inline color undo');
  }
 }
 globalThis.gc();const heapBefore=process.memoryUsage().heapUsed;
 const continuous=[];
 for(let i=0;i<60;i++){
  await select();continuous.push(await timed(()=>app.setBlockBackground(i%2?'#FFF2CC':'#D9E2F3')));
 }
 globalThis.gc();const historyHeapMiB=(process.memoryUsage().heapUsed-heapBefore)/1024/1024;
 for(let i=0;i<60;i++)await act(async()=>app.markdownHistory());assert.equal(source(),original,'all color history restores source');
 let bulkMs;
 if(kind==='shaded-table'){
  const cells=[];view.state.doc.descendants((n,p)=>{if(n.type.name==='table_cell'||n.type.name==='table_header')cells.push(p);});
  await act(async()=>view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,cells[0],cells.at(-1)))));
  bulkMs=await timed(()=>app.setBlockBackground('#D9E2F3'));
  assert.equal((source().match(/data-deditor-background/g)||[]).length,cells.length);
  await act(async()=>app.markdownHistory());assert.equal(source(),original,'bulk shade undo');
 }
 const result={kind,chars:original.length,bytes:Buffer.byteLength(original),readyMs:+readyMs.toFixed(2),input:quantiles(inputTimes),textColor:quantiles(foregroundTimes),highlight:quantiles(highlightTimes),background:quantiles(backgroundTimes),continuousFirst:quantiles(continuous.slice(0,20)),continuousLast:quantiles(continuous.slice(-20)),historyHeapMiB:+historyHeapMiB.toFixed(2),bulkMs:bulkMs===undefined?undefined:+bulkMs.toFixed(2)};
 // Gross-regression guards, not a claim of a one-frame native interaction.
 for(const key of ['input','textColor','highlight','background'])assert.ok(result[key].p95Ms<2000,`${kind} ${key} exceeds 2s`);
 assert.ok(result.continuousLast.medianMs<Math.max(100,result.continuousFirst.medianMs*2),`${kind} repeated colors degrade`);
 assert.ok(historyHeapMiB<(kind==='shaded-table'?128:32),`${kind} 60-step retained history exceeds memory budget`);
 if(bulkMs!==undefined)assert.ok(bulkMs<10000,'1020-cell shading exceeds 10s');
 results.push(result);console.log(JSON.stringify(result));
}
await act(async()=>root.unmount());assert.deepEqual(runtimeErrors,[]);dom.window.close();
console.log(JSON.stringify({results},null,2));
