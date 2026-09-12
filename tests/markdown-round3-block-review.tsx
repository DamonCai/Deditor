// Self-created sequence fixture. Buttons use the same visual insert API as the toolbar.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import { useEditorStore } from '../src/store/editor';
import { getVisualEditor } from '../src/lib/markdownVisualBridge';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const initial='Before\n\nAfter\n';
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{convertFileSrc:(p:string)=>p,invoke:async()=>{throw Error('Sequence fixture allows no file IO');}}});
useEditorStore.setState({tabs:[{id:'sequence-block',filePath:'/generated/sequence.md',content:initial,savedContent:initial}],activeId:'sequence-block',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
const samples={HTML:'<div>generated</div>',Details:'<details>\n<summary>Title</summary>\nBody\n</details>',Image:'![generated](/tests/fixtures/markdown-review.svg "title")',Formula:'$$\nx^2\n$$'};
function Review(){const content=useEditorStore(s=>s.tabs[0].content);const [generation,setGeneration]=React.useState(0);const reset=(text:string)=>{useEditorStore.getState().setContent(text,'sequence-block','command');setGeneration(g=>g+1);};return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div>{Object.entries(samples).map(([name,source])=><button key={name} onMouseDown={e=>e.preventDefault()} onClick={()=>getVisualEditor()?.insert(source,true)}>Insert {name}</button>)}<button onClick={()=>reset(initial)}>Reset</button><button onClick={()=>reset(Array.from({length:45},(_,i)=>`Paragraph ${i}: generated prose for scrolling.`).join('\n\n')+'\n\n<div>generated long block</div>\n\nAfter long block\n')}>Long sample</button><button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button></div><Visual key={generation} tabId="sequence-block" theme="light"/><pre data-testid="source" style={{height:160,overflow:'auto',flexShrink:0}}>{content}</pre></div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
