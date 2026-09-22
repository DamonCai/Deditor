import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url:'http://localhost', pretendToBeVisual:true });
for (const key of ['window','Window','document','Node','NodeFilter','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLDivElement','Element','Text','SVGElement','MutationObserver','DOMParser','DOMRect','Event','KeyboardEvent','CustomEvent','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
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
const output=path.resolve('node_modules/.cache/deditor-urgent-link-card.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[], reads=[], externalLinks=[];globalThis.mdOpenUrl=async href=>externalLinks.push(href);let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file'){reads.push(args.path);return '# Local destination\n';}
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=(href)=>globalThis.mdOpenUrl(href); export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {renderMarkdown} from './src/lib/markdown';
export {markdownDisplayHtml} from './src/lib/markdownDisplay';
export {default as Preview} from './src/components/Preview';
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
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

const range=async(text,start,end)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+start,at+end)));await pause(20);});};
const run=async(fn)=>act(async()=>{fn();await pause(40);});
const button=label=>{const item=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label || b.getAttribute('aria-label')?.startsWith(label+' ('));assert.ok(item,label);return item;};
const hover=async()=>{
 const link=document.querySelector('.ProseMirror a');let at;
 view.state.doc.descendants((n,pos)=>{if(n.isText&&n.marks.some(m=>m.type.name==='link'))at=pos;});
 const previous=view.posAtCoords;view.posAtCoords=()=>({pos:at,inside:at-1});
 await act(async()=>{view.focus();link.dispatchEvent(new window.MouseEvent('mousemove',{bubbles:true,clientX:1,clientY:1}));await pause(140);});
 view.posAtCoords=previous;assert.equal(document.querySelector('.milkdown-link-preview').dataset.show,'true');
};
const inputUrl=async(value)=>{const input=document.querySelector('.milkdown-link-edit input');assert.ok(input);await run(()=>{input.value=value;input.dispatchEvent(new window.Event('input',{bubbles:true}));});return input;};
const finish=async(input,which)=>run(()=>input.dispatchEvent(new window.KeyboardEvent('keydown',{key:which,bubbles:true,cancelable:true})));
const type=async(text)=>run(()=>{const{from,to}=view.state.selection;view.dispatch(view.state.tr.insertText(text,from,to));});
try {
 for(const action of ['Escape','Enter'])await test('link popup '+action+' restores editor focus and source caret',async()=>{
  const original='# Link card\n\nStart [label](https://example.com/old) end.\n\nTail untouched.\n';
  await reset(original);await select('Tail untouched.');const caret=view.state.selection.from;
  await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));await run(()=>{});
  const input=await inputUrl('https://example.com/new');assert.ok(document.activeElement===input,'URL input receives focus');
  await finish(input,action);assert.equal(view.state.selection.from,caret);assert.equal(view.state.selection.empty,true);
  const expected=action==='Enter'?original.replace('/old','/new'):original;
  assert.equal(content(),expected);

  assert.equal(view.hasFocus(),true,'closing the card returns real focus to editor');
  await type('X');const edited=expected.replace('untouched.','untouched.X');assert.equal(content(),edited);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await run(()=>app.markdownHistory());assert.equal(content(),expected);if(action==='Enter'){await run(()=>app.markdownHistory());assert.equal(content(),original);await run(()=>app.markdownHistory(true));assert.equal(content(),expected);}await run(()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);
 });

 await test('link popup preserves a reversed selection through confirm/cancel and replacement undo',async()=>{
  for(const action of ['Escape','Enter']){
   const original='Start [label](https://example.com/old) end.\n\nTail untouched.\n';await reset(original);await select('Start label end.',0);const base=view.state.selection.from;
   await run(()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,base+16,base+8))));
   const selection=view.state.selection.toJSON();await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
   await finish(await inputUrl('https://example.com/new'),action);assert.deepEqual(view.state.selection.toJSON(),selection);assert.equal(view.hasFocus(),true);
   const expected=action==='Enter'?original.replace('/old','/new'):original;assert.equal(content(),expected);await type('X');assert.equal(content(),expected.replace('label]','laX]').replace(' end.',''));await run(()=>app.markdownHistory());assert.equal(content(),expected);
  }
 });
 await test('link popup remove preserves text, caret, continued input and one-step undo',async()=>{
  const original='Start [label](https://example.com/old) end.\n\nTail untouched.\n';await reset(original);await select('Tail untouched.');const caret=view.state.selection.from;
  await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-remove-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  const removed=original.replace('[label](https://example.com/old)','label');assert.equal(content(),removed);assert.equal(view.state.selection.from,caret);assert.equal(view.hasFocus(),true);
  await exactHistory(original);await select('Tail untouched.');await type('R');assert.equal(content(),removed.replace('untouched.','untouched.R'));
 });
 await test('cancel does not overwrite an external link update with unchanged label',async()=>{
  const original='Start [label](https://example.com/old "Keep title") end.\n\nTail untouched.\n';await reset(original);await select('Tail untouched.');await hover();
  await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  const input=await inputUrl('https://example.com/cancelled');await run(()=>{const{from,to}=view.state.selection;view.dispatch(view.state.tr.addMark(from,to,view.state.schema.marks.link.create({href:'https://example.com/external',title:'New title'})));});
  const expected=original.replace('/old \"Keep title\"','/external \"New title\"');await finish(input,'Escape');assert.equal(content(),expected);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,expected);
 });
 await test('same-URL confirmation preserves title and reference spelling',async()=>{
  for(const original of ['Start [label](https://example.com/old "Keep title") end.\n\nTail untouched.\n','Start [label][guide] end.\n\nTail untouched.\n\n[guide]: https://example.com/old "Keep title"\n']){
   await reset(original);await select('Tail untouched.');await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
   await finish(await inputUrl('https://example.com/old'),'Enter');assert.equal(content(),original);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,original);
  }
 });
 await test('changed reference URL serializes the new target and preserves the old definition',async()=>{
  const original='Start [label][guide] end.\n\nTail untouched.\n\n[guide]: https://example.com/old "Keep title"\n';
  const expected=original.replace('[label][guide]','[label](https://example.com/new "Keep title")');
  await reset(original);await select('Tail untouched.');await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  await finish(await inputUrl('https://example.com/new'),'Enter');assert.equal(content(),expected);await exactHistory(original);assert.equal(content(),expected);
  const parsed=new DOMParser().parseFromString(await app.renderMarkdown(expected,{theme:'light'}),'text/html');const link=parsed.querySelector('a');assert.equal(link.textContent,'label');assert.equal(link.getAttribute('href'),'https://example.com/new');assert.equal(link.getAttribute('title'),'Keep title');
  assert.equal(document.querySelector('.ProseMirror a').getAttribute('href'),'https://example.com/new');
 });
 await test('link popup can edit a local file URL without erasing it',async()=>{
  const original='Start [label](https://example.com/old) end.\n\nTail untouched.\n';await reset(original);await select('Tail untouched.');await hover();
  await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  await finish(await inputUrl('file:///self-created/next.md'),'Enter');assert.equal(content(),original.replace('https://example.com/old','file:///self-created/next.md'));await exactHistory(original);
 });
 await test('file URL button confirmation, canceled draft and unsafe protocol boundaries',async()=>{
  const original='Start [label](https://example.com/old "Keep title") end.\n\nTail untouched.\n';
  for(const target of ['file:///self-created/%E4%B8%AD%20%23.md','file:///C:/self-created/next.md']){
   await reset(original);await select('Tail untouched.');await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
   await inputUrl(target);await run(()=>document.querySelector('.milkdown-link-edit .confirm').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));assert.equal(content(),original.replace('https://example.com/old',target));await exactHistory(original);
  }
  for(const [target,action] of [['file:///self-created/cancel.md','Escape'],['javascript:alert(1)','Enter']]){
   await reset(original);await select('Tail untouched.');await hover();await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
   await finish(await inputUrl(target),action);if(action==='Escape')assert.equal(content(),original);else {assert.ok(!content().includes('javascript:'));assert.equal(document.querySelector('.ProseMirror a').getAttribute('href'),'');}
  }
 });
 await test('link popup URL edit retains authored title through save and one undo',async()=>{
  const original='Start [label](https://example.com/old "Keep title") end.\n\nTail untouched.\n';await reset(original);await select('Tail untouched.');await hover();
  await run(()=>document.querySelector('.milkdown-link-preview .link-edit-button').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,cancelable:true})));
  const input=await inputUrl('https://example.com/new');await finish(input,'Enter');assert.equal(content(),original.replace('/old','/new'));await exactHistory(original);
 });
} finally {await act(async()=>root.unmount());dom.window.close();}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} link card groups`);
