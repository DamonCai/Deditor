// Generated documents and simulated disk search only; no application data or user files.
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import FindInFiles from "../src/components/FindInFiles";
import MarkdownVisualSlot from "../src/components/MarkdownVisualSlot";
import EditorSlot from "../src/components/EditorSlot";
import { useEditorStore } from "../src/store/editor";
import { Button } from "../src/components/ui/Button";
import "../src/styles.css";
const params = new URLSearchParams(location.search), dark = params.has("dark"), en = params.has("en");
const path = "/generated/search-navigation.md";
const code = params.has("long-code") ? '```js\n' + Array.from({length:60},(_,i)=>`const line${i} = "${i===44?'定位目标':'generated'}";`).join('\n') + '\n```' : '```js\nconst value = "定位目标";\n```';
const original = Array.from({length:160},(_,i)=>i===79 && params.has("code") ? code : i===79 ? `段落 ${i+1}：😀 prefix **定位目标** suffix` : `段落 ${i+1}：自建长文档，测试搜索后的滚动位置。`).join("\n\n") + "\n";
Object.defineProperty(window, "__TAURI_INTERNALS__", {configurable:true,value:{convertFileSrc:(path:string)=>path,invoke:async(command:string,args:any)=>{
 if(command==="find_in_files") {const needle=args.caseSensitive?args.query:args.query.toLowerCase();return {hits:original.split("\n").flatMap((text,index)=>{const col=(args.caseSensitive?text:text.toLowerCase()).indexOf(needle);return col<0?[]:[{path,line:index+1,col:col+1,text}];}),truncated:false,files_scanned:1};}
}}});
useEditorStore.setState({tabs:[{id:"search-review",filePath:path,content:original,savedContent:original}],activeId:"search-review",workspaces:["/generated"],language:en?"en":"zh",theme:dark?"dark":"light",markdownMode:params.has("source")?"source":"visual",autoSave:"off"});
document.documentElement.classList.toggle("dark",dark);
function Review(){
 const [open,setOpen]=useState(false);
 const mode=useEditorStore(s=>s.markdownMode), content=useEditorStore(s=>s.tabs[0]?.content);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.shiftKey&&e.key.toLowerCase()==="f"){e.preventDefault();setOpen(true);}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key);},[]);
 return <div style={{height:"100vh",display:"flex",flexDirection:"column"}}><div style={{display:"flex",gap:12,padding:8}}><Button onClick={()=>setOpen(true)}>搜索 / Search</Button><Button onClick={()=>useEditorStore.setState({markdownMode:mode==="visual"?"source":"visual"})}>切换模式 / Mode</Button><span role="status">{mode} · {content===original?"原文一致":"已修改"}</span></div><div style={{flex:1,minHeight:0,position:"relative",display:"flex"}}>{mode==="visual"?<MarkdownVisualSlot tabId="search-review" active theme={dark?"dark":"light"}/>:<EditorSlot tabId="search-review" active theme={dark?"dark":"light"} fontSize={14}/>}</div><FindInFiles open={open} onClose={()=>setOpen(false)}/></div>;
}
createRoot(document.getElementById("root")!).render(<Review/>);
