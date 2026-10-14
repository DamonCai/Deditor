import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import ConfirmDialog from '../src/components/ConfirmDialog';
import { useEditorStore } from '../src/store/editor';
import { saveFile, closeActiveTab } from '../src/lib/fileio';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
// Test-only in-memory disk. Buttons inject failures; no real file IO or account access.
let fail = true;
const original = 'Recovery baseline\n\n```js\nconst tail = 1;\n```\n';
let disk = original;
Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable:true, value:{
  convertFileSrc:(path:string)=>path,
  invoke:async(command:string,args:any)=>{
    if(command==='write_text_file'){if(fail)throw Error('Self-created disk-full test');disk=args.content;return;}
    if(command==='read_text_file')return disk;
    if(command==='write_app_state'||command==='record_markdown_draft'||command.startsWith('plugin:log'))return;
    if(command==='read_app_state')return '';
  },
}});
useEditorStore.setState({tabs:[{id:'recovery',filePath:'/generated/recovery.md',content:original,savedContent:original}],activeId:'recovery',markdownMode:'visual',theme:'light',language:'zh',autoSave:'off',formatOnSave:false});
function Review(){
 const tab=useEditorStore(s=>s.tabs.find(t=>t.id==='recovery'));
 const theme=useEditorStore(s=>s.theme);
 const [failure,setFailure]=React.useState(fail);
 const [status,setStatus]=React.useState('');
 React.useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();void saveFile().then(ok=>setStatus(ok?'saved':'unsaved'));}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
  <nav><button onMouseDown={e=>e.preventDefault()} onClick={()=>void saveFile().then(ok=>setStatus(ok?'saved':'unsaved'))}>保存</button>
   <button onClick={()=>{fail=!fail;setFailure(fail);}}>模拟失败：{failure?'开启':'关闭'}</button>
   <button onMouseDown={e=>e.preventDefault()} onClick={()=>void closeActiveTab().then(ok=>setStatus(ok?'closed':'open'))}>关闭文档</button>
   <button onMouseDown={e=>e.preventDefault()} onClick={()=>markdownHistory()}>撤销</button>
   <button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next});}}>切换主题</button>
   <button onClick={()=>useEditorStore.setState({language:useEditorStore.getState().language==='zh'?'en':'zh'})}>切换语言</button>
   <button onClick={()=>setStatus(JSON.stringify({content:tab?.content,savedContent:tab?.savedContent,disk,clean:tab?.content===disk,original:tab?.content===original}))}>核对内容</button>
  </nav>
  <div style={{flex:1,minHeight:0}}>{tab?<Visual tabId="recovery" theme={theme}/>:<p>测试文档已关闭</p>}</div>
  <pre style={{maxHeight:180,overflow:'auto'}} data-testid="source">{tab?.content}</pre><output>{status}</output><ConfirmDialog/>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
