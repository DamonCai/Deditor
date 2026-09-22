import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dom=new JSDOM('<!doctype html><body><button id="invoker">editor</button><div id="root"></div></body>',{url:'http://localhost',pretendToBeVisual:true});
for(const name of ['window','document','HTMLElement','HTMLInputElement','Element','Node','Event','MouseEvent','KeyboardEvent','localStorage'])Object.defineProperty(globalThis,name,{value:dom.window[name],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
for(const key of ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=dom.window[key].bind(dom.window);
window.matchMedia=()=>({matches:false}); HTMLElement.prototype.scrollIntoView=function(){};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const output=path.resolve('node_modules/.cache/deditor-recent-files.mjs');fs.mkdirSync(path.dirname(output),{recursive:true});
const handlers=new Map();let disk=[],records=[],readGate=null,openGate=null,opens=[];
globalThis.recentTest={
 invoke:async(cmd,args)=>{if(cmd==='read_recent_files'){const snapshot=[...disk];if(readGate)await readGate;return snapshot;}if(cmd==='record_recent_file'){records.push(args.path);disk=[args.path,...disk.filter(p=>p!==args.path)].slice(0,100);handlers.get('recent-files-changed')?.({payload:[...disk]});}},
 listen:async(name,handler)=>{handlers.set(name,handler);return()=>handlers.delete(name);},
 open:async(file)=>{opens.push(file);if(openGate)await openGate;if(file.includes('missing'))return;store.getState().openTab(file,'self-created body');},
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.recentTest.invoke(...a);',
 '@tauri-apps/api/event':'export const listen=(...a)=>globalThis.recentTest.listen(...a);',
 '../lib/fileio':'export const openFileByPath=(...a)=>globalThis.recentTest.open(...a);',
 './logger':'export const logInfo=()=>{};export const logWarn=()=>{};export const logError=()=>{};',
 '../lib/logger':'export const logError=()=>{};',
};
await build({stdin:{contents:`export * from './src/lib/recentFiles';export {focusRecentFile} from './src/lib/recentFileFocus';export {setActiveView} from './src/lib/editorBridge';export {setVisualEditor} from './src/lib/markdownVisualBridge';export {commitWindowClose} from './src/lib/windowCloseGuard';export {default as RecentFiles} from './src/components/RecentFiles';export {useEditorStore} from './src/store/editor';`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',plugins:[{name:'isolated',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path]}));}}]});
const app=await import(pathToFileURL(output)),store=app.useEditorStore,root=createRoot(document.getElementById('root'));
const tick=()=>new Promise(r=>setImmediate(r));
const run=async(fn)=>{await act(async()=>{await fn();await tick();});};
const key=(value,opts={})=>document.querySelector('input').dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...opts}));
const input=value=>{const field=document.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,value);field.dispatchEvent(new Event('input',{bubbles:true}));};
let closed=0;
const close=()=>{closed++;root.render(null);};
function reset(paths,active=paths[0]){store.setState({tabs:active?[{id:'test',filePath:active,content:'body',savedContent:'body'}]:[],activeId:active?'test':null,panes:null,language:'en',recentFiles:paths,recentFilesOpen:false});}
try{
 reset(['/self/a.md']);disk=['/self/old.md'];
 let cleanup=app.installRecentFiles();await tick();await tick();
 assert.equal(disk[0],'/self/a.md');
 store.getState().openTab('/self/b.md','b');await tick();
 store.getState().setActive('test');await tick();
 assert.deepEqual(store.getState().recentFiles,['/self/a.md','/self/b.md','/self/old.md']);
 disk=['/other-window/file.md',...disk];handlers.get('recent-files-changed')({payload:disk});
 window.dispatchEvent(new Event('focus'));await tick();assert.equal(disk[0],'/self/a.md');
 store.getState().closeTab('test');await tick();
 assert(store.getState().recentFiles.includes('/self/a.md'));
 const count=records.length;store.getState().openDiffTab({leftPath:'/self/x',rightPath:'/self/y',leftContent:'x',rightContent:'y'});await tick();assert.equal(records.length,count);
 cleanup();assert.equal(handlers.size,0);
 console.log('Round 1 PASS: open/switch/close recency, deduplication, diff exclusion');
 reset([],null);disk=['/self/stale.md'];let release;readGate=new Promise(r=>release=r);cleanup=app.installRecentFiles();await tick();
 handlers.get('recent-files-changed')({payload:['/other-window/最新.md','/self/stale.md']});release();readGate=null;await tick();
 assert.equal(store.getState().recentFiles[0],'/other-window/最新.md');cleanup();
 assert.equal(app.normalizeRecentFiles([...Array(120)].map((_,i)=>`/self/${i}.md`)).length,100);
 assert.deepEqual(app.normalizeRecentFiles([null,'','/文档/资料.md','/文档/资料.md',42]),['/文档/资料.md']);
 assert.deepEqual(app.filterRecentFiles(['C:\\work\\项目\\报告.md','/self/other.md'],'项目 报告'),['C:\\work\\项目\\报告.md']);
 console.log('Round 2 PASS: late hydration cannot overwrite cross-window updates; bounded Unicode/path filtering');
 reset(['/self/current.md','/self/previous.md','/self/last.md']);document.getElementById('invoker').focus();
 await run(()=>root.render(React.createElement(React.StrictMode,null,React.createElement(app.RecentFiles,{onClose:close}))));
 assert.equal(document.activeElement.tagName,'INPUT');assert.equal(document.querySelector('[aria-selected="true"]').textContent.includes('previous.md'),true);
 await run(()=>key('ArrowDown'));await run(()=>key('Enter'));assert.equal(opens.at(-1),'/self/last.md');assert.equal(closed,1);assert.equal(document.activeElement.id,'invoker');
 const event=new KeyboardEvent('keydown',{key:'e',metaKey:true,cancelable:true});assert.equal(app.handleRecentFilesKey(event),true);assert(event.defaultPrevented);assert(store.getState().recentFilesOpen);
 store.getState().setShortcutEnabled('file_recent',false);assert.equal(app.handleRecentFilesKey(new KeyboardEvent('keydown',{key:'e',ctrlKey:true})),false);store.getState().setShortcutEnabled('file_recent',true);
 assert.equal(app.handleRecentFilesKey(new KeyboardEvent('keydown',{key:'e',ctrlKey:true,shiftKey:true})),false);
 for(const action of ['setSettingsOpen','setGotoAnythingOpen','setCommandPaletteOpen','setGotoSymbolOpen','setFindInFilesOpen']) {store.getState().setRecentFilesOpen(true);store.getState()[action](true);assert.equal(store.getState().recentFilesOpen,false);store.getState().setRecentFilesOpen(true);assert.equal(store.getState()[action.replace(/^set/,'').replace(/^./,c=>c.toLowerCase())],false);}
 console.log('Round 3 PASS: previous-file selection, arrow/Enter, StrictMode, focus restoration and shortcut settings');
 reset(['/self/missing.md','/self/ok.md'],null);await run(()=>root.render(React.createElement(app.RecentFiles,{onClose:close})));
 await run(()=>key('Enter'));assert(document.querySelector('[role="alert"]'));assert(document.querySelector('[role="dialog"]'));
 await run(()=>input('ok'));await run(()=>key('Enter'));assert.equal(opens.at(-1),'/self/ok.md');assert(!document.querySelector('[role="dialog"]'));
 reset(['/self/one.md'],null);await run(()=>root.render(React.createElement(app.RecentFiles,{onClose:close})));let unlock;openGate=new Promise(r=>unlock=r);const before=opens.length;
 await run(()=>{key('Enter');key('Enter');});assert.equal(opens.length,before+1);unlock();openGate=null;await run(()=>{});
 reset([],null);await run(()=>root.render(React.createElement(app.RecentFiles,{onClose:close})));await run(()=>{key('ArrowDown');key('Enter');});assert(document.querySelector('[role="status"]'));await run(()=>key('Escape'));assert(!document.querySelector('[role="dialog"]'));
 console.log('Round 4 PASS: missing file recovery, duplicate-open protection, empty history and Escape');
 const destination=document.createElement('textarea');destination.id='destination-editor';document.body.append(destination);
 const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 const sourceView={focus:()=>destination.focus()};
 reset(['/self/current.txt','/self/target.txt']);
 store.setState(s=>({tabs:[...s.tabs,{id:'next',filePath:'/self/target.txt',content:'target',savedContent:'target'}]}));
 app.setActiveView(sourceView,'next','target');document.getElementById('invoker').focus();
 await run(()=>root.render(React.createElement(app.RecentFiles,{onClose:close})));
 await run(()=>key('Enter'));await frame();
 assert.equal(document.activeElement,destination,'success focuses destination after modal cleanup, not its old invoker');
 reset(['/self/visual.md']);store.setState({markdownMode:'visual'});app.setVisualEditor(null);document.getElementById('invoker').focus();
 app.focusRecentFile('test');await frame();assert.equal(document.activeElement.id,'invoker','wait for the requested bridge');
 let normalFocus=0,restoredFocus=0;
 app.setVisualEditor({tabId:'test',editable:true,focus:()=>normalFocus++,restoreFocus:()=>{restoredFocus++;destination.focus();}});await frame();
 assert.equal(restoredFocus,1);assert.equal(normalFocus,0);assert.equal(document.activeElement,destination);
 app.setVisualEditor(null);document.getElementById('invoker').focus();app.focusRecentFile('test');store.getState().setSettingsOpen(true);await frame();
 app.setVisualEditor({tabId:'test',editable:true,focus:()=>destination.focus()});await frame();assert.equal(document.activeElement.id,'invoker','opening another dialog cancels focus');
 store.getState().setSettingsOpen(false);app.setVisualEditor(null);app.focusRecentFile('test');const resume=app.commitWindowClose();await frame();resume();app.setVisualEditor({tabId:'test',editable:true,focus:()=>destination.focus()});await frame();assert.equal(document.activeElement.id,'invoker','closing the window cancels focus');
 reset(['/self/image.png']);app.focusRecentFile('test');app.setActiveView(sourceView,'test','');await frame();assert.equal(document.activeElement.id,'invoker','media creates no delayed text focus');
 reset(['/self/source.txt']);store.setState({markdownMode:'source'});app.setActiveView(null);app.focusRecentFile('test');store.getState().openTab('/self/other.txt','other');app.setActiveView(sourceView,'test','');await frame();assert.equal(document.activeElement.id,'invoker','changing files cancels a pending request');
 reset(['/self/cancel.md']);await run(()=>root.render(React.createElement(app.RecentFiles,{onClose:close})));await run(()=>key('Escape'));await frame();assert.equal(document.activeElement.id,'invoker','Escape still restores the invoker');
 app.setVisualEditor(null);app.setActiveView(null);destination.remove();
 console.log('Round 5 PASS: destination focus after success, late visual bridge, restored selection, cancellation and media');

}finally{await run(()=>root.unmount());dom.window.close();}
