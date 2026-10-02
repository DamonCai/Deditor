// New generated documents, in-memory IO only; no saved app state or user files.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Groups from '../src/components/EditorGroups';
import DiffView from '../src/components/DiffView';
import { useEditorStore as store } from '../src/store/editor';
import { sampleArchive } from './fixtures/xmind';
import { bytesToXmindDataUrl } from '../src/lib/xmind/edit';
import '../src/styles.css';
(window as any).__TAURI_INTERNALS__ = { invoke: async () => null, convertFileSrc: (path: string) => path };
const prose = '# Scroll audit\n\nRight click this paragraph.\n\n| Key | Value |\n| --- | --- |\n| Generated | 42 |\n\n' + Array.from({length: 100}, (_, i) => `## Heading ${i}\n\nGenerated paragraph ${i}.\n\n`).join('');
const rows = Array.from({length: 2000}, (_, i) => `Generated row ${i}`);
const json = JSON.stringify(rows, null, 2);
const xml = '<root>\n' + rows.map(row => `  <row>${row}</row>`).join('\n') + '\n</root>';
const html = '<!doctype html><title>Generated scroll audit</title>' + rows.map(row => `<p>${row}</p>`).join('');
const xmind = bytesToXmindDataUrl(sampleArchive([{ id: 'audit-sheet', title: 'Generated scroll audit', rootTopic: { id: 'root', title: 'Scroll audit root', children: { attached: [{id:'child',title:'Generated child'}] } } }]));
const tabs = [['markdown','md',prose], ['json','json',json], ['xml','xml',xml], ['text','txt',rows.join('\n')], ['csv','csv','key,value\n'+rows.map((r,i)=>`${i},${r}`).join('\n')], ['html','html',html], ['xmind','xmind',xmind]].map(([id,ext,content])=>({id,filePath:`/generated/scroll-audit.${ext}`,content,savedContent:content}));
const dark = new URLSearchParams(location.search).has('dark');
store.setState({tabs,activeId:'markdown',language:'en',theme:dark?'dark':'light',markdownMode:'visual',csvMode:'read',showPreview:true,previewMaximized:true,tocVisible:false,autoSave:'off',panes:null,splitEditor:false});
document.documentElement.classList.toggle('dark',dark);
function App(){
  const [diff, setDiff] = React.useState(false);
  return <main style={{height:'100vh',display:'flex',flexDirection:'column'}}>
    <nav style={{flexShrink:0}}>{tabs.map(tab=><button key={tab.id} onClick={()=>{setDiff(false);store.getState().setActive(tab.id);}}>{tab.id}</button>)} <button onClick={()=>setDiff(true)}>Diff</button> <button onClick={()=>store.setState({showMinimap:!store.getState().showMinimap})}>Minimap</button> <button onClick={()=>store.setState({markdownMode:'split'})}>Markdown preview</button> <button onClick={()=>store.setState({markdownMode:'visual'})}>Markdown reading</button></nav>
    <div style={{flex:1,minHeight:0,display:'flex'}}><>{diff ? <DiffView spec={{leftPath:"/generated/left.txt",rightPath:"/generated/right.txt",leftContent:rows.join("\n"),rightContent:rows.map(r=>r+" changed").join("\n")}}/> : <Groups initialPreviewPct={50}/>}</></div>
  </main>;
}
const root=createRoot(document.getElementById('root')!);root.render(<App/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
