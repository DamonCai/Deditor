// Reuse the real review interface; history records are self-created mock IO.
import './markdown-visual-review';
const entries=[{id:'current-version',path:'/generated/visual-review.md',timestamp:1000,draft:false,bytes:30},{id:'other-draft',path:'/generated/other.md',timestamp:2000,draft:true,bytes:30}];
const fixture='# Restored self-created version\n\nA distinct checkpoint.\n';
const original=(window as unknown as {__TAURI_INTERNALS__: Record<string,unknown>}).__TAURI_INTERNALS__;
Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{...original,invoke:async(command:string,args:Record<string,unknown>)=>{
 if(command==='list_markdown_history'){
  if(args.path===null&&new URLSearchParams(location.search).has('history-failure'))throw new Error('Self-created draft read failure');
  return args.path===null?[entries[1]]:[entries[0]];
 }
 if(command==='read_markdown_history')return args.id==='other-draft'?'# Separate draft\n':fixture;
 throw new Error(`Session audit does not allow ${command}`);
}}});
