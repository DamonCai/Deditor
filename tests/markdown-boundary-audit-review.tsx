import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import Toolbar from '../src/components/MarkdownToolbar';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
const samples:Record<string,string>={code:'```js\nconst x=1;\n```\n',emptyCode:'```js\n\n```\n',math:'$$\nx^2\n$$\n',image:'![alt](data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="60"%3E%3Crect width="120" height="60" fill="red"/%3E%3C/svg%3E)\n',table:'| A | B |\n| --- | --- |\n| C | D |\n',html:'<div>keep</div>\n',nested:'- parent\n  - child\n',quote:'> - child\n',placeholder:'- <br>\n',quoteBreak:'> <br>\n',word:'word\n',mixed:'Before\n\n```js\nconst x=1;\n```\n\nAfter\n'};
const initial=samples.code;
useEditorStore.setState({tabs:[{id:'boundary',filePath:'/generated/boundary.md',content:initial,savedContent:initial}],activeId:'boundary',markdownMode:'visual',theme:'light',language:'en',autoSave:'off'});
function Review(){const theme=useEditorStore(s=>s.theme);const content=useEditorStore(s=>s.tabs[0].content);const [version,setVersion]=React.useState(0);const [baseline,setBaseline]=React.useState(initial);return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav>{Object.entries(samples).map(([name,text])=><button key={name} onClick={()=>{useEditorStore.getState().setContent(text,'boundary','command');setBaseline(text);setVersion(v=>v+1);}}>{name}</button>)}<button onClick={()=>{const dark=theme==='light';document.documentElement.classList.toggle('dark',dark);useEditorStore.setState({theme:dark?'dark':'light'});}}>Theme</button></nav><Toolbar/><div style={{display:'flex',flex:1,minHeight:0}}><div style={{width:'50%'}}><Visual key={version} tabId="boundary" theme={theme}/></div><div style={{width:'50%'}}><Preview tabId="boundary" theme={theme}/></div></div><output style={{whiteSpace:'pre-wrap',maxHeight:150,overflow:'auto'}}>{JSON.stringify({unchanged:content===baseline,source:content})}</output></div>}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
