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
window.scrollBy=()=>{};
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
const output=path.resolve('node_modules/.cache/deditor-markdown-daily-code.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 'mermaid':`export default {initialize(){},async render(){return {svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Generated</text></svg>'}}};`,
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {formatBuffer} from './src/lib/format';
export {renderMarkdown} from './src/lib/markdown';
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
const {TextSelection,NodeSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view, editorContext;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);editorContext=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original,steps=1)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory());assert.equal(content(),original);for(let i=0;i<steps;i++)await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

// Diagram display is deterministic/offline; keyboard, CodeMirror, source and
// history remain the real product modules. This does not validate a service.
globalThis.fetch=async()=>new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text>Generated</text></svg>',{status:200,headers:{'Content-Type':'image/svg+xml'}});
const {EditorView:CMView}=await import('@codemirror/view');
const {parserCtx}=await import('@milkdown/kit/core');
const codeSource=(lang='text',code='first\nsecond',before='Before\n\n',after='\n\nTail\n')=>before+'```'+lang+'\n'+code+'\n```'+after;
const nodes=type=>{const out=[];view.state.doc.descendants((node,pos)=>{if(node.type.name===type)out.push({node,pos});});return out;};
let embeddedBlock;
const cm=()=>{const dom=embeddedBlock?.querySelector('.cm-editor');assert.ok(dom,'the selected source block must contain its editor');return CMView.findFromDOM(dom);};
const prepareEmbedded=async(offset,text)=>{assert.equal(cm().state.doc.toString(),text);await act(async()=>{cm().dispatch({selection:{anchor:offset}});cm().focus();await pause(30);});assert.equal(cm().state.selection.main.head,offset,'prepared embedded caret');return cm();};
const atCode=async(index=0,offset=0)=>{const {node}=nodes('code_block')[index];embeddedBlock=document.querySelectorAll('.md-code-block')[index];await act(async()=>{const mode=embeddedBlock.querySelector('.md-diagram-modes [data-mode="edit"]');if(!mode.parentElement.hidden)mode.click();else embeddedBlock.querySelector('.md-code-preview').dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0}));await pause(60);});return prepareEmbedded(offset,node.textContent);};
const atRaw=async(offset=0)=>{const {node}=nodes('deditor_raw')[0];embeddedBlock=document.querySelector('.md-raw-block');await act(async()=>{embeddedBlock.querySelector('.md-raw-edit').click();await pause(60);});return prepareEmbedded(offset,node.textContent);};
const embeddedKey=async(name,mods={})=>{let event;await act(async()=>{const editor=cm();editor.focus();event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...mods});editor.contentDOM.dispatchEvent(event);await pause(50);});return event;};
const nativeType=async(text,target=()=>view.dom)=>{for(const character of text)await act(async()=>{
 const editable=target();const down=new dom.window.KeyboardEvent('keydown',{key:character,bubbles:true,cancelable:true});editable.dispatchEvent(down);if(down.defaultPrevented)return;
 const before=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:character});editable.dispatchEvent(before);if(before.defaultPrevented)return;
 const selection=window.getSelection(),range=selection.getRangeAt(0);range.deleteContents();const node=document.createTextNode(character);range.insertNode(node);selection.collapse(node,character.length);editable.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:character}));await pause(50);
});};
const reparse=()=>{const parsed=editorContext.get(parserCtx)(content());parsed.check();return parsed;};
const blockText=(doc,type)=>{let text=[];doc.descendants(node=>{if(node.type.name===type)text.push(node.textContent);});return text;};
try {
 await test('C01 typed fences create ordinary and diagram blocks without losing following prose',async()=>{
  for(const language of ['text','typescript','mermaid','plantuml']) {
   await reset('Before\n\nStart\n\nTail\n');await select('Start',0);const from=view.state.selection.from;await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,from+5))));await key('Backspace');await nativeType('```'+language);const literal=content();await key('Enter');
   assert.equal(nodes('code_block').length,1);assert.equal(nodes('code_block')[0].node.attrs.language,language);assert.ok(content().startsWith('Before\n\n'));assert.ok(content().endsWith('\n\nTail\n'));await exactHistory(literal);assert.equal(nodes('code_block').length,1);
  }
 });
 await test('C02 embedded Tab ShiftTab and Enter ShiftEnter update only code and retain focus',async()=>{
  for(const language of ['text','typescript','mermaid','plantuml'])for(const shift of [false,true]) {
   const source=codeSource(language);await reset(source);await atCode();const editor=cm(),indent=' '.repeat(store.getState().markdownSettings.codeIndent);await embeddedKey('Tab');assert.equal(nodes('code_block')[0].node.textContent,indent+'first\nsecond');await embeddedKey('Tab',{shiftKey:true});assert.equal(content(),source);
   await act(async()=>cm().dispatch({selection:{anchor:2}}));await embeddedKey('Enter',{shiftKey:shift});const editedCode=nodes('code_block')[0].node.textContent;assert.deepEqual(editedCode.split('\n').map(line=>line.trim()),['fi','rst','second']);assert.equal(document.activeElement,cm().contentDOM);assert.deepEqual(blockText(reparse(),'code_block'),[editedCode]);assert.ok(content().startsWith('Before\n\n'));assert.ok(content().endsWith('\n\nTail\n'));
  }
 });
 await test('C03 exact code-edge arrows hand focus to preceding/following prose without modifying source',async()=>{
  for(const direction of [-1,1])for(const language of ['text','mermaid']) {
   const source=codeSource(language);await reset(source);await atCode(0,direction<0?0:'first\nsecond'.length);await embeddedKey(direction<0?'ArrowUp':'ArrowDown');assert.equal(view.state.selection.$head.parent.textContent,direction<0?'Before':'Tail');assert.equal(document.activeElement,view.dom);assert.equal(content(),source);await nativeType('X');assert.ok(content().includes(direction<0?'BeforeX':'XTail'));assert.equal(nodes('code_block')[0].node.textContent,'first\nsecond');
  }
 });
 await test('C04 ModEnter exits ordinary and diagram code to prose, including neighboring atomic blocks',async()=>{
  for(const language of ['text','mermaid','plantuml'])for(const tail of ['\n\nTail\n','\n\n| A | B |\n| --- | --- |\n| C | D |\n','']) {
   const source=codeSource(language,'first','Before\n\n',tail);await reset(source);await atCode(0,2);await embeddedKey('Enter',{ctrlKey:true});assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(document.activeElement,view.dom);assert.equal(nodes('code_block')[0].node.textContent,'first');await nativeType('X');assert.deepEqual(blockText(reparse(),'code_block'),['first']);assert.ok(content().includes('X'));if(tail.includes('| A'))assert.equal(nodes('table').length,1);
  }
 });
 await test('C05 Escape selects the block and outer Enter exits without code being deleted',async()=>{
  for(const language of ['text','mermaid','plantuml']) {
   const source=codeSource(language);await reset(source);await atCode(0,3);await embeddedKey('Escape');assert.ok(view.state.selection instanceof NodeSelection);assert.equal(view.state.selection.node.type.name,'code_block');assert.equal(content(),source);assert.equal(document.activeElement,view.dom);await key('Enter');assert.equal(view.state.selection.$head.parent.textContent,'Tail');await nativeType('X');assert.deepEqual(blockText(reparse(),'code_block'),['first\nsecond']);
  }
 });
 await test('C06 embedded undo redo then typing keeps source, caret and focus on the same block',async()=>{
  for(const language of ['text','mermaid']){
   const source=codeSource(language);await reset(source);await atCode(0,0);await embeddedKey('Tab');const changed=content();await embeddedKey('z',{ctrlKey:true});assert.equal(content(),source);await embeddedKey('z',{ctrlKey:true,shiftKey:true});assert.equal(content(),changed);assert.equal(document.activeElement,cm().contentDOM);await nativeType('X',()=>cm().contentDOM);assert.ok(nodes('code_block')[0].node.textContent.includes('X'));assert.ok(content().startsWith('Before\n\n'));assert.ok(content().endsWith('\n\nTail\n'));await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());assert.deepEqual(blockText(reparse(),'code_block'),[nodes('code_block')[0].node.textContent]);
  }
 });
 await test('C07 preserved HTML source Tab, ShiftTab and Escape keep raw source distinct from code',async()=>{
  const source='Before\n\n<div>raw</div>\n\nTail\n';await reset(source);await atRaw(0);await embeddedKey('Tab');assert.ok(nodes('deditor_raw')[0].node.textContent.startsWith('  '));await embeddedKey('Tab',{shiftKey:true});assert.equal(content(),source);await embeddedKey('Escape');assert.ok(view.state.selection instanceof NodeSelection);assert.equal(view.state.selection.node.type.name,'deditor_raw');assert.equal(document.querySelector('.md-raw-source .cm-editor'),null);assert.equal(nodes('code_block').length,0);await key('Enter');assert.equal(view.state.selection.$head.parent.textContent,'Tail');assert.equal(content(),source);
 });
 await test('C08 preserved-source boundary arrows and ModEnter hand off to surrounding prose',async()=>{
  for(const method of ['up','down','mod']) {
   const source='Before\n\n<div>raw</div>\n\nTail\n';await reset(source);await atRaw(method==='up'?0:method==='down'?14:3);await embeddedKey(method==='up'?'ArrowUp':method==='down'?'ArrowDown':'Enter',method==='mod'?{ctrlKey:true}:{});assert.equal(view.state.selection.$head.parent.type.name,'paragraph',method);assert.equal(document.activeElement,view.dom);assert.equal(content(),source);assert.equal(document.querySelector('.md-raw-source .cm-editor'),null);
  }
 });
 await test('C09 inline source Tab leaves formatted cell and subsequent text belongs to next cell',async()=>{
  const source='Before\n\n| A | B |\n| --- | --- |\n| **one** | two |\n\nTail\n';await reset(source);await select('one',1);assert.ok(document.querySelector('[data-md-inline-source]'));await key('Tab');assert.equal(view.state.selection.$head.parent.textContent,'two');assert.equal(document.querySelector('[data-md-inline-source]'),null);await nativeType('X');assert.ok(content().includes('**one**'));assert.ok(content().includes('X'));assert.equal(nodes('table').length,1);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());reparse();
 });
 await test('C10 inline Escape and terminal ArrowRight preserve marks and allow subsequent prose typing',async()=>{
  for(const marker of ['**','`'])for(const action of ['Escape','ArrowRight']){
   const source='Before '+marker+'word'+marker+' after.\n';await reset(source);await select('Before word after.',8);assert.ok(document.querySelector('[data-md-inline-source]'));
   if(action==='ArrowRight'){const n=nodes('deditor_inline_source')[0];await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,n.pos+n.node.nodeSize-1))));}
   await key(action);assert.equal(document.querySelector('[data-md-inline-source]'),null);assert.equal(content(),source);await nativeType('X');assert.ok(content().includes('X'));if(action==='ArrowRight')assert.equal(content(),'Before '+marker+'word'+marker+'X after.\n');reparse();
  }
 });
 await test('C11 formatted final-cell Tab creates a row and ShiftTab still enters the previous cell',async()=>{
  for(const reverse of [false,true]){
   const source='Before\n\n| A | B |\n| --- | --- |\n| one | **last** |\n\nTail\n';await reset(source);await select('last',2);assert.ok(document.querySelector('[data-md-inline-source]'));await key('Tab',{shiftKey:reverse});assert.equal(document.querySelector('[data-md-inline-source]'),null);assert.equal(view.state.selection.$head.parent.textContent,reverse?'one':'');assert.equal(nodes('table')[0].node.childCount,reverse?2:3);await nativeType('X');assert.ok(content().includes('**last**'));assert.equal(blockText(reparse(),'table').length,1);
  }
 });
 await test('C12 preserved HTML and frontmatter ModEnter focus destination, preserve source, and support continued typing',async()=>{
  for(const raw of ['<div>raw</div>','---\ntitle: Generated\n---'])for(const tail of ['\n\nTail\n','\n\n```text\nnext\n```\n','']){
   const source=raw+tail;await reset(source);assert.equal(nodes('deditor_raw').length,1);await atRaw(2);await embeddedKey('Enter',{ctrlKey:true});assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(document.activeElement,view.dom);assert.equal(nodes('deditor_raw')[0].node.textContent,raw);assert.equal(document.querySelector('.md-raw-source .cm-editor'),null);await nativeType('X');assert.ok(content().startsWith(raw));assert.equal(blockText(reparse(),'deditor_raw')[0],raw);assert.ok(content().includes('X'));await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
  }
 });
 await test('C13 preserved source undo redo then continuation and readonly transition keep source safe',async()=>{
  for(const raw of ['<div>raw</div>','---\ntitle: Generated\n---']){
   const source=raw+'\n\nTail\n';await reset(source);await atRaw(0);await embeddedKey('Tab');const changed=content();await embeddedKey('z',{ctrlKey:true});assert.equal(content(),source);await embeddedKey('z',{ctrlKey:true,shiftKey:true});assert.equal(content(),changed);await nativeType('X',()=>cm().contentDOM);assert.ok(content().includes('X'));const beforeReadonly=content();await render(true);assert.equal(document.querySelector('.md-raw-source .cm-editor'),null);await key('Enter',{ctrlKey:true});assert.equal(content(),beforeReadonly);
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} daily code keyboard checks passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
