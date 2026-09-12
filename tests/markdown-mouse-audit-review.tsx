import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Toolbar from '../src/components/MarkdownToolbar';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
const samples = {
  plain: 'Alpha bravo charlie delta.\n\nSecond paragraph echoes foxtrot.\n\nTail untouched.\n',
  format: 'Alpha **bravo** and *charlie* then `delta` finish.\n\nSecond paragraph stays.\n',
  link: 'Alpha [example label](https://example.com) omega.\n\nTail untouched.\n',
  wrap: 'Alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango uniform victor whiskey xray yankee zulu.\n\nSecond paragraph stays.\n',
  long: '# Mouse audit\n\n' + Array.from({length:80},(_,i)=>`Paragraph ${String(i+1).padStart(2,'0')} alpha bravo charlie delta echo foxtrot.`).join('\n\n') + '\n',
};
let serial = 0;
function reset(name:keyof typeof samples) {const id='mouse-audit-'+ ++serial,content=samples[name];useEditorStore.setState({tabs:[{id,filePath:'/generated/'+id+'.md',content,savedContent:content}],activeId:id,markdownMode:'visual',theme:'light',language:'en',autoSave:'off'});}
reset('plain');
function Review(){
  const tab=useEditorStore(s=>s.tabs.find(t=>t.id===s.activeId));
  const [narrow,setNarrow]=React.useState(false),[selection,setSelection]=React.useState(''),[saved,setSaved]=React.useState('');
  React.useEffect(()=>{const read=()=>{const s=window.getSelection();setSelection(s?.toString()??'');};document.addEventListener('selectionchange',read);return()=>document.removeEventListener('selectionchange',read);},[]);
  return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <div><b>Mouse audit — self-created documents</b>{Object.keys(samples).map(name=><button key={name} onClick={()=>reset(name as keyof typeof samples)}>{name}</button>)}<button onMouseDown={e=>e.preventDefault()} onClick={()=>setNarrow(x=>!x)}>Toggle width</button><button onMouseDown={e=>e.preventDefault()} onClick={()=>setSaved(tab?.content??'')}>Save snapshot</button></div>
    <Toolbar/>
    <div style={{width:narrow?480:'100%',minHeight:0,flex:1,display:'flex',flexDirection:'column'}}>{tab&&<Visual key={tab.id} tabId={tab.id} theme="light"/>}</div>
    <pre data-testid="selection" style={{height:40,margin:0,overflow:'auto'}}>Selected: {selection}</pre>
    <pre data-testid="source" style={{height:90,margin:0,overflow:'auto'}}>{tab?.content}</pre><pre data-testid="saved" style={{display:'none'}}>{saved}</pre>
  </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
