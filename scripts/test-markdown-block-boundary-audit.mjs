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
const output=path.resolve('node_modules/.cache/deditor-markdown-block-boundary-audit.mjs');
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
try {
 for(const name of ['code','math','html','yaml','details']) for(const direction of [-1,1])await test(`A07/I06 ${name} boundary ${direction<0?'up':'down'} exits to prose`,async()=>{
  const original=samples[name]+'\n';await reset(original);const cm=await enterBlock(['html','yaml','details'].includes(name)?'deditor_raw':'code_block',direction>0);await cmKey(cm,direction<0?'ArrowUp':'ArrowDown');assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(document.activeElement,view.dom);const before=content();await input('outside');assert.ok(content().includes('outside'));await exactHistory(original);
 });

 await test('A07 adjacent code, formula, image and preserved blocks gain prose at their shared edge',async()=>{
  const cases=[['code','image','code_block',1],['math','html','code_block',1],['html','code','deditor_raw',1],['yaml','code','deditor_raw',1],['image','html','deditor_raw',-1],['html','math','code_block',-1]];
  for(const [first,second,type,direction] of cases){const original=samples[first]+'\n\n'+samples[second]+'\n';await reset(original);const cm=await enterBlock(type,direction>0);await cmKey(cm,direction<0?'ArrowUp':'ArrowDown');assert.equal(view.state.selection.$head.parent.type.name,'paragraph');await input('between');const edited=content();assert.ok(edited.indexOf(samples[first].split('\n')[0])<edited.indexOf('between'));assert.ok(edited.indexOf('between')<edited.indexOf(samples[second].split('\n')[0]),JSON.stringify([first,second,edited]));await exactHistory(original);}
 });
 await test('A07 exiting to existing neighboring prose does not insert another paragraph',async()=>{
  for(const name of ['code','html'])for(const direction of [-1,1]){const original='Before\n\n'+samples[name]+'\n\nAfter\n';await reset(original);const cm=await enterBlock(name==='code'?'code_block':'deditor_raw',direction>0);const count=view.state.doc.childCount;await cmKey(cm,direction<0?'ArrowUp':'ArrowDown');assert.equal(view.state.doc.childCount,count);assert.equal(content(),original);assert.equal(view.state.selection.$head.parent.textContent,direction<0?'Before':'After');await input('outside');assert.ok(content().includes(direction<0?'Beforeoutside':'outsideAfter'));await exactHistory(original);}
 });
 await test('A07 source Enter stays inside the block, undo restores it, then source input continues',async()=>{
  for(const name of ['code','math','html','yaml','details']){const original=samples[name]+'\n';await reset(original);let cm=await enterBlock(['html','yaml','details'].includes(name)?'deditor_raw':'code_block',true);const before=cm.state.doc.toString();await cmKey(cm,'Enter');assert.notEqual(cm.state.doc.toString(),before);await act(async()=>{app.markdownHistory(false,'a');await pause(40);});assert.equal(content(),original);cm=CodeView.findFromDOM(document.querySelector('.cm-editor'));assert.ok(cm);await act(async()=>{const at=cm.state.selection.main.head;cm.dispatch({changes:{from:at,insert:'z'},selection:{anchor:at+1}});await pause(40);});assert.ok(content().includes('z'));await exactHistory(original);}
 });
 await test('A07 image Enter inserts prose and Delete/undo permits continued input',async()=>{
  for(const prefix of ['', 'Before\n\n']){const original=prefix+samples.image+'\n';await reset(original);const image=findNode('image-block');await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,image.pos)));});await key('Enter');assert.equal(view.state.selection.$head.parent.type.name,'paragraph');const afterEnter=content();await input('outside');assert.ok(content().includes('outside'));assert.ok(content().includes('assets/generated.png'));await exactHistory(afterEnter);await act(async()=>app.markdownHistory());await act(async()=>app.markdownHistory());assert.equal(content(),original);}
  const original='Before\n\n'+samples.image+'\n\nAfter\n';await reset(original);const image=findNode('image-block');await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,image.pos)));});await key('Backspace');assert.ok(!content().includes('assets/generated.png'));await act(async()=>app.markdownHistory());assert.equal(content(),original);await key('Enter');await input('restored');assert.ok(content().includes('restored'));assert.ok(content().includes('assets/generated.png'));
 });
 await test('A07/I06 Escape selects special block; delete and undo restore source, further editing works',async()=>{
  for(const name of ['code','math','html','yaml','details']){const original=samples[name]+'\n';await reset(original);const cm=await enterBlock(['html','yaml','details'].includes(name)?'deditor_raw':'code_block',true);await cmKey(cm,'Escape');assert.ok(view.state.selection instanceof NodeSelection);await key('Delete');assert.notEqual(content(),original);await act(async()=>{app.markdownHistory();await pause(50);});assert.equal(content(),original);const restored=await enterBlock(['html','yaml','details'].includes(name)?'deditor_raw':'code_block',true);await act(async()=>{const at=restored.state.doc.length;restored.dispatch({changes:{from:at,insert:'z'},selection:{anchor:at+1}});await pause(40);});assert.ok(content().includes('z'));await exactHistory(original);}
 });

 await test('Document end blank-space click appends prose after terminal blocks; save/undo/reopen preserve source',async()=>{
  for(const ending of [samples.code,'```\n\n```',samples.math,samples.html,samples.image,'| A |\n| --- |\n| B |','- last item']){
   const original='Before\n\n'+ending+'\n';await reset(original);
   const scroller=document.querySelector('.md-visual-scroll');
   const event=new dom.window.MouseEvent('mousedown',{button:0,clientX:0,clientY:50,bubbles:true,cancelable:true});
   await act(async()=>{scroller.dispatchEvent(event);await pause(20);});
   assert.equal(event.defaultPrevented,true);assert.equal(view.state.doc.lastChild.type.name,'paragraph');
   assert.equal(view.state.selection.head,view.state.doc.content.size-1);
   await input('after');assert.ok(content().endsWith('after'));
   assert.ok(content().indexOf('after')>content().indexOf(ending.split('\n')[0]));await exactHistory(original);
  }
 });
 await test('Document end prose click moves caret without adding content; read-only and secondary clicks do nothing',async()=>{
  await reset('Before\n\nLast paragraph\n');const original=content();const count=view.state.doc.childCount;
  const scroller=document.querySelector('.md-visual-scroll');
  await act(async()=>scroller.dispatchEvent(new dom.window.MouseEvent('mousedown',{button:0,clientX:0,clientY:50,bubbles:true,cancelable:true})));
  assert.equal(content(),original);assert.equal(view.state.doc.childCount,count);assert.equal(view.state.selection.head,view.state.doc.content.size-1);
  await reset(samples.code+'\n');
  for(const readonly of [false,true]){
   await render(readonly);const before=content();
   const event=new dom.window.MouseEvent('mousedown',{button:readonly?0:2,clientX:0,clientY:50,bubbles:true,cancelable:true});
   await act(async()=>document.querySelector('.md-visual-scroll').dispatchEvent(event));assert.equal(event.defaultPrevented,false);assert.equal(content(),before);
  }
 });
 await test('Document end code handle selects whole node; Backspace/Delete and undo restore fence and language',async()=>{
  for(const prefix of ['','Before\n\n'])for(const text of [samples.code,'```typescript\n\n```'])for(const keyName of ['Backspace','Delete']){
   const original=prefix+text+'\n';await reset(original);
   await act(async()=>{document.querySelector('.md-code-select').click();await pause(20);});
   assert.ok(view.state.selection instanceof NodeSelection);assert.equal(document.activeElement,view.dom);
   assert.equal(content(),original);await key(keyName);assert.ok(!content().includes('```'));if(prefix)assert.ok(content().includes('Before'));
   await exactHistory(original);
  }
 });
 await test('Document end selected code Enter and last visual line Down reach outside without altering code',async()=>{
  const original='Before\n\n'+samples.code+'\n';await reset(original);
  await act(async()=>document.querySelector('.md-code-select').click());await key('Enter');
  assert.equal(view.state.selection.$head.parent.type.name,'paragraph');const afterEnter=content();await input('outside');await exactHistory(afterEnter);
  await act(async()=>app.markdownHistory());await act(async()=>app.markdownHistory());assert.equal(content(),original);
  await reset(original);const cm=await enterBlock('code_block',false);
  await act(async()=>cm.dispatch({selection:{anchor:3}}));
  // Model a wrapped first row: Down must stay in CodeMirror until the final visual row.
  const coords=cm.coordsAtPos;cm.coordsAtPos=pos=>({top:pos===cm.state.doc.length?20:0,bottom:30,left:0,right:0});
  await cmKey(cm,'ArrowDown');assert.equal(view.state.doc.childCount,2);
  cm.coordsAtPos=()=>({top:20,bottom:30,left:0,right:0});await cmKey(cm,'ArrowDown');cm.coordsAtPos=coords;
  assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(document.activeElement,view.dom);
  await input('outside');await exactHistory(original);
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} block boundary audit groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
