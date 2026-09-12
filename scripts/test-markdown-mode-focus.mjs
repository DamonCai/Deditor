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
const output=path.resolve('node_modules/.cache/deditor-markdown-mode-focus.mjs');
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
export {default as ModeSwitch} from './src/components/PreviewModeSwitch';
export {setActiveView} from './src/lib/editorBridge';
export {setVisualEditor} from './src/lib/markdownVisualBridge';
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});

const app=await import(pathToFileURL(output));
const store=app.useEditorStore,root=createRoot(document.getElementById('root'));
const pause=()=>new Promise(r=>setTimeout(r,15));
const source=document.createElement('textarea'),visual=document.createElement('textarea'),other=document.createElement('button');document.body.append(source,visual,other);
let passed=0;
const setSource=id=>app.setActiveView({focus:()=>source.focus()},id,'');
const setVisual=id=>app.setVisualEditor({tabId:id,focus:()=>visual.focus()});
async function reset(mode){await act(async()=>root.render(null));app.setActiveView(null);app.setVisualEditor(null);store.setState({language:'en',activeId:'a',markdownMode:mode});await act(async()=>{root.render(React.createElement(app.ModeSwitch,{markdown:true}));await pause();});}
async function click(label){await act(async()=>{const button=[...document.querySelectorAll('#root button')].find(b=>b.textContent===label);assert.ok(button);button.focus();button.click();await pause();});}
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
try{
 await test('mode click focuses ready source and split projection',async()=>{for(const label of ['Edit','Live Preview']){await reset('visual');setSource('a');await click(label);assert.ok(document.activeElement===source);}});
 await test('mode click focuses ready visual projection',async()=>{await reset('source');setVisual('a');await click('Visual');assert.ok(document.activeElement===visual);});
 await test('mode click waits for the matching editor without focusing another tab',async()=>{await reset('source');await click('Visual');await act(async()=>{setVisual('b');await pause();});assert.ok(document.activeElement!==visual);await act(async()=>{setVisual('a');await pause();});assert.ok(document.activeElement===visual);});
 await test('late editor creation does not steal focus after the user clicks elsewhere',async()=>{await reset('source');await click('Visual');other.focus();await act(async()=>{setVisual('a');await pause();});assert.ok(document.activeElement===other);});
 await test('late editor creation does not focus a tab after switching documents',async()=>{await reset('source');await click('Visual');await act(async()=>{store.setState({activeId:'b'});await pause();});await act(async()=>{setVisual('a');await pause();});assert.ok(document.activeElement!==visual);});
 await test('same-event tab change cancels focus before React rerenders',async()=>{await reset('source');await click('Visual');await act(async()=>{store.setState({activeId:'b'});setVisual('a');await pause();});assert.ok(document.activeElement!==visual);});
 await test('same-event mode change cannot focus a now-hidden projection',async()=>{await reset('source');await click('Visual');await act(async()=>{store.setState({markdownMode:'source'});setVisual('a');await pause();});assert.ok(document.activeElement!==visual);});
 await test('state restore without a user mode click never steals focus',async()=>{await reset('source');other.focus();setVisual('a');await act(async()=>{store.setState({markdownMode:'visual'});await pause();});assert.ok(document.activeElement===other);});
}finally{await act(async()=>root.unmount());app.setActiveView(null);app.setVisualEditor(null);window.close();}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} mode focus groups`);
