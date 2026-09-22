// Self-created fixture and review-only storage; no native or user document access.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import {useEditorStore} from '../src/store/editor';
import {getVisualEditor} from '../src/lib/markdownVisualBridge';
import {markdownHistory} from '../src/lib/markdownHistory';
import {saveFile} from '../src/lib/fileio';
import '../src/styles.css';
const original='# Link card\n\nStart [label](https://example.com/old) end.\n\nTail untouched.\n';
const storage='deditor-urgent-link-card-review-only';
let saved=localStorage.getItem(storage)??original;
(window as any).__TAURI_INTERNALS__={convertFileSrc:(p:string)=>p,invoke:async(command:string,args:any)=>{
 if(command==='write_text_file'){saved=args.content;localStorage.setItem(storage,saved);return;}
 if(command==='read_text_file')return saved;
 if(command==='read_spelling_dictionary')return {words:[],ignored:{},revision:0};
}};
const query=new URLSearchParams(location.search),theme=query.get('theme')==='dark'?'dark':'light';
document.documentElement.classList.toggle('dark',theme==='dark');
useEditorStore.setState({tabs:[{id:'link-review',filePath:'/self-created/link-card.md',content:original,savedContent:original}],activeId:'link-review',language:query.get('lang')==='en'?'en':'zh',theme,markdownMode:'visual',autoSave:'off'});
function Review(){
 const tabs=useEditorStore(s=>s.tabs),id=useEditorStore(s=>s.activeId)!;
 const [generation,setGeneration]=React.useState(0),[disk,setDisk]=React.useState(saved),[focus,setFocus]=React.useState(''),[status,setStatus]=React.useState('');
 const content=tabs.find(t=>t.id===id)!.content;
 React.useEffect(()=>{const update=()=>{const el=document.activeElement;setFocus(el?.className+' / '+el?.getAttribute('aria-label'));};document.addEventListener('focusin',update);return()=>document.removeEventListener('focusin',update);},[]);
 const reset=(value:string)=>{useEditorStore.getState().setContent(value,id,'command');setGeneration(n=>n+1);setStatus('Loaded fixture');};
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
  <nav style={{padding:8,display:'flex',flexWrap:'wrap',gap:8}}>
   <button onClick={()=>reset(original)}>Reset fixture</button>
   <button onClick={()=>{getVisualEditor()?.navigate(5,16);getVisualEditor()?.focus();}}>Focus Tail end</button>
   <button onClick={()=>void saveFile().then(ok=>{setDisk(saved);setStatus(ok?'Saved to review storage':'Save failed');})}>Save fixture</button>
   <button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button>
   <button onClick={()=>{reset(saved);setStatus('Reopened review save');}}>Reopen saved</button>
  </nav>
  <p style={{margin:'0 12px',fontSize:12}}>Focus Tail end → move the real pointer onto “label” → wait for the card → edit / remove. Hover requires editor focus. Enter confirms; Escape cancels.</p>
  <section style={{flex:1,minHeight:180,display:'flex',flexDirection:'column'}}><Visual key={generation} tabId={id} theme={theme}/></section>
  <output data-testid="state" style={{padding:8,fontSize:11}}>{JSON.stringify({status,focus,sourceEqualsSaved:content===disk})}</output>
  <div style={{display:'flex',maxHeight:210,overflow:'auto',borderTop:'1px solid #888',fontSize:12}}><pre data-testid="source" style={{flex:1,whiteSpace:'pre-wrap',padding:10}}>{content}</pre><pre data-testid="saved" style={{flex:1,whiteSpace:'pre-wrap',padding:10}}>{disk}</pre></div>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
