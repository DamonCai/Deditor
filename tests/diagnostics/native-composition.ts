// Diagnostic only: never imported by src or the production build.
import { invoke } from '@tauri-apps/api/core';
declare const __COMPOSITION_LOG__: string;
declare const __COMPOSITION_FIXTURES__: string;
const records: unknown[]=[];const maxRecords=600,maxText=12000;
let seq=0,stopped=false,last:HTMLElement|null=null,timer:ReturnType<typeof setTimeout>|undefined,frame=0;
let writes=Promise.resolve();const cleanups:Array<()=>void>=[];
const status=document.createElement('div');status.dataset.diagnosticOnly='native-composition';
status.style.cssText='position:fixed;bottom:25px;right:6px;z-index:2147483647;pointer-events:none;background:#111;color:#fff;padding:4px 6px;font:11px monospace';
status.textContent='COMPOSITION DIAGNOSTIC — self fixtures only';document.body.append(status);
const allowedPath=()=>{const path=document.querySelector('.titlebar-filename')?.getAttribute('title')??'';return path.startsWith(__COMPOSITION_FIXTURES__+'/')?path:null;};
const surface=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLElement>('.ProseMirror, .cm-content, textarea, input'):null;
const box=(element:Element)=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
function nodePath(root:Node,node:Node|null){if(!node||!root.contains(node))return null;const path:number[]=[];while(node!==root&&node.parentNode){path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes,node));node=node.parentNode;}return path;}
function state(element:HTMLElement){
 const selection=document.getSelection();const raw=element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement?element.value:element.textContent??'';
 const scroll=[];for(let node:HTMLElement|null=element;node;node=node.parentElement){if(node.scrollHeight>node.clientHeight||node.classList.contains('md-visual-scroll'))scroll.push({tag:node.tagName,class:node.className,top:node.scrollTop,left:node.scrollLeft,height:node.clientHeight,total:node.scrollHeight,bounds:box(node)});}
 return {path:allowedPath(),tag:element.tagName,class:element.className,text:raw.slice(0,maxText),textLength:raw.length,textTruncated:raw.length>maxText,bounds:box(element),
  selection:element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement?{start:element.selectionStart,end:element.selectionEnd,direction:element.selectionDirection}:
   {anchorPath:nodePath(element,selection?.anchorNode??null),anchorOffset:selection?.anchorOffset,focusPath:nodePath(element,selection?.focusNode??null),focusOffset:selection?.focusOffset,collapsed:selection?.isCollapsed},scroll,
  // A DOM observer cannot claim access to the separate ProseMirror model.
  prosemirrorModel:'not observed; no public view handle exposed'};
}
function flush(){clearTimeout(timer);timer=undefined;const json=JSON.stringify({diagnostic:'native-composition',limit:maxRecords,maxText,stopped,records},null,2);const data=btoa(unescape(encodeURIComponent(json)));writes=writes.then(()=>invoke('write_binary_file',{path:__COMPOSITION_LOG__,data})).then(()=>{},error=>{status.textContent='COMPOSITION DIAG WRITE FAILED: '+String(error);});}
function stop(){if(stopped)return;stopped=true;cleanups.forEach(fn=>fn());cancelAnimationFrame(frame);frame=0;status.textContent='COMPOSITION DIAGNOSTIC stopped at '+records.length+' records';flush();}
function record(kind:string,data:unknown){if(stopped)return;records.push({seq:++seq,time:performance.now(),kind,data});status.textContent='COMPOSITION DIAGNOSTIC '+seq+'/'+maxRecords;if(records.length>=maxRecords){stop();return;}clearTimeout(timer);timer=setTimeout(flush,120);}
function later(element:HTMLElement,reason:string){if(frame||stopped)return;frame=requestAnimationFrame(()=>{frame=0;if(allowedPath()&&element.isConnected)record('animation-frame:'+reason,state(element));});}
const eventTypes=['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input','textInput','pointerdown','wheel','scroll','focusout'];
for(const type of eventTypes){const listener=(event:Event)=>{
 if(!allowedPath()||stopped)return;const element=surface(event.target)??last;if(!element?.isConnected)return;
 if(type==='scroll'&&event.target instanceof Element&&!event.target.contains(element)&&!element.contains(event.target))return;
 last=element;const e=event as KeyboardEvent&InputEvent&MouseEvent;
 record('event:capture',{type:event.type,trusted:event.isTrusted,key:e.key,code:e.code,keyCode:e.keyCode,meta:e.metaKey,ctrl:e.ctrlKey,alt:e.altKey,shift:e.shiftKey,composing:e.isComposing,inputType:e.inputType,data:e.data,clientX:e.clientX,clientY:e.clientY,button:e.button,buttons:e.buttons,defaultPrevented:event.defaultPrevented,state:state(element)});
 // This is a capture-callback microtask, not necessarily after React's handler.
 queueMicrotask(()=>{if(!stopped&&allowedPath()&&element.isConnected)record('capture-microtask:'+event.type,{defaultPrevented:event.defaultPrevented,state:state(element)});});
 later(element,event.type);
 };window.addEventListener(type,listener,true);cleanups.push(()=>window.removeEventListener(type,listener,true));}
const selection=()=>{if(!allowedPath()||!last?.isConnected||stopped)return;record('selectionchange',state(last));later(last,'selectionchange');};
document.addEventListener('selectionchange',selection);cleanups.push(()=>document.removeEventListener('selectionchange',selection));
const observer=new MutationObserver(changes=>{if(!allowedPath()||!last?.isConnected||stopped)return;if(changes.some(change=>last!.contains(change.target))){record('dom-mutation',state(last));later(last,'dom-mutation');}});
observer.observe(document.body,{subtree:true,childList:true,characterData:true});cleanups.push(()=>observer.disconnect());
window.addEventListener('pagehide',stop,{once:true});
record('installed',{userAgent:navigator.userAgent,fixtureRoot:__COMPOSITION_FIXTURES__,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio}});flush();
