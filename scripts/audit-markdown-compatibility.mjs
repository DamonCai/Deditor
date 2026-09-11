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
const output=path.resolve('node_modules/.cache/deditor-markdown-compatibility.mjs');
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
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile,saveFileAs,saveAllDirty,renamePath} from './src/lib/fileio';
export {renderMarkdown} from './src/lib/markdown';
export {installCompositionViewport} from './src/lib/markdownVisual/compositionViewport';
export {loadPersisted,schedulePersist} from './src/lib/persistence';
export {default as WritingSettings} from './src/components/MarkdownWritingSettings';
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
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}

// Self-created feature probes. Missing capabilities are reported, never counted as passing features.
const rows=[];
for(const [name,markdown,selector] of [
 ['footnotes','开头文字[^n] 后面的普通文字。\n\n[^n]: 脚注解释。\n','.footnote-ref'],
 ['callout','> [!NOTE]\n> 普通提示文字。\n','.md-callout'],
 ['highlight','==高亮==\n','mark'],
 ['subscript','H~2~O\n','sub'],
 ['superscript','X^2^\n','sup'],
 ['emoji',':smile: 中文\n',null],
 ['HTML equivalents','<mark>高亮</mark> H<sub>2</sub>O X<sup>2</sup>\n','mark'],
]) {
 await act(async()=>store.getState().setContent(markdown,'a','command'));await render(false);
 const html=await app.renderMarkdown(markdown,{theme:'light'}),template=document.createElement('template');template.innerHTML=html;
 const rawBlocks=document.querySelectorAll('.ProseMirror .md-raw-block').length;
 const directParagraphs=document.querySelectorAll('.ProseMirror > p').length;
 assert.equal(content(),markdown);await render(true);assert.equal(content(),markdown);
 rows.push({name,rendered:selector?!!template.content.querySelector(selector):!template.content.textContent.includes(':smile:'),rawBlocks,directParagraphs,sourcePreserved:true});
}
console.log(JSON.stringify(rows,null,2));
await act(async()=>root.unmount());assert.deepEqual(runtimeErrors,[]);dom.window.close();
