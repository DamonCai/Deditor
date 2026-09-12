// Self-created browser fixture; no real filesystem, persistence or account data.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {useEditorStore} from '../src/store/editor';
import {saveAllDirty, saveFile} from '../src/lib/fileio';
import MarkdownVisualSlot from '../src/components/MarkdownVisualSlot';
import MarkdownToolbar from '../src/components/MarkdownToolbar';
import '../src/styles.css';
const initial='# Save race review\n\nOriginal body.\n';
const source={id:'save-race-review',filePath:'/self-created/race.md',content:initial,savedContent:initial};
let disk=initial, writes:string[]=[], release:(()=>void)|undefined;
let refresh=()=>{};
const testWindow=window as unknown as {__saveRaceGate?:()=>Promise<void>;__TAURI_INTERNALS__?:unknown};
testWindow.__saveRaceGate=()=>new Promise<void>(resolve=>{release=resolve;refresh();});
testWindow.__TAURI_INTERNALS__={convertFileSrc:(p:string)=>p,invoke:async(command:string,args:{content:string})=>{
  if(command==='write_text_file'){disk=args.content;writes.push(disk);refresh();return;}
  if(command==='frontend_log')return;
  throw Error(`Unexpected fixture IPC: ${command}`);
}};
useEditorStore.setState({tabs:[{...source}],activeId:source.id,language:'en',markdownMode:'visual',formatOnSave:true});
function Review(){
 const tabs=useEditorStore(s=>s.tabs), id=useEditorStore(s=>s.activeId)!;
 const current=tabs.find(t=>t.id===id)!;
 const [,render]=React.useReducer(n=>n+1,0);refresh=render;
 const [status,setStatus]=React.useState('Idle');
 const begin=(automatic:boolean)=>{setStatus('Waiting for formatting');void (automatic?saveAllDirty():saveFile()).then(()=>setStatus('Finished'));};
 const external=(reload:boolean)=>{disk='# External version\n\nKeep this external content.\n';useEditorStore.setState(s=>({tabs:s.tabs.map(t=>t.id===source.id?{...t,...(reload?{content:disk,savedContent:disk,externalChange:undefined}:{externalChange:disk})}:t)}));};
 return <><div style={{display:'flex',gap:8,flexWrap:'wrap',padding:12}}>
 <button onClick={()=>{release?.();release=undefined;writes=[];disk=initial;useEditorStore.setState({tabs:[{...source}],activeId:source.id});setStatus('Idle');}}>Reset self-created sample</button>
 <button onClick={()=>begin(true)}>Start delayed autosave</button><button onClick={()=>begin(false)}>Start delayed manual save</button>
 <button onClick={()=>external(false)}>External conflict arrives</button><button onClick={()=>external(true)}>Reload external content</button>
 <button onClick={()=>{useEditorStore.getState().closeTab(source.id);const other=useEditorStore.getState().openTab('/self-created/second.md','# Second file\n\nOther body.\n');useEditorStore.getState().setActive(other);}}>Close target and open second file</button>
 <button disabled={!release} onClick={()=>{release?.();release=undefined;render();}}>Finish formatting</button></div>
 <div role="status">{status}</div><MarkdownToolbar/><div style={{height:360,position:'relative'}}><MarkdownVisualSlot tabId={id} filePath={current.filePath} content={current.content} active/></div>
 <h3>Current document</h3><pre data-testid="current">{current.content}</pre><h3>Simulated disk</h3><pre data-testid="disk">{disk}</pre>
 <div data-testid="writes">Writes: {writes.length}</div><div data-testid="conflict">Conflict: {current.externalChange??'none'}</div></>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
