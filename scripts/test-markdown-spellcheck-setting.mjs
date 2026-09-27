import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
import postcss from 'postcss';
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url:'http://localhost', pretendToBeVisual:true });
for (const key of ['window','Window','document','Node','NodeFilter','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLDivElement','Element','Text','SVGElement','MutationObserver','DOMParser','DOMRect','Event','CustomEvent','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
for (const key of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) globalThis[key]=dom.window[key].bind(dom.window);
globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
globalThis.IntersectionObserver=class{observe(){} unobserve(){} disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
window.scrollBy=()=>{};
HTMLElement.prototype.scrollIntoView=function(){};
HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
// React DOM must detect the installed DOM before choosing its input event implementation.
const {createRoot}=await import('react-dom/client');
const {flushSync}=await import('react-dom');
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-spellcheck-setting.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
globalThis.mdInvoke=async command=>command==='read_spelling_dictionary'?{words:[],ignored:{},revision:0}:undefined;
const stubs={
 'mermaid':`export default {initialize(){}, async render(id,source){await new Promise(r=>setTimeout(r,source.includes('Slow')?500:5)); if(source.includes('INVALID'))throw new Error('Generated syntax error');return {svg:'<svg><text>'+source.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</text></svg>'};}};`,
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {useSpellingDictionary, disposeSpellingDictionary} from './src/lib/spellingDictionary';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
// JSDOM lacks this standard reflected browser property; no spelling engine is simulated.
Object.defineProperty(HTMLElement.prototype,'spellcheck',{configurable:true,get(){return this.getAttribute('spellcheck')!=='false';},set(value){this.setAttribute('spellcheck',String(value));}});

const source='Speling body with `codetyppo` here.\n\n```js\nconst codetyppo = 1;\n```\n';
store.setState({tabs:[{id:'a',filePath:'/generated/spelling.md',content:source,savedContent:source}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const render=async(props={})=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',theme:'light',...props}));await pause(150);});await act(async()=>pause(50));};
const change=async(enabled)=>{await act(async()=>{store.setState({markdownSettings:{...store.getState().markdownSettings,spellcheck:enabled}});await pause(30);});};
const transact=async(insert=false)=>{await act(async()=>{view.dispatch(insert?view.state.tr.insertText('x',2):view.state.tr.setSelection(TextSelection.create(view.state.doc,2)));await pause(30);});};
const check=value=>{assert.equal(view.dom.getAttribute('spellcheck'),String(value),'the rendered contenteditable attribute must match the setting');assert.equal(view.dom.spellcheck,value);};
let passed=0;const test=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
try {
 await test('enabled spellcheck survives selection and input transactions',async()=>{
  await change(true);await render();check(true);await transact();check(true);await transact(true);check(true);
 });
 await test('runtime off/on toggles remain stable across successive edits',async()=>{
  for(const enabled of [false,true,false,true]){await change(enabled);check(enabled);await transact(true);check(enabled);}
 });
 await test('theme changes and readonly transitions preserve settings and editability',async()=>{
  const existing=view;await render({theme:'dark'});assert.equal(view,existing);await transact();check(true);
  await render({theme:'dark',readonly:true});assert.equal(view.editable,false);check(true);
  await change(false);check(false);await render({theme:'light',readonly:false});assert.equal(view.editable,true);check(false);
 });
 await test('unmount and remount read the current setting without stale attributes',async()=>{
  for(const enabled of [true,false]){await act(async()=>root.render(null));await change(enabled);await render();check(enabled);await transact();check(enabled);}
 });
 await test('enabled body keeps embedded code spelling disabled and does not change document',async()=>{
  const content=store.getState().tabs[0].content;await change(true);await transact();check(true);
  await act(async()=>{app.useSpellingDictionary.setState({data:{words:['body','codetyppo'],ignored:{},revision:1},loaded:true});await pause(30);});
  assert.equal(view.dom.querySelector('[data-deditor-spelling-accepted]')?.textContent,'body','actual dictionary decoration applies to prose');
  assert.equal(view.dom.querySelector('code [data-deditor-spelling-accepted]'),null,'inline code is excluded from dictionary decoration');
  const paragraphEnd=view.state.doc.firstChild.nodeSize-1;
  await act(async()=>{view.dispatch(view.state.tr.insertText(' ',paragraphEnd));await pause(30);});
  await act(async()=>{view.dispatch(view.state.tr.delete(paragraphEnd,paragraphEnd+1));await pause(30);});
  assert.equal(view.dom.querySelector('[data-deditor-spelling-accepted]')?.textContent,'body','accepted word persists after paragraph-end space/backspace');
  assert.equal(view.dom.querySelector('[data-deditor-spelling-accepted]')?.getAttribute('spellcheck'),'false');

  const code=document.querySelector('.md-code-block');assert.ok(code,'real code node view is mounted');
  await act(async()=>{code.querySelector('.md-code-toggle').click();await pause(80);});
  const excluded=[...document.querySelectorAll('[spellcheck="false"]')].filter(node=>node!==view.dom);
  assert.ok(excluded.some(node=>node.classList.contains('cm-content')),'CodeMirror code content retains explicit exclusion');
  assert.equal(store.getState().tabs[0].content,content,'spelling toggle/selection must not alter source');
 });
 await test('native marker styling targets only accepted words and releases removed words',async()=>{
  const css=postcss.parse(fs.readFileSync('src/components/markdown-visual.css','utf8'));
  const selectors=[];
  css.walkRules(rule=>{if(!rule.selectors.some(selector=>selector.endsWith('::spelling-error')))return;
   assert.equal(rule.nodes.find(node=>node.prop==='text-decoration')?.value,'none');
   selectors.push(...rule.selectors.map(selector=>selector.replace(/::spelling-error$/,'')));
  });
  assert.ok(selectors.length,'accepted-word native marker rule exists');
  const eligible=()=>[...new Set(selectors.flatMap(selector=>[...document.querySelectorAll(selector)]))];
  assert.deepEqual(eligible().map(node=>node.textContent),['body'],'ordinary prose and code cannot match the suppression rule');
  await act(async()=>{app.useSpellingDictionary.setState({data:{words:[],ignored:{},revision:2}});await pause(30);});
  assert.deepEqual(eligible(),[],'removing the dictionary entry immediately removes style eligibility');
  check(true);
 });
 assert.deepEqual(runtimeErrors,[]);console.log(`${passed} component spelling groups passed; native underlines/menu are outside JSDOM scope`);
} finally {await act(async()=>root.unmount());app.disposeSpellingDictionary();dom.window.close();fs.rmSync(output,{force:true});}
