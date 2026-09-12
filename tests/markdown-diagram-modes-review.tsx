import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import PreviewModeSwitch from '../src/components/PreviewModeSwitch';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const source = '# 图表三模式验收\n\n正文前文。\n\n```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```\n\n两图之间正文。\n\n```plantuml\n@startuml\nAlice -> Bob: Hello\nBob --> Alice: OK\n@enduml\n```\n\n```typescript\nconst value = 1;\n```\n\n正文末尾。\n';
useEditorStore.setState({tabs:[{id:'diagram-review',filePath:'/generated/diagram-review.md',content:source,savedContent:source}],activeId:'diagram-review',markdownMode:'visual',theme:'light',language:'zh',autoSave:'off'});
function Review() {
 const theme=useEditorStore(s=>s.theme);const [narrow,setNarrow]=React.useState(false);const [result,setResult]=React.useState('');
 return <div style={{height:'100vh',display:'flex',flexDirection:'column',width:narrow?720:'100%',maxWidth:'100%'}}><nav style={{display:'flex',alignItems:'center',gap:8}}>
 <button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button>
 <button onClick={()=>setNarrow(!narrow)}>720px 窄窗</button>
 <button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button>
 <button onClick={()=>setResult(JSON.stringify({unchanged:useEditorStore.getState().tabs[0].content===source,source:useEditorStore.getState().tabs[0].content}))}>核对原文</button>
 <span className="diagram-mode-reference" style={{marginLeft:'auto',display:'flex'}}><PreviewModeSwitch/></span>
 </nav><div style={{flex:1,minHeight:0}}><Visual tabId="diagram-review" theme={theme}/></div><output>{result}</output></div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
