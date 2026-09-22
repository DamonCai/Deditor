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
window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new Event('close'));};
// React DOM must detect the installed DOM before choosing its input event implementation.
const {createRoot}=await import('react-dom/client');
const {flushSync}=await import('react-dom');
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-close-async-edits.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];const reportedErrors=[];globalThis.closeAsyncErrors=reportedErrors;let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 'mermaid':`export default {initialize(){}, async render(id,source){await new Promise(r=>setTimeout(r,source.includes('Slow')?500:5)); if(source.includes('INVALID'))throw new Error('Generated syntax error');return {svg:'<svg><text>'+source.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</text></svg>'};}};`,
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {commitWindowClose,isWindowCloseCommitted} from './src/lib/windowCloseGuard';
export {collectMarkdownImages} from './src/lib/markdownImageCollect';
export {doCut,doPaste,handleImagePaste} from './src/components/Editor';
export {default as Confirm, chooseAction} from './src/components/ConfirmDialog';
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onLoad({filter:/[\\/]components[\\/]Editor\.tsx$/},a=>({contents:fs.readFileSync(a.path,'utf8')+'\nexport {doCut,doPaste,handleImagePaste};',loader:'tsx'}));
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async(message)=>{globalThis.closeAsyncErrors.push(message);};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}),React.createElement(app.Confirm)));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;await fn();passed++;console.log('PASS '+name);}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

const range=async(text,start,end)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+start,at+end)));await pause(20);});};
const run=async(fn)=>act(async()=>{fn();await pause(40);});
const button=label=>{const item=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label || b.getAttribute('aria-label')?.startsWith(label+' ('));assert.ok(item,label);return item;};

const {EditorView:CMView,runScopeHandlers}=await import('@codemirror/view');
const mode = async name => run(()=>document.querySelector(`.md-diagram-modes [data-mode="${name}"]`).click());
const cmView = () => CMView.findFromDOM(document.querySelector('.md-code-editor .cm-editor'));
const diagramSource = (lang, code='graph LR\n A-->B') => `Before\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\nTail\n`;
const deferred=()=>{let resolve,reject;return {promise:new Promise((done,fail)=>{resolve=done;reject=fail;}),resolve:value=>resolve(value),reject:err=>reject(err)};};
const clipboard=value=>Object.defineProperty(navigator,'clipboard',{value,configurable:true});
const contextAction=async(target,label)=>{await run(()=>target.dispatchEvent(new window.MouseEvent('contextmenu',{bubbles:true,cancelable:true})));await run(()=>[...document.querySelectorAll('.md-editor-menu button')].find(b=>b.textContent===label).click());};
const freeze=()=>{const release=app.commitWindowClose();assert.equal(app.isWindowCloseCommitted(),true);return release;};
try {
 await test('close rejects delayed code paste/cut and cancellation permits retry',async()=>{
  const original=diagramSource('typescript','BaselineCode');
  for(const action of ['Paste','Cut']) {
   await reset(original);await run(()=>document.querySelector('.md-code-preview').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true})));
   const cm=cmView();await run(()=>cm.dispatch({selection:{anchor:0,head:cm.state.doc.length}}));
   const delayed=deferred();clipboard(action==='Paste'?{readText:()=>delayed.promise}:{writeText:()=>delayed.promise});
   await contextAction(cm.contentDOM,action);const release=freeze();
   try{await run(()=>delayed.resolve('Late content'));assert.equal(content(),original);assert.equal(reportedErrors.length,0);}finally{release();}
   clipboard({readText:async()=>'Accepted after cancel'});await contextAction(cm.contentDOM,'Paste');assert.ok(content().includes('Accepted after cancel'));
  }
 });
 await test('close rejects delayed rich HTML and plain toolbar paste without error UI',async()=>{
  for(const type of ['rich','plain']) {
   await reset('Before\n\nOriginal paragraph\n');await range('Original paragraph',0,8);
   const before=content(),delayed=deferred();let pending;
   if(type==='rich') {
    clipboard({read:async()=>[{types:['text/html'],getType:async()=>({text:()=>delayed.promise})}]});
    await contextAction(view.dom.querySelector('p'), 'Paste');
   } else {clipboard({readText:()=>delayed.promise});pending=app.getVisualEditor().pastePlain();}
   const release=freeze();
   try{await run(()=>delayed.resolve(type==='rich'?'<strong>Late HTML</strong>':'Late text'));if(pending)assert.equal(await pending,false);assert.equal(content(),before);assert.equal(reportedErrors.length,0);}finally{release();}
   clipboard({readText:async()=>'New paste'});await run(()=>{pending=app.getVisualEditor().pastePlain();});assert.equal(await pending,true);assert.ok(content().includes('New paste'));
  }
 });
 await test('close rejects delayed bitmap insertion and cancellation permits new upload',async()=>{
  await reset('Before\n\nOriginal paragraph\n');await select('Original paragraph',4);const before=content();
  const invoke=globalThis.mdInvoke,delayed=deferred();let saving=0;
  globalThis.mdInvoke=async(command,args)=>command==='save_image'?(saving++,delayed.promise):invoke(command,args);
  const pasteImage=async()=>{const file={name:'sample.png',type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};const event=new window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{files:[file],getData:()=>''}});await run(()=>view.dom.dispatchEvent(event));};
  try {await pasteImage();assert.equal(saving,1);const release=freeze();try{await run(()=>delayed.resolve('/generated/assets/test.png'));assert.equal(content(),before);}finally{release();}
   globalThis.mdInvoke=async(command,args)=>command==='save_image'?'/generated/assets/retry.png':invoke(command,args);await pasteImage();assert.ok(content().includes('!['));
  }finally{globalThis.mdInvoke=invoke;}
 });
 await test('Crepe file upload quietly cancels both completion and storage rejection during close',async()=>{
  for(const reject of [false,true]) {
   await reset('Before\n');await select('Before');await run(()=>view.dispatch(view.state.tr.replaceSelectionWith(view.state.schema.nodes['image-block'].create({src:''}))));
   const input=view.dom.querySelector('input[type="file"]');assert.ok(input,'real Crepe upload input');const before=content(),invoke=globalThis.mdInvoke,delayed=deferred(),logged=[];const log=console.error;
   const file={name:'sample.png',type:'image/png',arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer};Object.defineProperty(input,'files',{value:[file],configurable:true});
   globalThis.mdInvoke=async(command,args)=>command==='save_image'?delayed.promise:invoke(command,args);console.error=(...args)=>logged.push(args);
   try {await run(()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));const release=freeze();try{await run(()=>reject?delayed.reject(new Error('expected close-time failure')):delayed.resolve('/generated/assets/test.png'));assert.equal(content(),before);assert.equal(reportedErrors.length,0);assert.equal(logged.length,0);}finally{release();}
    globalThis.mdInvoke=async(command,args)=>command==='save_image'?'/generated/assets/retry.png':invoke(command,args);await run(()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));assert.notEqual(content(),before,'new upload succeeds after cancellation');
   }finally{globalThis.mdInvoke=invoke;console.error=log;}
  }
 });
 await test('close prevents image collection from rewriting its final snapshot',async()=>{
  await reset('Before\n\n![sample](other/source.png)\n');const before=content(),invoke=globalThis.mdInvoke,delayed=deferred();let saving=0;
  globalThis.mdInvoke=async(command,args)=>command==='read_binary_as_base64'?'AQID':command==='save_image'?(saving++,delayed.promise):invoke(command,args);
  try {const result=app.collectMarkdownImages('a');await run(()=>{});assert.equal(saving,1);const release=freeze();try{await run(()=>delayed.resolve('/generated/assets/test.png'));assert.equal((await result).stopped,true);assert.equal(content(),before);}finally{release();}}finally{globalThis.mdInvoke=invoke;}
 });
 await test('source clipboard cut/paste/image callbacks respect close guard and resume normally',async()=>{
  for(const operation of ['cut','paste','image']) {
   const parent=document.createElement('div');document.body.append(parent);const cm=new CMView({parent,doc:'baseline'});cm.dispatch({selection:{anchor:0,head:8}});
   const delayed=deferred(),invoke=globalThis.mdInvoke;clipboard({readText:()=>delayed.promise,writeText:()=>delayed.promise});
   globalThis.mdInvoke=async(command,args)=>command==='save_image'?delayed.promise:invoke(command,args);
   let pending;
   try {pending=operation==='cut'?app.doCut(cm):operation==='paste'?app.doPaste(cm):app.handleImagePaste({arrayBuffer:async()=>new Uint8Array([1,2]).buffer},'image/png',cm);await run(()=>{});const release=freeze();try{delayed.resolve(operation==='paste'?'late':'saved.png');await pending;assert.equal(cm.state.doc.toString(),'baseline');}finally{release();}
    clipboard({readText:async()=>'after cancel'});await app.doPaste(cm);assert.equal(cm.state.doc.toString(),'after cancel');
   }finally{globalThis.mdInvoke=invoke;cm.destroy();parent.remove();}
  }
 });
 await test('normal clipboard failures still report an error outside window close',async()=>{
  await reset(diagramSource('typescript','BaselineCode'));await run(()=>document.querySelector('.md-code-preview').dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,cancelable:true})));
  const before=content();clipboard({readText:async()=>{throw new Error('normal denied clipboard');}});const count=reportedErrors.length;
  await contextAction(cmView().contentDOM,'Paste');assert.equal(reportedErrors.length,count+1);assert.equal(content(),before);
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} close async edit groups passed`);
}finally{MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
