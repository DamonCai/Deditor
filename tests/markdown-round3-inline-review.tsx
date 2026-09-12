import React from 'react';
import {createRoot} from 'react-dom/client';
import {Editor as MilkdownEditor, editorViewCtx} from '@milkdown/kit/core';
import type {Ctx} from '@milkdown/kit/ctx';
import {linkTooltipAPI} from '@milkdown/kit/component/link-tooltip';
import Visual from '../src/components/MarkdownVisualEditor';
import Toolbar from '../src/components/MarkdownToolbar';
import {useEditorStore} from '../src/store/editor';
import {markdownHistory} from '../src/lib/markdownHistory';
import '../src/styles.css';
let currentCtx: Ctx | null = null;
const originalMake = MilkdownEditor.make;
const fixtureMake: typeof MilkdownEditor.make = () => {
  const editor = originalMake(), create = editor.create;
  Object.defineProperty(editor, 'create', {configurable:true, value:async () => {
    const result = await create.call(editor);
    editor.action(ctx => { currentCtx = ctx; });
    return result;
  }});
  return editor;
};
MilkdownEditor.make = fixtureMake;
function editCurrentLink(): string {
  if (!currentCtx) return 'Editor is still loading.';
  const view = currentCtx.get(editorViewCtx);
  if (view.isDestroyed || !view.dom.isConnected) return 'Wait for the current editor to finish loading.';
  if (view.dom.querySelector('[data-md-inline-source]')) return 'Press Escape in the editor to close inline source, then use this test button.';
  const links: {from:number;to:number;mark:import('@milkdown/kit/prose/model').Mark}[] = [];
  view.state.doc.descendants((node, pos) => {
    const mark = node.isText ? node.marks.find(mark => mark.type.name === 'link') : undefined;
    if (mark) links.push({from:pos,to:pos+node.nodeSize,mark});
  });
  const head = view.state.selection.head;
  const target = links.find(link => link.from <= head && head <= link.to) ?? links.sort((a,b) => Math.min(Math.abs(a.from-head),Math.abs(a.to-head))-Math.min(Math.abs(b.from-head),Math.abs(b.to-head)))[0];
  if (!target) return 'Create a link with the real toolbar first.';
  currentCtx.get(linkTooltipAPI.key).editLink(target.mark,target.from,target.to);
  return 'Test API opened the actual link popup; hover activation is not covered.';
}
const samples={empty:'Start  end.\n\nTail untouched.\n',first:'word after.\n\nTail untouched.\n',last:'Before word\n\nTail untouched.\n',adjacent:'Before boldcode after.\n\nTail untouched.\n',replace:'Before word after.\n\nTail untouched.\n',link:'Before label after.\n\nTail untouched.\n'};
let serial=0;
function reset(name:keyof typeof samples){const id='round3-inline-'+ ++serial,content=samples[name];useEditorStore.setState({tabs:[{id,filePath:'/generated/'+id+'.md',content,savedContent:content}],activeId:id,markdownMode:'visual',theme:'light',language:'en',autoSave:'off'});}
reset('empty');
function Review(){const tab=useEditorStore(s=>s.tabs.find(t=>t.id===s.activeId));const [saved,setSaved]=React.useState('');const [notice,setNotice]=React.useState('');return <div style={{height:'100vh',display:'flex',flexDirection:'column'}}><div><b>Round 3 inline — self-created documents</b>{' '}{Object.keys(samples).map(name=><button key={name} onClick={()=>reset(name as keyof typeof samples)}>{name}</button>)}<button onMouseDown={event=>event.preventDefault()} onClick={()=>setNotice(editCurrentLink())}>测试：编辑当前链接</button><span role="status">{notice}</span><button onClick={()=>markdownHistory()}>Undo</button><button onClick={()=>markdownHistory(true)}>Redo</button><button onClick={()=>setSaved(tab?.content??'')}>Save snapshot</button></div><Toolbar/>{tab&&<Visual key={tab.id} tabId={tab.id} theme="light"/>}<pre data-testid="source" style={{maxHeight:160,overflow:'auto'}}>{tab?.content}</pre><pre data-testid="saved">{saved}</pre></div>};
const root=createRoot(document.getElementById('root')!);root.render(<Review/>);if(import.meta.hot)import.meta.hot.dispose(()=>{root.unmount();if(MilkdownEditor.make===fixtureMake)MilkdownEditor.make=originalMake;currentCtx=null;});
