import React from 'react';
import { createRoot } from 'react-dom/client';
import Toolbar from '../src/components/MarkdownToolbar';
import EditorHost from '../src/components/EditorHost';
import VisualSlot from '../src/components/MarkdownVisualSlot';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import { getVisualEditor } from '../src/lib/markdownVisualBridge';
import { flushDocument } from '../src/lib/documentFlush';
import '../src/styles.css';
const fixtures: Record<string,string> = {
 text: 'before TARGET after\n\nTail unchanged.\n',
 code: '\x60\x60\x60js\nlet TARGET = 1;\n\x60\x60\x60\n\nTail unchanged.\n',
 table: '| Head | Other |\n| --- | --- |\n| TARGET | stable |\n\nTail unchanged.\n',
 all: 'TARGET one\n\nTARGET two\n\nTail unchanged.\n',
 history: 'before body after\n\nTail unchanged.\n',
};
let next=0;
function reset(name: string) {const source=fixtures[name]; const id='seq-'+(++next); useEditorStore.setState({tabs:[{id,filePath:'/generated/'+id+'.md',content:source,savedContent:source},{id:'other-'+next,filePath:'/generated/other.md',content:'Other document.\n',savedContent:'Other document.\n'}],activeId:id,language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});}
reset('text');
function Review() {
 const activeId=useEditorStore(s=>s.activeId),mode=useEditorStore(s=>s.markdownMode),tabs=useEditorStore(s=>s.tabs);
 const [saved,setSaved]=React.useState('');
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
  <div style={{position:'relative',zIndex:100000,background:'#eee',padding:6}}><b>Self-created session sequences</b>{' '}
   {Object.keys(fixtures).map(k=><button key={k} onClick={()=>reset(k)}>Reset {k}</button>)}{' '}
   {(['source','split','visual'] as const).map(value=><button key={value} onClick={()=>useEditorStore.setState({markdownMode:value})}>{value}</button>)}{' '}
   {tabs.map((tab,i)=><button key={tab.id} onClick={()=>useEditorStore.getState().setActive(tab.id)}>Document {i+1}</button>)}{' '}
   <button onClick={()=>getVisualEditor()?.find?.()}>Find</button>
   <button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button>
   <button onClick={()=>{if(activeId)flushDocument(activeId);setSaved(useEditorStore.getState().tabs.find(t=>t.id===activeId)?.content??'');}}>Capture source</button>
  </div>
  <Toolbar/>
  <div style={{display:'flex',position:'relative',flex:1,minHeight:0}}>
   <div style={{display:mode==='visual'?'none':'flex',flex:1}}><EditorHost activeId={activeId} theme="light" fontSize={14}/></div>
   {activeId&&<VisualSlot key={activeId} tabId={activeId} active={mode==='visual'} theme="light"/>}
  </div>
  <pre aria-label="Current sources" style={{maxHeight:120,overflow:'auto'}}>{JSON.stringify(tabs.map(tab=>({id:tab.id,content:tab.content})),null,2)}</pre>
  <output aria-label="Captured source">{JSON.stringify(saved)}</output>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
