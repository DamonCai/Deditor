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
const output=path.resolve('node_modules/.cache/deditor-selection-audit.mjs');
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
const {DOMSerializer,DOMParser}=await import('@milkdown/kit/prose/model');
try {
 for(const [label,source] of Object.entries({details:'<details>\n<summary>Summary</summary>\nBody\n</details>',html:'<custom data-value="a &amp; b">Raw **literal**\n  spaces\n</custom>',yaml:'---\ntitle: Example\n---'})) await test('Clipboard raw '+label+' DOM roundtrip remains a preserved block',async()=>{
  await reset(source+'\n\nAfter\n'); const {node,pos}=findNode('deditor_raw');
  const container=document.createElement('div');container.append(DOMSerializer.fromSchema(view.state.schema).serializeNode(node));
  const parsed=DOMParser.fromSchema(view.state.schema).parse(container);
  assert.equal(parsed.firstChild.type.name,'deditor_raw',label+' clipboard must not turn raw source into code');assert.equal(parsed.firstChild.textContent,node.textContent);
  await run(()=>{view.focus();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,pos)));});
  const original=content();await key('Delete');assert.ok(!content().includes(source));await input('next');assert.ok(content().includes('next'));
  await run(()=>app.markdownHistory());await run(()=>app.markdownHistory());assert.equal(content(),original);
 });
 await test('Ordinary pre remains code without preserved marker',async()=>{await reset('Before\n');const host=document.createElement('div');host.innerHTML='<pre>const x = 1;</pre>';const parsed=DOMParser.fromSchema(view.state.schema).parse(host);assert.equal(parsed.firstChild.type.name,'code_block');});
 const tableSource='Before\n\n| A | B | C |\n| --- | --- | --- |\n| one | two | three |\n| four | five | six |\n| seven | eight | nine |\n\nAfter\n';
 const drag=async(axis,from,to,cancel=false,delay=0,between)=>{
  const table=document.querySelector('.table-wrapper > table');assert.ok(table);
  [...table.rows].forEach((row,r)=>{row.getBoundingClientRect=()=>({top:r*40,bottom:(r+1)*40,left:0,right:300,width:300,height:40});[...row.cells].forEach((cell,c)=>{cell.getBoundingClientRect=()=>({top:r*40,bottom:(r+1)*40,left:c*100,right:(c+1)*100,width:100,height:40});});});
  const handle=document.querySelector(`[data-role="${axis}-drag-handle"]`);assert.ok(handle);
  const event=(name,index)=>new window.MouseEvent(name,{bubbles:true,cancelable:true,clientX:axis==='col'?index*100+50:20,clientY:axis==='row'?index*40+20:20});
  await run(()=>handle.dispatchEvent(event('dragstart',from)));
  if(delay)await act(async()=>pause(delay));
  if(between)await between();
  await run(()=>(cancel==='outside' ? document.body : cancel ? window : document.querySelector('.table-wrapper > table').rows[axis==='row'?to:0].cells[axis==='col'?to:0]).dispatchEvent(event(cancel===true?'dragend':'drop',to)));
 };
 for(const axis of ['row','col']) await test('Table '+axis+' drop uses final pointer, reverse move, undo and cancellation',async()=>{
  await reset(tableSource);const end=axis==='row'?3:2,start=axis==='row'?1:0;
  await drag(axis,start,end);const edited=content();assert.notEqual(edited,tableSource);
  const rows=[...document.querySelector('.table-wrapper > table').rows].map(row=>[...row.cells].map(cell=>cell.textContent));
  if(axis==='row')assert.deepEqual(rows.slice(1).map(r=>r[0]),['four','seven','one']);else assert.deepEqual(rows[0],['B','C','A']);
  await run(()=>app.markdownHistory());assert.equal(content(),tableSource);
  await drag(axis,end,start,false,100);assert.notEqual(content(),tableSource);await run(()=>app.markdownHistory());assert.equal(content(),tableSource);
  await drag(axis,start,end,true);assert.equal(content(),tableSource);
  await drag(axis,start,start);assert.equal(content(),tableSource);
 });
 await test('Table outside drop and intervening edit cancel; header move retains valid schema',async()=>{
  await reset(tableSource);await drag('row',1,3,'outside');assert.equal(content(),tableSource);
  await drag('row',0,3);assert.notEqual(content(),tableSource);view.state.doc.check();assert.equal(document.querySelector('.table-wrapper > table').rows[0].cells[0].textContent,'one');await run(()=>app.markdownHistory());assert.equal(content(),tableSource);
  let changed;
  await drag('row',1,3,false,0,async()=>{await select('Before');await input('changed');changed=content();});assert.equal(content(),changed);
  await reset(tableSource);await drag('col',0,2,'outside');assert.equal(content(),tableSource);
 });
 console.log(`${passed} selection audit component groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
