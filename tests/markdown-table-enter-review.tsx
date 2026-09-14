// Generated fixture only; no user files or persisted state are read.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';

const source = "# 表格回车验证\n\nBefore unchanged\n\n| A | B | C |\n| --- | --- | --- |\n| one | two |  |\n| - alpha<br>- beta | 最后一格 | four |\n\nAfter unchanged\n";
useEditorStore.setState({tabs:[{id:'enter-review',filePath:'/generated/enter-review.md',content:source,savedContent:source}],activeId:'enter-review',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review() {
 const content=useEditorStore(s=>s.tabs[0].content),theme=useEditorStore(s=>s.theme);
 const [narrow,setNarrow]=React.useState(false),[report,setReport]=React.useState('');
 return <div style={{height:'100vh',width:narrow?720:'100%',maxWidth:'100%',display:'flex',flexDirection:'column'}}>
  <nav><button onClick={()=>useEditorStore.getState().setContent(source,'enter-review','command')}>重置样例</button><button onClick={()=>setNarrow(!narrow)}>切换720px</button><button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button><button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button><button onClick={()=>setReport(JSON.stringify({unchanged:content===source,rows:document.querySelectorAll('.ProseMirror tr').length}))}>检查状态</button></nav>
  <Visual tabId="enter-review" theme={theme}/><output>{report}</output><pre data-testid="source" style={{maxHeight:100,overflow:'auto'}}>{content}</pre>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
