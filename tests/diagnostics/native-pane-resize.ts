// Diagnostic-only entry, injected into a copied dist by the preparation script.
// Never imported by the application. Observes native events; dispatches none.
import { invoke } from '@tauri-apps/api/core';
declare const __DIAG_LOG_PATH__: string;
const records: unknown[] = [];
let sequence = 0, timer: ReturnType<typeof setTimeout> | undefined, writing = Promise.resolve();
const rect = (node: Element | null) => {
  if (!node) return null;
  const r = node.getBoundingClientRect();
  return { x:r.x, y:r.y, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
};
const identify = (node: EventTarget | null) => node instanceof Element
  ? { tag:node.tagName, id:node.id, class:node.getAttribute('class') } : String(node);
const handles = () => Array.from(document.querySelectorAll<HTMLElement>('.editor-group .splitter'));
const geometry = () => ({
  viewport:{ width:innerWidth,height:innerHeight,dpr:devicePixelRatio,screenX:window.screenX,screenY:window.screenY,visualScale:visualViewport?.scale },
  handles:handles().map(handle => ({ handle:rect(handle), parent:rect(handle.parentElement),
    children:Array.from(handle.parentElement?.children ?? []).map(node=>({ node:identify(node),bounds:rect(node) })),
    centerHit:identify(document.elementFromPoint(handle.getBoundingClientRect().x + 2,handle.getBoundingClientRect().y + handle.getBoundingClientRect().height / 2)),
    pointerEvents:getComputedStyle(handle).pointerEvents,dragging:handle.classList.contains('dragging') })),
  resizing:document.body.classList.contains('deditor-pane-resizing'),selectionLength:getSelection()?.toString().length ?? 0,
});
const status = document.createElement('div');
status.style.cssText='position:fixed;bottom:25px;right:6px;z-index:2147483647;pointer-events:none;background:#111;color:#fff;padding:4px 6px;font:11px monospace;max-width:600px;white-space:pre-wrap';
status.setAttribute('data-diagnostic-only','pane-resize');
document.body.append(status);
function flush() {
  clearTimeout(timer);timer=undefined;
  const content=JSON.stringify({ diagnostic:'native-pane-resize',logPath:__DIAG_LOG_PATH__,records },null,2);
  // Own diagnostic file only; binary writer avoids generating editor histories.
  const data=btoa(unescape(encodeURIComponent(content)));
  writing=writing.then(()=>invoke('write_binary_file',{path:__DIAG_LOG_PATH__,data})).then(()=>{},error=>{status.textContent='DIAG WRITE FAILED '+String(error);});
}
function record(kind:string,data:unknown) {
  records.push({seq:++sequence,time:performance.now(),kind,data});
  clearTimeout(timer);timer=setTimeout(flush,150);
}
function reportGeometry(reason:string) {
  const info=geometry();record('geometry:'+reason,info);
  status.textContent='DIAGNOSTIC ONLY '+info.handles.map((h,index)=>`#${index} x=${h.handle?.x.toFixed(2)}..${h.handle?.right.toFixed(2)} y=${h.handle?.y.toFixed(0)}..${h.handle?.bottom.toFixed(0)}`).join(' | ');
}
const wrapped=new WeakSet<HTMLElement>();
const resize=new ResizeObserver(()=>reportGeometry('resize'));
function observeHandles() {
  for(const handle of handles()){
    if(wrapped.has(handle))continue;wrapped.add(handle);resize.observe(handle);if(handle.parentElement)resize.observe(handle.parentElement);
    for(const name of ['setPointerCapture','releasePointerCapture'] as const){
      const original=handle[name];
      if(typeof original!=='function'){record('capture-unavailable',{name});continue;}
      handle[name]=function(id:number){record('capture-call',{name,id,before:this.hasPointerCapture(id)});try{const result=original.call(this,id);record('capture-result',{name,id,after:this.hasPointerCapture(id)});return result;}catch(error){record('capture-error',{name,id,error:String(error)});throw error;}};
    }
    reportGeometry('handle-mounted');
  }
}
new MutationObserver(observeHandles).observe(document.body,{childList:true,subtree:true});
observeHandles();
for(const name of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','mousedown','mousemove','mouseup','selectstart']){
  window.addEventListener(name,event=>{
    if(!handles().length)return;
    const mouse=event as PointerEvent;
    const info={type:event.type,isTrusted:event.isTrusted,button:mouse.button,buttons:mouse.buttons,pointerId:mouse.pointerId,pointerType:mouse.pointerType,isPrimary:mouse.isPrimary,
      clientX:mouse.clientX,clientY:mouse.clientY,screenX:mouse.screenX,screenY:mouse.screenY,target:identify(event.target),
      point: Number.isFinite(mouse.clientX)?identify(document.elementFromPoint(mouse.clientX,mouse.clientY)):null,
      handles:handles().map(h=>({bounds:rect(h),capture:mouse.pointerId!==undefined?h.hasPointerCapture(mouse.pointerId):null})),defaultPrevented:event.defaultPrevented};
    record('event:capture',info);
    queueMicrotask(()=>record('event:after',{type:event.type,defaultPrevented:event.defaultPrevented,...geometry()}));
    if(/up$|cancel$/.test(name))requestAnimationFrame(()=>{reportGeometry(name+'-frame');flush();});
  },true);
}
window.addEventListener('blur',()=>{record('window:blur',geometry());flush();});
record('installed',{userAgent:navigator.userAgent});
flush();
