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
const output=path.resolve('node_modules/.cache/deditor-markdown-format-links-audit.mjs');
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
try {
await test('D01 outdent: only the selected continuation leaves lists or quotes',async()=>{
 for(const marker of ['*','1.','- [ ]','- [x]'])for(const heading of ['', '## ']){
  const indent=marker.startsWith('1.')?'   ':'  ';
  const original=`Before\n\n${marker} keep\n\n${indent}${heading}target\n\n${indent}following\n\nAfter\n`;
  await reset(original);await select('target');
  await run(()=>button('Decrease indent').click());
  let targetDepth,keepDepth,followingDepth;
  view.state.doc.descendants((n,p)=>{if(!n.isTextblock)return;const depth=view.state.doc.resolve(p+1).depth;if(n.textContent==='target')targetDepth=depth;if(n.textContent==='keep')keepDepth=depth;if(n.textContent==='following')followingDepth=depth;});
  assert.equal(targetDepth,1,marker+' target moved to document');assert.ok(keepDepth>1,marker+' previous paragraph remains in list');assert.ok(followingDepth>1,marker+' following paragraph remains in list');
  assert.equal(view.state.selection.$from.parent.type.name,heading?'heading':'paragraph');
  await exactHistory(original);
 }
});
await test('D01 outdent: nested quotes/lists, heading Backspace and table boundaries',async()=>{
 for(const original of ['> keep\n>\n> ## target\n>\n> following\n','> > keep\n> >\n> > ## target\n','* outer\n  * keep\n\n    ## target\n']){
  await reset(original);await select('target');let count=0;
  while(view.state.selection.$from.depth>1 && count++<5){const before=content();await key('Tab',{shiftKey:true});await exactHistory(before);await act(async()=>pause(100));await select('target');}
  assert.equal(view.state.selection.$from.depth,1);assert.equal(view.state.selection.$from.parent.type.name,'heading',JSON.stringify({original,content:content(),doc:view.state.doc.toJSON()}));assert.ok(view.state.doc.textContent.includes('keep'));
 }
 const original='* keep\n\n  ## target\n';await reset(original);await select('target',0);await key('Backspace');assert.equal(view.state.selection.$from.depth,1);assert.equal(view.state.selection.$from.parent.type.name,'heading');await exactHistory(original);
 const table='| A | B |\n| --- | --- |\n| target | other |\n';await reset(table);await select('target');await run(()=>button('Decrease indent').click());assert.equal(content(),table);
});
await test('D01 toolbar: paragraph and all heading levels roundtrip and undo',async()=>{
 for(let n=1;n<=6;n++){
 const original='Before\n\nHeading\n\nTail\n';await reset(original);await select('Heading');
 const dropdown=document.querySelector('.md-heading-select');
 await run(()=>{dropdown.value=String(n);dropdown.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(document.querySelector('.ProseMirror h'+n)?.textContent,'Heading');await exactHistory(original);
 await select('Heading');await run(()=>app.getVisualEditor().prefix(''));assert.equal(content(),original);
 }
});
await test('D02-D03 toolbar: selected marks toggle on/off and exact undo',async()=>{
 for(const [label,mark] of [['Bold','strong'],['Italic','emphasis'],['Strikethrough','strike_through'],['Inline code','inlineCode'],['Underline','deditor_underline'],['Superscript','deditor_sup'],['Subscript','deditor_sub']]){
 const original='Before\n\nalpha word omega\n\nTail\n';await reset(original);await range('alpha word omega',6,10);
 await run(()=>button(label).click());assert.ok(view.state.doc.rangeHasMark(14,18,view.state.schema.marks[mark]),label+' applied');
 await exactHistory(original);await range('alpha word omega',6,10);await run(()=>button(label).click());assert.equal(content(),original,label+' removed');
 }
});
await test('D02-D03 empty caret: stored marks apply to input and can be switched off',async()=>{
 for(const marker of ['**','*','~~','`','<u>','<sup>','<sub>']){
 const original='alpha omega\n';await reset(original);await select('alpha omega',6);await run(()=>app.getVisualEditor().wrap(marker,marker));await run(()=>view.dispatch(view.state.tr.insertText('word')));assert.notEqual(content(),original);await run(()=>{const pos=view.state.selection.$head.start()+view.state.selection.$head.parent.textContent.indexOf('word')+4;view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,pos)));});assert.ok(app.getVisualEditor().marked(marker),JSON.stringify({marker,source:content(),selection:view.state.selection.toJSON(),parent:view.state.selection.$head.parent.toJSON(),offset:view.state.selection.$head.parentOffset})); 
 await run(()=>app.getVisualEditor().wrap(marker,marker));assert.equal(app.getVisualEditor().marked(marker),false,marker+' off');
 }
});
await test('D03 color: replacing color and mixed selected marks preserve unaffected content',async()=>{
 await reset('alpha word omega\n');await range('alpha word omega',6,10);await run(()=>app.getVisualEditor().color('color','#ff0000'));assert.match(content(),/color:#ff0000/);
 await run(()=>app.getVisualEditor().color('color','#0000ff'));assert.match(content(),/color:#0000ff/);assert.ok(!content().includes('#ff0000'));await run(()=>app.getVisualEditor().color('background','#ffff00'));assert.match(content(),/background/);assert.ok(content().startsWith('alpha '));assert.ok(content().endsWith(' omega\n'));
});
await test('D04 inline source: escape, enter and tab leave a stable selection and preserve text',async()=>{
 for(const exit of ['Escape','Enter','Tab']){
 const original='Before **bold** after.\n\nTail\n';await reset(original);await run(()=>app.getVisualEditor().navigate(1,11));assert.ok(document.querySelector('[data-md-inline-source]'));
 await key(exit);if(exit==='Escape')assert.equal(!!document.querySelector('[data-md-inline-source]'),false,exit);assert.ok(view.state.doc.textContent.replaceAll('**','').replaceAll(' ','').includes('bold'));assert.ok(content().endsWith('Tail\n'));if(exit==='Escape')assert.equal(content(),original);
 }
});
await test('G01 links: selected insertion, changed target rejection and undo',async()=>{
 const original='alpha label omega\n';await reset(original);await range('alpha label omega',6,11);await run(()=>app.getVisualEditor().link('https://example.com/a','label'));assert.equal(content(),'alpha [label](https://example.com/a) omega\n');await exactHistory(original);
 await range('alpha label omega',6,11);const captured=app.getVisualEditor().capture();await run(()=>view.dispatch(view.state.tr.insertText('changed')));let called=false;assert.equal(captured.apply(()=>called=true),false);assert.equal(called,false);
});
await test('G02 links: ordinary click edits; modifier clicks navigate document anchors safely',async()=>{
 const original='# Destination\n\n[Jump](#destination) [Malformed](#%broken)\n';await reset(original);let jumps=0;const heading=document.querySelector('.ProseMirror h1');heading.scrollIntoView=()=>jumps++;
 let link=document.querySelector('.ProseMirror a');await run(()=>link.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));assert.equal(jumps,0);
 await run(()=>link.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,metaKey:true})));assert.equal(jumps,1);await run(()=>document.querySelectorAll('.ProseMirror a')[1].dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true})));assert.equal(content(),original);
});
await test('G02a file links: preview renders filename links and keeps unsafe protocols rejected',async()=>{
 const original='[中文 文件.md](file:///generated/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.md) [引用][f] <file:///generated/auto.md>\n\n[f]: file:///generated/ref.md\n';
 const html=await app.renderMarkdown(original,{theme:'light'}), box=document.createElement('div');box.innerHTML=app.markdownDisplayHtml(html);
 assert.deepEqual([...box.querySelectorAll('a')].map(a=>a.textContent),['中文 文件.md','引用','file:///generated/auto.md']);
 assert.equal(box.querySelector('a').getAttribute('href'),'file:///generated/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.md');
 box.innerHTML=await app.renderMarkdown('[bad](javascript:alert%281%29) [data](data:text/html,bad)',{theme:'light'});assert.equal(box.querySelectorAll('a').length,0);
});
await test('G02a preview click: sanitized local links open a DEditor tab',async()=>{
 const original='[预览文件](file:///generated/preview%20file.md)\n';await reset(original);await act(async()=>root.render(null));
 await act(async()=>{root.render(React.createElement(app.Preview,{tabId:'a',active:true,theme:'light'}));});
 await act(async()=>pause(150));const link=document.querySelector('.preview a');assert.equal(link.textContent,'预览文件');const event=new window.MouseEvent('click',{bubbles:true,cancelable:true});await run(()=>link.dispatchEvent(event));
 assert.equal(event.defaultPrevented,true);assert.equal(reads.at(-1),'/generated/preview file.md');assert.equal(store.getState().tabs.find(t=>t.id===store.getState().activeId).filePath,'/generated/preview file.md');assert.equal(content(),original);await run(()=>store.setState({activeId:'a'}));
 const box=document.createElement('div');box.innerHTML=app.markdownDisplayHtml('<a href="javascript:alert(1)">bad</a><iframe src="file:///private/test"></iframe>');assert.equal(box.querySelector('a').getAttribute('href'),null);assert.equal(box.querySelector('iframe'),null);
});
await test('G02b file links: reading modifier click opens decoded file in DEditor and preserves source',async()=>{
 const original='[本地文件](file:///generated/click%20%23%2520.md) [bad](javascript:alert%281%29)\n';await reset(original);
 const link=document.querySelector('.ProseMirror a');assert.equal(link.getAttribute('href'),'file:///generated/click%20%23%2520.md');
 const before=externalLinks.length;await run(()=>link.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true,metaKey:true})));
 assert.equal(reads.at(-1),'/generated/click #%20.md');assert.equal(store.getState().tabs.find(t=>t.id===store.getState().activeId).filePath,'/generated/click #%20.md');
 assert.equal(externalLinks.length,before);assert.equal(content(),original);assert.equal(document.querySelectorAll('.ProseMirror a')[1].getAttribute('href'),'');
 await run(()=>store.setState({activeId:'a'}));
});
await test('G02c file links: actual link popup routes local files internally and HTTPS externally',async()=>{
 for(const [href,expected] of [['file:///generated/popup%20file.md','/generated/popup file.md'],['/generated/absolute%20file.md','/generated/absolute file.md'],['./near.md','/generated/near.md'],['../parent.md','/parent.md'],['https://example.test/docs',null]]){
  const original='前文\n\n[打开链接]('+href+')\n';await reset(original);await select('前文',1);const link=document.querySelector('.ProseMirror a');
  let at;view.state.doc.descendants((n,pos)=>{if(n.isText&&n.marks.some(m=>m.type.name==='link'))at=pos;});const oldCoords=view.posAtCoords;view.posAtCoords=()=>({pos:at,inside:at-1});
  await act(async()=>{view.focus();link.dispatchEvent(new window.MouseEvent('mousemove',{bubbles:true,clientX:1,clientY:1}));await pause(140);});
  view.posAtCoords=oldCoords;const popup=document.querySelector('.milkdown-link-preview a.link-display');assert.equal(popup.textContent,href);
  const e=new window.MouseEvent('click',{bubbles:true,cancelable:true});await run(()=>popup.dispatchEvent(e));assert.equal(e.defaultPrevented,true);
  if(expected){assert.equal(reads.at(-1),expected);assert.equal(store.getState().tabs.find(t=>t.id===store.getState().activeId).filePath,expected);}
  else assert.equal(externalLinks.at(-1),href);
  assert.equal(content(),original);await run(()=>store.setState({activeId:'a'}));
 }
});
await test('G03-G04 footnote: repeated reference, rich popup Tab/Escape and return focus',async()=>{
 const original='Text[^note] repeated[^note].\n\n[^note]: **Rich** and `code`.\n\n    second paragraph\n';await reset(original);assert.equal(document.querySelectorAll('.ProseMirror .footnote-ref').length,2);
 const link=document.querySelector('.ProseMirror .footnote-ref a');await run(()=>link.focus());assert.ok(document.querySelector('.md-footnote-preview strong'));assert.ok(document.querySelector('.md-footnote-preview code'));
 await run(()=>link.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));assert.ok(document.activeElement.closest('.md-footnote-preview'));
 await run(()=>document.activeElement.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));assert.equal(!!document.querySelector('.md-footnote-preview'),false);assert.equal(document.activeElement,link);assert.equal(content(),original);
});

await test('D05 shorthand: editable mark/sub/sup/emoji keep escaped and code text literal',async()=>{
 const original='alpha ==highlight== H~2~O x^2^ :smile: omega\n\n`==literal== :smile:` and \\==escaped\\==\n';await reset(original);
 assert.ok(document.querySelector('.ProseMirror mark'));assert.ok(document.querySelector('.ProseMirror sub'));assert.ok(document.querySelector('.ProseMirror sup'));assert.ok(document.querySelector('[data-md-emoji="smile"]'));assert.equal(document.querySelector('.ProseMirror code').textContent,'==literal== :smile:');
 await run(()=>app.getVisualEditor().navigate(1,11));const raw=document.querySelector('[data-md-inline-source]');assert.ok(raw);await run(()=>{raw.firstChild.textContent='==changed==';document.getSelection().collapse(raw.firstChild,5);raw.dispatchEvent(new Event('input',{bubbles:true}));});await key('Escape');assert.equal(content(),original.replace('highlight','changed'));await exactHistory(original);
});
await test('G04 footnotes: edit definition, undo and remove one repeated reference',async()=>{
 const original='Text[^n] repeated[^n].\n\n[^n]: note body\n';await reset(original);await select('note body',4);await run(()=>view.dispatch(view.state.tr.insertText(' new')));assert.match(content(),/note new body/);await exactHistory(original);
 await reset(original);let pos;view.state.doc.descendants((node,at)=>{if(pos===undefined && node.type.name==='footnote_reference')pos=at;});assert.notEqual(pos,undefined);await run(()=>view.dispatch(view.state.tr.delete(pos,pos+1)));assert.equal(document.querySelectorAll('.ProseMirror .footnote-ref').length,1);assert.match(content(),/\[\^n\]: note body/);await exactHistory(original);
});
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} format/link audit groups`);
