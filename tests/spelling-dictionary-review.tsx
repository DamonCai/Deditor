// Generated text and review-only app state; never accesses the system dictionary.
import React from 'react';
import {createRoot} from 'react-dom/client';
import MarkdownVisualEditor from '../src/components/MarkdownVisualEditor';
import MarkdownWritingSettings from '../src/components/MarkdownWritingSettings';
import {useEditorStore} from '../src/store/editor';
import {useSpellingDictionary} from '../src/lib/spellingDictionary';
import '../src/styles.css';
import '../src/preview.css';
const fixture='# Application dictionary\n\nThis is a spellng example. Deditorterm localword spellng appear in both files.\n\nA **Deditorterm** can remain bold.\n\n| Words | Check |\n| --- | --- |\n| Deditorterm | spellng |\n\n```text\nDeditorterm spellng stays in code.\n```\n';
let disk=JSON.parse(localStorage.getItem('deditor-spelling-review-only')??'{"words":[],"ignored":{},"revision":0}');
(window as any).__TAURI_INTERNALS__={convertFileSrc:(p:string)=>p,invoke:async(cmd:string,args:any)=>{
 if(cmd==='read_spelling_dictionary')return structuredClone(disk);
 if(cmd==='change_spelling_dictionary') {const c=args.change;if(c.kind==='word'){let words=c.document?disk.ignored[c.document]??[]:disk.words;words=words.filter((w:string)=>w!==c.word);if(c.add)words.push(c.word);words.sort();if(c.document)disk.ignored[c.document]=words;else disk.words=words;}else disk.ignored[c.to]=[...new Set([...(disk.ignored[c.to]??[]),...(c.from?disk.ignored[c.from]??[]:[]),...c.words])].sort();disk.revision++;localStorage.setItem('deditor-spelling-review-only',JSON.stringify(disk));return structuredClone(disk);}
}};
const query=new URLSearchParams(location.search),dark=query.get('theme')==='dark';document.documentElement.classList.toggle('dark',dark);
useEditorStore.setState(s=>({panes:null,activePane:'left',tabs:[{id:'first',filePath:'/self-created/dictionary-first.md',content:fixture,savedContent:fixture},{id:'second',filePath:'/self-created/dictionary-second.md',content:fixture,savedContent:fixture}],activeId:'first',markdownMode:'visual',markdownSettings:{...s.markdownSettings,spellcheck:true},autoSave:'off',language:query.get('lang')==='en'?'en':'zh',theme:dark?'dark':'light'}));
function Review(){const state=useEditorStore(s=>s),dict=useSpellingDictionary();return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><nav style={{display:'flex',alignItems:'center',gap:12,padding:8}}>{state.tabs.map(t=><button key={t.id} onClick={()=>state.setActive(t.id)}>{t.id}</button>)}<MarkdownWritingSettings/><span>Self-created dictionary documents</span></nav><main style={{flex:1,minHeight:0}}><MarkdownVisualEditor key={state.activeId} tabId={state.activeId!} theme={dark?'dark':'light'}/></main><output style={{fontSize:11,padding:6}}>App words: {dict.data.words.join(', ')} · This document ignored: {(dict.data.ignored[state.tabs.find(t=>t.id===state.activeId)?.filePath??'']??[]).join(', ')} · Source changed: {String(state.tabs.some(t=>t.content!==t.savedContent))}</output></div>}
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
