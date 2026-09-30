import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><body><div id="root"></div></body>', { url:'http://localhost', pretendToBeVisual:true });
for (const key of ['window','Window','document','Node','NodeFilter','HTMLElement','HTMLInputElement','HTMLButtonElement','HTMLDivElement','Element','Text','SVGElement','MutationObserver','DOMParser','DOMRect','Event','CustomEvent','localStorage']) Object.defineProperty(globalThis,key,{value:dom.window[key],configurable:true});
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
for (const key of ['addEventListener','removeEventListener','dispatchEvent','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) globalThis[key]=dom.window[key].bind(dom.window);
globalThis.ResizeObserver=class{observe(){} unobserve(){} disconnect(){}};
globalThis.IntersectionObserver=class{observe(){} unobserve(){} disconnect(){}};
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
window.Range.prototype.getClientRects=()=>[];
window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
HTMLElement.prototype.scrollIntoView=function(){};
HTMLElement.prototype.scrollTo=function({top=0}){this.scrollTop=top;};
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
// React DOM must detect the installed DOM before choosing its input event implementation.
const {createRoot}=await import('react-dom/client');
const {flushSync}=await import('react-dom');
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-colors.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[], reads=[], externalLinks=[];globalThis.mdOpenUrl=async href=>externalLinks.push(href);let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file'){reads.push(args.path);return '# Local destination\n';}
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=(href)=>globalThis.mdOpenUrl(href); export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Toolbar} from './src/components/MarkdownToolbar';
export {renderMarkdown} from './src/lib/markdown';
export {markdownDisplayHtml} from './src/lib/markdownDisplay';
export {default as Preview} from './src/components/Preview';
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {getVisualEditor} from './src/lib/markdownVisualBridge';
export {markdownHistory} from './src/lib/markdownHistory';
export {setBlockBackground,setActiveView} from './src/lib/editorBridge';
export {blockBackgroundEdits} from './src/lib/markdownVisual/backgroundSource';
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>(/\.css(?:\?raw)?$/.test(a.path))?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'export default "";':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(React.Fragment,null,React.createElement(app.Toolbar),React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'})));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
async function test(name,fn){if(testFilter && !testFilter.test(name))return;await fn();passed++;console.log('PASS '+name);}
const {Editor:MilkdownEditor,editorViewCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent.replace(/\n$/, '')===text)at=pos+1+offset;});assert.notEqual(at,undefined,JSON.stringify({text,doc:view.state.doc.toJSON()}));await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};
const exactHistory=async(original)=>{const edited=content();await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,edited);await act(async()=>app.markdownHistory());assert.equal(content(),original);await act(async()=>app.markdownHistory(true));assert.equal(content(),edited);await act(async()=>root.render(null));await render();assert.equal(content(),edited);};

const range=async(text,start,end)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent.replace(/\n$/, '')===text)at=pos+1;});assert.notEqual(at,undefined,JSON.stringify({text,doc:view.state.doc.toJSON()}));await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at+start,at+end)));await pause(20);});};
const run=async(fn)=>act(async()=>{fn();await pause(40);});
const button=label=>{const item=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')===label || b.getAttribute('aria-label')?.startsWith(label+' ('));assert.ok(item,label);return item;};
const {CellSelection}=await import('@milkdown/kit/prose/tables');
const {DOMParser:ProseDOMParser}=await import('@milkdown/kit/prose/model');
const pick=async(index,color)=>{await run(()=>document.querySelectorAll('.md-color-trigger')[index].click());assert.ok(document.querySelector('.md-color-popover'),'picker opens');await run(()=>document.querySelector(`.md-color-popover button[aria-label="${color}"]`).click());assert.equal(document.querySelector('.md-color-popover'),null);};
const shade=()=>pick(2,'#FFF2CC');
const shaded=()=>[...document.querySelectorAll('.ProseMirror [data-deditor-background]')];
const preview=async()=>{const el=document.createElement('div');el.innerHTML=await app.renderMarkdown(content(), { theme: "light" });return el;};
try {
await test('C01 all three color tools compose, replace, save, undo and reopen',async()=>{
 const original='Before\n\nalpha **bold** [link](https://example.com) omega\n\nAfter\n';
 await reset(original);await range('alpha bold link omega',0,5);await pick(0,'#C00000');await exactHistory(original);
 const text=content();await range('alpha bold link omega',0,5);await pick(1,'#FFFF00');await exactHistory(text);
 const highlighted=content();await select('alpha bold link omega',2);await shade();await exactHistory(highlighted);
 assert.equal(shaded().length,1);assert.equal(shaded()[0].tagName,'P');assert.equal(shaded()[0].textContent,'alpha bold link omega');
 assert.equal(shaded()[0].querySelector('span[style*="background"]').style.background,'rgb(255, 255, 0)');
 assert.equal(shaded()[0].querySelector('span[style*="color"]').style.color,'rgb(192, 0, 0)');
 assert.equal((await preview()).querySelector('p[style*="background-color"]').textContent,'alpha bold link omega');
 const old=content();await select('alpha bold link omega');await pick(2,'#D9E2F3');assert.equal((content().match(/data-deditor-background/g)||[]).length,1);await exactHistory(old);
 await select('alpha bold link omega');const colored=content();await run(()=>button('Background color').click());await run(()=>[...document.querySelectorAll('button')].find(n=>n.textContent==='No background color').click());assert.equal(shaded().length,0);assert.match(content(),/background:#FFFF00/);await exactHistory(colored);
});
await test('C02 paragraphs, headings, quotes, lists, task lists and terminal breaks',async()=>{
 for(const original of ['target\n','## target\n','> target\n','* target\n','* [ ] target\n','* [ ] <!-- deditor-task-indent:2 --> target\n','> [!TIP]\n> target\n','1. target\n','target<br>\n']){
  await reset(original);await select('target');await shade();assert.equal(shaded().length,1,original);await exactHistory(original);assert.equal(shaded().length,1,original+' reopen');assert.equal(view.state.doc.textContent.replace(/\n$/, ''),'target');assert.ok((await preview()).querySelector('[style*="background-color"]'),original+' preview '+content()+' '+(await preview()).innerHTML);
 }
});
await test('C03 table body/header/empty cell and existing indent/alignment/list metadata',async()=>{
 for(const [original,label] of [
  ['| A | B |\n| --- | --- |\n| target | other |\n','target'],
  ['| target | B |\n| --- | --- |\n| a | other |\n','target'],
  ['| A | B |\n| --- | --- |\n| | other |\n',''],
  ['| <!-- deditor:table-indent=2 --><!-- deditor:valign=middle -->target | B |\n| --- | --- |\n| a | other |\n','target'],
  ['| A | B |\n| --- | --- |\n| - target<br>- next | other |\n','target'],
 ]){
  await reset(original);await select(label);await shade();assert.equal(shaded().length,1);assert.ok(['TH','TD'].includes(shaded()[0].tagName));await exactHistory(original);assert.equal(shaded().length,1);assert.ok(['TH','TD'].includes(shaded()[0].tagName));
  assert.ok((await preview()).querySelector('td[style*="background-color"],th[style*="background-color"]'));
  if(!label){await select('');await run(()=>view.dispatch(view.state.tr.insertText('typed')));assert.equal(shaded()[0].textContent,'typed');assert.equal(document.querySelectorAll('.ProseMirror td')[1].textContent,'other');}
 }
});
await test('C04 multi-cell selection excludes unselected cells and survives clipboard HTML',async()=>{
 const original='| A | B | C |\n| --- | --- | --- |\n| one | two | three |\n| four | five | six |\n';await reset(original);
 const cells=[];view.state.doc.descendants((n,p)=>{if(n.type.name==='table_cell')cells.push(p);});
 await run(()=>view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc,cells[0],cells[4]))));await shade();assert.equal(shaded().length,4);assert.ok(view.state.selection instanceof CellSelection);
 assert.deepEqual(shaded().map(n=>n.textContent),['one','two','four','five']);
 const payload=app.getVisualEditor().clipboard();const el=document.createElement('div');el.innerHTML=payload.html;const pasted=ProseDOMParser.fromSchema(view.state.schema).parse(el);let count=0;pasted.descendants(n=>{if(n.attrs.background==='#FFF2CC')count++;});assert.equal(count,4);
 await exactHistory(original);assert.equal(shaded().length,4);
});
await test('C05 empty paragraph, cross-paragraph reverse selection and continued input',async()=>{
 await reset('');await shade();assert.equal(shaded().length,1);await exactHistory('');assert.equal(shaded().length,1);await run(()=>view.dispatch(view.state.tr.insertText('typed')));assert.equal(shaded()[0].textContent,'typed');
 const original='first\n\nsecond\n\nthird\n';await reset(original);let a,b;view.state.doc.descendants((n,p)=>{if(n.textContent==='first')a=p+2;if(n.textContent==='second')b=p+3;});await run(()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,b,a))));await shade();assert.deepEqual(shaded().map(n=>n.textContent),['first','second']);await exactHistory(original);
});
await test('C06 source mode targets and metadata replacement across CRLF, lists, headings, tables',async()=>{
 for(const original of ['# target\r\n\r\nnext\r\n','> target\n','- [ ] target\n','- [ ] <!-- deditor-task-indent:2 --> target\n','> [!TIP]\n> target\n','| A | B |\n| --- | --- |\n| target | other |\n','| <!-- deditor:table-indent=2 --><!-- deditor:valign=middle -->target | B |\n| --- | --- |\n']){
  const at=original.indexOf('target')+2;
  const changes=app.blockBackgroundEdits(original,at,at,'#FFF2CC');assert.equal(changes.length,1);
  const edit=changes[0],next=original.slice(0,edit.from)+edit.insert+original.slice(edit.to);
  await reset(next);assert.equal(shaded().length,1,original);assert.ok((await preview()).querySelector('[style*="background-color"]'));
  const caret=next.indexOf('target')+2;const same=app.blockBackgroundEdits(next,caret,caret,'#FFF2CC');assert.equal(same.length,0);
  const clear=app.blockBackgroundEdits(next,caret,caret,null)[0];assert.equal(next.slice(0,clear.from)+clear.insert+next.slice(clear.to),original);
 }
 assert.deepEqual(app.blockBackgroundEdits('```\ncode\n```\n',5,5,'#FFF2CC'),[]);
});
await test('C07 all three picker cancellation, stale target, read-only and invalid custom color',async()=>{
 for(let i=0;i<3;i++){
  await reset('target\n');await range('target',0,6);await run(()=>document.querySelectorAll('.md-color-trigger')[i].click());await run(()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(content(),'target\n');assert.equal(document.activeElement,document.querySelectorAll('.md-color-trigger')[i]);
  await run(()=>document.querySelectorAll('.md-color-trigger')[i].click());
  await run(()=>{const input=document.querySelector('.md-hex-input');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'badHEX');input.dispatchEvent(new window.Event('input',{bubbles:true}));});assert.equal(document.querySelector('.md-color-custom button').disabled,true);assert.ok(document.querySelector('.md-color-error'));
  await run(()=>store.setState({activeId:'b'}));assert.equal(document.querySelector('.md-color-popover'),null);assert.equal(content(),'target\n');await run(()=>store.setState({activeId:'a'}));
  await run(()=>document.querySelectorAll('.md-color-trigger')[i].click());await run(()=>store.getState().setContent('changed\n','a','command'));await run(()=>document.querySelector('.md-color-swatch').click());assert.equal(content(),'changed\n');assert.ok(document.querySelector('[role=alert]'));
 }
 await reset('target\n');await act(async()=>root.render(null));await render(true);assert.ok([...document.querySelectorAll('.md-color-trigger')].every(n=>n.disabled));
});
await test('C08 actual CodeMirror toolbar in source/split, selection and isolated undo',async()=>{
 const {EditorView}=await import('@codemirror/view'),{EditorState}=await import('@codemirror/state'),{history,undo,redo}=await import('@codemirror/commands');
 await act(async()=>root.render(null));
 for(const mode of ['source','split']){
  const original='target text\n\nuntouched\n';const parent=document.createElement('div');document.body.append(parent);
  await run(()=>store.setState(s=>({activeId:'a',markdownMode:mode,tabs:s.tabs.map(t=>t.id==='a'?{...t,content:original}:t)})));
  const cm=new EditorView({parent,state:EditorState.create({doc:original,selection:{anchor:0,head:6},extensions:[history(),EditorView.updateListener.of(u=>{if(u.docChanged)store.setState(s=>({tabs:s.tabs.map(t=>t.id==='a'?{...t,content:u.state.doc.toString()}:t)}));if(u.selectionSet||u.docChanged)app.setActiveView(u.view,'a');})]})});
  try{
   await run(()=>{app.setActiveView(cm,'a');root.render(React.createElement(app.Toolbar));});
   for(const [i,color] of [[0,'#C00000'],[1,'#FFFF00'],[2,'#FFF2CC']]){
    const before=cm.state.doc.toString();const at=before.indexOf('target');await run(()=>cm.dispatch({selection:{anchor:at,head:at+6}}));await pick(i,color);const after=cm.state.doc.toString();assert.notEqual(after,before);
    await run(()=>undo(cm));assert.equal(cm.state.doc.toString(),before);await run(()=>redo(cm));assert.equal(cm.state.doc.toString(),after);
    if(i===2)assert.equal(cm.state.sliceDoc(cm.state.selection.main.from,cm.state.selection.main.to),'target');
   }
   const snapshot=cm.state.doc.toString();assert.equal((snapshot.match(/data-deditor-background/g)||[]).length,1);assert.ok(snapshot.endsWith('untouched\n'));
  }finally{await run(()=>{app.setActiveView(null);root.render(null);});cm.destroy();parent.remove();}
 }
 await run(()=>store.setState({markdownMode:'visual'}));
});
await test('C09 preview HTML and default text contrast preserve independent explicit colors',async()=>{
 for(const [color,expected] of [['#FFF2CC','rgb(0, 0, 0)'],['#222222','rgb(255, 255, 255)']]){
  const source=`<span data-deditor-background="${color}"></span><span style="color:#C00000"><span style="background:#FFFF00">target</span></span> plain\n\n| A | B |\n| --- | --- |\n| <span data-deditor-background="${color}"></span>cell | other |\n`;
  await reset(source);assert.equal(shaded().length,2);assert.ok(shaded().every(el=>el.style.color===expected));
  assert.equal(shaded()[0].querySelector('span[style*=color]').style.color,'rgb(192, 0, 0)');
  const html=await preview();const parsed=ProseDOMParser.fromSchema(view.state.schema).parse(html);let colors=[];parsed.descendants(n=>{if(n.attrs.background)colors.push(n.attrs.background);});assert.deepEqual(colors,[color,color]);
  assert.equal(shaded()[0].querySelector('span[style*=background]').style.background,'rgb(255, 255, 0)');
 }
});
await test('C10 caret text and highlight colors remain active when shading a block',async()=>{
 await reset('');await pick(0,'#C00000');await pick(1,'#FFFF00');await shade();const before=content();
 await run(()=>view.dispatch(view.state.tr.insertText('typed')));
 assert.equal(shaded()[0].textContent,'typed');assert.equal(shaded()[0].querySelector('span[style*=color]').style.color,'rgb(192, 0, 0)');assert.equal(shaded()[0].querySelector('span[style*=background]').style.background,'rgb(255, 255, 0)');await exactHistory(before);
});
await test('C11 shaded formatted cell Enter stays in its cell; clearing preserves cell text',async()=>{
 for(const raw of ['**中文指标**','[中文指标](https://example.com)','<span style="color:#C00000">中文指标</span>']){
  const original=`| A | B |\n| --- | --- |\n| <span data-deditor-background="#FFF2CC"></span>${raw} | other |\n`;await reset(original);await select('中文指标');
  await run(()=>{const at=view.state.selection.$head;if(at.parent.type.name==='deditor_inline_source')view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at.end())));});await key('Enter');
  assert.equal(document.querySelectorAll('.ProseMirror td')[1].textContent,'other');assert.equal(shaded()[0].tagName,'TD');assert.ok(shaded()[0].querySelector('br'));await exactHistory(original);
  await select('中文指标');const before=content();await run(()=>button('Background color').click());await run(()=>[...document.querySelectorAll('button')].find(n=>n.textContent==='No background color').click());assert.equal(shaded().length,0);assert.match(content(),/other/);await exactHistory(before);
 }
});
} finally {await act(async()=>root.unmount());}
assert.deepEqual(runtimeErrors,[]);console.log(`Passed ${passed} color regression groups`);
