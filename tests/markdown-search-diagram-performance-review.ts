import {applySearch,setCurrentMatch,clearHighlights} from '../src/lib/previewSearch';
import {hydrateMermaid} from '../src/lib/mermaidHydrate';
import '../src/styles.css';
const root=document.getElementById('root')!;
root.innerHTML='<header style="position:sticky;top:0;background:var(--bg,#fff);z-index:2"><button id="search">Run 10000-hit search navigation</button><button id="legacy-long">Original long diagram</button><button id="legacy-edges">Original 501-edge diagram</button><button id="fixed">Production diagrams</button><button id="theme">Toggle dark</button><output id="result">Ready</output></header><main class="preview" style="height:75vh;overflow:auto"></main>';
const output=document.querySelector('output')!,main=document.querySelector<HTMLElement>('main')!;
const long='flowchart LR\nA["Long source retained '+ 'X'.repeat(50020)+'"]-->B[Complete]';
const edges='flowchart LR\n'+Array.from({length:501},()=> 'A[501 edges]-->B[Complete]').join('\n');
const frame=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const report=(value:unknown)=>output.textContent=JSON.stringify(value);
document.getElementById('theme')!.onclick=()=>document.documentElement.classList.toggle('dark');
document.getElementById('search')!.onclick=async()=>{
 main.innerHTML=Array.from({length:1000},(_,i)=>`<p>${i} ${'target '.repeat(10)}</p>`).join('');
 const original=main.textContent,result=applySearch(main,'target');
 const start=performance.now();for(let i=0;i<100;i++)setCurrentMatch(result.matches,(i*97)%10000);
 const elapsed=performance.now()-start;await frame();const current=main.querySelectorAll('.current').length;
 const top=result.matches[9603].getBoundingClientRect(),rect=main.getBoundingClientRect();
 const centered=Math.abs((top.top+top.bottom-rect.top-rect.bottom)/2)<30;
 clearHighlights(main);report({status:current===1&&centered&&main.textContent===original?'PASS':'FAIL',matches:result.total,steps:100,elapsed,current,centered,sourceUnchanged:main.textContent===original});
};
async function baseline(source:string){output.textContent='Rendering original defaults';main.replaceChildren();try{const mermaid=(await import('mermaid')).default;mermaid.initialize({startOnLoad:false,securityLevel:'loose'});const result=await mermaid.render('default-'+Date.now(),source);main.innerHTML=result.svg;report({mode:'default',sourceLength:source.length,labels:[...main.querySelectorAll('.nodeLabel')].map(el=>({length:el.textContent?.length,text:el.textContent?.slice(0,100)}))});}catch(error){report({mode:'default',sourceLength:source.length,error:String(error)});}}
document.getElementById('legacy-long')!.onclick=()=>baseline(long);
document.getElementById('legacy-edges')!.onclick=()=>baseline(edges);
document.getElementById('fixed')!.onclick=async()=>{
 output.textContent='Rendering production diagrams';main.replaceChildren();const theme=document.documentElement.classList.contains('dark')?'dark':'light';
 for(const source of [long,edges]){const el=document.createElement('div');el.className='mermaid-diagram';el.dataset.mermaidSource=source;main.append(el);}
 const start=performance.now();await hydrateMermaid(main,theme).done;
 const errors=main.querySelectorAll('.error').length,count=main.querySelectorAll('svg').length;
 const text=main.textContent??'';report({status:errors===0&&count===2&&text.includes('Long source retained')&&text.includes('501 edges')?'PASS':'FAIL',theme,count,errors,sourceLength:long.length,edges:501,milliseconds:performance.now()-start,labels:[...main.querySelectorAll('.nodeLabel')].map(el=>({length:el.textContent?.length,text:el.textContent?.slice(0,60)})),renderedEdges:main.querySelectorAll('path.flowchart-link').length});
};
