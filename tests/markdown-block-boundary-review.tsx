// Generated samples only; this browser review never reads or writes user files.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const samples:Record<string,string>={Code:'```js\nconst x=1;\n```\n',Math:'$$\nx^2\n$$\n',HTML:'<div>HTML</div>\n',Details:'<details>\n<summary>Title</summary>\nBody\n</details>\n',YAML:'---\ntitle: Example\n---\n',Adjacent:'```js\nx\n```\n\n![alt](/tests/fixtures/markdown-review.svg)\n\n<div>HTML</div>\n',Image:'![alt](/tests/fixtures/markdown-review.svg)\n'};
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{convertFileSrc:(p:string)=>p,invoke:async()=>{throw Error('No file IO in boundary review');}}});
useEditorStore.setState({tabs:[{id:'boundary',filePath:'/generated/boundary.md',content:samples.Code,savedContent:samples.Code}],activeId:'boundary',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){const content=useEditorStore(s=>s.tabs[0].content);const [generation,setGeneration]=React.useState(0);return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div>{Object.keys(samples).map(name=><button key={name} onClick={()=>{useEditorStore.getState().setContent(samples[name],'boundary','command');setGeneration(g=>g+1);}}>{name} sample</button>)}<button onClick={()=>markdownHistory()}>Undo boundary</button><button onClick={()=>markdownHistory(true)}>Redo boundary</button></div><Visual key={generation} tabId="boundary" theme="light"/><pre data-testid="source" style={{maxHeight:220,overflow:'auto'}}>{content}</pre></div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
