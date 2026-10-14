// Self-created keyboard fixtures. No native/persisted user data.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import MarkdownToolbar from '../src/components/MarkdownToolbar';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const fixtures: Record<string,string> = {
  '日常格式': 'plain cat **cat** *cat* `cat` [cat](https://example.com)\n\nEnd\n',
  '日常代码': 'Before\n\n```js\nconst a = 1;\nconst b = 2;\n```\n\nAfter\n',
  '空白输入': 'Start\n\n\n\nEnd\n',
  '同层列表': '- alpha\n- beta\n- gamma\n\nEnd\n',
  '表格单元格': '| A | B |\n| --- | --- |\n| one | two |\n| three | four |\n\nEnd\n',
  '列表内表格': '- alpha\n- beta\n\n  | A | B |\n  | --- | --- |\n  | one | two |\n\n- gamma\n\nEnd\n',
  '独立行和表格': '- alpha\n\nbeta\n\n| A | B |\n| --- | --- |\n| one | two |\n\nEnd\n',
  '单元格列表': '| A | B |\n| --- | --- |\n| - alpha<br>- beta | two |\n\nEnd\n',
  '嵌套与续段': '- alpha\n  - child\n  - sibling\n\n    continuation\n\n- beta\n\nEnd\n',
};
const initial=fixtures['同层列表'];
useEditorStore.setState({tabs:[{id:'shortcuts',filePath:'/generated/shortcuts.md',content:initial,savedContent:initial}],activeId:'shortcuts',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){
 const content=useEditorStore(s=>s.tabs[0].content),theme=useEditorStore(s=>s.theme);
 const [preview,setPreview]=React.useState(false);
 const [version,setVersion]=React.useState(0),[mounted,setMounted]=React.useState(true),[narrow,setNarrow]=React.useState(false),[measure,setMeasure]=React.useState('');
 const reset=(text:string)=>{setMounted(false);setTimeout(()=>{useEditorStore.getState().setContent(text,'shortcuts','command');setVersion(v=>v+1);setMounted(true);setMeasure('');},100);};
 return <div style={{height:'100vh',width:narrow?720:'100%',display:'flex',flexDirection:'column'}}>
 <div><button onClick={()=>setPreview(v=>!v)}>切换预览对照</button>{Object.entries(fixtures).map(([name,text])=><button key={name} onClick={()=>reset(text)}>{name}</button>)}<button onClick={()=>{const dark=theme!=='dark';document.documentElement.classList.toggle('dark',dark);useEditorStore.setState({theme:dark?'dark':'light'});}}>亮暗</button><button onClick={()=>setNarrow(v=>!v)}>宽窄</button><button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button><button onClick={()=>reset(content)}>重载当前</button><button onClick={()=>setMeasure(JSON.stringify([...document.querySelectorAll('.ProseMirror li, .ProseMirror table, .ProseMirror p')].map(e=>({tag:e.tagName,text:e.textContent?.slice(0,50),left:Math.round(e.getBoundingClientRect().left),width:Math.round(e.getBoundingClientRect().width)}))))}>测量对齐</button></div>
 <MarkdownToolbar/>{mounted&&(preview?<Preview tabId="shortcuts" theme={theme==='dark'?'dark':'light'}/>:<Visual key={version} tabId="shortcuts" theme={theme==='dark'?'dark':'light'}/>)}<output>{measure}</output><details open><summary>实际Markdown源码</summary><pre style={{maxHeight:170,overflow:'auto',whiteSpace:'pre-wrap'}}>{content}</pre></details></div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
