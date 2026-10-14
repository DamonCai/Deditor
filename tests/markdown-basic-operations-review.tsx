// Self-created cases; no native file access or persisted user state.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import MarkdownToolbar from '../src/components/MarkdownToolbar';
import { useEditorStore } from '../src/store/editor';
import { getVisualEditor } from '../src/lib/markdownVisualBridge';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const fixtures: Record<string,string> = {
 '正文': '前段保留。\n\nalpha beta\n\n后段保留。\n',
 '任务': '- [x] completed\n- [ ] pending\n\n后段保留。\n',
 '列表': '- alpha\n- beta\n- gamma\n\n后段保留。\n',
 '表格': '| A | B |\n| --- | --- |\n| one | two |\n\n后段保留。\n',
 '格式': '前段保留。\n\nalpha **bold** beta *italic* gamma\n\n后段保留。\n',
 '引用': '> alpha\n>\n> beta\n\n后段保留。\n',
 '换行': 'alpha\nbeta\n\ngamma\n',
};
const initial = fixtures['正文'];
useEditorStore.setState({tabs:[{id:'basic-a',filePath:'/generated/basic-operations.md',content:initial,savedContent:initial}],activeId:'basic-a',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off',autoCloseBrackets:true});
function Review() {
 const content = useEditorStore(s=>s.tabs[0].content);
 const [saved,setSaved] = React.useState('');
 const [selection,setSelection] = React.useState('');
 React.useEffect(()=>{const update=()=>{const s=document.getSelection();setSelection(JSON.stringify({anchor:s?.anchorNode?.textContent,anchorOffset:s?.anchorOffset,focus:s?.focusNode?.textContent,focusOffset:s?.focusOffset}));};document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);},[]);
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
 <div>{Object.entries(fixtures).map(([name,text])=><button key={name} onClick={()=>useEditorStore.getState().setContent(text,'basic-a','command')}>{name}样例</button>)} <button onClick={()=>{getVisualEditor()?.navigate(3,11);getVisualEditor()?.focus();}}>正文行尾</button> <button onClick={()=>setSaved(useEditorStore.getState().tabs[0].content)}>核对快照</button><button onClick={()=>markdownHistory()}>历史撤销</button></div>
 <MarkdownToolbar/><Visual tabId="basic-a" theme="light"/>
 <pre data-testid="selection" style={{height:35,overflow:'auto'}}>{selection}</pre>
 <div style={{display:'flex',maxHeight:190,overflow:'auto'}}><pre data-testid="source" style={{flex:1}}>{content}</pre><pre data-testid="saved" style={{flex:1}}>{saved}</pre></div>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
