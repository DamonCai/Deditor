// Self-created fixtures only; no native file access or user-state persistence.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { getVisualEditor } from '../src/lib/markdownVisualBridge';
import { writeMarkdownClipboard } from '../src/lib/markdownClipboard';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';

const filename = 'disabled_sg_channels_7d_sls_20260914.csv';
const fixtures = {
  Filename: 'File: `' + filename + '` **a_b** end\n',
  Escapes: '\\`' + filename.replaceAll('_', '\\_') + '\\`\n\n\\*literal\\* \\[x\\] \\| &amp;\n\n`C:\\temp\\a_b.csv`\n',
  Nodes: 'start :smile: $a_b + c$ end\n\n| A | B |\n| --- | --- |\n| **a_b** | `c_d` |\n',
  Empty: '',
};
useEditorStore.setState({tabs:[{id:'clipboard-review',filePath:'/generated/clipboard-review.md',content:fixtures.Filename,savedContent:fixtures.Filename}],activeId:'clipboard-review',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review() {
  const source = useEditorStore(state => state.tabs[0].content);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');
  const [events,setEvents] = React.useState<string[]>([]);
  React.useEffect(()=>{
    const record=(event: Event)=>{const key=event as KeyboardEvent;const input=event as InputEvent;setEvents(previous=>[...previous.slice(-11),JSON.stringify({type:event.type,key:key.key,meta:key.metaKey,ctrl:key.ctrlKey,shift:key.shiftKey,inputType:input.inputType,types:Array.from((event as ClipboardEvent).clipboardData?.types ?? [])})]);};
    const types=['keydown','keyup','beforeinput','paste','copy'];types.forEach(type=>document.addEventListener(type,record,true));return()=>types.forEach(type=>document.removeEventListener(type,record,true));
  },[]);
  return <main style={{height:'100vh',display:'flex',flexDirection:'column',background:theme === 'dark' ? '#202124' : '#fff',color:theme === 'dark' ? '#eee' : '#222'}}>
    <div>{Object.entries(fixtures).map(([name,text])=><button key={name} onClick={()=>useEditorStore.getState().setContent(text,'clipboard-review','command')}>{name}</button>)}
      <button onClick={()=>{const value=theme === 'light' ? 'dark' : 'light';setTheme(value);document.documentElement.classList.toggle('dark',value === 'dark');}}>Theme</button>
      <button onMouseDown={event=>event.preventDefault()} onClick={()=>{const payload=getVisualEditor()?.clipboard();if(payload)void writeMarkdownClipboard(payload,'rich');}}>Copy rich</button>
      <button onMouseDown={event=>event.preventDefault()} onClick={()=>{const payload=getVisualEditor()?.clipboard();if(payload)void writeMarkdownClipboard(payload,'markdown');}}>Copy Markdown</button>
      <button onMouseDown={event=>event.preventDefault()} onClick={()=>{
        getVisualEditor()?.focus();
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown',{key:'v',metaKey:true,shiftKey:true,bubbles:true,cancelable:true}));
      }}>Simulate Cmd+Shift+V</button>
      <button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button>
    </div>
    <Visual tabId="clipboard-review" theme={theme}/>
    <label>Plain destination<textarea aria-label="Plain destination" style={{width:'100%',height:110,color:'#111',background:'#fff'}}/></label>
    <pre data-testid="source" style={{height:140,overflow:'auto',whiteSpace:'pre-wrap'}}>{source}</pre>
    <pre data-testid="events" style={{height:90,overflow:'auto'}}>{events.join('\n')}</pre>
  </main>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
