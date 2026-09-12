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
const output=path.resolve('node_modules/.cache/deditor-markdown-image-audit.mjs');
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
export {rewriteMarkdownImageUrls,rebaseMarkdownImages} from './src/lib/markdownImagePaths';
export {collectMarkdownImages} from './src/lib/markdownImageCollect';
export {documentImageDirectory,resolveMarkdownImage,documentImageRoot} from './src/lib/markdownImageSettings';
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
try {
 await test('H01 width inputs display committed clamp after change and blur',async()=>{
  for(const [value,expected] of [['0','1'],['10001','10000'],['2.7','3'],['','']]) {
   const original='Before\n\n![alt](assets/a.svg "title")\n\nTail\n';await reset(original);const input=document.querySelector('.md-image-width input');assert.ok(input);await act(async()=>{input.focus();input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();await pause(30);});assert.equal(input.value,expected,'input '+value);if(expected)assert.ok(content().includes('width="'+expected+'"'));else assert.equal(content(),original);if(expected)await exactHistory(original);
  }
 });
 await test('H02 escaped image labels only rewrite the destination',async()=>{
  for(const source of ['![a \\](b](old.png "title")\n','![a \\](b][pic]\n\n[pic]: old.png "title"\n','![normal](old.png "title")\n','![outer [inner](label)](old.png "title")\n']) {
   assert.equal(app.rewriteMarkdownImageUrls(source,url=>url==='old.png'?'new.png':url),source.replace('old.png','new.png'));
  }
 });
 await test('H03 collection deduplicates aliases, preserves escaped labels and failures with exact undo',async()=>{
  const original='![a \\](b](old.png "title") ![second](./old.png#part) ![missing](missing.png)\n\n`![code](old.png)`\n';await reset(original);const previous=globalThis.mdInvoke,reads=[],copies=[];
  globalThis.mdInvoke=async(command,args)=>{if(command==='read_binary_as_base64'){reads.push(args.path);if(args.path.endsWith('missing.png'))throw Error('missing');return 'PHN2Zy8+';}if(command==='save_image'){copies.push(args);return '/generated/'+args.folder+'/'+args.name;}return previous(command,args);};
  try {let result;await act(async()=>{result=await app.collectMarkdownImages('a');});assert.equal(result.copied,1);assert.equal(result.failures.length,1);assert.equal(reads.length,2);assert.equal(copies.length,1);assert.ok(content().includes('![a \\](b](assets/'));assert.ok(content().includes('#part)'));assert.ok(content().includes('![missing](missing.png)'));assert.ok(content().includes('`![code](old.png)`'));await exactHistory(original);}finally{globalThis.mdInvoke=previous;}
 });
 await test('H04 cancelled download keeps completed image, concurrent prose, and one-step image undo',async()=>{
  const original='![one](https://fixture.test/one) ![two](https://fixture.test/two)\n\nOriginal\n';await reset(original);const previous=globalThis.mdInvoke;let stop=false,downloads=0;const concurrent=original.replace('Original','Concurrent');
  globalThis.mdInvoke=async(command,args)=>{if(command==='download_markdown_image'){downloads++;await assert.rejects(app.collectMarkdownImages('a',{kind:'download'}),/already running/);store.getState().setContent(concurrent,'a','command');stop=true;return {data:'PHN2Zy8+',extension:'svg'};}if(command==='save_image')return '/generated/'+args.folder+'/'+args.name;return previous(command,args);};
  try{let result;await act(async()=>{result=await app.collectMarkdownImages('a',{kind:'download'},()=>stop);});assert.equal(downloads,1);assert.equal(result.copied,1);assert.equal(result.stopped,true);assert.ok(content().includes('Concurrent'));assert.ok(content().includes('![two](https://fixture.test/two)'));await act(async()=>app.markdownHistory());assert.equal(content(),concurrent);}finally{globalThis.mdInvoke=previous;}
 });
 await test('H04 failed upload/download leaves references and history unchanged',async()=>{
  const original='![local](old.png) ![web](https://fixture.test/one)\n';await reset(original);const previous=globalThis.mdInvoke;let saved=0;
  globalThis.mdInvoke=async(command,args)=>{if(command==='upload_markdown_image')return 'javascript:alert(1)';if(command==='download_markdown_image')return {data:'bad',extension:'../bad'};if(command==='save_image')saved++;return previous(command,args);};
  try{for(const op of [{kind:'upload',endpoint:'http://127.0.0.1:36677/upload'},{kind:'download'}]){let result;await act(async()=>{result=await app.collectMarkdownImages('a',op);});assert.equal(result.copied,0);assert.equal(result.failures.length,1);assert.equal(content(),original);}assert.equal(saved,0);}finally{globalThis.mdInvoke=previous;}
 });
 await test('H02/H03 path roots and rebasing preserve decoded targets and authored labels',async()=>{
  for(const [url,file,root,expected] of [['中文%20a%23.svg','/docs/a.md',null,'/docs/中文 a#.svg'],['/image.svg','/docs/a.md','/site','/site/image.svg'],['file:///tmp/a%23.svg','/docs/a.md','/site','/tmp/a#.svg'],['a.svg','C:\\docs\\a.md',null,'C:\\docs\\a.svg']])assert.equal(app.resolveMarkdownImage(url,file,root),expected);
  const source='![a \\](b](old.png "title")\n';assert.equal(app.rebaseMarkdownImages(source,'/docs/a.md','/other/b.md'),'![a \\](b](../docs/old.png "title")\n');
 });
 await test('H01 alt, title and width edit independently with special characters and exact history',async()=>{
  for(const original of ['Before\n\n![old alt](assets/a.svg "old title")\n\nTail\n','Before\n\n<img src="assets/a.svg" alt="old alt" width="320" title="old title">\n\nTail\n']) {
   await reset(original);const alt=document.querySelector('.md-image-alt input');assert.ok(alt);const nextAlt='中文 < & " \\ ]( alternative';await act(async()=>{alt.focus();alt.value=nextAlt;alt.dispatchEvent(new Event('change',{bubbles:true}));alt.blur();await pause(30);});let image;view.state.doc.descendants(n=>{if(n.type.name==='image-block')image=n;});assert.equal(image.attrs.alt,nextAlt);assert.equal(image.attrs.caption,'old title');assert.equal(document.querySelector('.md-persisted-image img').alt,nextAlt);assert.equal(image.attrs.width,original.includes('width')?320:null);assert.ok(content().endsWith('\n\nTail\n'));await exactHistory(original);assert.equal(document.querySelector('.md-image-alt input').value,nextAlt);
   await reset(original);const caption=document.querySelector('.caption-input');assert.ok(caption);await act(async()=>{caption.focus();caption.value='changed title & "';caption.dispatchEvent(new Event('input',{bubbles:true}));caption.blur();await pause(40);});view.state.doc.descendants(n=>{if(n.type.name==='image-block')image=n;});assert.equal(image.attrs.caption,'changed title & "');assert.equal(document.querySelector('.md-persisted-image img').alt,'old alt');assert.equal(image.attrs.alt,'old alt');assert.equal(image.attrs.width,original.includes('width')?320:null);await exactHistory(original);
  }
 });
 assert.equal(runtimeErrors.length,0);console.log(`${passed} image audit groups passed`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));window.close();}
