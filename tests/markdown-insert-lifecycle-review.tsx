import React from 'react';
import { createRoot } from 'react-dom/client';
import Toolbar from '../src/components/MarkdownToolbar';
import EditorHost from '../src/components/EditorHost';
import VisualSlot from '../src/components/MarkdownVisualSlot';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const original = 'before selected after\n\nTail untouched.\n';
const seed = () => useEditorStore.setState({tabs:[{id:'insert-a',filePath:'/generated/insert-a.md',content:original,savedContent:original},{id:'insert-b',filePath:'/generated/insert-b.md',content:'Other document.\n',savedContent:'Other document.\n'}],activeId:'insert-a',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
seed();
function Review() {
  const activeId=useEditorStore(s=>s.activeId),mode=useEditorStore(s=>s.markdownMode),tabs=useEditorStore(s=>s.tabs);
  const update=()=>{if(activeId)useEditorStore.getState().setContent('Latest disk content\n',activeId,'command');};
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <div style={{position:'relative',zIndex:100000,background:'#eee',padding:6}}>
      <b>Self-created insertion lifecycle fixture</b>{' '}
      <button onClick={seed}>Reset</button>{' '}
      {(['source','split','visual'] as const).map(value=><button key={value} onClick={()=>useEditorStore.setState({markdownMode:value})}>{value}</button>)}{' '}
      {tabs.map(tab=><button key={tab.id} onClick={()=>useEditorStore.getState().setActive(tab.id)}>{tab.id}</button>)}{' '}
      <button onClick={()=>activeId&&useEditorStore.getState().closeTab(activeId)}>Close active</button>{' '}
      <button onClick={update}>Replace body</button>{' '}
      <button onClick={()=>{update();document.querySelector<HTMLFormElement>('.md-insert-dialog form')?.requestSubmit();}}>Replace body and confirm in same event</button>{' '}
      <button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button>
      <div>Open Link/Image/Table with “selected” highlighted, then use these fixture controls to change the document while the dialog remains open.</div>
    </div>
    <Toolbar/>
    <div style={{display:'flex',position:'relative',flex:1,minHeight:0}}>
      <div style={{display:mode==='visual'?'none':'flex',flex:1}}><EditorHost activeId={activeId} theme="light" fontSize={14}/></div>
      {activeId&&<VisualSlot key={activeId} tabId={activeId} active={mode==='visual'} theme="light"/>}
    </div>
    <pre data-testid="sources" style={{maxHeight:150,overflow:'auto'}}>{JSON.stringify(tabs.map(tab=>({id:tab.id,content:tab.content})),null,2)}</pre>
  </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
