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
const output=path.resolve('node_modules/.cache/deditor-markdown-round3-inline.mjs');
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
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {captureEditorTarget,insertLink} from './src/lib/editorBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'})));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;await fn();passed++;console.log('PASS '+name);}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view,editorCtx;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);editorCtx=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

const range=async(text,start,end)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+start,at+end)));await pause(20);});};
const run=async(fn)=>act(async()=>{fn();await pause(40);});
const button=label=>{const item=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label || b.getAttribute('aria-label')?.startsWith(label+' ('));assert.ok(item,label);return item;};

const input=async(text)=>{for(const character of text)await run(()=>view.dispatch(view.state.tr.insertText(character)));};
const caret=()=>({head:view.state.selection.head,parent:view.state.selection.$head.parent.type.name,offset:view.state.selection.$head.parentOffset,stored:view.state.storedMarks?.map(mark=>mark.type.name)});
const visible=()=>document.querySelector('.ProseMirror').textContent;
const erase=async(text)=>{let from;view.state.doc.descendants((node,pos)=>{if(from===undefined&&node.isText&&node.text?.includes(text))from=pos+node.text.indexOf(text);});assert.notEqual(from,undefined,text);await run(()=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,from+text.length)));view.dispatch(view.state.tr.deleteSelection());});};
const right=async()=>{const handled=await key('ArrowRight');if(!handled.defaultPrevented)await run(()=>{const p=view.state.selection.head;view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,Math.min(view.state.doc.content.size-1,p+1))));});};
const left=async()=>{const handled=await key('ArrowLeft');if(!handled.defaultPrevented)await run(()=>{const p=view.state.selection.head;view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,Math.max(1,p-1))));});};
const deleteAt=async(direction)=>{const handled=await key(direction==='backward'?'Backspace':'Delete');if(!handled.defaultPrevented)await run(()=>{const p=view.state.selection.head;view.dispatch(view.state.tr.delete(direction==='backward'?p-1:p,direction==='backward'?p:p+1));});};
try {
await test('IN00 sequential letters stay inside the format that was just enabled',async()=>{
 for(const label of ['Bold','Inline code']){await reset('Start  end.\n\nTail untouched.\n');await select('Start  end.',6);await run(()=>button(label).click());for(const letter of 'word')await input(letter);console.log('sequential',label,JSON.stringify({source:content(),caret:caret()}));assert.ok(content().includes(label==='Bold'?'**word**':'`word`'));}
});
await test('IN01 create bold, erase its word, exit right and continue as plain text',async()=>{
 const original='Start  end.\n\nTail untouched.\n';await reset(original);await select('Start  end.',6);await run(()=>button('Bold').click());await input('word');assert.match(content(),/\*\*word\*\*/);const generated=content();await erase('word');assert.equal(content(),original);await run(()=>app.markdownHistory());assert.equal(content(),generated);await run(()=>app.markdownHistory(true));assert.equal(content(),original);
 for(let i=0;i<5&&document.querySelector('[data-md-inline-source]');i++)await right();await input('NEXT');
 console.log('IN01 observation',JSON.stringify({source:content(),caret:caret(),visible:visible()}));
 assert.equal(content(),'Start NEXT end.\n\nTail untouched.\n');
});
await test('IN02 create inline code, erase its word, exit right and continue as plain text',async()=>{
 const original='Start  end.\n\nTail untouched.\n';await reset(original);await select('Start  end.',6);await run(()=>button('Inline code').click());await input('word');assert.match(content(),/`word`/);const generated=content();await erase('word');assert.equal(content(),original);await run(()=>app.markdownHistory());assert.equal(content(),generated);await run(()=>app.markdownHistory(true));assert.equal(content(),original);
 for(let i=0;i<5&&document.querySelector('[data-md-inline-source]');i++)await right();await input('NEXT');
 console.log('IN02 observation',JSON.stringify({source:content(),caret:caret(),visible:visible()}));
 assert.equal(content(),'Start NEXT end.\n\nTail untouched.\n');
});

await test('IN03 create a paragraph-leading bold word, leave left, Backspace and continue outside',async()=>{
 await reset('word after.\n');await range('word after.',0,4);await run(()=>button('Bold').click());await run(()=>app.getVisualEditor().navigate(1,1));for(let i=0;i<10&&document.querySelector('[data-md-inline-source]');i++)await left();assert.equal(!!document.querySelector('[data-md-inline-source]'),false);await key('Backspace');await input('NEXT');
 console.log('IN03',JSON.stringify({source:content(),caret:caret()}));assert.equal(content(),'NEXT**word** after.\n');
});
await test('IN04 create a paragraph-ending bold word, leave right, Delete and continue outside',async()=>{
 await reset('Before word\n');await range('Before word',7,11);await run(()=>button('Bold').click());await run(()=>app.getVisualEditor().navigate(1,16));for(let i=0;i<10&&document.querySelector('[data-md-inline-source]');i++)await right();assert.equal(!!document.querySelector('[data-md-inline-source]'),false);await key('Delete');await input('NEXT');
 console.log('IN04',JSON.stringify({source:content(),caret:caret()}));assert.equal(content(),'Before **word**NEXT\n');
});
await test('IN05 create adjacent formats, Backspace inside their boundary and retain both neighbors',async()=>{
 await reset('Before boldcode after.\n');await range('Before boldcode after.',7,11);await run(()=>button('Bold').click());await range('Before boldcode after.',11,15);await run(()=>button('Inline code').click());const generated=content();assert.equal(generated,'Before **bold**`code` after.\n');
 await run(()=>app.getVisualEditor().navigate(1,19));await deleteAt('backward');await input('X');await key('Escape');console.log('IN05',JSON.stringify({source:content(),caret:caret()}));assert.equal(content(),'Before **bold**`cXde` after.\n');await run(()=>app.saveFile());assert.equal(writes.at(-1).content,content());
});
await test('IN06 create adjacent formats, Delete and undo at code start then continue',async()=>{
 await reset('Before boldcode after.\n');await range('Before boldcode after.',7,11);await run(()=>button('Bold').click());await range('Before boldcode after.',11,15);await run(()=>button('Inline code').click());const generated=content();
 await run(()=>app.getVisualEditor().navigate(1,17));await deleteAt('forward');await key('Escape');console.log('IN06 delete',JSON.stringify({source:content(),caret:caret()}));assert.equal(content(),'Before **bold**`ode` after.\n');await run(()=>app.markdownHistory());assert.equal(content(),generated);await input('X');await key('Escape');console.log('IN06 continue',JSON.stringify({source:content(),caret:caret()}));assert.ok(content().includes('Xcode'));assert.ok(content().includes('**bold**'));
});
await test('IN07 generated format selection replacement, undo and replacement typing',async()=>{
 await reset('Before word after.\n');await range('Before word after.',7,11);await run(()=>button('Bold').click());const generated=content();await input('NEW');assert.equal(content(),'Before **NEW** after.\n');await key('Escape');await run(()=>app.markdownHistory());assert.equal(content(),generated);await input('X');await key('Escape');console.log('IN07',JSON.stringify({source:content(),caret:caret()}));assert.equal(content(),'Before **X** after.\n');
});
await test('IN08 generated link edit Escape/confirm restores the original caret for continued typing',async()=>{
 const {linkTooltipAPI}=await import('@milkdown/kit/component/link-tooltip');
 for(const exit of ['Escape','Enter']){
  await reset('Before label after.\n');await range('Before label after.',7,12);await run(()=>app.getVisualEditor().link('https://example.com/old','label'));await key('Escape');const generated=content();
  // Put the original caret inside the label, then invoke the same edit API as the hover Edit button.
  let at,mark;view.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='label'){at=pos;mark=node.marks.find(mark=>mark.type.name==='link');}});assert.notEqual(at,undefined);
  await run(()=>{view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+2)));view.dom.blur();});
  // Blurring closes the inline projection; locate the rendered link again.
  view.state.doc.descendants((node,pos)=>{if(node.isText&&node.text==='label'){at=pos;mark=node.marks.find(mark=>mark.type.name==='link');}});
  const originalHead=view.state.selection.head;await run(()=>editorCtx.get(linkTooltipAPI.key).editLink(mark,at,at+5));await act(async()=>pause(50));
  const field=document.querySelector('.milkdown-link-edit input');assert.ok(field);await run(()=>{field.value='https://example.com/new';field.dispatchEvent(new Event('input',{bubbles:true}));});await run(()=>field.dispatchEvent(new window.KeyboardEvent('keydown',{key:exit,bubbles:true,cancelable:true})));await act(async()=>pause(50));
  console.log('IN08 close',exit,JSON.stringify({source:content(),selection:view.state.selection.toJSON(),originalHead,focus:view.hasFocus()}));assert.equal(view.hasFocus(),true);assert.equal(view.state.selection.empty,true);if(view.state.selection.$head.parent.type.name==='deditor_inline_source')assert.equal(view.state.selection.$head.parentOffset,view.state.selection.$head.parent.textContent.indexOf('label')+2);else assert.equal(view.state.selection.head,originalHead);
  await input('X');await key('Escape');assert.equal(content(),generated.replace('label','laXbel').replace('/old',exit==='Enter'?'/new':'/old'));await run(()=>app.saveFile());assert.equal(writes.at(-1).content,content());await run(()=>app.markdownHistory());assert.equal(content(),generated.replace('/old',exit==='Enter'?'/new':'/old'));if(exit==='Enter'){await run(()=>app.markdownHistory());assert.equal(content(),generated);}
 }
});
}finally{await act(async()=>root.unmount());dom.window.close();}
console.log('Passed '+passed+' round3 inline chains');
