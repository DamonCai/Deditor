// Self-created fixture, with no persistence or user file access.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const source = '# 阅读编辑自适应验证\n\n'+ '中文正文、宽屏布局及文字选择验证。'.repeat(22)+'\n\n| 项目名称 | 说明 | 结果 |\n| --- | --- | --- |\n| 第一行中文 | 中间文字 | 完整末尾 |\n| 第二行 **粗体** | 多行<br>第二段 | 保留末格 |\n| 最后一行 | 删除后撤销 | 原文相同 |\n\n```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```\n\n```plantuml\n@startuml\nAlice -> Bob: Hello\n@enduml\n```\n\n尾部正文保留。\n';
useEditorStore.setState({tabs:[{id:'feedback',filePath:'/generated/feedback.md',content:source,savedContent:source}],activeId:'feedback',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){
 const theme=useEditorStore(s=>s.theme);const content=useEditorStore(s=>s.tabs[0].content);
 const [sidebar,setSidebar]=React.useState(true),[preview,setPreview]=React.useState(false),[width,setWidth]=React.useState('100%'),[snapshot,setSnapshot]=React.useState('');
 return <div style={{height:'100vh',width,maxWidth:'100%',display:'flex',flexDirection:'column'}}>
 <nav style={{display:'flex',gap:12,flexWrap:'wrap'}}><button onClick={()=>setSidebar(!sidebar)}>切换侧栏</button><button onClick={()=>setPreview(!preview)}>切换真实预览</button><button onClick={()=>{const t=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',t==='dark');useEditorStore.setState({theme:t});}}>切换主题</button><button onClick={()=>setWidth(width==='720px'?'100%':'720px')}>720px 窄窗</button><button onClick={()=>useEditorStore.setState({language:useEditorStore.getState().language==='zh'?'en':'zh'})}>中英文</button><button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button><button onClick={()=>setSnapshot(JSON.stringify({unchanged:content===source,source:content}))}>核对原文</button></nav>
 <div style={{display:'flex',flex:1,minHeight:0}}>{sidebar&&<aside style={{width:240,flexShrink:0,borderRight:'1px solid var(--border)'}}>测试侧栏</aside>}<main style={{flex:1,minWidth:0}}>{preview?<Preview tabId="feedback" theme={theme}/>:<Visual tabId="feedback" theme={theme}/>}</main></div><output style={{maxHeight:80,overflow:'auto'}}>{snapshot}</output></div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
