import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const output=path.resolve('node_modules/.cache/deditor-pane-resize.mjs');
await build({entryPoints:['src/lib/paneResize.ts'],outfile:output,bundle:true,format:'esm',platform:'node',logLevel:'silent'});
const {beginPaneResize}=await import(pathToFileURL(output));
const dom=new JSDOM('<body><div class="splitter"></div><p>中文 preview selection</p></body>',{pretendToBeVisual:true});
const {window:win}=dom,doc=win.document,handle=doc.querySelector('.splitter');
let captured=null,moves=[],passed=0;
handle.setPointerCapture=id=>{captured=id;};handle.hasPointerCapture=id=>captured===id;handle.releasePointerCapture=()=>{captured=null;handle.dispatchEvent(new win.Event('lostpointercapture'));};
const event=(type,props={})=>{const e=new win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,buttons:1,clientX:123,...props});Object.defineProperties(e,{pointerId:{value:props.pointerId??7},isPrimary:{value:props.isPrimary??true}});return e;};
const start=(props={})=>{moves=[];const e=event('pointerdown',props);const stop=beginPaneResize(handle,e,e=>moves.push(e.clientX));assert.equal(e.defaultPrevented,true);assert.equal(captured,7);assert.ok(doc.body.classList.contains('deditor-pane-resizing'));assert.ok(handle.classList.contains('dragging'));return stop;};
const idle=()=>{assert.equal(captured,null);assert.equal(doc.body.classList.contains('deditor-pane-resizing'),false);assert.equal(handle.classList.contains('dragging'),false);const e=event('selectstart');doc.dispatchEvent(e);assert.equal(e.defaultPrevented,false);};
function test(name,fn){fn();passed++;console.log('PASS '+name);}
try{
 test('round 1: drag blocks selection, updates width and releases normally',()=>{const stop=start();const selection=event('selectstart');doc.dispatchEvent(selection);assert.ok(selection.defaultPrevented);win.dispatchEvent(event('pointermove'));assert.deepEqual(moves,[123]);win.dispatchEvent(event('pointerup'));idle();win.dispatchEvent(event('pointermove'));assert.deepEqual(moves,[123]);stop();});
 test('round 2: right button and secondary pointer do not start resize',()=>{for(const props of [{button:2},{isPrimary:false}]){const e=event('pointerdown',props);beginPaneResize(handle,e,()=>assert.fail())();assert.equal(e.defaultPrevented,false);idle();}});
 test('round 2: another pointer cannot resize or release this drag',()=>{start();win.dispatchEvent(event('pointermove',{pointerId:8}));win.dispatchEvent(event('pointerup',{pointerId:8}));assert.deepEqual(moves,[]);assert.equal(captured,7);win.dispatchEvent(event('pointerup'));idle();});
 test('round 3: pointer cancel, capture loss, blur and missing button all restore selection',()=>{for(const end of [()=>win.dispatchEvent(event('pointercancel')),()=>handle.dispatchEvent(event('lostpointercapture')),()=>win.dispatchEvent(new win.Event('blur')),()=>win.dispatchEvent(event('pointermove',{buttons:0}))]){start();end();idle();win.dispatchEvent(event('pointermove'));assert.deepEqual(moves,[]);}});
 test('round 3: existing selected text and inline styles survive resize',()=>{const selection=doc.getSelection(),range=doc.createRange();range.selectNodeContents(doc.querySelector('p'));selection.removeAllRanges();selection.addRange(range);doc.body.style.cursor='crosshair';doc.body.style.userSelect='text';const stop=start();stop();idle();assert.equal(selection.toString(),'中文 preview selection');assert.equal(doc.body.style.cursor,'crosshair');assert.equal(doc.body.style.userSelect,'text');});
 test('round 4: unmount cleanup is idempotent and stops all pending input',()=>{const stop=start();stop();stop();idle();win.dispatchEvent(event('pointermove'));assert.deepEqual(moves,[]);});
 test('round 4: removed divider ends drag at next pointer event',()=>{const stop=start();handle.remove();win.dispatchEvent(event('pointermove'));idle();assert.deepEqual(moves,[]);doc.body.prepend(handle);stop();});
 test('round 5: rapid consecutive drags recover their own state',()=>{for(let i=0;i<8;i++){start();win.dispatchEvent(event('pointermove',{clientX:i*10}));assert.deepEqual(moves,[i*10]);win.dispatchEvent(event('pointerup'));idle();}});
 test('captured zero-buttons native sequence resizes until matching pointerup',()=>{
  start({buttons:0});win.dispatchEvent(event('pointermove',{buttons:0,clientX:456}));assert.deepEqual(moves,[456]);assert.equal(captured,7);
  win.dispatchEvent(event('pointerup',{buttons:0}));idle();win.dispatchEvent(event('pointermove',{buttons:0,clientX:789}));assert.deepEqual(moves,[456]);
 });
 test('zero-buttons exception requires capture and does not accept another button',()=>{
  const capture=handle.setPointerCapture;
  try{handle.setPointerCapture=()=>{};moves=[];beginPaneResize(handle,event('pointerdown',{buttons:0}),e=>moves.push(e.clientX));win.dispatchEvent(event('pointermove',{buttons:0}));assert.deepEqual(moves,[]);idle();}finally{handle.setPointerCapture=capture;}
  start({buttons:0});win.dispatchEvent(event('pointermove',{buttons:2}));assert.deepEqual(moves,[]);idle();
  start({buttons:0});captured=null;win.dispatchEvent(event('pointermove',{buttons:0}));assert.deepEqual(moves,[]);idle();
 });
 test('zero-buttons sequence still ends on cancel, lost capture, blur, unmount and disconnected handle',()=>{
  for(const end of [()=>win.dispatchEvent(event('pointercancel')),()=>handle.dispatchEvent(new win.Event('lostpointercapture')),()=>win.dispatchEvent(new win.Event('blur'))]){
   start({buttons:0});end();idle();win.dispatchEvent(event('pointermove',{buttons:0}));assert.deepEqual(moves,[]);
  }
  const stop=start({buttons:0});stop();idle();win.dispatchEvent(event('pointermove',{buttons:0}));assert.deepEqual(moves,[]);
  start({buttons:0});handle.remove();win.dispatchEvent(event('pointermove',{buttons:0}));idle();assert.deepEqual(moves,[]);doc.body.prepend(handle);
 });
 test('capture failure cleans selection guards and never enables zero-buttons fallback',()=>{
  const capture=handle.setPointerCapture;
  try{handle.setPointerCapture=()=>{throw new Error('generated capture failure');};moves=[];const stop=beginPaneResize(handle,event('pointerdown',{buttons:0}),e=>moves.push(e.clientX));idle();win.dispatchEvent(event('pointermove',{buttons:0}));assert.deepEqual(moves,[]);stop();idle();}finally{handle.setPointerCapture=capture;}
 });
 console.log(`${passed} pane-resize groups passed`);
}finally{dom.window.close();fs.rmSync(output,{force:true});}
