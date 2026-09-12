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
const output=path.resolve('node_modules/.cache/deditor-round3-block.mjs');
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
export {markdownSession} from './src/lib/markdownSession';
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
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};
const input=async(text)=>{await act(async()=>{const {from,to}=view.state.selection;let handled=false;view.someProp('handleTextInput',fn=>{if(fn(view,from,to,text,()=>view.state.tr.insertText(text,from,to))){handled=true;return true;}});if(!handled)view.dispatch(view.state.tr.insertText(text,from,to));await pause(35);});};
const range=async(text,a,b)=>{await select(text,a);await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.from,view.state.selection.from+b-a))));};
const paste=async(text,html='')=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?text:type==='text/html'?html:''}});await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});};
const visible=()=>view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n');
const suggestions=()=>[...document.querySelectorAll('.md-emoji-suggestions button')].map(b=>b.textContent);

const {EditorView:CodeView}=await import('@codemirror/view');
const {NodeSelection}=await import('@milkdown/kit/prose/state');
const samples={code:'```js\nconst x=1;\n```',math:'$$\nx^2\n$$',html:'<div>HTML</div>',details:'<details>\n<summary>Title</summary>\nBody\n</details>',yaml:'---\ntitle: Example\n---',image:'![alt](assets/generated.png)'};
const findNode=type=>{let found;view.state.doc.descendants((node,pos)=>{if(!found&&node.type.name===type)found={node,pos};});assert.ok(found,type);return found;};
const enterBlock=async(type,atEnd)=>{const {node,pos}=findNode(type);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,pos+1+(atEnd?node.content.size:0))));await pause(35);});const host=view.nodeDOM(pos);if(!host.querySelector('.cm-editor'))await act(async()=>{const button=host.querySelector('.md-raw-edit');if(button)button.click();else host.querySelector('.md-code-preview').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));await pause(30);});const cm=CodeView.findFromDOM(host.querySelector('.cm-editor'));assert.ok(cm);await act(async()=>{cm.dispatch({selection:{anchor:atEnd?cm.state.doc.length:0}});cm.focus();await pause(20);});return cm;};
const cmKey=async(cm,key)=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});cm.contentDOM.dispatchEvent(event);await pause(40);});return event;};

const run=async(fn)=>act(async()=>{fn();await pause(50);});
const insert=async(source)=>run(()=>app.getVisualEditor().insert(source,true));
const cmReplace=async(cm,text)=>run(()=>cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:text},selection:{anchor:text.length}}));
try {
 await test('S1 generated HTML and details clear Escape then ordinary input retain neighbors and history',async()=>{
  for(const html of ['<div>generated</div>','<details>\n<summary>Title</summary>\nBody\n</details>']){
   await reset('Before\n\nAfter\n');await select('Before');await insert(html);let cm=await enterBlock('deditor_raw',true);await cmReplace(cm,'');await cmKey(cm,'Escape');const cleared=content();await input('plain');assert.ok(content().includes('plain'));assert.ok(content().includes('Before'));assert.ok(content().includes('After'));await exactHistory(cleared);
  }
 });
 await test('S2 generated HTML edits collapse on neighboring paragraph focus and reopen modified source',async()=>{
  await reset('Before\n\nAfter\n');await select('Before');await insert('<div>generated</div>');let cm=await enterBlock('deditor_raw',true);await cmReplace(cm,'<div>changed</div>');const saved=content();const outside=document.createElement('button');document.body.append(outside);await run(()=>outside.focus());assert.equal(document.querySelector('.md-raw-source .cm-editor'),null,'source editor closes after moving to prose');assert.equal(document.querySelector('.md-raw-preview').hidden,false);assert.equal(content(),saved);await select('After');outside.remove();await input('later');assert.ok(content().includes('Afterlater'));cm=await enterBlock('deditor_raw',true);assert.equal(cm.state.doc.toString(),'<div>changed</div>');
 });
 await test('S3 emptied preserved block exits next to images without losing either neighbor',async()=>{
  for(const direction of [-1,1]){await reset('Before\n\nAfter\n');await select('Before');await insert('<div>generated</div>\n\n![generated](assets/generated.png)');const cm=await enterBlock('deditor_raw',true);await cmReplace(cm,'');await cmKey(cm,direction<0?'ArrowUp':'ArrowDown');await input('outside');assert.ok(content().includes('outside'));assert.ok(content().includes('assets/generated.png'));assert.ok(content().includes('Before'));assert.ok(content().includes('After'));}
 });
 await test('S4 generated preserved block delete undo redo undo then source typing has stable focus',async()=>{
  await reset('Before\n\nAfter\n');await select('Before');await insert('<div>generated</div>');let cm=await enterBlock('deditor_raw',true);await cmKey(cm,'Escape');const original=content();await key('Delete');const deleted=content();assert.ok(!deleted.includes('generated'));await run(()=>app.markdownHistory());assert.equal(content(),original);await run(()=>app.markdownHistory(true));assert.equal(content(),deleted);await run(()=>app.markdownHistory());assert.equal(content(),original);assert.ok(view.state.selection instanceof NodeSelection,'undo must restore the selected block rather than select its source text');cm=await enterBlock('deditor_raw',true);await cmReplace(cm,'<div>continued</div>');assert.ok(content().includes('continued'));assert.equal(document.activeElement,cm.contentDOM);
 });
 await test('S4 legacy history without a selection JSON and unknown selection types keep a valid fallback',async()=>{
  for(const kind of ['legacy','unknown']){await reset('Before\n\nAfter\n');await select('Before');await insert('<div>generated</div>');const cm=await enterBlock('deditor_raw',true);await cmKey(cm,'Escape');const original=content();await key('Delete');const session=app.markdownSession('a',content()),take=session.takeHistoryVisual;session.takeHistoryVisual=function(){const value=take.call(this);if(value){if(kind==='legacy')delete value.selectionJSON;else value.selectionJSON={type:'generated-unavailable'};}return value;};try{await run(()=>app.markdownHistory());assert.equal(content(),original);assert.ok(view.state.selection.from>=0&&view.state.selection.to<=view.state.doc.content.size);}finally{session.takeHistoryVisual=take;}}
 });
 await test('S5 generated image caption can be cleared, blurred, deleted and restored',async()=>{
  await reset('Before\n\nAfter\n');await select('Before');await insert('![generated](assets/generated.png "title")');const caption=document.querySelector('.caption-input');assert.ok(caption);await run(()=>{caption.focus();caption.value='';caption.dispatchEvent(new Event('input',{bubbles:true}));caption.blur();});assert.ok(content().includes('assets/generated.png'));assert.ok(!content().includes('"title"'));const original=content();const image=findNode('image-block');await run(()=>{view.focus();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,image.pos)));});await key('Delete');assert.ok(!content().includes('generated.png'));await run(()=>app.markdownHistory());assert.equal(content(),original);await key('Enter');await input('continued');assert.ok(content().includes('generated.png'));assert.ok(content().includes('continued'));
 });
 await test('S5 caption typing commits before undo and cannot reappear after a delayed update or blur',async()=>{
  await reset('Before\n\nAfter\n');await select('Before');await insert('![generated](assets/generated.png "title")');const original=content();const caption=document.querySelector('.caption-input');await run(()=>{caption.focus();caption.value='';caption.dispatchEvent(new Event('input',{bubbles:true}));});assert.ok(!content().includes('"title"'),'visible empty caption must already be saved');await run(()=>app.markdownHistory());assert.equal(content(),original);assert.equal(caption.value,'title');await act(async()=>{await pause(1100);caption.blur();await pause(40);});assert.equal(content(),original,'late callback/blur cannot overwrite undo');
 });
 await test('S6 generated adjacent image and raw blocks retain prose through undo redo and continued input',async()=>{
  await reset('');await insert('![generated](assets/generated.png)\n\n<div>generated</div>');const original=content();const cm=await enterBlock('deditor_raw',false);await cmKey(cm,'ArrowUp');await input('middle');const edited=content();assert.ok(edited.includes('middle'));assert.ok(edited.indexOf('generated.png')<edited.indexOf('middle'));assert.ok(edited.indexOf('middle')<edited.indexOf('<div>'));await run(()=>app.markdownHistory());assert.equal(content(),original);await run(()=>app.markdownHistory(true));assert.equal(content(),edited);await input('next');assert.ok(content().includes('middlenext'));assert.ok(content().includes('generated.png'));
 });
 await test('S7 generated formula can be emptied and exited, with history retaining following typing',async()=>{
  await reset('Before\n\nAfter\n');await select('Before');await insert('$$\nx^2\n$$');const cm=await enterBlock('code_block',true);await cmReplace(cm,'');const empty=content();await cmKey(cm,'ArrowDown');await input('outside');const edited=content();assert.ok(edited.includes('outside'));await run(()=>app.markdownHistory());assert.equal(content(),empty);await run(()=>app.markdownHistory(true));assert.equal(content(),edited);await input('next');assert.ok(content().includes('outsidenext'));
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} round3 block sequence component groups passed (S8 requires browser)`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
