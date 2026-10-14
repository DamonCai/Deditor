// Self-created paths and in-memory IO only; never reads native app history.
import React from 'react';
import {createRoot} from 'react-dom/client';
import RecentFiles from '../src/components/RecentFiles';
import {handleRecentFilesKey} from '../src/lib/recentFiles';
import {useEditorStore} from '../src/store/editor';
import '../src/styles.css';
const params=new URLSearchParams(location.search),dark=params.get('theme')==='dark',language=params.get('lang')==='en'?'en':'zh';
document.documentElement.classList.toggle('dark',dark);
const files=['/generated/work/当前文件.md','/generated/work/方案说明.md','/generated/a-very-long-directory/very-long-project-name/deeply-nested/documentation/readme-with-a-very-long-filename.md','/generated/missing.md','C:\\generated\\windows\\配置.json'];
(window as any).__TAURI_INTERNALS__={invoke:async(command:string,args:any)=>{if(command==='read_text_file'){if(args.path.includes('missing'))throw Error('Self-created missing fixture');return '# Self-created recent file fixture\n';}return null;}};
useEditorStore.setState({recentFiles:files,tabs:[{id:'recent-initial',filePath:files[0],content:'# Original\n',savedContent:'# Original\n'}],activeId:'recent-initial',language,theme:dark?'dark':'light',autoSave:'off',recentFilesOpen:true});
function Review(){
 const open=useEditorStore(s=>s.recentFilesOpen),active=useEditorStore(s=>s.tabs.find(t=>t.id===s.activeId)?.filePath);
 React.useEffect(()=>{window.addEventListener('keydown',handleRecentFilesKey,true);return()=>window.removeEventListener('keydown',handleRecentFilesKey,true);},[]);
 return <div style={{padding:20,color:'var(--text)',background:'var(--bg)',height:'100vh'}}><button className="deditor-input" onClick={()=>useEditorStore.getState().setRecentFilesOpen(true)}>Cmd/Ctrl+E</button><p data-testid="active-file">{active}</p>{open&&<RecentFiles onClose={()=>useEditorStore.getState().setRecentFilesOpen(false)}/>}</div>;
}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
