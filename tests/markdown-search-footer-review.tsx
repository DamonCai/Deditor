import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Editor from '../src/components/Editor';
import {useEditorStore} from '../src/store/editor';
import {openEditorSearch} from '../src/lib/editorSearch';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
const sample = '# Search review\n\nStart unchanged.\n\n' + Array.from({length:80},(_,i)=>`Paragraph ${i+1}: ${i===20?'查找目标 alpha':i===65?'查找目标 **alpha**':'ordinary text for scrolling.'}\n\n`).join('') + '| Name | Value |\n| --- | --- |\n| 查找目标 | alpha |\n\n```js\nconst alpha = "查找目标";\n```\n\nEnd unchanged.\n';
useEditorStore.setState({tabs:[{id:'search-footer',filePath:'/generated/search-footer.md',content:sample,savedContent:sample}],activeId:'search-footer',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){
 const content=useEditorStore(s=>s.tabs[0].content), theme=useEditorStore(s=>s.theme) as 'light'|'dark';
 const [mode,setMode]=React.useState('visual'),[narrow,setNarrow]=React.useState(false),[readonly,setReadonly]=React.useState(false);
 React.useEffect(()=>{document.documentElement.classList.toggle('dark',theme==='dark');},[theme]);
 return <div style={{height:'100vh',width:narrow?720:'100%',display:'flex',flexDirection:'column'}}>
 <div><button onClick={()=>{const next=mode==='visual'?'source':'visual';setMode(next);useEditorStore.setState({markdownMode:next as 'visual'|'source'});}}>Switch mode</button><button onClick={()=>openEditorSearch()}>Find</button><button onClick={()=>setNarrow(!narrow)}>720px</button><button onClick={()=>useEditorStore.setState({theme:theme==='light'?'dark':'light'})}>Theme</button><button onClick={()=>setReadonly(!readonly)}>Readonly</button><button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button></div>
 <div style={{flex:1,minHeight:0}}>{mode==='visual'?<Visual tabId="search-footer" theme={theme} readonly={readonly}/>:<Editor theme={theme} fontSize={16} value={content} tabId="search-footer" filePath="/generated/search-footer.md" onChange={value=>useEditorStore.getState().setContent(value,'search-footer')}/>}</div>
 <output data-testid="fidelity">{content===sample?'Original unchanged':'Edited'}</output>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
