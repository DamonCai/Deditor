// Generated fixtures only. No application startup, user files or persisted state.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Groups from '../src/components/EditorGroups';
import {useEditorStore} from '../src/store/editor';
import {getActiveView} from '../src/lib/editorBridge';
import {textHistory} from '../src/lib/textHistory';
import '../src/styles.css';
const make=(id:string,ext:string,content:string)=>({id,filePath:`/generated/${id}.${ext}`,content,savedContent:content});
const samples=[make('引号与换行','csv','姓名,编号,备注\r\n小李,001,"上海,杭州"\r\n小王,0002,"第一行\n第二行 ""原文"""\r\n'),make('分页','csv','编号,内容\n'+Array.from({length:255},(_,i)=>`${i},自建第${i}行`).join('\n')),make('空文件','csv',''),make('Markdown','md','# 自建文档\n\n原有编辑模式\n'),make('HTML','html','<h1>Generated HTML</h1>')];
useEditorStore.setState({panes:null,activePane:'left',tabs:samples,activeId:samples[0].id,csvMode:'source',markdownMode:'source',showPreview:false,language:'zh',theme:'light',autoSave:'off',formatOnSave:false});
function Review(){const state=useEditorStore(s=>s);return <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
 <nav style={{display:'flex',alignItems:'center',gap:8,padding:8,flexWrap:'wrap'}}>
  <button onClick={()=>{const theme=state.theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',theme==='dark');useEditorStore.setState({theme});}}>切换亮暗主题</button>
  <button onClick={()=>useEditorStore.setState({language:state.language==='zh'?'en':'zh'})}>切换中英文</button>
  <button onClick={()=>useEditorStore.getState().splitRight()}>验证左右分屏</button>
  <button onClick={()=>useEditorStore.getState().mergePanes()}>关闭左右分屏</button>
  <button onClick={()=>{const view=getActiveView();if(state.activeId&&view)textHistory(state.activeId,view);}}>验证撤销</button>
  <button onClick={()=>{const view=getActiveView();if(state.activeId&&view)textHistory(state.activeId,view,true);}}>验证重做</button>
 </nav>
 <Groups initialPreviewPct={50}/>
 <output id="csv-results" style={{fontSize:11,padding:4}}>{JSON.stringify({csvMode:state.csvMode,activeId:state.activeId,dirty:state.tabs.filter(t=>t.content!==t.savedContent).map(t=>t.id)})}</output>
 </div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
