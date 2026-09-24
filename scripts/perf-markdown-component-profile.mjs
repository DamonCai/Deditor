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
const output=path.resolve('node_modules/.cache/deditor-markdown-component-profile.mjs');
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
const profile={};
const record=(name,elapsed,count=1)=>{const item=profile[name]??={ms:0,calls:0};item.ms+=elapsed;item.calls+=count;};
globalThis.mdProfile=record;
const createElement=document.createElement.bind(document);
document.createElement=(name,...args)=>{if(name.toLowerCase()==='table')record('DOM.tableElements',0);return createElement(name,...args);};
const OriginalObserver=dom.window.MutationObserver;
Object.defineProperty(globalThis,'MutationObserver',{configurable:true,value:class extends OriginalObserver {constructor(fn){const label=new Error().stack.split('\n').find(line=>line.includes('deditor-markdown-component-profile'))?.trim()??'observer';super((...args)=>{const begin=performance.now();try{fn(...args);}finally{record(label,performance.now()-begin);record('mutation records',0,args[0].length);}});}}});
const {EditorView}=await import('@milkdown/kit/prose/view');
const {EditorState}=await import('@milkdown/kit/prose/state');
for(const [prototype,names] of [[EditorView.prototype,['updateState']],[EditorState.prototype,['applyTransaction']]]) for(const name of names){const original=prototype[name];prototype[name]=function(...args){const begin=performance.now();try{return original.apply(this,args);}finally{record(name,performance.now()-begin);}};}
await build({stdin:{contents:`
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {MarkdownDocument} from './src/lib/markdownVisual/document';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onLoad({filter:/\.(?:ts|tsx)$/},async a=>{
  if (!a.path.startsWith(path.resolve('src')+path.sep)) return;
  const relative=path.relative(process.cwd(),a.path);
  const owned=['src/lib/markdownFragments.ts','src/lib/markdownVisual/rawView.ts','src/lib/markdown.ts','src/lib/markdownVisual/document.ts','src/lib/markdownVisual/initialNodeViews.ts'].includes(relative);
  const baseline=process.env.DEDITOR_MARKDOWN_BASELINE ?? process.env.DEDITOR_RAW_BASELINE;
  const base=owned ? baseline ?? process.env.DEDITOR_MARKDOWN_TARGET : process.env.DEDITOR_PROFILE_BASE;
  const frozen=base ? path.join(base,relative) : null;
  const component=relative==='src/components/MarkdownVisualEditor.tsx' && !baseline ? process.env.DEDITOR_PROFILE_COMPONENT : undefined;
  const readingBase=process.env.DEDITOR_READING_BASELINE ? path.join(process.env.DEDITOR_READING_BASELINE,relative) : null;
  const file=readingBase && fs.existsSync(readingBase) ? readingBase : component ?? (frozen && fs.existsSync(frozen) ? frozen : a.path);
  let contents=await fs.promises.readFile(file,'utf8');
  if(relative==='src/components/MarkdownVisualEditor.tsx' && process.env.DEDITOR_PROFILE_BASE && !baseline && !component) contents=contents.replace('deditor_raw: rawView(filePath, tabId),','deditor_raw: rawView(filePath, tabId, () => document.sourceContext()),');
  contents=contents.replace('const result = create(node, view, getPos, decorations, innerDecorations);','const start=performance.now(); const result = create(node, view, getPos, decorations, innerDecorations); (globalThis as any).mdProfile("table NodeView create",performance.now()-start);');
  contents=contents.replace('const indexed = documentContext?.();','const indexed = documentContext?.(); (globalThis as any).mdProfile(indexed?.source === source ? "raw.indexedReuse" : "raw.indexedMiss",0);');
  contents=contents.replace('const tree = sourceTree(source);','const treeStart=performance.now(); const tree = sourceTree(source); (globalThis as any).mdProfile(' + JSON.stringify(relative.endsWith('/document.ts') ? 'model.editingTree' : relative.endsWith('/rawView.ts') ? 'raw.sourceTree' : 'math.sourceTree') + ',performance.now()-treeStart);');
  contents=contents.replaceAll('const tokens = md.parse(parsedSource, env);','const parseStart=performance.now(); const tokens = md.parse(parsedSource, env); (globalThis as any).mdProfile("markdown.parse",performance.now()-parseStart);');
  contents=contents.replace('template.innerHTML = html;', 'const domStart=performance.now(); template.innerHTML = html; (globalThis as any).mdProfile("raw.contextDOM",performance.now()-domStart);');
  return {contents,loader:a.path.endsWith('.tsx')?'tsx':'ts'};
 });
 b.onResolve({filter:/.*/},a=>a.path.endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});

const app=await import(pathToFileURL(output));
for(const name of ['apply','sourceOffset','index','reset','editInline']){const original=app.MarkdownDocument.prototype[name];app.MarkdownDocument.prototype[name]=function(...args){const begin=performance.now();try{return original.apply(this,args);}finally{record('model.'+name,performance.now()-begin);}};}
const sections=Number(process.argv[2]||100);
const base=fs.readFileSync('tests/fixtures/markdown-complex.md','utf8');
const source=base.replace('## 文末验收', Array.from({length:sections},(_,i)=>`## 性能第 ${i+1} 节\n\n性能输入定位点 ${i+1}：中文正文与 **强调内容**，${'长文光标、原文和页面位置核对。'.repeat(12)}\n\n> 引用 **重点**\n>\n> - 嵌套项目\n\n| 名称 | 数量 |\n| --- | ---: |\n| **表格正文** | ${i+1} |\n`).join('\n')+'\n## 文末验收');
const store=app.useEditorStore;
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const root=createRoot(document.getElementById('root'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const content=()=>store.getState().tabs[0].content;
const take=()=>{const value=structuredClone(profile);for(const key of Object.keys(profile))delete profile[key];return value;};
const start=performance.now();
await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',theme:'light'}));});
for(let i=0;i<300&&!app.getVisualEditor();i++)await act(async()=>{await pause(20);});
assert.ok(app.getVisualEditor(),'ready');
const readyMs=performance.now()-start;
assert.equal(content(),source);
const init=take();
await act(async()=>{await pause(1000);});
const idle=take();
const operations=[];
for(let i=0;i<5;i++){
 await act(async()=>{app.getVisualEditor().navigate(1,3);});
 take();
 const outlineRows=[...document.querySelectorAll('.preview-toc-list > li')];
 const tocRows=[...document.querySelectorAll('.md-toc li')];
 const p=document.querySelector('.ProseMirror h1');
 const begin=performance.now();
 await act(async()=>{p.firstChild.textContent+='中';document.getSelection().collapse(p.firstChild,p.firstChild.textContent.length);p.dispatchEvent(new Event('input',{bubbles:true}));await pause(0);});
 const elapsed=performance.now()-begin;
 assert.equal(content(),source.replace(/^# (.+)$/m, '# $1中'),'input exact');
 const retainedOutlineRows=outlineRows.filter(row=>row.isConnected).length;
 if(!process.env.DEDITOR_READING_BASELINE && !process.env.DEDITOR_PROFILE_BASE) assert.ok(retainedOutlineRows>=outlineRows.length-1, "unchanged headings retain outline DOM after an earlier input");
 const retainedTocRows=tocRows.filter(row=>row.isConnected).length;
 if(!process.env.DEDITOR_READING_BASELINE && !process.env.DEDITOR_PROFILE_BASE) assert.ok(retainedTocRows>=tocRows.length-1,'unchanged body TOC rows retain DOM');
 operations.push({ms:elapsed,outlineRows:outlineRows.length,retainedOutlineRows,tocRows:tocRows.length,retainedTocRows,profile:take()});
 await act(async()=>app.markdownHistory());
 assert.equal(content(),source,'undo exact');
}
const bodyOperations=[];
for(let i=0;i<5;i++){
 await act(async()=>{app.getVisualEditor().navigate(9,2);});
 take();
 const paragraph=document.querySelector('.ProseMirror > p'),text=paragraph.firstChild;
 const original=text.textContent,begin=performance.now();
 await act(async()=>{text.textContent+='中';document.getSelection().collapse(text,text.textContent.length);paragraph.dispatchEvent(new Event('input',{bubbles:true}));await pause(0);});
 const elapsed=performance.now()-begin;
 assert.equal(content(),source.replace(original,original+'中'),'body input exact');
 bodyOperations.push({ms:elapsed,profile:take()});
 await act(async()=>app.markdownHistory());assert.equal(content(),source,'body undo exact');
}
const themeOperations=[];
for(const theme of ['dark','light','dark']) {
 const pm=document.querySelector('.ProseMirror'),tables=[...document.querySelectorAll('.milkdown-table-block')];take();
 const begin=performance.now();
 await act(async()=>{document.documentElement.classList.toggle('dark',theme==='dark');root.render(React.createElement(app.Visual,{tabId:'a',theme}));await pause(0);});
 for(let i=0;i<300&&!app.getVisualEditor();i++)await act(async()=>pause(10));
 assert.ok(app.getVisualEditor());assert.equal(content(),source,'theme retains exact source');
 const retainedTables=tables.filter(table=>table.isConnected).length;
 if(!process.env.DEDITOR_READING_BASELINE && !process.env.DEDITOR_PROFILE_BASE) {assert.equal(document.querySelector('.ProseMirror'),pm);assert.equal(retainedTables,tables.length);}
 themeOperations.push({theme,ms:performance.now()-begin,retainedTables,profile:take()});
}
console.log(JSON.stringify({sections,chars:source.length,bytes:Buffer.byteLength(source),readyMs,domNodes:document.querySelectorAll('*').length,tables:document.querySelectorAll('.milkdown-table-block').length,init,idle,operations,bodyOperations,themeOperations},null,2));
await act(async()=>root.unmount());
assert.equal(runtimeErrors.length,0);
dom.window.close();
