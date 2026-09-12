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
 'Mixed': '# Heading alpha\n\nParagraph beta\n\n- List gamma\n- List delta\n  - Nested epsilon\n  - Nested zeta\n\n> Quote eta\n>\n> Quote theta\n\n## Heading iota\n\nTail kappa\n',
 'List': 'Before\n\n- first\n- second\n  - nested one\n  - nested two\n- third\n\nAfter\n',
 'Quote': 'Before\n\n> alpha\n>\n> beta\n\nAfter\n',
 'Formatted': '# Heading **bold**\n\nBefore\n\n- alpha **bold** beta `code` gamma\n- \n\n> delta <kbd>Ctrl</kbd>\n\nTail\n\n[ref]: https://example.com/test\n',
};
const initial = fixtures['Mixed'];
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
