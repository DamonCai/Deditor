import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';

const initial = '底部连续输入位置。水电费\n\n```typescript\nconst bottom = "code";\n```\n\n末尾正文。\n';
const long = '换行、空行与缩进\n\n```typescript\nconst message = "' + 'long text 中文 '.repeat(18) + '";\n\n\tconsole.log(message);\n\n```\n\n末尾正文。\n';
useEditorStore.setState({tabs:[{id:'focus-review',filePath:'/generated/focus-review.md',content:initial,savedContent:initial}],activeId:'focus-review',markdownMode:'visual',theme:'light',autoSave:'off'});
function Review() {
  const theme = useEditorStore(s=>s.theme);
  const [baseline,setBaseline] = React.useState(initial);
  const [result,setResult] = React.useState('');
  const setting = (key:'codeLineNumbers'|'codeWrap') => useEditorStore.setState(s=>({markdownSettings:{...s.markdownSettings,[key]:!s.markdownSettings[key]}}));
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <nav>{[initial,long].map((text,i)=><button key={i} onClick={()=>{useEditorStore.getState().setContent(text,'focus-review','command');setBaseline(text);}}>{i?'长行样例':'截图样例'}</button>)}
      <button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button>
      <button onClick={()=>setting('codeLineNumbers')}>切换行号</button><button onClick={()=>setting('codeWrap')}>切换换行</button>
      <button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button>
      <button onClick={()=>setResult(JSON.stringify({unchanged:useEditorStore.getState().tabs[0].content===baseline,source:useEditorStore.getState().tabs[0].content}))}>核对原文</button>
    </nav>
    <div style={{display:'flex',flex:1,minHeight:0}}><div style={{flex:1,minWidth:0}}><Visual tabId="focus-review" theme={theme}/></div><div style={{flex:1,minWidth:0}}><Preview tabId="focus-review" theme={theme}/></div></div>
    <output>{result}</output>
  </div>;
}
const root=createRoot(document.getElementById('root')!); root.render(<Review/>);
if(import.meta.hot) import.meta.hot.dispose(()=>root.unmount());
