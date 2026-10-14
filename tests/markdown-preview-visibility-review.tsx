import React from 'react';
import { createRoot } from 'react-dom/client';
import Preview from '../src/components/Preview';
import { useEditorStore } from '../src/store/editor';
import '../src/styles.css';
const sources = {
 a: '# Retained alpha\n\n中文 **format** [link](#retained-alpha)\n\n```typescript\nconst alpha = 1;\n```\n\n```mermaid\ngraph TD; A-->B\n```\n',
 b: '# Retained beta\n\n- [x] parent\n  - child\n\n| A | B |\n| - | - |\n| one | two |\n',
};
useEditorStore.setState(s=>({tabs:Object.entries(sources).map(([id,content])=>({id,filePath:`/generated/${id}.md`,content,savedContent:content})),activeId:'a',theme:'light',markdownMode:'preview',tocVisible:false,markdownSettings:{...s.markdownSettings,customCss:''}}));
const pause=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
const assert=(ok:unknown,message:string)=>{if(!ok)throw new Error(message);};
function Review(){
 const [active,setActive]=React.useState('a'),[theme,setTheme]=React.useState<'light'|'dark'>('light'),[cold,setCold]=React.useState(false),[result,setResult]=React.useState('Ready');
 const surface=(id:string)=>document.querySelector<HTMLElement>(`[data-slot="${id}"] .preview`)!;
 const ready=async(id:string,needle:string)=>{for(let i=0;i<50;i++){if(surface(id).textContent?.includes(needle))return;await pause(100);}throw new Error(`Missing ${id}: ${needle}`);};
 const checks:string[]=[];
 async function run(){
  setResult('Running');
  try{
   await ready('a','Retained alpha');
   for(let i=0;i<100&&!surface('a').querySelector('.mermaid-diagram svg');i++)await pause(100);
   assert(surface('a').querySelector('.mermaid-diagram svg'),'initial real Mermaid SVG');checks.push('initial real diagram');
   setActive('b');await ready('b','Retained beta');
   const previous=surface('a').innerHTML;
   useEditorStore.getState().setContent(sources.a+'\nLatest hidden 中文 😀\n','a');await pause(250);
   assert(surface('a').innerHTML===previous,'hidden source leaves retained HTML untouched');checks.push('hidden source deferred');
   setTheme('dark');document.documentElement.setAttribute('data-theme','dark');await pause(250);
   assert(surface('a').innerHTML===previous,'hidden theme leaves retained HTML untouched');checks.push('hidden theme deferred');
   setActive('a');await ready('a','Latest hidden 中文 😀');
   assert(surface('a').querySelector('.shiki')?.getAttribute('style')?.includes('#282c34'),'activation uses current dark code theme');checks.push('activation uses current source and theme');
   setActive('b');setCold(true);await frames();assert(surface('a').innerHTML==='','cold DOM released');
   useEditorStore.getState().setContent(sources.a+'\nLatest cold source\n','a');await pause(200);assert(surface('a').innerHTML==='','cold updates do not recreate DOM');
   setCold(false);setActive('a');await ready('a','Latest cold source');checks.push('cold DOM latest source');
   useEditorStore.getState().setContent(sources.a,'a');setTheme('light');document.documentElement.setAttribute('data-theme','light');await ready('a','Retained alpha');await pause(300);
   assert(!surface('a').textContent?.includes('Latest'),'original source restored');
   assert(useEditorStore.getState().tabs.every(tab=>tab.content===sources[tab.id as keyof typeof sources]),'all source buffers exactly restored');
   setResult(JSON.stringify({status:'PASS',checks,sourceUnchanged:true}));
  }catch(error){setResult(`FAIL ${String(error)}`);}
 }
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><button onClick={run}>Run hidden preview checks</button><output data-testid="result">{result}</output><div style={{flex:1,minHeight:0,position:'relative'}}>{['a','b'].map(id=><div key={id} data-slot={id} style={{display:active===id?'block':'none',position:'absolute',inset:0}}><Preview tabId={id} active={active===id} retainDom={id!=='a'||!cold} theme={theme}/></div>)}</div></div>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
