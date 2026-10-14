// Generated documents only; no persistence or application startup.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Groups from '../src/components/EditorGroups';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
import '../src/preview.css';
(window as any).__TAURI_INTERNALS__ = {
  convertFileSrc: (path: string) => new URL(path, location.href).href,
  invoke: async () => undefined,
};
const interactive = `<style>body{font:16px system-ui;padding:12px}button{padding:8px}h1{color:#267}</style><h1>动态 HTML</h1><output id="result"></output><button id="run">运行计算</button><form id="form"><input aria-label="表单内容" name="value" value="本地表单"><button>提交本地表单</button></form><p id="form-result"></p><iframe title="内嵌页面" srcdoc="<p>内嵌页面正常显示</p>"></iframe><script>
const result=document.getElementById('result');result.textContent='初始化 '+new Function('return 6*7')();document.getElementById('run').onclick=()=>{result.textContent='点击 '+eval('20+22')};document.getElementById('form').onsubmit=e=>{e.preventDefault();document.getElementById('form-result').textContent=new FormData(e.target).get('value')};
try{parent.document.body.dataset.changed='yes'}catch{document.body.dataset.isolated='true'}
</script>`;
const md = '# Markdown 行为核对\n\n```html\n'+interactive+'\n```\n\n## 本地内嵌页面\n\n<iframe title="本地页面" src="./frame.html"></iframe>\n\n<iframe title="srcdoc 页面" srcdoc="<button onclick=&quot;this.textContent=\'已点击\'&quot;>内嵌按钮</button>"></iframe>\n\n## 本地资源\n\n<img src="file:///tests/fixtures/preview-restrictions/dot.svg" alt="本地图片">\n\n<video controls poster="./dot.svg"><source src="../../artifacts/preview-restrictions-2026-09-20/clip.mp4"></video>\n\n<audio controls src="../../artifacts/preview-restrictions-2026-09-20/tone.wav"></audio>\n\n## 原生 HTML 块\n\n<div>\n<style>body{font:16px system-ui}h2{color:#168}</style>\n<h2 id="raw">等待脚本</h2><script>document.getElementById("raw").textContent="原生块脚本通过"</script>\n</div>\n\n## 静态 SVG\n\n```html\n<svg viewBox="0 0 120 40"><rect width="120" height="40" fill="#268"/><text x="10" y="25" fill="white">Static SVG</text></svg>\n```\n';
const make=(id:string,ext:string,content:string)=>({id,filePath:`/tests/fixtures/preview-restrictions/${id}.${ext}`,content,savedContent:content});
const samples=[make('document','html',interactive),make('document','md',md),make('external','html','<h1>外链脚本</h1><p id="external">等待脚本</p><script src="./helper.js"></script><img src="file:///tests/fixtures/preview-restrictions/dot.svg">')];
samples.forEach((t,i)=>t.id+='-'+i);
useEditorStore.setState({panes:null,activePane:'left',tabs:samples,activeId:samples[0].id,showPreview:true,previewMaximized:true,markdownMode:'visual',language:'zh',theme:'light',autoSave:'off',formatOnSave:false});
function Review(){const state=useEditorStore(s=>s);return <div style={{height:'100%',display:'flex',flexDirection:'column'}}>
<nav><button onClick={()=>{const theme=state.theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',theme==='dark');useEditorStore.setState({theme});}}>切换亮暗</button><button onClick={()=>useEditorStore.setState({language:state.language==='zh'?'en':'zh'})}>切换中英文</button></nav>
<Groups initialPreviewPct={50}/><output id="review-state">{JSON.stringify({dirty:state.tabs.filter(t=>t.content!==t.savedContent).map(t=>t.id)})}</output></div>}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
