import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import {useEditorStore} from '../src/store/editor';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
const sample='# Search\n\nAlpha alpha ALPHA alphabet\n\ncat scatter cat_ cat-cat café CAFÉ İ 😀 é\n\n**item12** item34 item56\n\ncat cat cat\n\nTail unchanged.\n';
useEditorStore.setState({tabs:[{id:'search-a',filePath:'/generated/search.md',content:sample,savedContent:sample}],activeId:'search-a',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){const content=useEditorStore(s=>s.tabs[0].content);const [saved,setSaved]=React.useState('');return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div><button onClick={()=>useEditorStore.getState().setContent('cat cat cat\n','search-a','command')}>Replacement sample</button><button onClick={()=>useEditorStore.getState().setContent(sample,'search-a','command')}>Reset sample</button><button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button><button onClick={()=>setSaved(useEditorStore.getState().tabs[0].content)}>Save snapshot</button></div><Visual tabId="search-a" theme="light"/><pre data-testid="source" style={{maxHeight:180,overflow:'auto'}}>{content}</pre><pre data-testid="saved">{saved}</pre></div>};const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
