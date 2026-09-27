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
const mac=process.env.DEDITOR_DAILY_PLATFORM==='mac';
if(mac)Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});
const commandModifier=mac?{metaKey:true}:{ctrlKey:true};
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
const output=path.resolve('node_modules/.cache/deditor-markdown-daily-space-order.mjs');
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
export {markdownHistory} from './src/lib/markdownHistory';
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
const failures=[];async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push([name,error]);console.error('FAIL '+name+'\n'+error.stack);}}
const {Editor:MilkdownEditor,editorViewCtx,parserCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view,context;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);context=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};


// Distinguish separate DOM observer deliveries from one burst. Each input still
// has beforeinput/input; only the specified no-keydown contrast omits keydown.
const insertCharacter=(character,{nbsp=false,omitKeydown=false,keyCode=0}={})=>{
 const down=new dom.window.KeyboardEvent('keydown',{key:character,keyCode,bubbles:true,cancelable:true});
 if(!omitKeydown)view.dom.dispatchEvent(down);if(down.defaultPrevented)return;
 const before=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:character});view.dom.dispatchEvent(before);if(before.defaultPrevented)return;
 const selection=window.getSelection(),range=selection.getRangeAt(0);range.deleteContents();
 const node=document.createTextNode(nbsp && character===' '?'\u00a0':character);range.insertNode(node);selection.collapse(node,node.length);
 view.dom.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:character}));
};
const type=async(text,options={})=>{
 if(options.batch)await act(async()=>{for(const character of text)insertCharacter(character,options);await pause(40);});
 else for(const character of text)await act(async()=>{insertCharacter(character,options);await pause(40);});
};
const evidence=[];
const cases=[
 ['separate ASCII',{}],['separate NBSP',{nbsp:true}],
 ['batch keydown ASCII',{batch:true}],['batch keydown NBSP',{batch:true,nbsp:true}],
 ['batch no-keydown ASCII',{batch:true,omitKeydown:true}],['batch no-keydown NBSP',{batch:true,omitKeydown:true,nbsp:true}],
 ['batch keyCode229 ASCII',{batch:true,keyCode:229}],['batch keyCode229 NBSP',{batch:true,keyCode:229,nbsp:true}],
];
try {
 for(const [name,options] of cases)await test(name,async()=>{
  await reset('');await select('',0);const steps=[];evidence.push({name,options,steps});
  const record=(label,expected)=>{
   const s=window.getSelection(),domPos=s.anchorNode&&view.dom.contains(s.anchorNode)?view.posAtDOM(s.anchorNode,s.anchorOffset):null;
   steps.push({label,source:content(),parent:view.state.selection.$head.parent.textContent,head:view.state.selection.head,offset:view.state.selection.$head.parentOffset,domPos});
   assert.equal(content(),expected,label+' source');assert.equal(domPos,view.state.selection.head,label+' DOM caret');
  };
  const space=options.nbsp?'\u00a0':' ';
  await key('b',{...commandModifier});await type('1');record('bold 1','**1**');await type('2');record('bold 12','**12**');
  await key('b',{...commandModifier});record('bold off','**12**');
  if(options.batch){await type(' 3 ',options);record('space3space batch','**12**'+space+'3'+space);}
  else {await type(' ',options);record('first space','**12**'+space);await type('3',options);record('then 3','**12**'+space+'3');await type(' ',options);record('second space','**12**'+space+'3'+space);}
  const beforeItalic='**12**'+space+'3'+space;
  await key('i',{...commandModifier});await type('4');record('italic 4',beforeItalic+'*4*');await type('5');record('italic 45',beforeItalic+'*45*');
  await key('i',{...commandModifier});record('italic off',beforeItalic+'*45*');
  if(options.batch){await type(' 6',options);record('space6 batch',beforeItalic+'*45*'+space+'6');}
  else {await type(' ',options);record('third space',beforeItalic+'*45*'+space);await type('6',options);record('then 6',beforeItalic+'*45*'+space+'6');}
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());record('save',beforeItalic+'*45*'+space+'6');
  const saved=content();await act(async()=>{view.dom.blur();await pause(40);});assert.equal(content(),saved,'blur retains order');
  assert.equal(view.dom.querySelector('strong')?.textContent,'12');assert.equal(view.dom.querySelector('em')?.textContent,'45');
 });
 assert.deepEqual(runtimeErrors,[]);if(failures.length)throw new Error(`${failures.length} failed space order cases`);
 console.log(`${passed} space order probes passed; generated DOM input, not native-event diagnosis`);
} finally {
 const evidencePath=path.resolve('tests/artifacts/daily-space-order-2026-09-27.json');fs.mkdirSync(path.dirname(evidencePath),{recursive:true});fs.writeFileSync(evidencePath,JSON.stringify({platform:mac?'MacIntel':'default',evidence},null,2)+'\n');
 MilkdownEditor.make=make;await act(async()=>root.render(null));dom.window.close();fs.rmSync(output,{force:true});
}
