import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const dom = new JSDOM('<!doctype html><body><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','HTMLButtonElement','Node','NodeFilter','Element','MutationObserver','DOMRect','DOMParser','localStorage']) globalThis[key] = dom.window[key];
for (const key of ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) globalThis[key] = dom.window[key].bind(dom.window);
window.matchMedia = () => ({ matches:false, addEventListener(){}, removeEventListener(){} });
window.ResizeObserver = globalThis.ResizeObserver = class { observe(){} disconnect(){} unobserve(){} };
HTMLElement.prototype.scrollTo = function({top=0}) { this.scrollTop=top; };
HTMLElement.prototype.scrollIntoView = function(){};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const { createRoot }=await import('react-dom/client');
const measureOnly=process.argv.includes('--measure-only');
const baselinePath=process.env.PREVIEW_BASELINE;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'deditor-preview-visibility-'));
fs.symlinkSync(path.resolve('node_modules'),path.join(dir,'node_modules'),'dir');
const stubs={
 '../preview.css?raw':`export default ${JSON.stringify(fs.readFileSync('src/preview.css','utf8'))}`,
 '@tauri-apps/api/core':'export const invoke=async()=>null; export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>null; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const revealItemInDir=async()=>{}; export const openUrl=async()=>{}; export const openPath=async()=>{};',
 './markdownExport/mathCss':'export const katexExportCss=()=>"";',
 './logger':'export const logError=()=>{};export const logWarn=()=>{};export const logInfo=()=>{};export const logDebug=()=>{};',
 '../lib/logger':'export const logError=()=>{};export const logWarn=()=>{};export const logInfo=()=>{};export const logDebug=()=>{};',
};
try {
 await build({stdin:{contents:"export {default as Preview} from './src/components/Preview'; export {useEditorStore} from './src/store/editor';",resolveDir:process.cwd()},outfile:path.join(dir,'app.mjs'),bundle:true,packages:'external',format:'esm',platform:'node',loader:{'.css':'empty'},logLevel:'silent',plugins:[{name:'preview-boundaries',setup(b){
  if(baselinePath)b.onLoad({filter:/components\/Preview\.tsx$/},()=>({loader:'tsx',contents:fs.readFileSync(baselinePath,'utf8'),resolveDir:path.resolve('src/components')}));
  b.onResolve({filter:/.*/},a=>{
   if(a.importer.endsWith('/Preview.tsx')&&a.path==='../lib/markdown')return {path:'renderer',namespace:'stub'};
   if(a.importer.endsWith('/Preview.tsx')&&a.path==='../lib/markdownDisplay')return {path:'display',namespace:'stub'};
   if(a.path.endsWith('.css'))return {path:'empty',namespace:'stub'};
   if(stubs[a.path])return {path:a.path,namespace:'stub'};
  });
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'js',contents:a.path==='renderer'?'export const renderMarkdown=(s,o)=>globalThis.__render(s,o);export const renderCode=(s,p,o)=>globalThis.__render(s,{...o,filePath:p});':a.path==='display'?'export const markdownDisplayHtml=s=>s;export const hydrateMarkdownDisplay=(r,o)=>globalThis.__hydrate(r,o);':stubs[a.path]??''}));
 }}]});
 const {Preview,useEditorStore:store}=await import(pathToFileURL(path.join(dir,'app.mjs')));
 const root=createRoot(document.getElementById('root'));
 const initial=store.getState();
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const settle=()=>act(()=>pause(110));
 const calls=[],hydrates=[];
 const defaultRender=(s,o)=>Promise.resolve(`<h1 data-line="1" data-theme="${o.theme}">${s}</h1>`);
 let renderImpl=defaultRender;
 globalThis.__render=(s,o)=>{calls.push({source:s,...o});return renderImpl(s,o);};
 globalThis.__hydrate=(element,opts)=>{
  const ctrl=new AbortController(); const entry={element,...opts,ctrl}; hydrates.push(entry);
  for(const diagram of element.querySelectorAll('.mermaid-diagram,.plantuml-diagram')){
   const attr=diagram.classList.contains('mermaid-diagram')?'data-mermaid-hydrated':'data-plantuml-hydrated';
   if(diagram.getAttribute(attr)==='1')continue;
   diagram.setAttribute(attr,'1');
   (entry.pending??=[]).push(diagram);
  }
  return Object.assign(ctrl,{done:Promise.resolve()});
 };
 const reset=async(tabs=[{id:'a',filePath:'/test/a.md',content:'initial',savedContent:'initial'}])=>{
  await act(async()=>{root.render(null);store.setState({...initial,tabs,activeId:tabs[0].id,tocVisible:false});});
  calls.length=0;hydrates.length=0;renderImpl=defaultRender;
 };
 const show=async(props={})=>act(async()=>root.render(React.createElement(Preview,{tabId:'a',theme:'light',...props})));
 const content=async(s,id='a')=>act(async()=>store.getState().setContent(s,id));
 const text=()=>document.querySelector('.preview')?.textContent??'';
 let checked=0;
 const check=(name)=>{checked++;console.log(`PASS ${name}`);};

 if(!measureOnly){
 await reset(); await show(); await settle();
 assert.equal(calls.length,1); assert.match(text(),/initial/); check('omitted active defaults to visible');
 await show({active:false}); await content('hidden latest'); await settle();
 assert.equal(calls.length,1); assert.match(text(),/initial/);
 await show({active:true}); await settle(); assert.equal(calls.length,2);assert.match(text(),/hidden latest/);
 await show({active:false});await show({active:true});await settle();assert.equal(calls.length,2);
 check('hidden changes defer; visible changes flush once; unchanged reactivation reuses HTML');

 await reset();await show({active:false});
 for(let i=0;i<3;i++){await content(`hidden ${i}`);await settle();}
 await show({active:false,theme:'dark'});await settle();assert.equal(calls.length,0);assert.equal(hydrates.length,0);
 await show({active:true,theme:'dark'});await settle();assert.equal(calls.length,1);assert.equal(calls[0].source,'hidden 2');assert.equal(calls[0].theme,'dark');
 check('cold hidden mount and repeated theme/source changes do no rendering or hydration');

 await reset();await show({active:true});await settle();await show({active:true,retainDom:false});await content('cold 中文 😀');await settle();
 assert.equal(calls.length,1);assert.equal(text(),'');await show({active:true,retainDom:true});await settle();assert.equal(calls.length,2);assert.match(text(),/cold 中文 😀/);
 check('DOM eviction defers updates and restores current Unicode source');

 await reset();await show({active:false});await content('');
 await act(async()=>store.setState(s=>({markdownSettings:{...s.markdownSettings,mathAutoNumber:!s.markdownSettings.mathAutoNumber}})));
 await settle();assert.equal(calls.length,0);await show({active:true,theme:'dark'});await settle();
 assert.equal(calls[0].source,'');assert.equal(calls[0].mathAutoNumber,store.getState().markdownSettings.mathAutoNumber);assert.equal(calls[0].theme,'dark');
 await content('短文');await content('');await settle();assert.equal(calls.length,1);check('empty source and latest math preference; reverting before debounce reuses output');

 await reset();let release;
 renderImpl=()=>new Promise(resolve=>{release=resolve;});
 await show({active:true});await settle();assert.equal(calls.length,1);
 await show({active:false});await act(async()=>release('<h1>stale async result</h1>'));assert.doesNotMatch(text(),/stale/);
 await content('newest');renderImpl=defaultRender;await show({active:true});await settle();assert.match(text(),/newest/);
 check('hidden in-flight render cannot overwrite the retained result');

 await reset();await show({active:true});await show({active:false});await settle();assert.equal(calls.length,0);
 await show({active:true});await settle();assert.equal(calls.length,1);
 check('hiding before the existing debounce cancels pending generation');

 await reset([{id:'a',filePath:'/test/a.md',content:'alpha',savedContent:'alpha'},{id:'b',filePath:'/test/b.md',content:'beta',savedContent:'beta'}]);
 const pair=async(activeId,theme='light')=>act(async()=>root.render(React.createElement(React.Fragment,null,...['a','b'].map(id=>React.createElement(Preview,{key:id,tabId:id,active:activeId===id,theme})))));
 await pair('a');await settle();await pair('b');await settle();assert.deepEqual(calls.map(c=>c.source),['alpha','beta']);
 await content('alpha new','a');await pair('b','dark');await settle();assert.equal(calls.length,3);assert.equal(calls[2].source,'beta');
 await pair('a','dark');await settle();assert.equal(calls.length,4);assert.equal(calls[3].source,'alpha new');
 const sections=Array.from(document.querySelectorAll('.preview'));assert.match(sections[0].textContent,/alpha new/);assert.match(sections[1].textContent,/beta/);
 check('two retained tabs keep separate sources and refresh only the active theme');

 await reset();renderImpl=()=>Promise.resolve('<div class="mermaid-diagram" data-mermaid-source="graph TD;A-->B"></div><div class="plantuml-diagram" data-plantuml-source="A->B"></div>');
 await show({active:true});await settle();const first=hydrates.at(-1);assert.equal(first.pending.length,2);
 await show({active:false});assert.equal(first.ctrl.signal.aborted,false);
 await show({active:false,theme:'dark'});await settle();assert.equal(hydrates.at(-1),first);assert.equal(first.ctrl.signal.aborted,false);
 first.pending[0].innerHTML='<svg></svg>';first.pending[1].innerHTML='<div class="error">failure</div>';
 await show({active:true});await settle();assert.equal(hydrates.at(-1),first);assert.equal(calls.length,1);assert.ok(document.querySelector('.mermaid-diagram svg'));assert.match(text(),/failure/);
 check('hidden theme does not rehydrate or abort retained pending diagrams; completion survives reactivation');

 await reset();await show({active:true});await settle();const before=hydrates.at(-1);await content('superseding source');await settle();assert.equal(before.ctrl.signal.aborted,true);assert.match(text(),/superseding source/);
 await act(async()=>root.render(null));assert.equal(hydrates.at(-1).ctrl.signal.aborted,true);check('rendered HTML replacement and unmount keep display cleanup');

 await reset([{id:'a',filePath:'/test/a.ts',content:'const one=1',savedContent:'const one=1'}]);await show({active:false});await settle();await content('const two=2');await settle();assert.equal(calls.length,2);assert.equal(calls[1].filePath,'/test/a.ts');check('non-Markdown standalone rendering keeps its prior behavior');
 }

 // Three separate runs, each an active document plus five visits followed by
 // three edits and one global theme update while all six previews stay mounted.
 // The fixture counts actual renderMarkdown calls at the component boundary.
 const measurements=[];
 for(let run=0;run<3;run++){
  const tabs=Array.from({length:6},(_,i)=>({id:String(i),filePath:`/test/${i}.md`,content:`document ${i}`,savedContent:`document ${i}`}));
  await reset(tabs);
  const group=async(activeId,theme='light')=>act(async()=>root.render(React.createElement(React.Fragment,null,...tabs.map(tab=>React.createElement(Preview,{key:tab.id,tabId:tab.id,active:tab.id===activeId,theme})))));
  for(const tab of tabs){await group(tab.id);await settle();}
  const start=calls.length;
  for(let edit=0;edit<3;edit++){await content(`background edit ${edit}`,'0');await settle();}
  await group('5','dark');await settle();
  measurements.push({retainedTabs:6,backgroundEdits:3,themeChanges:1,generationCalls:calls.length-start});
 }
 console.log(JSON.stringify({checks:checked,measurements}));
 await act(async()=>root.unmount());
} finally {dom.window.close();fs.rmSync(dir,{recursive:true,force:true});}
