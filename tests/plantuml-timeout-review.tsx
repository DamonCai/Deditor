// Test-only transport proxy delays a genuine upstream response; product code is unchanged.
import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
const network=window.fetch.bind(window);
window.fetch=(input,init)=>network(typeof input==='string'&&input.startsWith('https://www.plantuml.com/plantuml/svg/')?input.replace('https://www.plantuml.com/plantuml/svg/','http://127.0.0.1:5174/svg/'):input,init);
const stamp=new URLSearchParams(location.search).get('run')||'manual';
const content='# Real remote recovery\n\n```plantuml\n@startuml\nAlice -> Bob: Recovery_'+stamp+'\nBob --> Alice: Confirmed\n@enduml\n```\n';
useEditorStore.setState({tabs:[{id:'timeout',filePath:'/generated/timeout.md',content,savedContent:content}],activeId:'timeout',markdownMode:'visual',theme:'light',language:'en',autoSave:'off'});
function Review(){const [result,setResult]=React.useState('');return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><button onClick={()=>setResult(useEditorStore.getState().tabs[0].content===content?'Source unchanged':'SOURCE CHANGED')}>Verify source</button><output>{result}</output><div style={{flex:1,minHeight:0}}><Visual tabId="timeout" theme="light"/></div></div>;}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
