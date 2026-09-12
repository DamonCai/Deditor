// Self-created samples and an optional ignored local review copy; no writes to the original file.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const samples: Record<string, string> = {
  Tasks: 'Before\n\n<br />\n\n* [x] <br />\n\n  * [ ] child one\n  * [x] child two\n  * [ ] child three\n\nAfter\n',
};
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{convertFileSrc:(p:string)=>p,invoke:async()=>{throw Error('No file IO in task review');}}});
useEditorStore.setState({tabs:[{id:'boundary',filePath:'/generated/boundary.md',content:samples.Tasks,savedContent:samples.Tasks}],activeId:'boundary',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){const content=useEditorStore(s=>s.tabs[0].content);const [generation,setGeneration]=React.useState(0);const [showPreview,setShowPreview]=React.useState(false);return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div><button onClick={()=>setShowPreview(v=>!v)}>对照预览</button><button onClick={async()=>{const text=await(await fetch('/tests/artifacts/task-user-copy.md')).text();useEditorStore.getState().setContent(text,'boundary','command');setGeneration(g=>g+1);}}>文档副本</button>{Object.keys(samples).map(name=><button key={name} onClick={()=>{useEditorStore.getState().setContent(samples[name],'boundary','command');setGeneration(g=>g+1);}}>{name} sample</button>)}<button onClick={()=>markdownHistory()}>Undo task</button><button onClick={()=>markdownHistory(true)}>Redo task</button></div><div style={{display:"flex",flex:1,minHeight:0}}><div style={{flex:1,minWidth:0}}><Visual key={generation} tabId="boundary" theme="light"/></div>{showPreview&&<div style={{flex:1,minWidth:0}}><Preview tabId="boundary" theme="light"/></div>}</div><pre data-testid="source" style={{maxHeight:220,overflow:'auto'}}>{content}</pre></div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
