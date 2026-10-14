// Generated fixtures only; this entry never loads native application state.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Groups from '../src/components/EditorGroups';
import {useEditorStore} from '../src/store/editor';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
const source='# 三种颜色验证\n\nalpha **bold** link omega\n\n第二段用于背景色范围验证。\n\n| 指标 | 数值 |\n| --- | --- |\n| 单元格内容 | 123 |\n| 空格测试 | |\n';
useEditorStore.setState({tabs:[{id:'colors',filePath:'/generated/colors.md',content:source,savedContent:source},{id:'other',filePath:'/generated/other.md',content:'# 另一标签\n\n保持原文\n',savedContent:'# 另一标签\n\n保持原文\n'}],activeId:'colors',markdownMode:'visual',language:'zh',theme:'light',autoSave:'off',panes:null,showPreview:true});
function Review(){
 const state=useEditorStore(s=>s),[narrow,setNarrow]=React.useState(false);
 return <div style={{width:narrow?720:'100%',maxWidth:'100%',height:'100vh',display:'flex',flexDirection:'column'}}>
 <nav style={{display:'flex',gap:12}}><button onClick={()=>setNarrow(!narrow)}>720px</button><button onClick={()=>{const theme=state.theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',theme==='dark');useEditorStore.setState({theme});}}>亮暗主题</button><button onClick={()=>useEditorStore.setState({language:state.language==='zh'?'en':'zh'})}>中英文</button><button onClick={()=>markdownHistory()}>撤销</button><button onClick={()=>markdownHistory(true)}>重做</button></nav>
 <Groups initialPreviewPct={50}/><pre id="color-source" style={{height:130,overflow:'auto'}}>{state.tabs.find(t=>t.id===state.activeId)?.content}</pre>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
