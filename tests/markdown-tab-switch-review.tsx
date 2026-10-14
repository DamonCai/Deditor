// Generated documents only. The legacy branch reproduces the previous App lifecycle.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Host from '../src/components/MarkdownVisualHost';
import Slot from '../src/components/MarkdownVisualSlot';
import TabBar from '../src/components/TabBar';
import { useEditorStore } from '../src/store/editor';
import { getVisualEditor } from '../src/lib/markdownVisualBridge';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const params=new URLSearchParams(location.search), legacy=params.has('legacy'), count=Number(params.get('count')||600);
const source=(id:string)=>`# ${id} 文件切换验证\n\n`+Array.from({length:count},(_,i)=>`第 ${i} 段：中文内容 **粗体** [链接](https://example.com) 😀\n\n`).join('');
const tabs=['甲','乙','丙'].map(id=>({id,filePath:`/generated/${id}.md`,content:source(id),savedContent:source(id)}));
useEditorStore.setState({tabs,activeId:'甲',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off'});
let pending:{id:string;start:number}|undefined;
const samples:unknown[]=[];const identities=new WeakMap<Element,number>();let nextIdentity=0;
document.addEventListener('click',event=>{const id=(event.target as Element).closest('[data-tab-id]')?.getAttribute('data-tab-id');if(id&&id!==useEditorStore.getState().activeId)pending={id,start:performance.now()};},true);
function frame(){
 if(pending&&getVisualEditor()?.tabId===pending.id){
  const dom=document.querySelector('[aria-hidden="false"] .ProseMirror');
  if(dom?.getAttribute('contenteditable')==='true'){
   const captured=pending;pending=undefined;
   if(!identities.has(dom))identities.set(dom,++nextIdentity);
   requestAnimationFrame(()=>{samples.push({id:captured.id,ms:+(performance.now()-captured.start).toFixed(1),instance:identities.get(dom),live:document.querySelectorAll('.ProseMirror').length});document.querySelector('#metrics')!.textContent=JSON.stringify(samples);});
  }
 }
 requestAnimationFrame(frame);
}requestAnimationFrame(frame);
function Review(){
 const id=useEditorStore(s=>s.activeId),theme=useEditorStore(s=>s.theme),mode=useEditorStore(s=>s.markdownMode),content=useEditorStore(s=>s.tabs.find(t=>t.id===s.activeId)?.content);
 const [narrow,setNarrow]=React.useState(false);
 return <div style={{height:'100vh',width:narrow?720:'100%',maxWidth:'100%',display:'flex',flexDirection:'column'}}>
  <TabBar/>
  <nav><button onClick={()=>setNarrow(!narrow)}>720px</button><button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>主题</button><button onClick={()=>useEditorStore.setState({markdownMode:mode==='visual'?'source':'visual'})}>模式</button><button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button><span>{legacy?'BEFORE':'AFTER'} / {count}段 / {content===source(id!)?'原文一致':'已修改'}</span></nav>
  {legacy?<Slot key={id} tabId={id!} active={mode==='visual'} theme={theme}/>:<Host activeId={id} active={mode==='visual'} theme={theme}/>}
  <output id="metrics" style={{maxHeight:85,overflow:'auto',fontSize:12}}/>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
