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
const output=path.resolve('node_modules/.cache/deditor-markdown-search-audit.mjs');
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

const input=async(index,value)=>run(()=>{const el=document.querySelectorAll('[role="search"] input:not([type="checkbox"])')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});
const searchButton=text=>{const names={'Whole word':'input[name=word]','Match case':'input[name=case]','Regex':'input[name=re]','Replace current':'button[name=replace]','Replace All':'button[name=replaceAll]'};const b=document.querySelector('[role=search] '+names[text]);assert.ok(b,text);return b;};
const count=()=>document.querySelector('[role="search"]').textContent;
const open=async()=>run(()=>app.getVisualEditor().find());
try {
await test('Reading mounts the stock CodeMirror panel with its original control structure',async()=>{
 await reset('cat cat\n');await open();
 const {EditorState}=await import('@codemirror/state'),{EditorView}=await import('@codemirror/view');
 const {search,openSearchPanel}=await import('@codemirror/search');
 const host=document.createElement('div');document.body.append(host);
 const native=new EditorView({parent:host,state:EditorState.create({extensions:[search()]})});
 try {
 openSearchPanel(native);
 const structure=el=>[...el.children].map(child=>[child.tagName,child.getAttribute('name'),child.tagName==='BUTTON'||child.tagName==='LABEL'?child.textContent:null]);
 assert.deepEqual(structure(document.querySelector('[role=search] .cm-search')),structure(host.querySelector('.cm-search')));
 assert.equal(document.querySelector('[role=search] .cm-content').getAttribute('contenteditable'),'false');
 assert.equal(document.querySelector('[role=search] .cm-scroller').style.display,'none');
 assert.equal(document.querySelector('[role=search] button[name=select]').disabled,true);
 } finally {native.destroy();host.remove();}
});
await test('Footer search keeps all highlights visible while focus stays in the input, including repeated single-match Enter',async()=>{
 const original='Start unchanged.\n\n查找目标 **alpha**\n\nMiddle\n\n查找目标 alpha\n';
 await reset(original);await open();await input(0,'查找目标');
 const field=document.querySelector('[role=search] input[name=search]'), footer=document.querySelector('.deditor-search-footer');
 assert.equal(footer.previousElementSibling.classList.contains('md-visual-layout'),true);
 assert.equal(document.activeElement,field);assert.equal(document.querySelectorAll('.preview-search-match').length,2);
 const first=view.state.selection.from;
 await run(()=>field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 assert.ok(view.state.selection.from>first);assert.equal(document.activeElement,field);
 assert.equal(document.querySelectorAll('.preview-search-match.current').length,1);
 assert.equal(document.querySelector('.preview-search-match.current').parentElement.textContent,'查找目标 alpha');
 await input(0,'Middle');
 let scrolls=0;const scroller=document.querySelector('.md-visual-scroll'), scroll=scroller.scrollTo;
 scroller.scrollTo=()=>scrolls++;
 await run(()=>field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 assert.equal(scrolls,1);scroller.scrollTo=scroll;
 await input(0,'missing');assert.equal(document.querySelectorAll('.preview-search-match').length,0);assert.equal(document.querySelector('[name=next]').disabled,true);
 await input(0,'alpha');assert.equal(document.querySelectorAll('.preview-search-match').length,2);
 await run(()=>field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
 assert.equal(document.querySelectorAll('.preview-search-match').length,0);assert.equal(document.activeElement,view.dom);assert.equal(content(),original);
});
await test('Footer replacement Enter, read-only controls and search close preserve exact undo',async()=>{
 const original='cat **cat**\n';await reset(original);await open();await input(0,'cat');await input(1,'dog');
 await run(()=>document.querySelector('[name=replace]').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
 assert.equal(content(),'dog **cat**\n');await exactHistory(original);
 await render(true);await open();assert.equal(document.querySelector('[role=search] input[name=replace]'),null);
 await input(0,'cat');assert.equal(document.querySelector('.preview-search-match.current').textContent,'cat');
 await render(false);
});
await test('Search highlights survive editor recreation on a theme change without another keypress',async()=>{
 await reset('cat **cat**\n');await open();await input(0,'cat');
 assert.equal(document.querySelectorAll('.preview-search-match').length,2);
 const outside=document.createElement('button');document.body.append(outside);outside.focus();
 await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',theme:'dark'})));await pause(120);});
 await act(async()=>pause(60));
 assert.equal(document.querySelectorAll('.preview-search-match').length,2);assert.equal(document.querySelectorAll('.preview-search-match.current').length,1);
 assert.equal(content(),'cat **cat**\n');assert.equal(document.activeElement,outside);outside.remove();
});
await test('J01 whole-word and case toggles respect Unicode letters, accents and surrogate pairs',async()=>{
 await reset('Alpha alpha ALPHA alphabet\n\ncat scatter cat_ cat-cat café CAFÉ İ 😀 é\n\n𐐀cat cat𐐀 cat😀 😀cat\n');await open();await input(0,'alpha');assert.match(count(),/1 \/ 4/);await run(()=>searchButton('Whole word').click());assert.match(count(),/1 \/ 3/);await run(()=>searchButton('Match case').click());assert.match(count(),/1 \/ 1/);assert.equal(app.getVisualEditor().selected,'alpha');
 await input(0,'cat');assert.match(count(),/1 \/ 5/);assert.equal(app.getVisualEditor().selected,'cat');
 await input(0,'café');assert.match(count(),/1 \/ 1/);await run(()=>searchButton('Match case').click());assert.match(count(),/1 \/ 2/);await input(0,'😀');assert.match(count(),/1 \/ 1/);assert.equal(app.getVisualEditor().selected,'😀');
});
await test('J01 forward/backward match navigation wraps correctly after replacement count changes',async()=>{
 await reset('cat cat cat\n');await open();await input(0,'cat');const el=document.querySelector('[role="search"] input');
 await run(()=>el.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true})));assert.match(count(),/3 \/ 3/);
 await run(()=>el.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));assert.match(count(),/1 \/ 3/);
 await input(1,'dog');await run(()=>searchButton('Replace current').click());assert.equal(content(),'dog cat cat\n');assert.match(count(),/1 \/ 2/);
 await run(()=>el.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true})));assert.match(count(),/2 \/ 2/);assert.equal(app.getVisualEditor().selected,'cat');
});
await test('J02 repeated current replacement advances when the replacement retains the query',async()=>{
 await reset('cat cat cat\n');await open();await input(0,'cat');await input(1,'cat!');await run(()=>searchButton('Replace current').click());assert.equal(content(),'cat! cat cat\n');await run(()=>searchButton('Replace current').click());assert.equal(content(),'cat! cat! cat\n');await run(()=>searchButton('Replace current').click());assert.equal(content(),'cat! cat! cat!\n');assert.match(count(),/1 \/ 3/);await exactHistory('cat! cat! cat\n');
});
await test('J02 zero-width expressions cannot mutate content, then named captures and literal dollar syntax work',async()=>{
 const original='item12 item34\n';await reset(original);await open();await run(()=>searchButton('Regex').click());await input(0,'(?=item)');assert.equal(searchButton('Replace All').disabled,true);assert.equal(content(),original);
 await input(0,'(?<name>item)(?<n>\\d+)');await input(1,'$<n>-$<name>');await run(()=>searchButton('Replace All').click());assert.equal(content(),'12-item 34-item\n');await exactHistory(original);
 await reset('cat cat\n');await open();await input(0,'cat');await input(1,'$1 **X**');await run(()=>searchButton('Replace All').click());assert.equal(view.state.doc.textContent,'$1 **X** $1 **X**');assert.equal(document.querySelectorAll('.ProseMirror strong').length,0);await exactHistory('cat cat\n');
});

await test('J02-J03 invalid regex recovery, Unicode replacement and post-close editing keep independent undo',async()=>{
 const original='İ 😀 before\n\nTarget remains.\n';await reset(original);await open();await run(()=>searchButton('Regex').click());await input(0,'[');assert.ok(document.querySelector('[role="search"] [role="alert"]:not([hidden])'));assert.equal(searchButton('Replace current').disabled,true);
 await input(0,'😀');assert.equal(!!document.querySelector('[role="search"] [role="alert"]:not([hidden])'),false);assert.equal(app.getVisualEditor().selected,'😀');await input(1,'X');await run(()=>searchButton('Replace current').click());const replaced='İ X before\n\nTarget remains.\n';assert.equal(content(),replaced);
 const field=document.querySelectorAll('[role="search"] input:not([type="checkbox"])')[1];await run(()=>{field.focus();field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));});assert.equal(!!document.querySelector('[role="search"]'),false);assert.equal(document.activeElement,view.dom);
 await run(()=>app.getVisualEditor().navigate(3,1));await run(()=>view.dispatch(view.state.tr.insertText('Z')));assert.equal(content(),'İ X before\n\nZTarget remains.\n');await exactHistory(replaced);await run(()=>app.markdownHistory());await run(()=>app.markdownHistory());assert.equal(content(),original);
});
await test('Workspace navigation selects exact UTF-16 text and centers reading content without modifying it',async()=>{
 const original='# Heading\n\n😀 prefix 定位目标 suffix\n\nLast paragraph\n';await reset(original);
 let calls=0;const scroller=document.querySelector('.md-visual-scroll');const previous=scroller.scrollTo;scroller.scrollTo=function(options){calls++;previous.call(this,options);};
 await run(()=>app.getVisualEditor().navigate(3,11,{length:4,center:true}));
 assert.equal(app.getVisualEditor().selected,'定位目标');assert.equal(document.activeElement,view.dom);assert.ok(calls>0);assert.equal(content(),original);
 await run(()=>app.getVisualEditor().navigate(999,999,{length:100,center:true}));assert.equal(content(),original);
});
await test('Workspace navigation centers the inner code match rather than the outer block and keeps source exact',async()=>{
 const original='before\n\n```js\n'+Array.from({length:60},(_,i)=>`const line${i} = "${i===44?'定位目标':'generated'}";`).join('\n')+'\n```\n\nafter\n';await reset(original);
 const scroller=document.querySelector('.md-visual-scroll'), scrolls=[];scroller.scrollTo=options=>scrolls.push(options.top);
 const oldRect=window.Range.prototype.getBoundingClientRect;
 window.Range.prototype.getBoundingClientRect=()=>({left:0,right:40,top:1200,bottom:1220,width:40,height:20});
 try {await run(()=>app.getVisualEditor().navigate(48,17,{length:4,center:true}));assert.equal(window.getSelection().toString(),'定位目标');assert.ok(scrolls.some(top=>top===1210),'Scroll uses the inner selected range, not the outer node bounds');assert.equal(content(),original);}
 finally {window.Range.prototype.getBoundingClientRect=oldRect;}
});
await test('Unmodified CodeMirror footer retains Enter/Shift+Enter, select-all, regex and replace commands',async()=>{
 await act(async()=>root.render(null));
 const {EditorState}=await import('@codemirror/state'),{EditorView,keymap}=await import('@codemirror/view');
 const {search,searchKeymap,openSearchPanel,getSearchQuery,SearchQuery,setSearchQuery}=await import('@codemirror/search');
 const host=document.createElement('div');document.body.append(host);
 const cm=new EditorView({parent:host,state:EditorState.create({doc:'cat cat item12',extensions:[search(),keymap.of(searchKeymap),EditorState.allowMultipleSelections.of(true)]})});
 try {
 openSearchPanel(cm);const panel=host.querySelector('.cm-search');assert.ok(panel.closest('.cm-panels-bottom'));
 const field=panel.querySelector('[name=search]');field.focus();field.value='cat';field.dispatchEvent(new Event('change',{bubbles:true}));
 field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));assert.equal(cm.state.selection.main.from,0);
 field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}));assert.equal(cm.state.selection.main.from,4);
 field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',keyCode:13,shiftKey:true,bubbles:true,cancelable:true}));assert.equal(cm.state.selection.main.from,0);
 assert.equal(document.activeElement,field);
 panel.querySelector('[name=select]').click();assert.equal(cm.state.selection.ranges.length,2);
 cm.dispatch({effects:setSearchQuery.of(new SearchQuery({search:'item(\\d+)',regexp:true,replace:'row$1'}))});
 assert.equal(field.value,'item(\\d+)');assert.equal(panel.querySelector('[name=re]').checked,true);
 panel.querySelector('[name=replaceAll]').click();assert.equal(cm.state.doc.toString(),'cat cat row12');
 field.value='[';field.dispatchEvent(new Event('change',{bubbles:true}));assert.equal(getSearchQuery(cm.state).valid,false);assert.equal(cm.state.doc.toString(),'cat cat row12');
 field.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(host.querySelector('.cm-search'),null);
 } finally {cm.destroy();host.remove();}
});
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} search audit groups`);
