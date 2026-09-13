// Generated fixture only; no user files or persisted state are read.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';

const source = '# 表格选列验证\n\n| 工作项 | 验收目标 | 备注 |\n| --- | --- | --- |\n| 建立事前防控机制，核心链路变更全部纳入机制卡点 | 1. 变更评审覆盖率100%<br>2. 故障下降50%<br>3. 清单完成率100% | 保留甲 |\n| 建立监测应急机制，故障感知由被动转主动 | 1. 发现时间≤24h<br>2. 恢复时间≤30min<br>3. 业务方先发现=0 | 保留乙 |\n|  | 1. 中文与😀<br>2. **粗体**<br>3. 最后目标 | 保留丙 |\n\n尾部保持不变。\n';
useEditorStore.setState({tabs:[{id:'column-review',filePath:'/generated/column-review.md',content:source,savedContent:source}],activeId:'column-review',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review() {
 const content=useEditorStore(s=>s.tabs[0].content),theme=useEditorStore(s=>s.theme);
 const [narrow,setNarrow]=React.useState(false),[report,setReport]=React.useState('');
 return <div style={{height:'100vh',width:narrow?720:'100%',maxWidth:'100%',display:'flex',flexDirection:'column'}}>
  <nav><button onClick={()=>useEditorStore.getState().setContent(source,'column-review','command')}>重置样例</button><button onClick={()=>setNarrow(!narrow)}>切换720px</button><button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button><button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button><button onClick={()=>setReport(JSON.stringify({unchanged:content===source,selected:[...document.querySelectorAll('.selectedCell')].map(cell=>({row:(cell.parentElement as HTMLTableRowElement).rowIndex,col:(cell as HTMLTableCellElement).cellIndex,text:cell.textContent}))}))}>检查选区</button></nav>
  <Visual tabId="column-review" theme={theme}/><output>{report}</output><pre data-testid="source" style={{maxHeight:100,overflow:'auto'}}>{content}</pre>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
