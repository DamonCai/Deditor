// Isolated UI fixture: all content is generated here; no application state or user files.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Groups from '../src/components/EditorGroups';
import StatusBar from '../src/components/StatusBar';
import {useEditorStore} from '../src/store/editor';
import {getActiveView} from '../src/lib/editorBridge';
import {getVisualEditor} from '../src/lib/markdownVisualBridge';
import {markdownHistory} from '../src/lib/markdownHistory';
import {isMarkdown} from '../src/lib/lang';
import {textHistory} from '../src/lib/textHistory';
import '../src/styles.css';
const make=(id:string,ext:string,content:string)=>({id,filePath:`/generated/${id}.${ext}`,content,savedContent:content});
const source=(id:string)=>`# ${id} 分屏验证\n\n`+Array.from({length:30},(_,i)=>`第 ${i} 段 中文 **粗体** [链接](https://example.com) 😀\n\n`).join('');
const originals=[make('甲','md',source('甲')),make('乙','md',source('乙')),make('文本','txt','plain text\n中文😀\n'),make('页面','html','<h1>Generated HTML</h1><p>Split preview</p>')];
useEditorStore.setState({panes:null,activePane:'left',tabs:originals,activeId:'甲',markdownMode:'visual',language:'zh',autoSave:'off',showPreview:true});
function Review(){
 const state=useEditorStore(s=>s),[narrow,setNarrow]=React.useState(false);
 const history=(redo=false)=>{const tab=state.tabs.find(t=>t.id===state.activeId);if(!tab)return;if(isMarkdown(tab.filePath))markdownHistory(redo);else {const view=getActiveView();if(view)textHistory(tab.id,view,redo);}};
 return <div style={{width:narrow?720:'100%',maxWidth:'100%',height:'100vh',display:'flex',flexDirection:'column'}}>
  <nav style={{display:'flex',gap:12,alignItems:'center',fontSize:12}}>
   <span>自建验证</span><button onClick={()=>setNarrow(!narrow)}>720px</button>
   <button onClick={()=>{const theme=state.theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',theme==='dark');useEditorStore.setState({theme});}}>亮暗主题</button>
   <button onClick={()=>useEditorStore.setState({language:state.language==='zh'?'en':'zh'})}>中英文</button>
   <button onClick={()=>useEditorStore.getState().openTab('/generated/新文件.md','# 新文件\n\n测试正文\n')}>打开新文件</button>
   <button onClick={()=>history()}>撤销验证</button><button onClick={()=>history(true)}>重做验证</button>
  </nav>
  <Groups initialPreviewPct={50}/><StatusBar/>
  <output id="split-results" style={{maxHeight:65,overflow:'auto',fontSize:11}}>{JSON.stringify({activePane:state.activePane,activeId:state.activeId,panes:state.panes,documents:state.tabs.map(t=>({id:t.id,dirty:t.content!==t.savedContent,tail:t.content.slice(-70)})),bridge:getVisualEditor()?.tabId})}</output>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
