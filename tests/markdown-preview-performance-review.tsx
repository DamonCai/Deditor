import React from 'react';
import { createRoot } from 'react-dom/client';
import Preview from '../src/components/Preview';
import { useEditorStore } from '../src/store/editor';
import { PreviewScrollIndex, markerFloor } from '../src/lib/previewScrollIndex';
import '../src/styles.css';
const source = '# Scroll index review\n\n```mermaid\ngraph TD; A-->B\n```\n\n'+Array.from({length:200},(_,i)=>`## Heading ${i}\n\nParagraph 中文 ${i} ${'wrapping text '.repeat(8)}\n\n- [x] parent ${i}\n  - child\n\n\`\`\`typescript\nconst value${i} = ${i};\n\`\`\`\n\n`).join('');
const total=source.split('\n').length;
useEditorStore.setState(s=>({tabs:[{id:'preview-perf',filePath:'/generated/preview-perf.md',content:source,savedContent:source}],activeId:'preview-perf',markdownMode:'preview',theme:'light',tocVisible:false,markdownSettings:{...s.markdownSettings,customCss:''}}));
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const assert=(ok:unknown,msg:string)=>{if(!ok)throw new Error(msg);};
const oldMarkers=(root:HTMLElement)=>{const lines:number[]=[],tops:number[]=[];root.querySelectorAll<HTMLElement>('[data-line]').forEach(el=>{const n=Number(el.dataset.line);if(Number.isFinite(n)){lines.push(n);tops.push(el.offsetTop);}});return {lines,tops};};
function legacyFloor(v:number[],n:number){let i=0;for(let k=0;k<v.length;k++){if(v[k]<=n)i=k;else break;}return i;}
function toTop(root:HTMLElement,line:number){const{lines,tops}=oldMarkers(root),max=Math.max(0,root.scrollHeight-root.clientHeight);if(line>total)return max;if(line<=lines[0])return 0;const i=legacyFloor(lines,line);return Math.max(0,i<lines.length-1?tops[i]+(lines[i+1]>lines[i]?(line-lines[i])/(lines[i+1]-lines[i]):0)*(tops[i+1]-tops[i]):tops[i]+Math.max(0,Math.min(1,(line-lines[i])/Math.max(1,total-lines[i])))*(max-tops[i]));}
function toLine(root:HTMLElement){const{lines,tops}=oldMarkers(root),top=root.scrollTop,max=Math.max(0,root.scrollHeight-root.clientHeight);if(max>0&&max-top<2)return total+1;if(top<=tops[0])return lines[0];const i=legacyFloor(tops,top);return i<tops.length-1?lines[i]+(tops[i+1]>tops[i]?(top-tops[i])/(tops[i+1]-tops[i]):0)*(lines[i+1]-lines[i]):lines[i]+Math.max(0,Math.min(1,(top-tops[i])/Math.max(1,max-tops[i])))*(total-lines[i]);}
function Review(){
 const [line,setLine]=React.useState(1),[width,setWidth]=React.useState(1100),[theme,setTheme]=React.useState<'light'|'dark'>('light'),[retain,setRetain]=React.useState(true),[result,setResult]=React.useState('Ready');
 const outgoing=React.useRef(0);
 function prepareInteraction(){
  const root=document.querySelector<HTMLElement>('.preview')!;
  const style=document.createElement('style');style.textContent='.scroll-state-test{padding-top:0!important;padding-bottom:20px!important}.scroll-state-test:hover,.scroll-state-test:focus-within{padding-top:20px!important;padding-bottom:0!important}';root.parentElement!.appendChild(style);
  const list=document.createElement('ul');list.className='scroll-state-test';list.innerHTML='<li data-line="3"><button>Check hover and focus geometry</button></li>';root.prepend(list);root.scrollTo(0,0);
  const index=new PreviewScrollIndex(root);const initial=index.read().tops[0];
  list.querySelector('button')!.addEventListener('click',async()=>{await frames();try{const fresh=oldMarkers(root),cached=index.read();assert(fresh.tops[0]===initial+20,'custom hover/focus moved marker by 20px');assert(JSON.stringify(fresh.tops)===JSON.stringify(cached.tops),'hover/focus invalidates unchanged-size geometry');setResult(JSON.stringify({status:'PASS',case:'real pointer and focus custom CSS',initialTop:initial,finalTop:fresh.tops[0]}));}catch(error){setResult('FAIL '+String(error));}finally{index.destroy();list.remove();style.remove();}});
  setResult('Click the document sample');
 }
 async function run(){
  setResult('Running');
  try{
   const root=document.querySelector<HTMLElement>('.preview')!;
   for(let i=0;i<100&&(!root.querySelector('.mermaid-diagram svg')||root.querySelectorAll('[data-line]').length<600);i++)await pause(100);
   assert(root.querySelector('.mermaid-diagram svg'),'real Mermaid SVG rendered');
   let scans=0;const query=root.querySelectorAll.bind(root);root.querySelectorAll=((selector:string)=>{if(selector==='[data-line]')scans++;return query(selector);}) as typeof root.querySelectorAll;
   const index=new PreviewScrollIndex(root),checks:string[]=[];
   const geometry=(name:string)=>{const fresh=oldMarkers(root),cached=index.read();assert(JSON.stringify(fresh.lines)===JSON.stringify(cached.lines)&&JSON.stringify(fresh.tops)===JSON.stringify(cached.tops),`${name} geometry`);checks.push(name);};
   const incoming=async(value:number,label:string)=>{setLine(value);await frames();const expected=Math.min(root.scrollHeight-root.clientHeight,toTop(root,value));assert(Math.abs(root.scrollTop-expected)<2,`${label}: ${root.scrollTop} != ${expected}`);checks.push(label);};
   await frames();geometry('initial');await incoming(501,'incoming middle');await incoming(total+1,'incoming bottom');await incoming(1,'incoming first');
   const median=(v:number[])=>v.sort((a,b)=>a-b)[2];
   const timing=(fn:()=>unknown)=>Array.from({length:5},()=>{const start=performance.now();for(let i=0;i<100;i++)fn();return(performance.now()-start)/100;});
   index.read();const before=timing(()=>{const m=oldMarkers(root);legacyFloor(m.tops,root.scrollHeight/2);});const after=timing(()=>{const m=index.read();markerFloor(m.tops,root.scrollHeight/2,m.topsOrdered);});
   await pause(250);const counts:number[]=[];
   for(const top of [800,1600,3200,root.scrollHeight]){outgoing.current=-1;const n=scans;root.scrollTo(0,top);await frames();counts.push(scans-n);assert(Math.abs(outgoing.current-toLine(root))<0.01,`outgoing ${top}`);}
   checks.push('outgoing first/middle/bottom');assert(counts.slice(1).every(n=>n===0),'unchanged scroll frames reuse DOM geometry');
   setWidth(720);await frames();geometry('720px width');await incoming(800,'narrow incoming');
   useEditorStore.setState(s=>({editorFontSize:18,markdownSettings:{...s.markdownSettings,documentTheme:'compact',codeWrap:true}}));await frames();geometry('font compact wrap');await incoming(900,'settings incoming');
   document.documentElement.classList.add('dark');setTheme('dark');await pause(350);await frames();geometry('dark rerender');await incoming(1000,'dark incoming');
   const style=document.createElement('style');style.textContent='.preview p { margin-top:37px; }';root.parentElement!.appendChild(style);geometry('sibling custom CSS same task');style.remove();
   const img=document.createElement('img');img.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="240"><rect width="100" height="240" fill="gray"/></svg>');root.firstElementChild!.after(img);await img.decode();await frames();geometry('async image');await incoming(1100,'image incoming');img.remove();
   const a=root.querySelectorAll<HTMLElement>('p')[0],b=root.querySelectorAll<HTMLElement>('p')[1];a.style.marginBottom='100px';b.style.marginBottom='0px';geometry('redistributed block spacing');a.style.marginBottom='';b.style.marginBottom='';
   const original=useEditorStore.getState().tabs[0].content;useEditorStore.getState().setContent(original+'\nTrailing prose change.','preview-perf');await pause(350);await frames();geometry('prose edit rerender');useEditorStore.getState().setContent(original,'preview-perf');await pause(350);
   setRetain(false);await frames();assert(!root.querySelector('[data-line]'),'cold DOM released');setRetain(true);await pause(350);await frames();geometry('cold DOM restored');await incoming(1200,'restored incoming');
   assert(useEditorStore.getState().tabs[0].content===source,'source unchanged');
   index.destroy();root.querySelectorAll=query;
   setResult(JSON.stringify({status:'PASS',checks,markerCount:oldMarkers(root).lines.length,scrollFrameScans:counts,beforeMs:before,afterMs:after,beforeMedian:median(before),afterMedian:median(after),sourceUnchanged:true}));
  }catch(error){setResult('FAIL '+String(error));}
 }
 return <div style={{height:'100vh',display:'flex',flexDirection:'column',width}}><button onClick={run}>Run preview performance checks</button><button onClick={prepareInteraction}>Prepare hover check</button><output data-testid="result">{result}</output><div style={{flex:1,minHeight:0}}><Preview tabId="preview-perf" active retainDom={retain} theme={theme} scrollLine={line} onScroll={value=>{outgoing.current=value;}}/></div></div>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
