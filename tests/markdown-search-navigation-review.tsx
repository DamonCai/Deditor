// Generated documents and simulated disk search only; no application data or user files.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import FindInFiles from "../src/components/FindInFiles";
import EditorGroups from "../src/components/EditorGroups";
import { useEditorStore } from "../src/store/editor";
import { Button } from "../src/components/ui/Button";
import "../src/styles.css";
const params = new URLSearchParams(location.search), dark = params.has("dark"), en = params.has("en");
const path = "/generated/search-navigation.md";
const code = params.has("long-code") ? '```js\n' + Array.from({length:60},(_,i)=>`const line${i} = "${i===44?'定位目标':'generated'}";`).join('\n') + '\n```' : '```js\nconst value = "定位目标";\n```';
const original = Array.from({length:160},(_,i)=>i===79 && params.has("code") ? code : i===79 ? `段落 ${i+1}：😀 prefix **定位目标** suffix` : `段落 ${i+1}：自建长文档，测试搜索后的滚动位置。`).join("\n\n") + "\n";
Object.defineProperty(window, "__TAURI_INTERNALS__", {configurable:true,value:{convertFileSrc:(path:string)=>path,transformCallback:()=>0,invoke:async(command:string,args:any)=>{
 if(command==="read_text_file") return original;
 if(command==="find_in_files") {const needle=args.caseSensitive?args.query:args.query.toLowerCase();return {hits:original.split("\n").flatMap((text,index)=>{const col=(args.caseSensitive?text:text.toLowerCase()).indexOf(needle);return col<0?[]:[{path,line:index+1,col:col+1,text}];}),truncated:false,files_scanned:1};}
}}});
useEditorStore.setState({tabs:params.has("cold")?[{id:"starter",filePath:"/generated/already-open.md",content:"# 已打开的文档\n\n当前段落。\n",savedContent:"# 已打开的文档\n\n当前段落。\n"}]:[{id:"search-review",filePath:path,content:original,savedContent:original}],activeId:params.has("cold")?"starter":"search-review",workspaces:["/generated"],language:en?"en":"zh",theme:dark?"dark":"light",markdownMode:params.has("source")?"source":params.has("split")?"split":"visual",autoSave:"off"});
document.documentElement.classList.toggle("dark",dark);
function Review(){
 const [open,setOpen]=useState(false);
 const activeId=useEditorStore(s=>s.activeId);
 const [readyId,setReadyId]=useState<string|null>(null);
 useEffect(()=>{const timer=setTimeout(()=>setReadyId(activeId),params.has("slow")?2600:0);return()=>clearTimeout(timer);},[activeId]);
 const mode=useEditorStore(s=>s.markdownMode), content=useEditorStore(s=>s.tabs.find(t=>t.id===s.activeId)?.content);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==="f"){e.preventDefault();setOpen(true);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
 return <div style={{height:"100vh",display:"flex",flexDirection:"column"}}><div style={{display:"flex",gap:12,padding:8}}><Button onClick={()=>setOpen(true)}>搜索 / Search</Button><Button onClick={()=>useEditorStore.setState({markdownMode:mode==="visual"?"source":mode==="source"?"split":"visual"})}>切换模式 / Mode</Button><span role="status">{mode} · {!activeId?"尚未打开文件":content===original?"原文一致":"已修改"}</span></div><div style={{flex:1,minHeight:0,position:"relative",display:"flex"}}>{activeId && readyId!==activeId?<span>正在加载测试编辑器 / Loading test editor</span>:<EditorGroups initialPreviewPct={50}/>}</div>{open && <FindInFiles open onClose={()=>setOpen(false)}/>}</div>;
}
createRoot(document.getElementById("root")!).render(<Review/>);
