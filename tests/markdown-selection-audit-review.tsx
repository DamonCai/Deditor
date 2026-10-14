import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Toolbar from '../src/components/MarkdownToolbar';
import {useEditorStore} from '../src/store/editor';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
const samples:Record<string,string>={
Image:'Before\n\n![Picture](data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22160%22%20height=%2280%22%3E%3Crect%20width=%22160%22%20height=%2280%22%20fill=%22orange%22/%3E%3C/svg%3E)\n\nAfter\n',
Math:'Before\n\n$$\nx^2\n$$\n\nAfter\n',
Raw:'Before\n\n<details>\n<summary>Summary</summary>\nBody\n</details>\n\nAfter\n',
Code:'Before\n\n```js\nconst x = 1;\n```\n\nAfter\n',
Table:'Before\n\n| A | B | C |\n| --- | --- | --- |\n| one | two | three |\n| four | five | six |\n| seven | eight | nine |\n\nAfter\n',
Mixed:'Before\n\n```js\nconst x = 1;\n```\n\n$$\nx^2\n$$\n\n<custom>Raw</custom>\n\nAfter\n'};
useEditorStore.setState({tabs:[{id:'selection-a',filePath:'/generated/selection-a.md',content:samples.Image,savedContent:samples.Image},{id:'selection-b',filePath:'/generated/selection-b.md',content:'Destination\n',savedContent:'Destination\n'}],activeId:'selection-a',language:'en',markdownMode:'visual',theme:'light',autoSave:'off'});
function Review(){const s=useEditorStore();const [base,setBase]=React.useState(samples.Image);return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav>{Object.entries(samples).map(([name,source])=><button key={name} onClick={()=>{s.setActive('selection-a');s.setContent(source,'selection-a','command');setBase(source)}}>{name}</button>)}<button onClick={()=>s.setActive('selection-a')}>Document A</button><button onClick={()=>s.setActive('selection-b')}>Document B</button><button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button></nav><Toolbar/><div style={{flex:1,minHeight:0}}><Visual key={s.activeId} tabId={s.activeId!} theme="light"/></div><details open><summary>Source evidence</summary><output style={{whiteSpace:'pre-wrap',display:'block',maxHeight:160,overflow:'auto'}}>{JSON.stringify({id:s.activeId,exact:s.tabs.find(t=>t.id==='selection-a')?.content===base,source:s.tabs.find(t=>t.id===s.activeId)?.content})}</output></details></div>};
for(const kind of ['pointermove','mousemove','dragstart','dragover','drop'])document.addEventListener(kind,()=>{document.documentElement.dataset[kind]=String(Number(document.documentElement.dataset[kind]??0)+1)},true);
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
