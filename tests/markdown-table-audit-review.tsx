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
 '代码到表格': '```text\ncode sample\n```\n\n| A | B |\n| --- | --- |\n| first | second |\n\nTail\n',
 '正文': '前段保留。\n\nalpha beta\n\n后段保留。\n',
 '任务': '- [x] completed\n- [ ] pending\n\n后段保留。\n',
 '列表': '- alpha\n- beta\n- gamma\n\n后段保留。\n',
 '表格': '| A | B |\n| --- | --- |\n| one | two |\n\n后段保留。\n',
 '格式': '前段保留。\n\nalpha **bold** beta *italic* gamma\n\n后段保留。\n',
 '引用': '> alpha\n>\n> beta\n\n后段保留。\n',
 '换行': 'alpha\nbeta\n\ngamma\n',
};
const initial = '# Table audit\n\nBefore unchanged\n\n| A long heading | B long heading | C long heading |\n| :--- | :---: | ---: |\n| one | two | three |\n| four | five | six |\n| seven | eight | nine |\n| ten | eleven | twelve |\n| thirteen | fourteen | fifteen |\n| sixteen | seventeen | eighteen |\n\nAfter unchanged\n';
useEditorStore.setState({tabs:[{id:'basic-a',filePath:'/generated/basic-operations.md',content:initial,savedContent:initial}],activeId:'basic-a',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off',autoCloseBrackets:true});
function Review() {
 const content = useEditorStore(s=>s.tabs[0].content);
 const [saved,setSaved] = React.useState('');
 const [narrow,setNarrow] = React.useState(false);
 const [selection,setSelection] = React.useState('');
 const [dragEvents,setDragEvents] = React.useState<string[]>([]);
 React.useEffect(()=>{const types=['dragstart','dragover','drop','dragend'];const log=(e:Event)=>setDragEvents(prev=>[...prev.slice(-10),`${e.type}:${(e.target as Element).closest?.('[data-role]')?.getAttribute('data-role')??(e.target as Element).tagName}`]);types.forEach(type=>window.addEventListener(type,log,true));return()=>types.forEach(type=>window.removeEventListener(type,log,true));},[]);
 React.useEffect(()=>{const update=()=>{const s=document.getSelection();setSelection(JSON.stringify({anchor:s?.anchorNode?.textContent,anchorOffset:s?.anchorOffset,focus:s?.focusNode?.textContent,focusOffset:s?.focusOffset}));};document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);},[]);
 return <div style={{height:'100vh',width:narrow?280:'100%',display:'flex',flexDirection:'column'}}>
 <div><button onClick={()=>setNarrow(value=>!value)}>Narrow view</button><button onClick={()=>useEditorStore.getState().setContent(initial,'basic-a','command')}>Reset table</button><button onClick={()=>{const text=useEditorStore.getState().tabs[0].content;useEditorStore.getState().setContent('', 'basic-a','command');setTimeout(()=>useEditorStore.getState().setContent(text,'basic-a','command'),30);}}>Reparse source</button>{Object.entries(fixtures).map(([name,text])=><button key={name} onClick={()=>useEditorStore.getState().setContent(text,'basic-a','command')}>{name}样例</button>)} <button onClick={()=>{getVisualEditor()?.navigate(3,11);getVisualEditor()?.focus();}}>正文行尾</button> <button onClick={()=>setSaved(useEditorStore.getState().tabs[0].content)}>核对快照</button><button onClick={()=>markdownHistory()}>历史撤销</button></div>
 <MarkdownToolbar/><Visual tabId="basic-a" theme="light"/>
 <pre data-testid="drag-events">{dragEvents.join(" → ")}</pre><pre data-testid="selection" style={{height:35,overflow:'auto'}}>{selection}</pre>
 <div style={{display:'flex',maxHeight:190,overflow:'auto'}}><pre data-testid="source" style={{flex:1}}>{content}</pre><pre data-testid="saved" style={{flex:1}}>{saved}</pre></div>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
