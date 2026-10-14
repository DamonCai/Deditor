// Generated documents only. PlantUML uses an explicit offline SVG fixture to test layout.
import React from "react";
import { createRoot } from "react-dom/client";
import ConfirmDialog, { chooseAction } from "../src/components/ConfirmDialog";
import Visual from "../src/components/MarkdownVisualEditor";
import { useEditorStore } from "../src/store/editor";
import { Button } from "../src/components/ui/Button";
import { markdownHistory } from "../src/lib/markdownHistory";
import "../src/styles.css";
const params = new URLSearchParams(location.search);
const dark = params.has("dark"), en = params.has("en");
const sources = {
 tall: 'flowchart TD\n' + Array.from({length:17},(_,i)=>` N${i}[步骤 ${i+1}] --> N${i+1}[步骤 ${i+2}]`).join('\n'),
 short: 'flowchart LR\n A[开始] --> B[结束]',
 wide: 'flowchart LR\n' + Array.from({length:12},(_,i)=>` N${i}[步骤 ${i+1}] --> N${i+1}[步骤 ${i+2}]`).join('\n'),
 empty: '', error: 'INVALID GRAPH [',
};
let shape: keyof typeof sources = 'tall';
const fixture = (kind: keyof typeof sources) => `# 图表自动高度\n\n前文保持可编辑。\n\n\`\`\`mermaid\n${sources[kind]}\n\`\`\`\n\n两张图之间。\n\n\`\`\`plantuml\n${kind==='empty'?'':`@startuml\n' generated autosize ${kind}\nAlice -> Bob: ${kind}\n@enduml`}\n\`\`\`\n\n\`\`\`typescript\nconst ordinary = 1;\n\`\`\`\n\n正文末尾。\n`;
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
 if (!String(input).startsWith('https://www.plantuml.com/plantuml/svg/')) return nativeFetch(input,init);
 const kind = shape, width = kind==='wide'?2400:360, height = kind==='tall'?1600:160;
 if (kind==='error') return new Response('Generated failure',{status:503});
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}px" height="${height}px" viewBox="0 0 ${width} ${height}" style="width:${width}px;height:${height}px;background:#ffffff"><rect x="1" y="1" width="${width-2}" height="${height-2}" fill="#f5f7ff" stroke="#5268a7"/>${Array.from({length:kind==='tall'?16:2},(_,i)=>`<rect x="30" y="${20+i*(height/(kind==='tall'?16:2))}" width="300" height="50" fill="#dbeafe" stroke="#5268a7"/><text x="50" y="${50+i*(height/(kind==='tall'?16:2))}" fill="#172554">Generated PlantUML step ${i+1}</text>`).join('')}</svg>`;
 return new Response(svg,{headers:{'Content-Type':'image/svg+xml'}});
};
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{convertFileSrc:(path:string)=>path,invoke:async()=>undefined}});
const original=fixture(shape);
useEditorStore.setState({tabs:[{id:'autosize',filePath:'/generated/diagram-autosize.md',content:original,savedContent:original}],activeId:'autosize',markdownMode:'visual',theme:dark?'dark':'light',language:en?'en':'zh',autoSave:'off'});
document.documentElement.classList.toggle('dark',dark);
function Review(){
 React.useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.altKey&&event.code==='KeyE'){event.preventDefault();void chooseAction({title:'Generated save failure',message:'Self-created error dialog for fullscreen focus validation.',buttons:[{label:'Close generated error',value:'close'}],tone:'error'});}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const theme=useEditorStore(s=>s.theme), content=useEditorStore(s=>s.tabs[0].content);
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav style={{display:'flex',flexWrap:'wrap',gap:8,padding:8}}>
 {(['tall','short','wide','empty','error'] as const).map(kind=><Button key={kind} onClick={()=>{shape=kind;useEditorStore.getState().setContent(fixture(kind),'autosize','command');}}>{kind}</Button>)}
 <Button onClick={()=>markdownHistory()}>Undo</Button><Button onClick={()=>markdownHistory(true)}>Redo</Button>
 <span role="status">{content===fixture(shape)?'原文一致':'内容已变化'} · PlantUML offline fixture</span></nav>
 <div style={{flex:1,minHeight:0}}><Visual tabId="autosize" theme={theme}/></div><ConfirmDialog/></div>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
