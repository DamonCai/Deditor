import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import { useEditorStore } from '../src/store/editor';
import { openEditorSearch } from '../src/lib/editorSearch';
import '../src/styles.css';
const initial = '# 文档标题\n\n开篇正文。\n\n'+Array.from({length:8},(_,i)=>`## 第 ${i+1} 章\n\n${'章节正文，用来检查滚动定位与目录呈现。'.repeat(18)}\n\n### 小节 ${i+1}\n\n小节正文。\n\n`).join('')+'## 重复标题\n\n尾部正文。\n\n## 重复标题\n\n尾部最后一段。\n';
useEditorStore.setState({tabs:[{id:'outline-review',filePath:'/generated/outline.md',content:initial,savedContent:initial}],activeId:'outline-review',markdownMode:'visual',previewMaximized:true,theme:'light',autoSave:'off'});
function Review(){
 const theme=useEditorStore(s=>s.theme);const [result,setResult]=React.useState('');
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
  <nav style={{display:'flex',gap:16,padding:8}}><span>左：阅读编辑　右：预览</span>
   <button onClick={()=>openEditorSearch()}>模拟编辑菜单：查找</button><button onClick={()=>openEditorSearch(true)}>模拟编辑菜单：替换</button>
   <button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button>
   <button onClick={()=>setResult(String(useEditorStore.getState().tabs[0].content===initial))}>核对原文</button>
  </nav>
  <div style={{display:'flex',flex:1,minHeight:0}}><div style={{flex:1,minWidth:0}}><Visual tabId="outline-review" theme={theme}/></div><div style={{flex:1,minWidth:0}}><Preview tabId="outline-review" theme={theme}/></div></div><output>{result}</output>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
