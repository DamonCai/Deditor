// Generated update fixture only. No network, document access, installation or persistence.
import React from 'react';
import { createRoot } from 'react-dom/client';
import UpdateDialog from '../src/components/UpdateDialog';
import ConfirmDialog from '../src/components/ConfirmDialog';
import { useEditorStore } from '../src/store/editor';
import '../src/styles.css';
const query = new URLSearchParams(location.search);
const language = query.has('en') ? 'en' : 'zh';
const theme = query.has('dark') ? 'dark' : 'light';
useEditorStore.setState({language, theme});
document.documentElement.classList.toggle('dark', theme === 'dark');
if (query.has('narrow')) document.documentElement.style.width = '720px';
const callbacks: Record<number, (value: unknown) => void> = {};
let callbackId = 0;
Object.defineProperty(window, '__TAURI_INTERNALS__', {configurable:true,value:{
  transformCallback: (callback: (value: unknown) => void) => { callbacks[++callbackId] = callback; return callbackId; },
  unregisterCallback: (id: number) => {delete callbacks[id];},
  invoke: async (command: string, args: any) => {
    if (command === 'check_for_updates') {
      if (query.has('error')) throw 'network';
      return {currentVersion:'1.0.3',builtAt:1792882800,platform:'macos',arch:'aarch64',version:query.has('same')?'1.0.3':'1.0.4',publishedAt:'2026-10-26T01:00:00Z',releaseUrl:'https://github.com/DamonCai/Deditor/releases',notes:'# Self-created release\nGenerated notes for layout review.\n<script>Text only</script>',status:query.has('same')?'same_version_unknown':'new_version',installerBuiltAt:null,installer:{id:1,name:query.has('same')?'DEditor_1.0.3_aarch64.dmg':'DEditor_1.0.4_aarch64.dmg',size:83000000,updatedAt:'2026-10-26T01:00:00Z',sha256:'ab'.repeat(32)}};
    }
    if (command === 'plugin:dialog|save') return `/generated/${args.options.defaultPath}`;
    if (command === 'download_update') {
      const channel=typeof args.onProgress==='string'?args.onProgress:args.onProgress.toJSON();
      const id=Number(channel.slice('__CHANNEL__:'.length));
      callbacks[id]?.({message:{downloaded:41500000,total:83000000},index:0});
      await new Promise(resolve=>setTimeout(resolve,1000));
      callbacks[id]?.({message:{downloaded:83000000,total:83000000},index:1});
      return;
    }
    if (command === 'plugin:opener|reveal_item_in_dir' || command === 'plugin:opener|open_url') return;
    throw new Error(`Review forbids native operation: ${command}`);
  },
}});
function Review() {
 const [open,setOpen]=React.useState(true);
 return <><button onClick={()=>setOpen(true)}>Open update fixture</button>{open&&<UpdateDialog onClose={()=>setOpen(false)}/>}<ConfirmDialog/></>;
}
createRoot(document.getElementById('root')!).render(<Review/>);
