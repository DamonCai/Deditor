import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import PreviewModeSwitch from '../src/components/PreviewModeSwitch';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const source = '# 图表三模式验收\n\n正文前文。\n\n```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```\n\n两图之间正文。\n\n```plantuml\n@startuml\nAlice -> Bob: Hello\nBob --> Alice: OK\n@enduml\n```\n\n```typescript\nconst value = 1;\n```\n\n正文末尾。\n';
useEditorStore.setState({tabs:[{id:'diagram-review',filePath:'/generated/diagram-review.md',content:source,savedContent:source}],activeId:'diagram-review',markdownMode:'visual',theme:'light',language:'zh',autoSave:'off'});
const longSource = '# 长文拖动验收\n\n' + Array.from({length:30},(_,i)=>`前文 ${i+1}：滚动位置样例。\n\n`).join('') + '```mermaid\nflowchart LR\n A[开始] --> B[完成]\n```\n\n图表后第一段。\n\n图表后第二段。\n\n| 名称 | 内容 |\n| --- | --- |\n| 中文 | **粗体** |\n| 第二行 | 普通 |\n\n表格后正文。\n\n' + Array.from({length:30},(_,i)=>`后文 ${i+1}：滚动位置样例。\n\n`).join('');
const tallSource=longSource.replace('flowchart LR\n A[开始] --> B[完成]', 'flowchart TD\n'+Array.from({length:14},(_,i)=>` A${i}[节点 ${i}] --> A${i+1}[节点 ${i+1}]`).join('\n'));
function Review() {
 const theme=useEditorStore(s=>s.theme);const [narrow,setNarrow]=React.useState(false);const [result,setResult]=React.useState('');const [baseline,setBaseline]=React.useState(source);
 const checkViewport = (kind: 'table' | 'diagram') => {
  const scroll = document.querySelector<HTMLElement>('.md-visual-scroll');
  const handle = scroll?.querySelector<HTMLButtonElement>(kind === 'table' ? '.md-table-drag' : '.md-diagram-drag');
  const block = handle?.closest<HTMLElement>(kind === 'table' ? '.milkdown-table-block' : '.md-diagram-block');
  if (!scroll || !handle || !block) { setResult('请先加载相应拖动样例'); return; }
  scroll.scrollTop += block.getBoundingClientRect().bottom - scroll.getBoundingClientRect().top - 200;
  const before = scroll.scrollTop;
  handle.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown',altKey:true,bubbles:true,cancelable:true}));
  const immediate = scroll.scrollTop;
  requestAnimationFrame(() => {
   const frame = scroll.scrollTop;
   setTimeout(() => setResult(JSON.stringify({before,immediate,frame,settled:scroll.scrollTop})), 700);
  });
 };
 return <div style={{height:'100vh',display:'flex',flexDirection:'column',width:narrow?720:'100%',maxWidth:'100%'}}><nav style={{display:'flex',alignItems:'center',gap:8}}>
 <button onClick={()=>checkViewport('table')}>检查表格落点视口</button>
 <button onClick={()=>checkViewport('diagram')}>检查长图落点视口</button>
 <button onClick={()=>{setBaseline(tallSource);useEditorStore.getState().setContent(tallSource,'diagram-review','command');}}>长图拖动样例</button>
 <button onClick={()=>{setBaseline(longSource);useEditorStore.getState().setContent(longSource,'diagram-review','command');}}>长文拖动样例</button>
 <button onClick={()=>{const scroll=document.querySelector<HTMLElement>('.md-visual-scroll')!,block=scroll.querySelector('.md-diagram-block')!;scroll.scrollTop+=block.getBoundingClientRect().top-scroll.getBoundingClientRect().top-90;}}>定位图表</button>
 <button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button>
 <button onClick={()=>setNarrow(!narrow)}>720px 窄窗</button>
 <button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button>
 <button onClick={()=>setResult(JSON.stringify({unchanged:useEditorStore.getState().tabs[0].content===baseline,source:useEditorStore.getState().tabs[0].content}))}>核对原文</button>
 <span className="diagram-mode-reference" style={{marginLeft:'auto',display:'flex'}}><PreviewModeSwitch/></span>
 </nav><div style={{flex:1,minHeight:0}}><Visual tabId="diagram-review" theme={theme}/></div><output style={{maxHeight:72,overflow:'auto',whiteSpace:'pre',flexShrink:0,fontSize:12}}>{result}</output></div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
