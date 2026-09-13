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
const output=path.resolve('node_modules/.cache/deditor-split-right.mjs');
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
export {sampleArchive} from './tests/fixtures/xmind';
export {openDocument} from './src/lib/xmind/document';
export {default as Groups} from './src/components/EditorGroups';
export {getActiveView} from './src/lib/editorBridge';
export {openEditorSearch} from './src/lib/editorSearch';
export {textHistory} from './src/lib/textHistory';
export {closeTabById} from './src/lib/fileio';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {setVisualEditor} from './src/lib/markdownVisualBridge';
export {setActiveView} from './src/lib/editorBridge';
export {default as HistoryDialog} from './src/components/MarkdownHistoryDialog';
export {default as VisualSlot} from './src/components/MarkdownVisualSlot';
export {default as VisualHost} from './src/components/MarkdownVisualHost';
export {markdownSession} from './src/lib/markdownSession';
export {flushDocument} from './src/lib/documentFlush';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.split('?')[0].endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let created=0,creationGate;const views=[];
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{views.push(ctx.get(editorViewCtx));created++;});if(creationGate)await creationGate;return result;};return editor;};
const {EditorView}=await import('@codemirror/view');
const tab=(id,content=`# ${id} 中文😀\n\n正文 alpha **bold** beta\n\n末段内容\n`,ext='md')=>({id,filePath:`/generated/${id}.${ext}`,content,savedContent:content});
let passed=0;
const pass=name=>{passed++;console.log('PASS '+name);};
const text=id=>store.getState().tabs.find(t=>t.id===id)?.content;
const pane=id=>document.querySelector(`[data-editor-pane="${id}"]`);
const cm=id=>{const dom=[...pane(id).querySelectorAll('.cm-editor')].find(el=>!el.closest('[style*="display: none"]'));return dom&&EditorView.findFromDOM(dom);};
const pm=id=>views.find(v=>!v.isDestroyed&&v.dom.closest(`[data-editor-pane="${id}"]`)&&!v.dom.closest('[aria-hidden="true"]'));
async function ready(predicate){for(let i=0;i<300;i++){await act(async()=>pause(10));if(predicate())return;}throw Error('Timed out waiting for editor');}
async function setup(tabs,mode='source'){
 await act(async()=>root.render(null));
 await act(async()=>{store.setState({panes:null,activePane:'left',splitEditor:false,tabs,activeId:tabs[0].id,language:'en',markdownMode:mode,autoSave:'off',showPreview:false});root.render(React.createElement(app.Groups,{initialPreviewPct:50}));});
 await ready(()=>tabs[0].filePath.endsWith('.xmind')?pane('left').querySelector('.xm-svg'):mode==='visual'?pm('left')&&app.getVisualEditor()?.tabId===tabs[0].id:cm('left'));
}
async function split(id){await act(async()=>store.getState().splitRight(id));await ready(()=>pane('right')&&(pane('right').querySelector('.xm-svg')|| (store.getState().markdownMode==='visual'?pm('right'):cm('right'))));}
async function focus(id){await act(async()=>{pane(id).dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true,button:0}));});await act(async()=>pause(10));}
async function typeSource(id,word){await focus(id);const view=cm(id);await act(async()=>{view.focus();view.dispatch({changes:{from:view.state.doc.length,insert:word},selection:{anchor:view.state.doc.length+word.length},userEvent:'input.type'});});}
try {
 await setup([tab('one'),tab('two')]);
 await split('one');
 assert.deepEqual(store.getState().panes.left.tabIds,['one','two']);assert.deepEqual(store.getState().panes.right.tabIds,['one']);
 await typeSource('right','RIGHT');assert.equal(cm('left').state.doc.toString(),text('one'));
 await focus('left');await act(async()=>app.markdownHistory());assert.equal(text('one'),tab('one').content);
 await act(async()=>app.markdownHistory(true));assert.ok(text('one').endsWith('RIGHT'));
 await focus('right');await act(async()=>store.getState().openTab('/generated/new.md','# 新文档\n'));assert.equal(store.getState().panes.left.activeId,'one');assert.equal(store.getState().panes.right.tabIds.length,2);
 const newId=store.getState().activeId;await ready(()=>cm('right')?.state.doc.toString()==='# 新文档\n');
 await typeSource('right','NEW');await act(async()=>app.saveFile());assert.equal(writes.at(-1).path,'/generated/new.md');assert.equal(writes.at(-1).content,text(newId));
 await act(async()=>store.getState().mergePanes());assert.equal(store.getState().panes,null);assert.ok(store.getState().tabs.some(t=>t.id===newId));
 pass('independent groups, shared Markdown content/history, focused save, lossless merge');

 await setup([tab('empty',''),tab('unicode','中😀é\n','txt')]);await split('empty');
 await typeSource('right','中文😀');await focus('left');await act(async()=>app.markdownHistory());assert.equal(text('empty'),'');
 await focus('right');await act(async()=>app.closeTabById('empty'));assert.equal(store.getState().panes,null);assert.equal(store.getState().tabs.length,2);
 await act(async()=>store.getState().setActive('unicode'));await ready(()=>cm('left')?.state.doc.toString()==='中😀é\n');
 await typeSource('left','before');await split('unicode');await typeSource('right','after');
 await focus('left');await act(async()=>app.textHistory('unicode',cm('left')));assert.equal(cm('right').state.doc.toString(),text('unicode'));assert.ok(!text('unicode').includes('after'));
 await act(async()=>app.textHistory('unicode',cm('left'),true));assert.ok(text('unicode').includes('after'));
 pass('empty/CJK/emoji documents, duplicate close, shared plain-text undo across split');

 await setup([tab('visual-a'),tab('visual-b')],'visual');await split('visual-a');
 assert.notEqual(pm('left'),pm('right'));
 await focus('right');await act(async()=>{pm('right').focus();pm('right').dispatch(pm('right').state.tr.insertText('RIGHT',2));});
 assert.equal(pm('left').state.doc.textContent,pm('right').state.doc.textContent);
 await focus('left');assert.equal(app.getVisualEditor().owner!==undefined,true);await act(async()=>app.markdownHistory());assert.equal(text('visual-a'),tab('visual-a').content);
 await focus('right');await act(async()=>store.setState({markdownMode:'source'}));await ready(()=>cm('right'));
 assert.equal(store.getState().panes.left.markdownMode,'visual');assert.equal(store.getState().panes.right.markdownMode,'source');
 await typeSource('right','SOURCE');assert.ok(pm('left').state.doc.textContent.includes('SOURCE'));
 await focus('left');await act(async()=>app.openEditorSearch());assert.ok(pane('left').querySelector('input'));assert.equal(pane('right').querySelector('.cm-search'),null);
 await act(async()=>store.getState().setActive('visual-b'));await ready(()=>pm('left')?.state.doc.textContent.includes('visual-b'));
 assert.equal(store.getState().panes.right.activeId,'visual-a');
 await focus('right');const leftBefore=text('visual-b');await act(async()=>app.markdownHistory());assert.equal(text('visual-b'),leftBefore);
 await focus('left');const leftUnchanged=text('visual-b');
 await act(async()=>[...pane('right').querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Redo'||b.getAttribute('data-tooltip')==='Redo'||b.title==='Redo').click());
 assert.equal(store.getState().activePane,'right');assert.equal(store.getState().activeId,'visual-a');
 assert.ok(text('visual-a').includes('SOURCE'));assert.equal(text('visual-b'),leftUnchanged);
 pass('visual/source combinations, live sibling rendering, search and undo focus isolation');

 await setup([tab('close-a'),tab('close-b'),tab('close-c')]);await split('close-a');
 await act(async()=>store.getState().openTab('/generated/right-only.txt','RIGHT ONLY'));const rightId=store.getState().activeId;
 await focus('left');await act(async()=>app.closeTabById('close-b'));assert.equal(store.getState().panes.left.activeId,'close-a');
 await act(async()=>app.closeTabById('close-c'));await act(async()=>app.closeTabById('close-a'));
 assert.equal(store.getState().panes,null);assert.ok(store.getState().tabs.some(t=>t.id===rightId));
 await split(rightId);await focus('right');await act(async()=>store.getState().setActive('close-a'));
 await act(async()=>store.getState().reorderTabs(0,2));assert.deepEqual(store.getState().panes.right.tabIds,['close-a',rightId]);
 pass('closing inactive/last pane tabs, preserved right-only files, independent reorder');

 await setup([tab('save-failure')]);await split('save-failure');await typeSource('right','UNSAVED');
 const failedContent=text('save-failure'),beforeWrites=writes.length;failed=true;
 await act(async()=>app.saveFile());assert.equal(writes.length,beforeWrites);assert.equal(text('save-failure'),failedContent);
 assert.notEqual(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
 failed=false;await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,failedContent);
 assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
 await act(async()=>store.getState().mergePanes());assert.equal(text('save-failure'),failedContent);
 pass('failed save retains shared dirty content; retry and merge preserve the document');

 window.HTMLCanvasElement.prototype.getContext=()=>({font:'',measureText:text=>({width:Array.from(text).length*9})});
 localStorage.setItem('deditor:xmind:viewMode','edit');
 const archive=`data:application/vnd.xmind.workbook;base64,${Buffer.from(app.sampleArchive()).toString('base64')}`;
 await setup([tab('mind',archive,'xmind')]);await split('mind');
 const button=(id,name)=>[...pane(id).querySelectorAll('button')].find(b=>b.textContent.trim()===name);
 await focus('right');await act(async()=>button('right','Subtopic').click());
 const editedMind=text('mind');assert.notEqual(editedMind,archive);await ready(()=>button('left','Undo')?.disabled===false);
 await focus('left');await act(async()=>button('left','Undo').click());
 assert.deepEqual(app.openDocument(new Uint8Array(Buffer.from(text('mind').split(',')[1],'base64'))).sheets,app.openDocument(app.sampleArchive()).sheets);
 await focus('right');await act(async()=>button('right','Redo').click());assert.equal(text('mind'),editedMind);
 await act(async()=>app.saveFile());assert.equal(text('mind'),editedMind);
 await act(async()=>store.getState().mergePanes());assert.equal(text('mind'),editedMind);
 pass('XMind same-file peer updates and shared undo/redo survive save and merge');
 assert.equal(runtimeErrors.length,0,String(runtimeErrors));
 console.log(`Split Right: ${passed} groups passed`);
} finally {await act(async()=>root.unmount());fs.rmSync(output,{force:true});}
