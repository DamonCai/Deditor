// Self-created text; no persisted state or native IO.
import React from 'react';
import { beginPaneResize } from '../src/lib/paneResize';
import { createRoot } from 'react-dom/client';
import Preview from '../src/components/Preview';
import EditorSlot from '../src/components/EditorSlot';
import { useEditorStore } from '../src/store/editor';
import '../src/styles.css';
const source='# 预览分隔线验收\n\n'+Array.from({length:8},(_,i)=>`第${i+1}段：左右拖动中间线，不应选中预览文字。松开鼠标后应能正常选择这些文字。`).join('\n\n')+'\n';
useEditorStore.setState({tabs:[{id:'divider',filePath:'/generated/divider.md',content:source,savedContent:source}],activeId:'divider',markdownMode:'split',theme:'light',language:'zh',autoSave:'off'});
function Review(){
 const [pct,setPct]=React.useState(50),[selection,setSelection]=React.useState(''),[dark,setDark]=React.useState(false);
 const stop=React.useRef<(()=>void)|null>(null);
 React.useEffect(()=>()=>stop.current?.(),[]);
 React.useEffect(()=>{const update=()=>setSelection(document.getSelection()?.toString()??'');document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);},[]);
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav><button onClick={()=>{document.documentElement.classList.toggle('dark',!dark);setDark(!dark);}}>切换主题</button><button onClick={()=>setSelection(document.getSelection()?.toString()??'')}>核对选区</button><span data-testid="ratio">{pct.toFixed(1)}</span></nav><div style={{display:'flex',flex:1,minHeight:0}}><div style={{width:`${100-pct}%`,minWidth:0}}><EditorSlot tabId="divider" theme={dark?'dark':'light'} fontSize={14}/></div><div className="splitter" onPointerDown={e=>{stop.current?.();stop.current=beginPaneResize(e.currentTarget,e.nativeEvent,e=>setPct(100-Math.min(85,Math.max(15,e.clientX/window.innerWidth*100))));}}/><div style={{width:`${pct}%`,minWidth:0}}><Preview tabId="divider" theme={dark?'dark':'light'}/></div></div><output style={{height:42,overflow:'auto'}}>{selection}</output></div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
