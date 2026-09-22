// Self-created resource paths and in-memory file reads only.
import React from 'react';
import {createRoot} from 'react-dom/client';
import HtmlPreview from '../src/components/HtmlPreview';
import ConfirmDialog from '../src/components/ConfirmDialog';
import {openFileByPath} from '../src/lib/fileio';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
const base='/tests/fixtures/html-local-resources/';
const source=`<base href="file://${base}" target="resource-window"><link rel="stylesheet" href="style.css"><h1>Local HTML resources</h1><p id="status">Waiting for local script</p><button id="run">Run button</button><form id="form"><input name="value" aria-label="Form value" value="local form"><button>Submit form</button></form><p id="result"></p><p id="isolation"></p><div class="samples"><img alt="Responsive local image" srcset="file://${base}dot.svg 1x, file://${base}dot.svg 2x"><svg viewBox="0 0 80 60"><image width="80" height="60" xlink:href="file://${base}dot.svg"/></svg></div><a href="dot.svg" target="_self">Open local image</a><script src="helper.js"></script>`;
(window as any).__TAURI_INTERNALS__={convertFileSrc:(p:string)=>new URL(p,location.href).href,invoke:async(cmd:string,args:any)=>{if(cmd==='read_text_file'){if(args.path.includes('missing'))throw new Error('Self-created missing file');return source;}}};
const query=new URLSearchParams(location.search);const dark=query.get('theme')==='dark';
document.documentElement.classList.toggle('dark',dark);
useEditorStore.setState({panes:null,tabs:[{id:'sample',filePath:base+'index.html',content:source,savedContent:source}],activeId:'sample',language:query.get('lang')==='en'?'en':'zh',theme:dark?'dark':'light'});
function Review(){return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav style={{padding:8}}><button onClick={()=>void openFileByPath(base+'missing.html')}>Open missing HTML</button><button onClick={()=>void openFileByPath(base+'valid.html')}>Open valid HTML</button><span> Generated files only · iframe preserves editor isolation</span></nav><main style={{flex:1,minHeight:0}}><HtmlPreview tabId="sample"/></main><ConfirmDialog/></div>}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
