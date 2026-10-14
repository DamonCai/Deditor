import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { performance } from 'node:perf_hooks';
import { PreviewScrollIndex, markerFloor } from '../src/lib/previewScrollIndex';
const dom = new JSDOM('<html><head></head><body><main><style></style><div id="root"></div><aside></aside></main></body></html>');
Object.assign(globalThis, { MutationObserver: dom.window.MutationObserver });
const root = dom.window.document.getElementById('root')!;
let reads = 0, width = 700, height = 600, scrollHeight = 60000;
Object.defineProperties(root, { clientWidth: { get: () => width }, clientHeight: { get: () => height }, scrollHeight: { get: () => scrollHeight } });
function populate(n: number) {
  root.innerHTML = Array.from({length:n}, (_,i) => `<p data-line="${i * 3 + 1}">中文 ${i}</p>`).join('');
  Array.from(root.children).forEach((el,i) => Object.defineProperty(el, 'offsetTop', { configurable: true, get: () => { reads++; return i * 30; } }));
}
const legacy = () => {
  const lines: number[] = [], tops: number[] = [];
  root.querySelectorAll<HTMLElement>('[data-line]').forEach(el => { const line=Number(el.dataset.line); if(Number.isFinite(line)){lines.push(line);tops.push(el.offsetTop);} });
  return { lines, tops };
};
const index = new PreviewScrollIndex(root);
for (const n of [0,1,30,2000]) {
  populate(n); index.reset();
  assert.deepEqual(index.read().lines, legacy().lines);
  assert.deepEqual(index.read().tops, legacy().tops);
  reads = 0;
  for(let i=0;i<100;i++) index.read();
  assert.equal(reads,0,'unchanged scroll frames do not remeasure markers');
}
let checks=0;
for (const values of [[],[0],[1,1,1,3,8],[1,20,3,8],[20,3,8],Array.from({length:2000},(_,i)=>i*3)]) {
 const sorted=values.every((v,i)=>!i||v>=values[i-1]);
 for(let target=-2;target<=6010;target+=0.5){
  let old=0;for(let k=0;k<values.length;k++){if(values[k]<=target)old=k;else break;}
  assert.equal(markerFloor(values,target,sorted),old);checks++;
 }
}
function checkInvalidation(label: string, mutate: () => void) {
 index.read(); mutate(); reads=0; const actual=index.read();
 assert.ok(reads>0,label); assert.deepEqual(actual.tops,legacy().tops,label);
}
checkInvalidation('same-task source marker edit',()=>root.firstElementChild!.setAttribute('data-line','2'));
checkInvalidation('inline CSS',()=>root.firstElementChild!.setAttribute('style','margin: 30px'));
checkInvalidation('theme ancestor',()=>dom.window.document.body.classList.toggle('dark'));
checkInvalidation('sibling custom stylesheet',()=>dom.window.document.querySelector('style')!.textContent='p{margin:40px}');
checkInvalidation('window width before resize delivery',()=>{width=450;});
checkInvalidation('viewport height',()=>{height=450;});
checkInvalidation('async content height',()=>{scrollHeight+=300;});
checkInvalidation('loaded image',()=>root.dispatchEvent(new dom.window.Event('load')));
checkInvalidation('hover CSS',()=>root.dispatchEvent(new dom.window.Event('pointerover')));
checkInvalidation('focus CSS',()=>root.dispatchEvent(new dom.window.Event('focusin')));
checkInvalidation('checkbox checked CSS',()=>root.dispatchEvent(new dom.window.Event('change')));
root.dispatchEvent(new dom.window.Event('transitionrun'));index.read();reads=0;index.read();assert.ok(reads>0,'margin transition remeasured while active');root.dispatchEvent(new dom.window.Event('transitionend'));index.read();reads=0;index.read();assert.equal(reads,0,'reuse after transition');
index.read(); dom.window.document.querySelector('aside')!.className='active'; reads=0; index.read(); assert.equal(reads,0,'outline active state does not invalidate document');
populate(2000);index.reset();index.read();
const median=(v:number[])=>v.sort((a,b)=>a-b)[Math.floor(v.length/2)];
const timings=(fn:()=>unknown)=>Array.from({length:5},()=>{const t=performance.now();for(let i=0;i<100;i++)fn();return (performance.now()-t)/100;});
const before=timings(()=>{const m=legacy();markerFloor(m.tops,30000,false);});
const after=timings(()=>{const m=index.read();markerFloor(m.tops,30000,m.topsOrdered);});
console.log(JSON.stringify({test:'Preview scroll (JSDOM, 2000 markers, 5 x 100 lookups)',checks,beforeMs:before,afterMs:after,beforeMedian:median(before),afterMedian:median(after),markerReadsBefore:2000,markerReadsAfter:0}));
index.destroy();
console.log('PASS source geometry reuse, invalidation, unordered/duplicate boundaries, empty document and lifecycle');
