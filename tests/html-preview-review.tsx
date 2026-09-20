// Self-contained fixtures; optional supplied-file copy lives only in ignored artifacts.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Groups from '../src/components/EditorGroups';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';

if (!(window as any).__TAURI_INTERNALS__) (window as any).__TAURI_INTERNALS__ = {
  convertFileSrc: (path: string) => new URL(path, location.href).href,
  invoke: async () => undefined,
};
const dynamic = `<!doctype html><html lang="zh"><head><style>body{font:16px system-ui;padding:24px}button{padding:8px}#graph{color:#267}</style></head><body><h1>自建动态 HTML</h1><div id="graph"></div><button id="add">增加节点</button><button onclick="document.getElementById('inline').textContent='内联事件通过'">内联事件</button><p id="inline"></p><p id="isolation"></p><script>
let count=1;const graph=document.getElementById('graph');function draw(){graph.textContent='动态节点 '+count;}draw();document.getElementById('add').onclick=()=>{count++;draw();};
let isolated=false;try{parent.document.body.dataset.compromised='yes';}catch{isolated=true;}let storageBlocked=false;try{localStorage.getItem('generated-test');}catch{storageBlocked=true;}
document.getElementById('isolation').textContent='父页面隔离: '+isolated+' / 存储隔离: '+storageBlocked+' / 原生桥: '+typeof window.__TAURI_INTERNALS__;
</script></body></html>`;
const supplied = new URLSearchParams(location.search).has('supplied')
  ? await fetch('./artifacts/html-preview-2026-09-20/gateway-traffic-flow.txt').then(r=>r.text()) : null;
const make=(id:string,content:string)=>({id,filePath:`/generated/${id}.html`,content,savedContent:content});
const samples=[...(supplied ? [make('gateway-traffic-flow',supplied)] : []),make('动态脚本',dynamic),make('静态边界','<h1>中文 &amp; 静态片段</h1><p>正常显示</p>'),make('空文件','')];
useEditorStore.setState({panes:null,activePane:'left',tabs:samples,activeId:samples[0].id,showPreview:true,previewMaximized:true,language:'zh',theme:'light',autoSave:'off',formatOnSave:false});
function Review(){const state=useEditorStore(s=>s);return <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
  <nav style={{display:'flex',gap:8,padding:8}}>
    <button onClick={()=>{const theme=state.theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',theme==='dark');useEditorStore.setState({theme});}}>切换亮暗</button>
    <button onClick={()=>useEditorStore.setState({language:state.language==='zh'?'en':'zh'})}>切换中英文</button>
    <button onClick={()=>useEditorStore.getState().splitRight()}>左右分屏</button>
    <button onClick={()=>useEditorStore.getState().mergePanes()}>合并分屏</button>
  </nav><Groups initialPreviewPct={50}/>
  <output>{JSON.stringify({dirty:state.tabs.filter(t=>t.content!==t.savedContent).map(t=>t.id)})}</output>
</div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
