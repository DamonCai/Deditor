import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { applySearch, setCurrentMatch, clearHighlights } from '../src/lib/previewSearch';
const dom = new JSDOM('<!doctype html><body></body>');
Object.assign(globalThis,{document:dom.window.document,NodeFilter:dom.window.NodeFilter});
let scrolls=0;
dom.window.HTMLElement.prototype.scrollIntoView=function(){scrolls++;};
const root=document.createElement('div');document.body.append(root);
root.innerHTML='<p>目标 <b>目标</b> 目标</p><svg><text>目标</text></svg><style>.目标{}</style>';
let result=applySearch(root,'目标');assert.equal(result.total,3);
setCurrentMatch(result.matches,0);setCurrentMatch(result.matches,2);assert.equal(root.querySelectorAll('.current').length,1);
assert.equal(result.matches[2].className,'preview-search-match current');
setCurrentMatch(result.matches,2);assert.equal(scrolls,3,'repeat navigation still centers the same result');
setCurrentMatch(result.matches,-1);assert.equal(root.querySelectorAll('.current').length,0);
setCurrentMatch(result.matches,3);assert.equal(root.querySelectorAll('.current').length,0);
clearHighlights(root);assert.equal(root.innerHTML,'<p>目标 <b>目标</b> 目标</p><svg><text>目标</text></svg><style>.目标{}</style>');
const external=[document.createElement('span'),document.createElement('span')];external.forEach(m=>m.className='current');setCurrentMatch(external,1);assert.equal(external[0].className,'');assert.equal(external[1].className,'current');
root.innerHTML=Array.from({length:1000},()=>'<p>'+ 'target '.repeat(10)+'</p>').join('');result=applySearch(root,'target');assert.equal(result.total,10000);
let calls=0;const proto=dom.window.DOMTokenList.prototype;
for(const name of ['toggle','add','remove'] as const){const original=proto[name];(proto as any)[name]=function(...args:any[]){calls++;return (original as any).apply(this,args);};}
const indices=Array.from({length:100},(_,i)=>(i*97)%10000);
const run=(fn:(matches:HTMLSpanElement[],idx:number)=>void)=>{calls=0;const start=performance.now();for(const idx of indices)fn(result.matches,idx);return {milliseconds:performance.now()-start,classOperations:calls};};
const trials=[];
for(let trial=0;trial<5;trial++) {
 result=applySearch(root,'target');
 const legacy=run((matches,idx)=>{matches.forEach((match,i)=>match.classList.toggle('current',i===idx));matches[idx].scrollIntoView();});
 // A fresh result owns no preexisting current marker, as in production.
 result=applySearch(root,'target');const optimized=run(setCurrentMatch);
 assert.equal(legacy.classOperations,1000000);assert.equal(optimized.classOperations,199);
 assert.equal(root.querySelectorAll('.current').length,1);assert.equal(result.matches[indices.at(-1)!].classList.contains('current'),true);
 clearHighlights(root);assert.equal(root.textContent,'target '.repeat(10000));
 trials.push({legacy,optimized});
}
const median=(values:number[])=>values.sort((a,b)=>a-b)[2];
console.log(JSON.stringify({status:'PASS',matches:10000,navigations:100,trials,legacyMedianMs:median(trials.map(x=>x.legacy.milliseconds)),optimizedMedianMs:median(trials.map(x=>x.optimized.milliseconds)),sourceRestored:true}));
dom.window.close();
