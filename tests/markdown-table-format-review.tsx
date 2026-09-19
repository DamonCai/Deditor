import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import {useEditorStore} from '../src/store/editor';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
const generated='| A | B |\n| --- | --- |\n| numbers | 1.\u00a0one<br>2.\u00a0two |\n| bullets | \\-\u00a0alpha<br>\\-\u00a0beta |\n| labels | * **情报运营：**为正文<br>    <br>* **项目(预计)：**继续正文 |\n';
const fixture=new URL(location.href).searchParams.get('fixture');
const initial=fixture?.startsWith('/tests/artifacts/')?await fetch(fixture).then(r=>{if(!r.ok)throw new Error('Fixture unavailable');return r.text()}):generated;
useEditorStore.setState({tabs:[{id:'format',filePath:'/generated/table-format.md',content:initial,savedContent:initial}],activeId:'format',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){const source=useEditorStore(s=>s.tabs[0].content),theme=useEditorStore(s=>s.theme);const [mode,setMode]=React.useState('both');return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav>{['both','preview','visual'].map(m=><button key={m} onClick={()=>setMode(m)}>{m}</button>)}<button onClick={()=>{const next=theme==='light'?'dark':'light';document.documentElement.classList.toggle('dark',next==='dark');useEditorStore.setState({theme:next})}}>主题</button><button onClick={()=>markdownHistory()}>撤销</button><output data-testid="unchanged">{String(source===initial)}</output></nav><div style={{display:'flex',flex:1,minHeight:0}}>{mode!=='visual'&&<section aria-label="实时预览" style={{width:mode==='both'?'50%':'100%',minWidth:0,display:'flex',flexDirection:'column'}}><Preview tabId="format" active theme={theme}/></section>}{mode!=='preview'&&<section aria-label="阅读编辑" style={{width:mode==='both'?'50%':'100%',minWidth:0,display:'flex',flexDirection:'column'}}><Visual tabId="format" theme={theme}/></section>}</div></div>}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
