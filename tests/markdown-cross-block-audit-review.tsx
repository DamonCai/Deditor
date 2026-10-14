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
 'ParagraphTable': 'Before untouched\n\nalpha middle\n\n| H1 | H2 |\n| --- | --- |\n| beta tail | kept cell |\n\nAfter untouched\n\n[ref]: https://example.com/keep\n',
 'NestedQuote': 'Before untouched\n\n- parent\n  - alpha middle\n  - child kept\n\n> beta tail\n>\n> kept quote\n\nAfter untouched\n\n[ref]: https://example.com/keep\n',
 'HeadingList': 'Before untouched\n\n## alpha middle\n\n- beta tail\n- kept item\n\nAfter untouched\n\n[ref]: https://example.com/keep\n',
};
const initial = fixtures['ParagraphTable'];
useEditorStore.setState({tabs:[{id:'cross-a',filePath:'/generated/cross-block-audit.md',content:initial,savedContent:initial}],activeId:'cross-a',language:'zh',theme:'light',markdownMode:'visual',autoSave:'off',autoCloseBrackets:true});
document.addEventListener('beforeinput', event => console.info('cross-block-beforeinput', JSON.stringify({inputType:(event as InputEvent).inputType,data:(event as InputEvent).data,isComposing:(event as InputEvent).isComposing,cancelable:event.cancelable})), true);
function Review() {
 const content = useEditorStore(s=>s.tabs[0].content);
 const [saved,setSaved] = React.useState('');
 const [selection,setSelection] = React.useState('');
 React.useEffect(()=>{const update=()=>{const s=document.getSelection();setSelection(JSON.stringify({anchor:s?.anchorNode?.textContent,anchorOffset:s?.anchorOffset,focus:s?.focusNode?.textContent,focusOffset:s?.focusOffset}));};document.addEventListener('selectionchange',update);return()=>document.removeEventListener('selectionchange',update);},[]);
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
 <div>{Object.entries(fixtures).map(([name,text])=><button key={name} onClick={()=>useEditorStore.getState().setContent(text,'cross-a','command')}>{name}样例</button>)} <button onClick={()=>{getVisualEditor()?.navigate(3,11);getVisualEditor()?.focus();}}>正文行尾</button> <button onClick={()=>setSaved(useEditorStore.getState().tabs[0].content)}>核对快照</button><button onClick={()=>markdownHistory()}>历史撤销</button><button onClick={()=>markdownHistory(true)}>历史重做</button></div>
 <MarkdownToolbar/><Visual tabId="cross-a" theme="light"/>
 <pre data-testid="selection" style={{height:35,overflow:'auto'}}>{selection}</pre>
 <div style={{display:'flex',maxHeight:190,overflow:'auto'}}><pre data-testid="source" style={{flex:1}}>{content}</pre><pre data-testid="saved" style={{flex:1}}>{saved}</pre></div>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
