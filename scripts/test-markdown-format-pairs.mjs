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
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-format-pairs.mjs');
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
export {saveFile, saveAllDirty} from './src/lib/fileio';
export {flushDocument} from './src/lib/documentFlush';
export {formatPairKey} from './src/lib/markdownVisual/formatPairs';
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
const failedCases=[];
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failedCases.push(name);console.error('FAIL '+name+'\n'+error.stack);}}
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
const visible=()=>view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n');

// Emulate browser editing, not a direct handleTextInput call: several native
// edits may be observed in one MutationObserver delivery. ProseMirror must read
// the DOM and derive the combined input itself.
const domTextBatch=async(parts,{inputType='insertText',composing=false}={})=>{
 const observed=[];view.setProps({handleTextInput(_view,from,to,text){observed.push({from,to,text});return false;}});
 await act(async()=>{
  for(const text of parts){
   const event=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType,data:text,isComposing:composing});view.dom.dispatchEvent(event);
   assert.equal(event.defaultPrevented,false,'input tracking does not cancel native edits');
   const selection=window.getSelection();if(!selection.isCollapsed)selection.deleteFromDocument();const node=selection.anchorNode,offset=selection.anchorOffset;assert.equal(node.nodeType,3);
   node.insertData(offset,text);selection.collapse(node,offset+text.length);
   view.dom.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType,data:text,isComposing:composing}));
  }
  await pause(80);
 });
 return observed;
};

try {
 await test('single formatting pairs preserve live Markdown, skip closers and undo',async()=>{
  for(const marker of ['*','_','`','$','~','^']) {
   const original='Before\n';await reset(original);await select('Before');await input(' ');
   await input(marker);assert.equal(content(),'Before '+marker+marker+'\n',marker+' open source');
   await input('中文');assert.equal(content(),'Before '+marker+'中文'+marker+'\n',marker+' live source');
   await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());
   await input(marker);assert.equal(content(),'Before '+marker+'中文'+marker+'\n',marker+' skip');
   assert.equal(document.querySelector('[data-md-inline-source]'),null,marker+' closed');
   await input('后');assert.equal(content(),'Before '+marker+'中文'+marker+'后\n',marker+' outside text');
  }
 });
 await test('empty pairs delete together and doubled markers support strong/highlight/strike',async()=>{
  for(const marker of ['*','_','`','$','~','=','^']) {
   await reset('Before\n');await select('Before');await input(' ');await input(marker);await key('Backspace');assert.equal(content(),'Before \n',marker+' empty deletion');
  }
  for(const marker of ['*','_','`','~','=']) {
   const original='Before\n';await reset(original);await select('Before');await input(' ');
   await input(marker);await input(marker);assert.equal(content(),'Before '+marker.repeat(4)+'\n',marker+' double');
   await input('中文');await input(marker);await input(marker);
   assert.equal(content(),'Before '+marker.repeat(2)+'中文'+marker.repeat(2)+'\n');assert.equal(document.querySelector('[data-md-inline-source]'),null);
  }
 });

 await test('block prefixes still reach list, fence, language preference and display math rules',async()=>{
  for(const [marker,type] of [['*','bullet_list'],['***','hr'],['___','hr'],['```','code_block'],['$$','code_block']]) {
   await reset('');await select('');for(const c of marker)await input(c);await input(' ');
   assert.equal(view.state.doc.firstChild.type.name,type,marker);assert.equal(document.querySelector('[data-md-inline-source]'),null);
   if(marker==='$$')assert.equal(view.state.doc.firstChild.attrs.language.toLowerCase(),'latex');
  }
  const settings=store.getState().markdownSettings;
  await act(async()=>store.setState({markdownSettings:{...settings,defaultCodeLanguage:'typescript'}}));
  await reset('');await select('');for(const c of '```')await input(c);await input(' ');assert.equal(view.state.doc.firstChild.attrs.language,'typescript');
  await act(async()=>store.setState({markdownSettings:settings}));
  await reset('');await select('');for(const c of '```javascript')await input(c);await input(' ');assert.equal(view.state.doc.firstChild.attrs.language,'javascript');
 });
 await test('generated pairs are a single undoable edit with exact save and reload',async()=>{
  for(const marker of ['*','**','_','__','`','``','$','~','~~','==','^']) {
   const original='Before\n';await reset(original);await select('Before');await input(' ');
   for(const c of marker)await input(c);await input('word');for(const c of marker)await input(c);
   assert.equal(content(),'Before '+marker+'word'+marker+'\n',marker);
   await exactHistory(original);
  }
 });
 await test('no accidental skip of authored closers, escaped or intraword operators',async()=>{
  for(const marker of ['*','_','`','$','~','=','^']) {
   await reset('Before\\\\\n');await select('Before\\');await input(marker);
   assert.equal(document.querySelector('[data-md-inline-source]'),null,marker+' escape');
   assert.equal(visible(),'Before\\'+marker);
  }
  for(const marker of ['_','=']) {
   await reset('identifier\n');await select('identifier');await input(marker);
   assert.equal(visible(),'identifier'+marker);assert.equal(document.querySelector('[data-md-inline-source]'),null);
  }
  await reset('\\*\\*\n');await select('**',1);await input('*');assert.equal(visible(),'***','authored symbols must not be silently skipped');
 });
 await test('pair setting, composition, readonly and code contexts remain opt-out',async()=>{
  await act(async()=>store.setState({autoCloseBrackets:false}));
  await reset('Before\n');await select('Before');await input(' ');await input('*');assert.equal(visible(),'Before *');assert.equal(document.querySelector('[data-md-inline-source]'),null);
  await act(async()=>store.setState({autoCloseBrackets:true}));
  await reset('Before\n');await select('Before');view.input.composing=true;await input('*');view.input.composing=false;
  assert.equal(visible(),'Before*');assert.equal(document.querySelector('[data-md-inline-source]'),null);
  await render(true);const original=content();const {from,to}=view.state.selection;
  assert.equal(!!view.someProp('handleTextInput',fn=>fn(view,from,to,'*',()=>view.state.tr.insertText('*'))),false);assert.equal(content(),original);await render(false);
  await reset('```text\ncode\n```\n');let pos;view.state.doc.descendants((n,p)=>{if(n.type.name==='code_block')pos=p+1;});view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,pos)));
  assert.equal(!!view.someProp('handleTextInput',fn=>fn(view,pos,pos,'*',()=>view.state.tr.insertText('*'))),false);
 });
 await test('body deletion retains generated closer and empty backspace removes it; selection wrapping remains available',async()=>{
  await reset('Before\n');await select('Before');await input(' ');await input('*');await input('x');
  await act(async()=>{const pos=view.state.selection.from;view.dispatch(view.state.tr.delete(pos-1,pos));});
  assert.equal(content(),'Before **\n');await key('Backspace');assert.equal(content(),'Before \n');assert.equal(document.querySelector('[data-md-inline-source]'),null);
  for(const marker of ['*','_','`','$','~','=','^']){
   await reset('alpha beta\n');await range('alpha beta',6,10);await input(marker);
   assert.equal(visible(),'alpha '+marker+'beta'+marker);assert.equal(view.state.doc.textBetween(view.state.selection.from,view.state.selection.to),'beta');
  }
 });
 await test('nested paragraph/table pairs preserve neighboring source through save and undo',async()=>{
  for(const original of ['> Before\n\nTail\n','- Before\n\nTail\n','| A | B |\n| --- | --- |\n| Before | keep |\n\nTail\n']) {
   await reset(original);await select('Before');await input(' ');const beforePair=content();await input('*');await input('*');await input('中文');await input('*');await input('*');
   assert.equal(content(),beforePair.replace(/Before( |&#32;)/,'Before$1**中文**'));await exactHistory(original);
  }
 });

 await test('paragraph-end source mapping retains spaces after marks and nested author spelling',async()=>{
  for(const original of ['> Before\n\nTail\n','- Before\n\nTail\n','| A | B |\n| --- | --- |\n| Before | keep |\n\nTail\n']) {
   await reset(original);await select('Before');await input('*');await input('x');await input('*');assert.equal(content(),original.replace('Before','Before*x*'));await exactHistory(original);
  }
  await reset('> **Before**\n\nTail\n');await select('Before');await key('Escape');
  // Explicitly put the caret outside the mark before adding whitespace.
  let paragraph;view.state.doc.descendants((n,p)=>{if(n.type.name==='paragraph'&&n.textContent==='Before')paragraph={n,p};});
  await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,paragraph.p+1+paragraph.n.content.size)).setStoredMarks([])));
  await input(' ');await input(' ');const before=content();await input('^');await input('x');await input('^');
  assert.equal(content(),before.replace('  ','  ^x^'));
 });

 await test('long block marker runs preserve typed characters without leftover generated closers',async()=>{
  for(const marker of ['****','*****','******','____','_____','______','````','`````','~~~','~~~~','~~~~~']) {
   await act(async()=>store.setState({autoCloseBrackets:false}));await reset('');await select('');for(const c of marker)await input(c);await input(' ');const expected={source:content(),visible:visible()};
   await act(async()=>store.setState({autoCloseBrackets:true}));await reset('');await select('');for(const c of marker)await input(c);await input(' ');
   assert.deepEqual({source:content(),visible:visible()},expected,marker);
   const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);
  }
 });
 await test('escaped generated closer remains body text and padded inline code maps outside',async()=>{
  await reset('Before\n');await select('Before');await input(' ');await input('*');await input('x');await input('\\');await input('*');
  assert.equal(content(),'Before *x\\**\n');assert.notEqual(document.querySelector('[data-md-inline-source]'),null);await input('*');assert.equal(content(),'Before *x\\**\n');
  await reset('> ` x `\n\nTail\n');await select('x');await key('Escape');
  let at;view.state.doc.descendants((n,p)=>{if(n.type.name==='paragraph'&&n.textContent==='x')at=p+1+n.content.size;});
  await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)).setStoredMarks([])));await input(' ');const before=content();
  await input('^');await input('new');await input('^');assert.equal(content(),before.replace(/ (?=\n)/,' ^new^'));
 });

 await test('empty pair deletion preserves trailing space and caret for immediate next pair and save',async()=>{
  const original='# 第二个标签\n\n独立历史。\n';await reset(original);await select('独立历史。');await input(' ');await input('^');
  assert.equal(content(),'# 第二个标签\n\n独立历史。 ^^\n');await key('Backspace');
  assert.equal(content(),'# 第二个标签\n\n独立历史。 \n');
  assert.equal(view.state.selection.$from.parent.textBetween(0,view.state.selection.$from.parentOffset),'独立历史。 ');
  for(const c of '**unfinished')await input(c);
  const expected='# 第二个标签\n\n独立历史。 **unfinished**\n';assert.equal(content(),expected);
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,expected);
  await act(async()=>app.markdownHistory());assert.equal(content(),'# 第二个标签\n\n独立历史。 \n');
  await act(async()=>app.markdownHistory(true));assert.equal(content(),expected);
  await act(async()=>root.render(null));await render();assert.equal(content(),expected);
 });
 await test('same-session flush and saves retain generated closers for continued typing',async()=>{
  // App's afterDelay timer calls saveAllDirty. Exercise that real entry after
  // 1.55s here; this component harness does not mount App's scheduling effect.
  for(const route of ['flush','manual','afterDelay-entry']) {
   await act(async()=>store.setState({autoCloseBrackets:true,formatOnSave:false,autoSave:route==='afterDelay-entry'?'afterDelay':'off'}));
   await reset('Before\n');await select('Before');for(const c of ' **word')await input(c);
   const before=app.formatPairKey.getState(view.state);assert.ok(before);assert.equal(before.width,2);
   assert.equal(content(),'Before **word**\n');
   await act(async()=>{if(route==='flush')app.flushDocument('a');else if(route==='manual')await app.saveFile();else {await pause(1550);await app.saveAllDirty();}await pause(100);});
   assert.deepEqual(app.formatPairKey.getState(view.state),before,route+' must retain generated ranges');
   assert.notEqual(document.querySelector('[data-md-inline-source]'),null,route+' retains active source');
   assert.equal(content(),'Before **word**\n');if(route!=='flush')assert.equal(writes.at(-1).content,'Before **word**\n');
   await input('*');assert.equal(content(),'Before **word**\n');await input('*');assert.equal(content(),'Before **word**\n');
   assert.equal(document.querySelector('[data-md-inline-source]'),null);await input('后');assert.equal(content(),'Before **word**后\n');
  }
 });

 await test('coalesced DOM edits skip only the generated closers and preserve exact history',async()=>{
  for(const chunks of [['*','*'],['native','*','*'],['native','*','*',' ','outside']]){
   const original='Pair testing paragraph.\n';await reset(original);await select('Pair testing paragraph.');for(const c of ' **')await input(c);
   if(chunks.length===2)await input('native');
   const observed=await domTextBatch(chunks);
   assert.equal(observed[0].text,chunks.join(''),'ProseMirror really consumed one combined DOM diff');
   assert.equal(content(),'Pair testing paragraph. **native**'+(chunks.length===5?' outside':'')+'\n');
   assert.equal(app.formatPairKey.getState(view.state),null);assert.equal(document.querySelector('[data-md-inline-source]'),null);
   // As with ordinary typing, text after a completed pair has its own undo boundary.
   await exactHistory(chunks.length===5?'Pair testing paragraph. **native**\n':original);
  }
 });
 await test('coalesced input preserves opening width and escaped closer semantics',async()=>{
  await reset('Before\n');await select('Before');await input(' ');await input('*');
  await domTextBatch(['*','word','*','*']);assert.equal(content(),'Before **word**\n');assert.equal(document.querySelector('[data-md-inline-source]'),null);
  await reset('Before\n');await select('Before');await input(' ');await input('*');
  await domTextBatch(['word','\\','*','*']);assert.equal(content(),'Before *word\\**\n');assert.equal(document.querySelector('[data-md-inline-source]'),null);
 });
 await test('composition, paste, disabled pairing and unobserved multi-character input stay literal',async()=>{
  for(const mode of ['composition','paste','disabled','unobserved']){
   await act(async()=>store.setState({autoCloseBrackets:true}));await reset('Before\n');await select('Before');for(const c of ' **native')await input(c);
   if(mode==='composition')await domTextBatch(['*','*'],{inputType:'insertCompositionText',composing:true});
   if(mode==='disabled'){await act(async()=>store.setState({autoCloseBrackets:false}));await domTextBatch(['*','*']);}
   if(mode==='unobserved')await input('**');
   if(mode==='paste')await act(async()=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?'**':''}});view.dom.dispatchEvent(event);await pause(40);assert.equal(event.defaultPrevented,true);});
   assert.equal(content(),'Before **native****\n',mode+' must not remove literal input');
  }
  await act(async()=>store.setState({autoCloseBrackets:true}));
 });

 await test('overflowed event batches fall back to complete literal input without replaying a suffix',async()=>{
  await reset('Before\n');await select('Before');for(const c of ' **native')await input(c);
  const parts=[...Array(257).fill('x'),'*','*'];
  const observed=await domTextBatch(parts);
  assert.deepEqual(observed.map(entry=>entry.text),[parts.join('')],'overflow must abandon the whole batch, not replay its final stars');
  const expected='Before **native'+'x'.repeat(257)+'****\n';assert.equal(content(),expected);
  await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,expected);
 });
 await test('coalesced marker matrix preserves closures and outside text',async()=>{
  for(const marker of ['**','__','`','$','~~','==','^']){
   await reset('Before\n');await select('Before');for(const c of ' '+marker)await input(c);await input('word');
   await domTextBatch([...marker]);assert.equal(content(),'Before '+marker+'word'+marker+'\n',marker);
   assert.equal(app.formatPairKey.getState(view.state),null,marker);await input(' outside');
   assert.equal(content(),'Before '+marker+'word'+marker+' outside\n',marker+' continuation');
  }
 });
 await test('coalesced selected body preserves history across observer delivery boundaries',async()=>{
  for(const batches of [[['next','*','*']],[['next','*'],['*']],[['next'],['*','*']]]){
   await reset('Before\n');await select('Before');for(const c of ' **word')await input(c);
   const p=app.formatPairKey.getState(view.state);await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,p.open+p.width,p.close))));
   for(const batch of batches)await domTextBatch(batch);
   assert.equal(content(),'Before **next**\n');assert.equal(app.formatPairKey.getState(view.state),null);
   await exactHistory('Before **word**\n');
  }
 });

} finally {await act(async()=>root.unmount());dom.window.close();}
assert.equal(runtimeErrors.length,0);assert.deepEqual(failedCases,[]);console.log(`Passed ${passed} formatting pair groups`);
