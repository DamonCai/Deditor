// Self-created bitmap fixture. Storage below is simulated and touches no user files.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const source='Before\n\nalpha beta gamma\n\nAfter\n';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=';
const calls:unknown[]=[];
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{
 convertFileSrc:()=>`data:image/png;base64,${png}`,
 invoke:async(command:string,args:Record<string,string>)=>{if(command==='save_image'){calls.push({command,...args});document.querySelector('[data-testid="writes"]')!.textContent=JSON.stringify(calls);return `${args.dir}/${args.folder}/${args.name}`;}throw Error(`Image clipboard fixture does not allow ${command}`);},
}});
useEditorStore.setState({tabs:[{id:'png',filePath:'/generated/clipboard.md',content:source,savedContent:source}],activeId:'png',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){const content=useEditorStore(s=>s.tabs[0].content);return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div>PNG clipboard audit · simulated storage <button onClick={()=>markdownHistory()}>Undo image</button></div><Visual tabId="png" theme="light"/><pre data-testid="source">{content}</pre><pre data-testid="writes" style={{overflow:'auto'}}/></div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
