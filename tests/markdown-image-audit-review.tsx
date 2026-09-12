// Self-created fixture. Browser-only image IO is mocked; never reads user files.
import React from 'react';
import { createRoot } from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import MarkdownToolbar from '../src/components/MarkdownToolbar';
import { useEditorStore } from '../src/store/editor';
import { collectMarkdownImages } from '../src/lib/markdownImageCollect';
import { markdownHistory } from '../src/lib/markdownHistory';
import '../src/styles.css';
const fixtures = {
  image: 'Before\n\n![自建图片](/tests/fixtures/markdown-review.svg "title")\n\nTail\n',
  path: 'Before\n\n![a \\](b](/tests/fixtures/markdown-review.svg "title")\n\nTail\n',
};
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{
  convertFileSrc:(path:string)=>new URL(path.startsWith('/generated/assets/')?'/tests/fixtures/markdown-review.svg':path,location.origin).href,
  invoke:async(command:string,args:Record<string,string>)=>{
    if(command==='read_binary_as_base64')return 'PHN2Zy8+';
    if(command==='save_image')return `${args.dir}/${args.folder}/${args.name}`;
    throw new Error(`Image audit does not allow ${command}`);
  },
}});
useEditorStore.setState({tabs:[{id:'image-audit',filePath:'/generated/images.md',content:fixtures.image,savedContent:fixtures.image}],activeId:'image-audit',language:'en',theme:'light',markdownMode:'visual',autoSave:'off'});
function Review(){
 const content=useEditorStore(s=>s.tabs[0].content);const [report,setReport]=React.useState('');
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}>
  <div><button onClick={()=>useEditorStore.getState().setContent(fixtures.image,'image-audit','command')}>Image sample</button><button onClick={()=>useEditorStore.getState().setContent(fixtures.path,'image-audit','command')}>Escaped label sample</button><button onClick={()=>collectMarkdownImages('image-audit').then(r=>setReport(JSON.stringify(r)),e=>setReport(String(e)))}>Collect with mock IO</button><button onClick={()=>markdownHistory()}>Undo audit</button></div>
  <MarkdownToolbar/><Visual tabId="image-audit" theme="light"/>
  <pre data-testid="source" style={{height:180,overflow:'auto'}}>{content}</pre><pre data-testid="report">{report}</pre>
 </div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
