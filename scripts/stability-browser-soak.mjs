/** Isolated real-Chromium lifecycle soak. No user files, profiles, or native I/O.
 * node scripts/stability-browser-soak.mjs --minutes=30
 * Open the returned URL in an isolated browser tab. Results are intentionally
 * browser evidence, not WKWebView/native persistence or physical IME evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { build } from 'esbuild';
const minutes = Number(process.argv.find(a=>a.startsWith('--minutes='))?.split('=')[1] ?? 30);
if (!(minutes > 0 && minutes <= 720)) throw new Error('minutes must be in (0, 720]');
const output = path.resolve('tests/artifacts/stability-2026-09-27', new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(output,{recursive:true});
const stubs={
 '@tauri-apps/api/core': 'export const invoke=async()=>null;export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog': 'export const save=async()=>null;export const open=async()=>null;export const message=async()=>{};export const ask=async()=>false;',
 '@tauri-apps/plugin-opener': 'export const openUrl=async()=>{};export const openPath=async()=>{};export const revealItemInDir=async()=>{};',
 '@tauri-apps/plugin-log': 'export const info=async()=>{};export const error=async()=>{};export const warn=async()=>{};export const debug=async()=>{};export const trace=async()=>{};',
};
await build({stdin:{contents:String.raw`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Host from './src/components/MarkdownVisualHost';
import XmindView from './src/components/XmindView';
import {useEditorStore as store} from './src/store/editor';
import {getVisualEditor} from './src/lib/markdownVisualBridge';
import {markdownHistory} from './src/lib/markdownHistory';
import {dropMarkdownSession} from './src/lib/markdownSession';
import {sampleArchive} from './tests/fixtures/xmind';
import {bytesToXmindDataUrl} from './src/lib/xmind/edit';
import './src/styles.css';
const source='# Soak document 中文\n\n'+Array.from({length:200},(_,i)=>'## Section '+i+'\n\nParagraph '+i+' '+('中文 continuous editing **bold** and ordinary text. '.repeat(10))+'\n\n| A | B |\n| --- | --- |\n| row '+i+' | value |\n\n').join('');
const sheets=Array.from({length:3},(_,s)=>({id:'sheet-'+s,title:'Sheet '+s,rootTopic:{id:'root-'+s,title:'Root '+s,children:{attached:Array.from({length:20},(_,i)=>({id:s+'-branch-'+i,title:'Branch '+i,children:{attached:Array.from({length:49},(_,j)=>({id:s+'-node-'+i+'-'+j,title:'Node 中文 '+i+'/'+j}))}}))}}}));
const xsource=bytesToXmindDataUrl(sampleArchive(sheets));
// Match main.tsx closed-tab cleanup; this isolated host intentionally omits app persistence.
store.subscribe((state,prev)=>{const live=new Set(state.tabs.map(t=>t.id));for(const t of prev.tabs)if(!live.has(t.id))dropMarkdownSession(t.id)});
const blank={id:'blank',filePath:null,content:'',savedContent:''};
store.setState({tabs:[blank],activeId:'blank',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function App(){const tabs=store(s=>s.tabs),active=store(s=>s.activeId),theme=store(s=>s.theme);const tab=tabs.find(t=>t.id===active);return <main style={{height:'100vh'}}><Host activeId={active} active={Boolean(tab?.filePath?.endsWith('.md'))} theme={theme}/>{tabs.filter(t=>t.filePath?.endsWith('.xmind')).map(t=><div key={t.id} style={{position:'absolute',inset:0,display:t.id===active?'block':'none'}}><XmindView tabId={t.id} active={t.id===active} filePath={t.filePath} dataUrl={t.content}/></div>)}</main>}
createRoot(document.getElementById('root')).render(<App/>);
let mdId='',xmId='',cycle=0;
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
window.soak={
 sizes:{markdownChars:source.length,xmindNodesPerSheet:1001,sheets:3},
 open(){cycle++;mdId='md-'+cycle;xmId='xm-'+cycle;store.setState({tabs:[blank,{id:mdId,filePath:'/generated/soak-'+cycle+'.md',content:source,savedContent:source}],activeId:mdId})},
 ready(){return Boolean(getVisualEditor()?.tabId===mdId && document.querySelector('.ProseMirror h1'))},
 caret(){const h=document.querySelector('.ProseMirror h1');h.closest('[contenteditable]').focus();document.getSelection().collapse(h.firstChild,h.firstChild.length)},
 edited(){assert(store.getState().tabs.find(t=>t.id===mdId).content===source.replace('# Soak document 中文','# Soak document 中文Z'),'Markdown input must preserve exact source')},
 undo(){markdownHistory();assert(store.getState().tabs.find(t=>t.id===mdId).content===source,'Markdown undo exact')},
 redo(){markdownHistory(true);this.edited()},
 xmind(){store.setState(s=>({tabs:[...s.tabs,{id:xmId,filePath:'/generated/soak-'+cycle+'.xmind',content:xsource,savedContent:xsource}],activeId:xmId}))},
 xmready(){return Boolean(document.querySelector('.xm-svg [data-topic]')||document.querySelector('.xm-zoom'))},
 zoom(){const b=document.querySelectorAll('.xm-zoom button');assert(b.length>=2,'zoom controls');b[1].click()},
 unzoom(){document.querySelectorAll('.xm-zoom button')[0].click()},
 sheet(i){document.querySelectorAll('.xm-sheets [role=tab]')[i].click()},
 theme(){store.setState(s=>({theme:s.theme==='dark'?'light':'dark'}));document.documentElement.classList.toggle('dark',store.getState().theme==='dark')},
 check(){assert(store.getState().tabs.find(t=>t.id===xmId).content===xsource,'pan/zoom/sheet must preserve exact XMind bytes');this.edited()},
 close(){this.check();store.getState().closeTab(xmId);store.getState().closeTab(mdId)},
 clean(){return {tabs:store.getState().tabs.length,closed:store.getState().closedTabsStack.length,visual:getVisualEditor()?.tabId??null,editors:document.querySelectorAll('.ProseMirror').length,xmind:document.querySelectorAll('.xm-canvas').length}},
};
`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'esm',platform:'browser',outfile:path.join(output,'app.js'),define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'isolate-native-io',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'js'}))}}],logLevel:'warning',loader:{'.woff2':'dataurl','.woff':'dataurl','.ttf':'dataurl'}});
const run = String.raw`
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[];window.addEventListener('error',e=>errors.push(String(e.error??e.message)));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
const post=async (kind,data)=>{document.querySelector('#status').textContent=kind+' '+JSON.stringify(data);await fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,data})})};
const wait=async fn=>{for(let i=0;i<300;i++){if(fn())return;await pause(100)}throw new Error('Timed out waiting for editor readiness')};
const run=async()=>{
await wait(()=>Boolean(window.soak));
const started=Date.now();let rounds=0;const samples=[];
const sample=async()=>{await pause(500);const clean=soak.clean();const item={round:rounds,seconds:(Date.now()-started)/1000,heap:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize,limit:performance.memory.jsHeapSizeLimit}:null,domNodes:document.querySelectorAll('*').length,blobURLs:window.liveBlobs.size,clean};samples.push(item);await post('sample',item);if(clean.tabs!==1||clean.editors||clean.xmind||clean.visual)throw new Error('Components/bridge not released after close')};
try{
await post('started',{started:new Date().toISOString(),minutes:MINUTES,sizes:soak.sizes,userAgent:navigator.userAgent,method:'Frozen production bundle; actual MarkdownVisualHost/XmindView; autonomous page DOM input and component UI clicks; synthetic wheel panning; native I/O stubbed; natural GC only'});
await sample();
while(Date.now()-started<MINUTES*60000){
soak.open();await wait(()=>soak.ready());soak.caret();
// Real browser DOM observer -> production edit pipeline. Synthetic input, not physical keyboard/IME.
const h=document.querySelector('.ProseMirror h1');h.firstChild.textContent+='Z';document.getSelection().collapse(h.firstChild,h.firstChild.length);h.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'Z'}));
await pause(100);soak.edited();soak.undo();await pause(100);soak.redo();await pause(100);
soak.xmind();await wait(()=>soak.xmready());
for(let i=0;i<6;i++){
const zoomBefore=document.querySelector('.xm-svg').getAttribute('viewBox');soak.zoom();await pause(75);if(document.querySelector('.xm-svg').getAttribute('viewBox')===zoomBefore)throw new Error('Zoom did not change viewport');soak.unzoom();soak.sheet(i%3);await pause(75);if(document.querySelector('.xm-sheets [aria-selected=true]').textContent!=='Sheet '+i%3)throw new Error('Sheet switch failed');
const beforePan=document.querySelector('.xm-svg').getAttribute('viewBox');const canvas=document.querySelector('.xm-canvas');canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:60,deltaY:40}));await pause(75);if(document.querySelector('.xm-svg').getAttribute('viewBox')===beforePan)throw new Error('Wheel pan did not change viewport');
}
soak.theme();soak.close();await pause(250);rounds++;if(rounds%5===0)await sample();
}
await sample();if(errors.length)throw new Error('Browser errors: '+errors.join(';'));
await post('complete',{finished:new Date().toISOString(),elapsedSeconds:(Date.now()-started)/1000,rounds,markdownOpens:rounds,xmindOpens:rounds,typedDOMInputs:rounds,undo:rounds,redo:rounds,zoomClicks:rounds*12,sheetSwitches:rounds*6,wheelPans:rounds*6,samples,errors});
}catch(error){await post('failure',{error:String(error),errors,rounds,elapsedSeconds:(Date.now()-started)/1000})}
};run();
`.replaceAll('MINUTES', String(minutes));
fs.writeFileSync(path.join(output,'runner.js'),run);
fs.writeFileSync(path.join(output,'index.html'),`<html><link rel="stylesheet" href="/app.css"><body><div id="root"></div><pre id="status" style="position:fixed;bottom:0;left:0;background:white;color:black;z-index:9999;font-size:10px;max-width:100vw;white-space:pre-wrap"></pre><script>window.liveBlobs=new Set();const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);URL.createObjectURL=(blob)=>{const url=create(blob);liveBlobs.add(url);return url};URL.revokeObjectURL=(url)=>{liveBlobs.delete(url);return revoke(url)};</script><script type="module" src="/app.js"></script><script type="module" src="/runner.js"></script></body></html>`);
const server=http.createServer(async(req,res)=>{
if(req.url==='/report'&&req.method==='POST'){let body='';for await(const chunk of req)body+=chunk;const report=JSON.parse(body);fs.appendFileSync(path.join(output,'reports.jsonl'),body+'\n');console.log(body);if(report.kind==='complete'||report.kind==='failure')fs.writeFileSync(path.join(output,report.kind+'.json'),JSON.stringify(report.data,null,2));res.end('ok');return;}
const file=path.join(output,req.url==='/'?'index.html':req.url.slice(1));if(!file.startsWith(output+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
console.log(JSON.stringify({url:'http://127.0.0.1:'+server.address().port,output,minutes}));
