import React from 'react';
import {createRoot} from 'react-dom/client';
import {useEditorStore} from '../src/store/editor';
import Preview from '../src/components/Preview';
import MarkdownVisualSlot from '../src/components/MarkdownVisualSlot';
import {Button} from '../src/components/ui/Button';
import {checkMarkdownListPresentation} from './markdown-list-presentation-check';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
const source = '# Native operations review\n\n- [x] parent\n  - child\n  - sibling\n\n+ [x] target task\n\n| A | B |\n| :--- | ---: |\n| first | second |\n\n```typescript\nconst value = 1;\n```\n\n$$\nx^2\n$$\n\n## List boundaries\n\n- [ ] unchecked 中文\n- [x] checked 中文\n- [ ] Long task '+ 'wrapping 中文 '.repeat(12)+'\n  - child task body\n    - third level\n      - fourth level\n\n3. ordered three\n4. ordered four\n   - nested bullet\n     - deep bullet\n\n- first bullet\n\n  7. nested seven\n  8. nested eight\n\n- [ ] \n- [x] \n- [ ] Parent task\n  - [x] Nested task\n    - [ ] Deep task\n\n- [ ] Multiple paragraphs\n\n  Second paragraph with **bold**.\n\n  - Nested paragraph item\n\nEnd.\n';
const params=new URLSearchParams(location.search);
const dark=params.has('dark'), font=Number(params.get('font'))||14;
useEditorStore.setState(s=>({tabs:[{id:'list-parity',filePath:'/generated/list-parity.md',content:source,savedContent:source,zoomFontSize:font}],activeId:'list-parity',markdownMode:'visual',theme:dark?'dark':'light',markdownSettings:{...s.markdownSettings,documentTheme:params.has('compact')?'compact':'default'}}));
document.documentElement.classList.toggle('dark',dark);
function Review(){
 const tab=useEditorStore(s=>s.tabs[0]);
 const [result,setResult]=React.useState<ReturnType<typeof checkMarkdownListPresentation>|null>(null);
 return <div style={{height:'100vh',width:params.has('narrow')?720:undefined,display:'flex',flexDirection:'column'}}><div><Button onClick={()=>setResult(checkMarkdownListPresentation(document.querySelector('.preview')!,document.querySelector('.ProseMirror')!))}>Check presentation</Button><Button onClick={()=>markdownHistory(false)}>Undo</Button><Button onClick={()=>markdownHistory(true)}>Redo</Button><output data-testid="source-status">{tab.content===source?'Original source':'Modified source'}</output></div>{result&&<output data-testid="list-presentation-check">{JSON.stringify(result)}</output>}<div style={{display:'flex',flex:1,minHeight:0}}><div data-testid="parity-preview" style={{flex:'1 1 0',minWidth:0}}><Preview tabId={tab.id} theme={dark?'dark':'light'}/></div><MarkdownVisualSlot tabId={tab.id} active theme={dark?'dark':'light'}/></div><details><summary>Source</summary><pre data-testid="source">{tab.content}</pre></details></div>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
