import { recoveryIpcFixture } from './recovery-ipc-fixture.mjs';
const receiveRecovery = recoveryIpcFixture();
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
const output=path.resolve('node_modules/.cache/deditor-csv.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state_incremental')return receiveRecovery(args.packet,content=>globalThis.mdInvoke('write_app_state',{content}));
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
export {default as Groups} from './src/components/EditorGroups';
export {default as CsvPreview} from './src/components/CsvPreview';
export {getActiveView} from './src/lib/editorBridge';
export {textHistory} from './src/lib/textHistory';
export {useEditorStore} from './src/store/editor';
export {saveFile} from './src/lib/fileio';
export {parseCsv} from './src/lib/csv';
export {isCsv} from './src/lib/lang';
export {loadPersisted,schedulePersist,flushPersist} from './src/lib/persistence';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.split('?')[0].endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const {EditorView}=await import('@codemirror/view');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let passed=0;
const pass=name=>console.log(`PASS ${++passed} ${name}`);
const sample='\ufeff姓名,备注,编号\r\n小李,"上海,杭州",001\r\n小王,"第一行\n第二行 ""原文""",0002\r\n';
const tab=(id,content=sample,ext='csv')=>({id,filePath:`/generated/${id}.${ext}`,content,savedContent:content});
const text=id=>store.getState().tabs.find(t=>t.id===id)?.content;
const pane=id=>document.querySelector(`[data-editor-pane="${id}"]`);
const cm=id=>{const dom=pane(id)?.querySelector('.cm-editor');return dom&&EditorView.findFromDOM(dom);};
const button=(label,within=document)=>[...within.querySelectorAll('button')].find(b=>b.textContent===label);
const click=async b=>{assert.ok(b);assert.equal(b.disabled,false);await act(async()=>b.click());};
async function ready(fn){for(let i=0;i<250;i++){await act(async()=>pause(10));if(fn())return;}throw Error('Timed out');}
async function setup(tabs,mode='source'){
 await act(async()=>root.render(null));
 await act(async()=>{store.setState({panes:null,activePane:'left',splitEditor:false,tabs,activeId:tabs[0].id,language:'en',csvMode:mode,markdownMode:'source',autoSave:'off',showPreview:false,formatOnSave:false});root.render(React.createElement(app.Groups,{initialPreviewPct:50}));});
 await ready(()=>cm('left'));
}
async function source(value,id='left') {const view=cm(id);await act(async()=>{view.dispatch({changes:{from:0,to:view.state.doc.length,insert:value},userEvent:'input'});});}
try {
 assert.equal(app.isCsv('report.CSV'),true);assert.equal(app.isCsv('report.csv.md'),false);assert.equal(app.isCsv(null),false);
 assert.deepEqual(app.parseCsv(sample).rows,[['姓名','备注','编号'],['小李','上海,杭州','001'],['小王','第一行\n第二行 "原文"','0002']]);
 await setup([tab('csv-basic')]);const originalView=cm('left');
 assert.ok(document.querySelector('.csv-preview').closest('[hidden]'));
 await click(button('Live Preview'));assert.equal(document.querySelectorAll('.csv-table tbody tr').length,2);
 assert.match(document.querySelector('.csv-table').textContent,/001/);assert.equal(text('csv-basic'),sample);
 await click(button('Reading'));await click(button('Edit'));await click(button('Live Preview'));assert.equal(text('csv-basic'),sample,'Changing modes alone must preserve CRLF and BOM');
 await source(sample.replace('小李','测试姓名'));assert.match(document.querySelector('.csv-table').textContent,/测试姓名/);
 await click(button('Reading'));assert.equal(pane('left').querySelector('.cm-editor').closest('[style*="display: none"]')!==null,true);
 assert.equal(document.querySelectorAll('.csv-table tbody tr').length,2);
 await click(button('Edit'));assert.equal(cm('left'),originalView);
 await act(async()=>app.textHistory('csv-basic',cm('left')));assert.equal(text('csv-basic'),sample.replaceAll('\r\n','\n')); // Existing source editor normalizes line endings on edit.
 await act(async()=>app.textHistory('csv-basic',cm('left'),true));assert.ok(text('csv-basic').includes('测试姓名'));
 await click(button('Reading'));await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,text('csv-basic'));assert.equal(writes.at(-1).path,'/generated/csv-basic.csv');
 pass('round 1: edit/live/read, live updates, retained source view, undo/redo and exact save');

 for(const [input,expected] of [
  ['',[]],['\ufeff',[]],['x',[['x']]],['""',[['']]],['a,',[['a','']]],['\n',[['']]],['a\n\n',[['a'],['']]],['a,b\rc,d',[['a','b'],['c','d']]],['a,"b\r\nc",d\r\n',[['a','b\r\nc','d']]],['"a""b",=SUM(1),001',[['a"b','=SUM(1)','001']]],['名,值\n👨‍👩‍👧‍👦,é',[['名','值'],['👨‍👩‍👧‍👦','é']]]
 ])assert.deepEqual(app.parseCsv(input).rows,expected,input);
 assert.deepEqual(app.parseCsv('a;"b;c"',';').rows,[['a','b;c']]);assert.deepEqual(app.parseCsv('a\tb\n1\t2','\t').rows,[['a','b'],['1','2']]);
 assert.equal(app.parseCsv('a,"pending').issue,'unclosedQuote');assert.equal(app.parseCsv('a,"b"x').issue,'unexpectedQuote');
 assert.equal(app.parseCsv('a,b\n1\n2,3,4').ragged,true);
 await setup([tab('csv-edge','name,note\n张三,"<img src=x onerror=alert(1)>"')],'split');
 assert.equal(document.querySelector('.csv-preview img'),null);assert.match(document.querySelector('.csv-table').textContent,/<img/);
 await source('');assert.ok(document.querySelector('.csv-empty'));await source('h1,h2\na,"pending');assert.ok(document.querySelector('[role="alert"]'));await source('h1,h2\na,"fixed"');assert.equal(document.querySelector('[role="alert"]'),null);
 await source('h1;h2\na;b');const select=document.querySelector('.csv-delimiter select');await act(async()=>{select.value=';';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.equal(document.querySelectorAll('.csv-table tbody td').length,2);
 await click(document.querySelector('.csv-header-toggle input'));assert.equal(document.querySelectorAll('.csv-table tbody tr').length,2);assert.match(document.querySelector('.csv-table thead').textContent,/Column 1/);
 await click(button('Edit'));await source('h1;h2\na;b\nc;d');await click(button('Live Preview'));assert.equal(document.querySelector('.csv-delimiter select').value,';');assert.equal(document.querySelector('.csv-header-toggle input').checked,false);assert.equal(document.querySelectorAll('.csv-table tbody tr').length,3);
 pass('round 2: BOM/CRLF/Unicode, empty and quoted fields, alternate delimiters, safe text, error recovery and retained preview options');

 const large='id,value\n'+Array.from({length:255},(_,i)=>`${i},第${i}行`).join('\n');
 await setup([tab('csv-pages',large)],'read');assert.equal(document.querySelectorAll('.csv-table tbody tr').length,100);assert.equal(button('Previous').disabled,true);
 await click(button('Next'));assert.match(document.querySelector('.csv-pagination').textContent,/2 \/ 3/);assert.equal(document.querySelector('.csv-table tbody td').textContent,'100');
 await click(button('Next'));assert.equal(document.querySelectorAll('.csv-table tbody tr').length,55);assert.equal(button('Next').disabled,true);
 await act(async()=>store.getState().setContent('id,value\n0,last','csv-pages'));assert.equal(document.querySelectorAll('.csv-table tbody tr').length,1);assert.equal(document.querySelector('.csv-pagination'),null);
 pass('round 2: pagination reaches every record and clamps after source shrinks');

 await setup([tab('csv-one'),tab('csv-two','name,value\n乙,2'),tab('md-one','# 原文\n','md'),tab('html-one','<p>Generated</p>','html')],'split');
 await click(button('Reading'));await act(async()=>store.getState().setActive('csv-two'));await ready(()=>document.querySelector('.csv-table')?.textContent.includes('乙'));
 assert.equal(store.getState().csvMode,'read');await act(async()=>store.getState().setActive('md-one'));assert.equal(store.getState().markdownMode,'source');assert.equal(document.querySelector('.csv-toolbar'),null);
 await act(async()=>store.getState().setActive('html-one'));assert.equal(store.getState().showPreview,false);await click(button('Live Preview'));assert.equal(store.getState().csvMode,'read');assert.ok(document.querySelector('iframe'));
 await act(async()=>store.getState().setActive('csv-one'));assert.ok(document.querySelector('.csv-table'));await act(async()=>store.getState().splitRight('csv-two'));await ready(()=>pane('right')?.querySelector('.csv-table'));
 await click(button('Edit',pane('right')));assert.equal(store.getState().panes.left.csvMode,'read');assert.equal(store.getState().panes.right.csvMode,'source');
 await act(async()=>{pane('left').dispatchEvent(new window.MouseEvent('pointerdown',{bubbles:true}));store.getState().togglePreview();});assert.equal(store.getState().csvMode,'source');assert.equal(store.getState().panes.right.csvMode,'source');
 await act(async()=>store.getState().togglePreviewMaximized());assert.equal(store.getState().csvMode,'read');assert.equal(store.getState().panes.right.csvMode,'source');
 await act(async()=>store.getState().mergePanes());assert.equal(store.getState().csvMode,'read');
 await act(async()=>store.setState({language:'zh'}));assert.ok(button('编辑'));assert.ok(button('实时预览'));assert.ok(button('阅读'));assert.match(document.querySelector('.csv-preview-options').textContent,/首行为表头/);
 pass('round 3: multiple CSV tabs, Markdown/HTML isolation, independent split panes, shortcuts and bilingual controls');

 await setup([tab('csv-conflict')],'read');
 await act(async()=>store.setState({tabs:store.getState().tabs.map(t=>({...t,externalChange:'name,value\nnew,3'}))}));assert.ok(button('Reload from disk'));
 await click(button('Reload from disk'));assert.match(document.querySelector('.csv-table').textContent,/new/);assert.equal(text('csv-conflict'),'name,value\nnew,3');
 await act(async()=>store.getState().setContent('name,value\nchanged,4','csv-conflict'));failed=true;await act(async()=>app.saveFile());assert.notEqual(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);failed=false;await act(async()=>app.saveFile());assert.equal(store.getState().tabs[0].content,store.getState().tabs[0].savedContent);
 await act(async()=>root.render(null));store.setState({csvMode:'read'});app.schedulePersist({sidebarPx:240,previewPct:50});await app.flushPersist();assert.equal(JSON.parse(persistedState).csvMode,'read');store.setState({csvMode:'source'});await act(async()=>app.loadPersisted());assert.equal(store.getState().csvMode,'read');
 const legacy=JSON.parse(persistedState);delete legacy.csvMode;persistedState=JSON.stringify(legacy);await act(async()=>app.loadPersisted());assert.equal(store.getState().csvMode,'source');
 pass('round 4: external reload in reading, failed save recovery, mode persistence and legacy defaults');
 assert.equal(runtimeErrors.length,0,runtimeErrors.map(String).join('\n'));
 console.log(`${passed} CSV integration groups passed`);
} finally {await act(async()=>root.unmount());dom.window.close();}
