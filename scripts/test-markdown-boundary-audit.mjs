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
const output=path.resolve('node_modules/.cache/deditor-boundary-audit.mjs');
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
const undo=async()=>{await act(async()=>{app.markdownHistory();await pause(45);});};
const redo=async()=>{await act(async()=>{app.markdownHistory(true);await pause(45);});};
const writeWord=async(word)=>{for(const char of word)await input(char);};
const onlyProse=()=>assert.equal(view.state.doc.firstChild.type.name,'paragraph');
const persistRemount=async()=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};
try {
for(const [name,sourceText,type] of [['code',samples.code,'code_block'],['math',samples.math,'code_block']]) {
 await test(`B01 ${name} sole block before/after creation and continued input`,async()=>{
  for(const direction of [-1,1]){const original=sourceText+'\n';await reset(original);const cm=await enterBlock(type,direction>0);await cmKey(cm,direction<0?'ArrowUp':'ArrowDown');assert.equal(view.state.selection.$head.parent.type.name,'paragraph');assert.equal(document.activeElement,view.dom);await writeWord('xyz');assert.ok(direction<0?content().indexOf('xyz')<content().indexOf(sourceText.split('\n')[0]):content().endsWith('xyz'));await undo();assert.equal(content(),original);await redo();await persistRemount();}
 });
}
await test('B02 sole code deletion leaves an editable empty document; undo restores block and selection',async()=>{
 for(const sourceText of ['```js\n\n```','```js\n \n```','```js\n\n\n```'])for(const keyName of ['Delete','Backspace']){
  const original=sourceText+'\n';await reset(original);await act(async()=>document.querySelector('.md-code-select').click());await key(keyName);onlyProse();await writeWord('abc');assert.equal(content().trim(),'abc');await undo();assert.ok(!content().includes('abc'));await undo();assert.equal(content(),original);assert.ok(view.state.selection instanceof NodeSelection);await redo();await redo();assert.equal(content().trim(),'abc');await persistRemount();
 }
});
await test('B03 sole image deletion and next typing survive undo/redo',async()=>{
 const original=samples.image+'\n';await reset(original);const image=findNode('image-block');await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc,image.pos)));});await key('Delete');onlyProse();await writeWord('imagegone');assert.equal(content().trim(),'imagegone');await undo();await undo();assert.equal(content(),original);await redo();await redo();assert.equal(content().trim(),'imagegone');await persistRemount();
});
await test('B04 sole table last cell Enter keeps table and permits following prose',async()=>{
 const original='| A | B |\n| --- | --- |\n| C | D |\n';for(const before of [false]){await reset(original);await select('D',1);await key('Enter');assert.equal(view.state.selection.$head.depth,1);assert.equal(view.state.selection.$head.parent.type.name,'paragraph');await writeWord('outside');assert.ok(before?content().startsWith('outside'):content().endsWith('outside'));await undo();await undo();assert.equal(content(),original);await redo();await redo();await persistRemount();}
});
await test('B05 sole HTML clear source and Escape permits following prose',async()=>{
 const original='<div>keep</div>\n';await reset(original);const cm=await enterBlock('deditor_raw',true);await act(async()=>cm.dispatch({changes:{from:0,to:cm.state.doc.length,insert:''}}));await cmKey(cm,'Escape');await key('Enter');await writeWord('after');assert.ok(content().trimEnd().endsWith('after'));await undo();await undo();await undo();assert.equal(content(),original);await redo();await redo();await redo();await persistRemount();
});
await test('B06 all-document clearing then typing preserves the independent clear operation',async()=>{
 const {AllSelection}=await import('@milkdown/kit/prose/state');for(const sourceText of ['',samples.code+'\n','Before\n\n'+samples.code+'\n\n'+samples.image+'\n']){
  await reset(sourceText);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));});await key('Backspace');onlyProse();await writeWord('new');assert.equal(content().trim(),'new');await undo();assert.ok(!content().includes('new'));if(sourceText)await undo();assert.equal(content(),sourceText);await redo();if(sourceText)await redo();assert.equal(content().trim(),'new');await persistRemount();
 }
});
await test('B07 trailing nested list exits one level at a time, then typing remains outside',async()=>{
 const original='- parent\n  - child\n';await reset(original);await select('child');await key('Enter');await key('Enter');await key('Enter');await key('Enter');assert.equal(view.state.selection.$head.depth,1);await writeWord('after');assert.ok(content().trimEnd().endsWith('after'));await persistRemount();
});
await test('B08 list inside quotation can exit through consecutive empty items',async()=>{
 const original='> - child\n';await reset(original);await select('child');await key('Enter');await key('Enter');await key('Enter');assert.equal(view.state.selection.$head.depth,1);await writeWord('after');assert.ok(content().trimEnd().endsWith('after'));await persistRemount();
});
await test('B09 paragraph heading paragraph conversion retains text and next-input caret',async()=>{
 const original='word\n';await reset(original);await select('word');await act(async()=>app.getVisualEditor().prefix('## '));assert.equal(view.state.selection.$head.parent.type.name,'heading');await act(async()=>app.getVisualEditor().prefix(''));assert.equal(view.state.selection.$head.parent.type.name,'paragraph');await writeWord('next');assert.equal(content().trim(),'wordnext');await undo();assert.equal(content(),original);await undo();assert.ok(content().startsWith('## '));await undo();assert.equal(content(),original);await persistRemount();
});
await test('B10 ordinary list placeholder/soft-break empty states exit instead of duplicating empty items',async()=>{
 for(const initial of ['- <br>\n','generated-breaks','> <br>\n']){
  await reset(initial==='generated-breaks'?'- text\n':initial);
  if(initial==='generated-breaks'){await range('text',0,4);await key('Backspace');await key('Enter',{shiftKey:true});await key('Enter',{shiftKey:true});}
  const original=content();let at;view.state.doc.descendants((n,pos)=>{if(n.type.name==='paragraph')at=pos+1+n.content.size;});assert.notEqual(at,undefined,JSON.stringify([original,view.state.doc.toJSON()]));await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));});await key('Enter');assert.equal(view.state.selection.$head.depth,1,JSON.stringify([original,view.state.doc.toJSON()]));await writeWord('after');assert.ok(content().trimEnd().endsWith('after'));await undo();assert.ok(!content().includes('after'));await undo();assert.equal(content(),original);await persistRemount();
 }
});
await test('B11 placeholder guards preserve visible text, typed spaces, and replacement typing history',async()=>{
 for(const original of ['- content\n','> content\n']){
  await reset(original);await select(original.includes('tail')?'contenttail':'content',0);await key('Backspace');assert.ok(content().includes('content'));if(original.includes('tail'))assert.ok(content().includes('tail'));
 }
 await reset('- text\n');await select('text');await key('Enter');await writeWord('  ');assert.equal(view.state.selection.$head.parent.textContent,'  ');await key('Enter');assert.ok(view.state.doc.firstChild.type.name.includes('list'));assert.ok(view.state.doc.textContent.includes('  '));
 await reset('- [ ] label ![alt](assets/generated.png)\n');
 let imageParagraph;view.state.doc.descendants((n,pos)=>{if(n.type.name==='paragraph')imageParagraph={n,pos};});assert.ok(imageParagraph);
 await act(async()=>{const tr=view.state.tr.insert(imageParagraph.pos+1+imageParagraph.n.content.size,view.state.schema.nodes.hardbreak.create()).delete(imageParagraph.pos+1,imageParagraph.pos+7);tr.setSelection(TextSelection.create(tr.doc,imageParagraph.pos+1));view.dispatch(tr);});
 await key('Enter');assert.equal(view.state.doc.firstChild.type.name,'bullet_list',JSON.stringify(view.state.doc.toJSON()));assert.ok(content().includes('assets/generated.png'));
 await reset('Before word After\n');await range('Before word After',7,11);await writeWord('abc');assert.equal(content().trim(),'Before abc After');await undo();assert.equal(content(),'Before word After\n');
});
assert.equal(runtimeErrors.length,0);console.log(`${passed} boundary/structure groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
