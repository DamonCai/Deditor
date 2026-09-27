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
const output=path.resolve('node_modules/.cache/deditor-markdown-daily-clipboard-search.mjs');
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
export {writeMarkdownClipboard} from './src/lib/markdownClipboard';
export {saveFile} from './src/lib/fileio';
export {normalizeMarkdownPreferences} from './src/lib/markdownPreferences';
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
const {TextSelection,AllSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};
const input=async(text)=>{await act(async()=>{const {from,to}=view.state.selection;let handled=false;view.someProp('handleTextInput',fn=>{if(fn(view,from,to,text,()=>view.state.tr.insertText(text,from,to))){handled=true;return true;}});if(!handled)view.dispatch(view.state.tr.insertText(text,from,to));await pause(35);});};
const range=async(text,a,b)=>{let at;view.state.doc.descendants((n,p)=>{if(n.isTextblock&&n.textContent===text)at=p+1;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+a,at+b)));await pause(20);});};
const paste=async(text,html='')=>{const event=new dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(event,'clipboardData',{value:{getData:type=>type==='text/plain'?text:type==='text/html'?html:''}});await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});};
const visible=()=>view.state.doc.textBetween(0,view.state.doc.content.size,'\n','\n');
const suggestions=()=>[...document.querySelectorAll('.md-emoji-suggestions button')].map(b=>b.textContent);
// Heading IDs are generated by the display layer, not authored Markdown.
// Default table alignment and explicit left alignment are semantically equal.
// Compare persisted semantics, including all other node attributes and marks.
const semantics=()=>JSON.parse(JSON.stringify(view.state.doc.toJSON(),(key,value)=>{
 if(value?.type==='heading'&&value.attrs){const {id,...attrs}=value.attrs;return {...value,attrs};}
 if(['table_cell','table_header'].includes(value?.type)&&value.attrs)return {...value,attrs:{...value.attrs,alignment:value.attrs.alignment??'left'}};
 return value;
}));
// Exercise the editor's real copy/cut handlers; only the OS clipboard is mocked.
const copySelection=async(type='copy')=>{
 const data=new Map();
 const event=new dom.window.Event(type,{bubbles:true,cancelable:true});
 Object.defineProperty(event,'clipboardData',{value:{clearData:()=>data.clear(),setData:(kind,value)=>data.set(kind,value),getData:kind=>data.get(kind)||''}});
 await act(async()=>{view.dom.dispatchEvent(event);await pause(40);});
 assert.equal(event.defaultPrevented,true,type+' must be handled');
 assert.ok(data.has('text/plain'));assert.ok(data.has('text/html'));
 return {text:data.get('text/plain'),html:data.get('text/html')};
};
const selectDocument=async()=>{
 await act(async()=>view.focus());await key('a',{ctrlKey:true});
 assert.equal(view.state.selection.from,0,'select all starts at document boundary');
 assert.equal(view.state.selection.to,view.state.doc.content.size,'select all includes final block');
};
const selectClipboardDocument=async()=>act(async()=>{
 view.focus();view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
});
const run=async(fn)=>act(async()=>{fn();await pause(45);});
const searchInput=async(name,value)=>run(()=>{
 const field=document.querySelector(`[role=search] input[name=${name}]`);assert.ok(field,name);
 Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);
 field.dispatchEvent(new Event('input',{bubbles:true}));
});
const searchKey=async(name,modifiers={})=>run(()=>{
 const field=document.querySelector('[role=search] input[name=search]');assert.ok(field);field.focus();
 field.dispatchEvent(new window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers}));
});
const searchClick=async(name)=>run(()=>{const b=document.querySelector(`[role=search] button[name=${name}]`);assert.ok(b,name);b.click();});
const openSearch=async(mod={ctrlKey:true},replace=false)=>{
 assert.equal((await key('f',{...mod,altKey:replace})).defaultPrevented,true);
 assert.ok(document.querySelector('[role=search]'));
};
const undo=async(mod={ctrlKey:true})=>{await key('z',mod);};
const redo=async(mod={ctrlKey:true})=>{await key('z',{...mod,shiftKey:true});};
const assertSaved=async(expected)=>{assert.equal(content(),expected);await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,expected);};
try {
await test('DAILY01 mixed inline cut, keyboard undo/redo, fresh input and save keep exact source',async()=>{
 for(const mod of [{ctrlKey:true},{metaKey:true}]){
  const original='prefix **a_b** and `c_d` suffix\n';await reset(original);await range('prefix a_b and c_d suffix',7,18);
  const copied=await copySelection('cut');assert.equal(copied.text,'a_b and c_d');assert.match(copied.html,/<strong>a_b<\/strong>/);assert.match(copied.html,/<code>c_d<\/code>/);
  assert.equal(content(),'prefix  suffix\n');await undo(mod);assert.equal(content(),original);await redo(mod);assert.equal(content(),'prefix  suffix\n');
  await input('新😀');await assertSaved('prefix 新😀 suffix\n');await undo(mod);assert.equal(content(),'prefix  suffix\n');await undo(mod);assert.equal(content(),original);
 }
});
await test('DAILY02 cross paragraph/list range rich copy and literal shortcut copy agree then rich paste preserves marks',async()=>{
 const original='before **bold**\n\n- first\n- second `code`\n\nafter\n';await reset(original);
 let from,to;view.state.doc.descendants((n,p)=>{if(n.isTextblock&&n.textContent==='before bold')from=p+1+7;if(n.isTextblock&&n.textContent==='second code')to=p+1+11;});
 await run(()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,from,to)));});
 const copied=await copySelection();assert.equal(copied.text,'bold\nfirst\nsecond code');assert.equal(content(),original);
 const plain=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async t=>plain.push(t)}});
 await key('c',{ctrlKey:true,shiftKey:true});assert.deepEqual(plain,[copied.text]);
 await reset('');await paste(copied.text,copied.html);assert.equal(visible(),copied.text);assert.equal(view.dom.querySelector('strong').textContent,'bold');assert.equal(view.dom.querySelector('code').textContent,'code');assert.equal(view.dom.querySelectorAll('li').length,2);
 const rich=content();await undo();assert.equal(content(),'');await redo();assert.equal(content(),rich);await assertSaved(rich);
});
await test('DAILY03 ordinary Markdown paste formats, Shift V stays literal, each has exact undo and followup edit',async()=>{
 for(const mod of [{ctrlKey:true},{metaKey:true}]){
  await reset('target\n');await range('target',0,6);await paste('**bold** and `code`');await key('Escape');assert.equal(view.dom.querySelector('strong').textContent,'bold');assert.equal(view.dom.querySelector('code').textContent,'code');
  await undo(mod);assert.equal(content(),'target\n');await range('target',0,6);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>'**bold** and `code`'}});await key('v',{...mod,shiftKey:true});
  assert.equal(visible(),'**bold** and `code`');assert.equal(view.dom.querySelector('strong,code'),null);const literal=content();
  await input('!');assert.equal(visible(),'**bold** and `code`!');await undo(mod);assert.equal(content(),literal);await undo(mod);assert.equal(content(),'target\n');
 }
});
await test('DAILY04 table rectangle cut clears only selected cells, keyboard undo/redo and plain paste stay in cells',async()=>{
 const {CellSelection,TableMap}=await import('@milkdown/kit/prose/tables');
 const original='before\n\n| A | B |\n| --- | --- |\n| **one** | two |\n| three | four |\n\nafter\n';await reset(original);
 let table,pos;view.state.doc.descendants((n,p)=>{if(n.type.name==='table'){table=n;pos=p;}});const map=TableMap.get(table);
 await run(()=>{view.focus();view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,pos+1+map.map[2],pos+1+map.map[4])));});
 const copied=await copySelection('cut');assert.equal(copied.text,'one\nthree');assert.equal(view.dom.querySelectorAll('tbody[data-content-dom]').length,1);assert.equal(view.dom.querySelectorAll('tbody[data-content-dom] td')[0].textContent,'');assert.equal(view.dom.querySelectorAll('tbody[data-content-dom] td')[2].textContent,'');assert.equal(view.dom.querySelectorAll('tbody[data-content-dom] td')[1].textContent,'two');
 const cut=content();await undo();assert.equal(content(),original);await redo();assert.equal(content(),cut);
 await select('two',0);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{readText:async()=>'x\ty\nz'}});await key('v',{ctrlKey:true,shiftKey:true});
 assert.equal(view.dom.querySelectorAll('tbody[data-content-dom]').length,1);assert.equal(view.dom.querySelectorAll('tbody[data-content-dom] td').length,4);assert.equal(view.dom.querySelectorAll('tbody[data-content-dom] td')[1].textContent,'x\tyztwo');assert.ok(visible().includes('x\ty\nz'));await undo();assert.equal(content(),cut);
});
await test('DAILY05 search Escape returns to selected hit and immediate typing replaces that hit only',async()=>{
 for(const mod of [{ctrlKey:true},{metaKey:true}]){
  const original='alpha start\n\nother alpha end\n';await reset(original);await select('other alpha end');await openSearch(mod);await searchInput('search','alpha');await searchKey('Enter');
  assert.equal(app.getVisualEditor().selected,'alpha');await searchKey('Escape');assert.equal(document.querySelector('[role=search]'),null);assert.equal(document.activeElement,view.dom);
  await input('新😀');await assertSaved('alpha start\n\nother 新😀 end\n');await undo(mod);assert.equal(content(),original);await redo(mod);assert.equal(content(),'alpha start\n\nother 新😀 end\n');
 }
});
await test('DAILY06 search miss and invalid regex Escape retain prior caret for immediate typing',async()=>{
 for(const invalid of [false,true]){
  await reset('before target after\n');await select('before target after',7);await openSearch();
  if(invalid)await run(()=>document.querySelector('[role=search] input[name=re]').click());
  await searchInput('search',invalid?'[':'missing');await searchKey('Escape');assert.equal(document.activeElement,view.dom);await input('X');await assertSaved('before Xtarget after\n');await undo();assert.equal(content(),'before target after\n');
 }
});
await test('DAILY07 replace-all preserves each mixed inline style and exact undo after Escape then input',async()=>{
 const original='plain cat **cat** *cat* `cat` [cat](https://example.com)\n';await reset(original);await openSearch({ctrlKey:true},true);assert.equal(document.activeElement.getAttribute('name'),'replace');
 await searchInput('search','cat');await searchInput('replace','dog');await searchClick('replaceAll');
 assert.equal(content(),'plain dog **dog** *dog* `dog` [dog](https://example.com)\n');assert.equal(view.dom.querySelector('strong').textContent,'dog');assert.equal(view.dom.querySelector('em').textContent,'dog');assert.equal(view.dom.querySelector('code').textContent,'dog');assert.equal(view.dom.querySelector('a').textContent,'dog');
 await searchKey('Escape');await select('plain dog dog dog dog dog');await input('!');await undo();assert.equal(content(),'plain dog **dog** *dog* `dog` [dog](https://example.com)\n');await undo();assert.equal(content(),original);
});
await test('DAILY08 replace all spans prose, task list and table without changing their structure',async()=>{
 const original='cat\n\n- [ ] cat\n- cat\n\n| cat | B |\n| --- | --- |\n| cat | cat |\n';await reset(original);await openSearch();await searchInput('search','cat');assert.equal(document.querySelectorAll('.preview-search-match').length,6);await searchInput('replace','dog');await searchClick('replaceAll');
 assert.equal(content(),original.replaceAll('cat','dog'));assert.equal(view.dom.querySelectorAll('tbody[data-content-dom]').length,1);assert.equal(view.dom.querySelectorAll('li').length,2);assert.equal(view.dom.querySelectorAll('[role=checkbox]').length,1);
 await searchKey('Escape');await undo();assert.equal(content(),original);await redo();assert.equal(content(),original.replaceAll('cat','dog'));await assertSaved(content());
});
await test('DAILY09 search fields own typing and clipboard shortcuts; composing find is ignored',async()=>{
 await reset('alpha\n');await select('alpha',2);let writes=0,reads=0;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>writes++,readText:async()=>{reads++;return 'BAD';}}});
 assert.equal((await key('f',{ctrlKey:true,isComposing:true})).defaultPrevented,false);assert.equal(document.querySelector('[role=search]'),null);
 await openSearch();await searchInput('search','zzz');await searchKey('c',{ctrlKey:true,shiftKey:true});await searchKey('v',{ctrlKey:true,shiftKey:true});assert.equal(writes,0);assert.equal(reads,0);assert.equal(content(),'alpha\n');
 await searchKey('Escape');await input('X');assert.equal(content(),'alXpha\n');
});
await test('DAILY10 replace-current takes matched character marks at starts, middles and adjacent mark boundaries',async()=>{
 const cases=[
  ['before **cat** after\n','cat','dog','before **dog** after\n'],
  ['before **cats** after\n','at','oo','before **coos** after\n'],
  ['**prefix**cat after\n','cat','dog','**prefix**dog after\n'],
  ['before **cat**s after\n','cats','dog','before **dog** after\n'],
  ['before [cat](https://example.com "title") after\n','cat','dog','before [dog](https://example.com "title") after\n'],
  ['before ~~cat~~ ==cat==\n','cat','dog','before ~~dog~~ ==cat==\n'],
 ];
 for(const [original,query,replacement,expected] of cases){
  await reset(original);await openSearch({metaKey:true},true);await searchInput('search',query);await searchInput('replace',replacement);await searchClick('replace');await assertSaved(expected);await searchKey('Escape');await undo({metaKey:true});assert.equal(content(),original);await redo({metaKey:true});assert.equal(content(),expected);
 }
});
await test('DAILY11 regex capture replacement preserves marked source and literal replacement punctuation',async()=>{
 const original='row **item12** and [item34](https://example.com)\n';await reset(original);await openSearch();await run(()=>document.querySelector('[role=search] input[name=re]').click());await searchInput('search','item(\\d+)');await searchInput('replace','$1-$&');await searchClick('replaceAll');await assertSaved('row **12-item12** and [34-item34](https://example.com)\n');await searchKey('Escape');await undo();assert.equal(content(),original);
 await openSearch();await searchInput('search','item(\\d+)');await searchInput('replace','**$1**');await searchClick('replaceAll');assert.equal(view.dom.querySelector('strong').textContent,'**12**');assert.equal(view.dom.querySelector('a').textContent,'**34**');const edited=content();await searchKey('Escape');await undo();assert.equal(content(),original);await redo();assert.equal(content(),edited);
});
await test('DAILY12 replacing the final match with empty text keeps Escape and subsequent input recoverable',async()=>{
 const original='prefix cat suffix\n';await reset(original);await openSearch();await searchInput('search','cat');await searchInput('replace','');await searchClick('replace');assert.equal(content(),'prefix  suffix\n');assert.equal(document.activeElement.getAttribute('name'),'search');await searchKey('Escape');await input('dog');await assertSaved('prefix dog suffix\n');await undo();assert.equal(content(),'prefix  suffix\n');await undo();assert.equal(content(),original);
});
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);assert.deepEqual(failedCases,[]);console.log(`Passed ${passed} daily clipboard/search workflows`);
