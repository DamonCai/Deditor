import React from 'react';
import {createRoot} from 'react-dom/client';
import Visual from '../src/components/MarkdownVisualEditor';
import Preview from '../src/components/Preview';
import EditorSlot from '../src/components/EditorSlot';
import Toolbar from '../src/components/MarkdownToolbar';
import {getActiveView} from '../src/lib/editorBridge';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
const generated='# Generated document\n\n'+Array.from({length:30},(_,i)=>`## Section ${i}\n\nParagraph ${i} ${'wrapping words '.repeat(12)}\n\n`).join('')+'* sdf\n\n  sdf\n\n  ## sdf\n';
const fixture=new URL(location.href).searchParams.get('fixture');
const initial=fixture?.startsWith('/tests/artifacts/')?await fetch(fixture).then(r=>{if(!r.ok)throw new Error('Fixture unavailable');return r.text()}):generated;
useEditorStore.setState({tabs:[{id:'feedback',filePath:'/generated/feedback.md',content:initial,savedContent:initial}],activeId:'feedback',markdownMode:'split',theme:'light',language:'zh',autoSave:'off'});
function Review(){
 const mode=useEditorStore(s=>s.markdownMode),source=useEditorStore(s=>s.tabs[0].content);
 const [sync,setSync]=React.useState<{line:number,from:'editor'|'preview'}>();
 const [measure,setMeasure]=React.useState('Ready');
 React.useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>;let raf=0;
  const snapshot=()=>{const left=document.querySelector<HTMLElement>('.cm-scroller'),right=document.querySelector<HTMLElement>('.preview'),view=getActiveView();return {left:left?.scrollTop,right:right?.scrollTop,leftHeight:left?.scrollHeight,rightHeight:right?.scrollHeight,caret:view?.coordsAtPos(view.state.selection.main.head)?.top};};
  const start=(event:Event)=>{if(!(event.target as HTMLElement).closest('.cm-content'))return;if(event.type==='keydown'&&!['Enter','Backspace','Delete'].includes((event as KeyboardEvent).key))return;clearTimeout(timer);cancelAnimationFrame(raf);const before=snapshot(),frames:ReturnType<typeof snapshot>[]=[];let until=performance.now()+1000;const sample=()=>{frames.push(snapshot());if(performance.now()<until)raf=requestAnimationFrame(sample);};raf=requestAnimationFrame(sample);timer=setTimeout(()=>{const after=snapshot();setMeasure(JSON.stringify({input:(event as InputEvent).inputType||(event as KeyboardEvent).key,before,after,leftDelta:(after.left??0)-(before.left??0),leftRange:[Math.min(...frames.map(f=>f.left??0)),Math.max(...frames.map(f=>f.left??0))]}));},1050);};
  document.addEventListener('beforeinput',start,true);document.addEventListener('keydown',start,true);return()=>{document.removeEventListener('beforeinput',start,true);document.removeEventListener('keydown',start,true);clearTimeout(timer);cancelAnimationFrame(raf);};
 },[]);
 return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><Toolbar/><output data-testid="measurement" style={{fontSize:11,height:32,overflow:'auto'}}>{measure}</output><div style={{flex:1,display:'flex',minHeight:0}}>
 <section aria-label="源码" style={{width:mode==='split'?'50%':'100%',minWidth:0,display:mode==='visual'?'none':'block'}}><EditorSlot tabId="feedback" active={mode!=='visual'} theme="light" fontSize={14} externalScrollLine={sync?.from==='preview'?sync.line:undefined} onScroll={line=>setSync({line,from:'editor'})}/></section>
 {mode==='split'&&<section aria-label="实时预览" style={{width:'50%',minWidth:0}}><Preview tabId="feedback" theme="light" scrollLine={sync?.from==='editor'?sync.line:undefined} onScroll={line=>setSync({line,from:'preview'})}/></section>}
 {mode==='visual'&&<section aria-label="阅读编辑" style={{width:'100%',minWidth:0,display:'flex',flexDirection:'column'}}><Visual tabId="feedback" theme="light"/></section>}</div><details style={{maxHeight:130,overflow:'auto'}}><summary>源文核对</summary><pre data-testid="source">{source}</pre></details></div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
