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
const mac=process.env.DEDITOR_DAILY_PLATFORM==='mac';
if(mac)Object.defineProperty(navigator,'platform',{value:'MacIntel',configurable:true});
const commandModifier=mac?{metaKey:true}:{ctrlKey:true};
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
const runtimeErrors=[];window.addEventListener('error',event=>runtimeErrors.push(event.error));
const output=path.resolve('node_modules/.cache/deditor-markdown-daily-input.mjs');
fs.mkdirSync(path.dirname(output),{recursive:true});
const writes=[];let failed=false,persistedState='';
globalThis.mdInvoke=async(command,args)=>{
 if(command==='read_app_state')return persistedState;
 if(command==='write_app_state'){persistedState=args.content;return;}
 if(command==='write_text_file'){if(failed)throw new Error('generated disk failure');writes.push(args);}
 if(command==='read_text_file')return '';
};
const stubs={
 '@tauri-apps/api/core':'export const invoke=(...a)=>globalThis.mdInvoke(...a); export const convertFileSrc=p=>p;',
 '@tauri-apps/plugin-dialog':'export const save=async()=>"/generated/renamed.md"; export const open=async()=>null;',
 '@tauri-apps/plugin-opener':'export const openUrl=async()=>{}; export const openPath=async()=>{}; export const revealItemInDir=async()=>{};',
};
await build({stdin:{contents:`
export {default as Visual} from './src/components/MarkdownVisualEditor';
export {useEditorStore} from './src/store/editor';
export {markdownHistory} from './src/lib/markdownHistory';
export {saveFile} from './src/lib/fileio';
`,resolveDir:process.cwd()},outfile:output,bundle:true,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'isolated-io',setup(b){
 b.onResolve({filter:/.*/},a=>a.path.endsWith('.css')?{path:'css',namespace:'stub'}:stubs[a.path]?{path:a.path,namespace:'stub'}:a.path.endsWith('/feedback')?{path:'feedback',namespace:'stub'}:undefined);
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='css'?'':a.path==='feedback'?'export const showError=async()=>{};':stubs[a.path],loader:'js'}));
}}],logLevel:'silent'});
const app=await import(pathToFileURL(output));
const store=app.useEditorStore, root=createRoot(document.getElementById('root'));
const source='# Test\n\nOriginal paragraph\n\n+ [ ] todo\n\n[ref]: https://example.com\n';
store.setState({tabs:[{id:'a',filePath:'/generated/a.md',content:source,savedContent:source},{id:'b',filePath:'/generated/b.html',content:'<h1>HTML</h1>',savedContent:'<h1>HTML</h1>'}],activeId:'a',language:'en',markdownMode:'visual',autoSave:'off'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const render=async(readonly=false)=>{await act(async()=>{root.render(React.createElement(app.Visual,{tabId:'a',readonly,theme:'light'}));await pause(120);});};
const content=()=>store.getState().tabs.find(t=>t.id==='a').content;
let passed=0;
const testFilter=process.env.DEDITOR_TEST_FILTER ? new RegExp(process.env.DEDITOR_TEST_FILTER) : null;
const failures=[];async function test(name,fn){if(testFilter && !testFilter.test(name))return;try{await fn();passed++;console.log('PASS '+name);}catch(error){failures.push([name,error]);console.error('FAIL '+name+'\n'+error.stack);}}
const {Editor:MilkdownEditor,editorViewCtx,parserCtx}=await import('@milkdown/kit/core');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const make=MilkdownEditor.make;let view,context;
MilkdownEditor.make=function(...args){const editor=make.apply(this,args),create=editor.create;editor.create=async()=>{const result=await create();editor.action(ctx=>{view=ctx.get(editorViewCtx);context=ctx;});return result;};return editor;};
const reset=async(text)=>{await act(async()=>root.render(null));await act(async()=>store.getState().setContent(text,'a','command'));await render();await act(async()=>pause(60));assert.equal(view.editable,true);};
const select=async(text,offset=text.length)=>{let at;view.state.doc.descendants((node,pos)=>{if(node.isTextblock && node.textContent===text)at=pos+1+offset;});assert.notEqual(at,undefined,text);await act(async()=>{view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,at)));await pause(20);});};
const key=async(name,modifiers={})=>{let event;await act(async()=>{event=new dom.window.KeyboardEvent('keydown',{key:name,bubbles:true,cancelable:true,...modifiers});view.dom.dispatchEvent(event);await pause(30);});return event;};

// Synthetic browser editing path: dispatch keyboard/beforeinput/input events,
// perform only the default DOM text insertion missing from JSDOM, and let PM's
// real MutationObserver derive text/input-rule transactions. No list commands.
const type=async(text)=>{for(const character of text)await act(async()=>{
 const down=new dom.window.KeyboardEvent('keydown',{key:character,bubbles:true,cancelable:true});view.dom.dispatchEvent(down);
 if(down.defaultPrevented)return;
 const before=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:character});view.dom.dispatchEvent(before);
 if(before.defaultPrevented)return;
 const selection=window.getSelection(),range=selection.getRangeAt(0);range.deleteContents();
 const node=document.createTextNode(character);range.insertNode(node);selection.collapse(node,character.length);
 view.dom.dispatchEvent(new dom.window.InputEvent('input',{bubbles:true,inputType:'insertText',data:character}));
 await pause(40);
});};
const shape=(doc=view.state.doc)=>{const items=[];doc.descendants((node,pos)=>{if(node.type.name==='list_item')items.push({text:node.firstChild.textContent,depth:doc.resolve(pos+1).depth,checked:node.attrs.checked});});return items;};
const rootTypes=()=>Array.from({length:view.state.doc.childCount},(_,i)=>view.state.doc.child(i).type.name);
const saved=async()=>{await act(async()=>app.saveFile());assert.equal(writes.at(-1).content,content());};

const blur=async()=>act(async()=>{view.dom.blur();await pause(40);});
const semantics=()=>JSON.parse(JSON.stringify(view.state.doc.toJSON(),(key,value)=>['id','spread'].includes(key)?undefined:value));
const caret=(text,offset=text.length)=>{
 assert.equal(view.state.selection.empty,true);
 assert.equal(view.state.selection.$head.parent.textContent,text);
 assert.equal(view.state.selection.$head.parentOffset,offset);
 const selection=window.getSelection();assert.ok(selection.anchorNode && view.dom.contains(selection.anchorNode));
 assert.equal(view.posAtDOM(selection.anchorNode,selection.anchorOffset),view.state.selection.head,'DOM/model caret must agree');
};
const reopen=async()=>{await blur();const text=content(),before=semantics();await saved();await reset(text);await blur();assert.equal(content(),text);assert.deepEqual(semantics(),before);};
try {
 await test('D01 headings 1–6 entered consecutively return to ordinary paragraphs with correct caret',async()=>{
  await reset('');await select('',0);
  for(let level=1;level<=6;level++){
   await type('#'.repeat(level)+' Title'+level);caret('Title'+level);
   assert.equal(view.state.selection.$head.parent.type.name,'heading');assert.equal(view.state.selection.$head.parent.attrs.level,level);
   assert.equal(view.dom.querySelector('h'+level)?.textContent,'Title'+level);
   await key('Enter');assert.equal(view.state.selection.$head.parent.type.name,'paragraph');caret('',0);
   await type('Body'+level);caret('Body'+level);await key('Enter');
  }
  assert.deepEqual(rootTypes().filter(type=>type==='heading').length,6);await type('End');caret('End');await reopen();
 });
 await test('D02 quote→nested list→empty exits→fresh task preserves block and caret ownership',async()=>{
  await reset('');await select('',0);await type('> Quoted');caret('Quoted');assert.equal(rootTypes()[0],'blockquote');
  await key('Enter');await type('- First');caret('First');await key('Enter');await type('Second');caret('Second');
  assert.deepEqual(shape().map(item=>item.text),['First','Second']);
  await key('Enter');await key('Enter');assert.equal(view.state.selection.$head.node(-1).type.name,'blockquote');
  await key('Enter');assert.equal(view.state.selection.$head.depth,1);await type('- [ ] Fresh');caret('Fresh');
  assert.equal(shape().at(-1).checked,false);await key('Enter',{shiftKey:true});await type('continued');caret('Fresh\ncontinued');
  await key('Enter');await key('Enter');await type('After');caret('After');assert.equal(view.state.selection.$head.depth,1);await reopen();
 });
 await test('D03 all six inline formats followed by plain typing do not leak source markers or active marks',async()=>{
  await reset('');await select('',0);
  for(const [typed,tag,text] of [['**Bold**','strong','Bold'],['*Italic*','em','Italic'],['~~Gone~~','del','Gone'],['==Mark==','mark','Mark'],['~Sub~','sub','Sub'],['^Sup^','sup','Sup']]){
   await type(typed+' plain ');
   assert.ok([...view.dom.querySelectorAll(tag)].some(n=>n.textContent===text),typed+' must render');
   assert.ok(!view.state.selection.$head.marks().some(m=>['strong','emphasis','strike_through','deditor_mark','deditor_subscript','deditor_superscript'].includes(m.type.name)),typed+' plain suffix must be unmarked');
   assert.equal(view.state.selection.$head.parent.textContent.endsWith(' plain '),true);
  }
  assert.equal(view.dom.textContent,'Bold plain Italic plain Gone plain Mark plain Sub plain Sup plain ');await type('End');await reopen();
 });
 await test('D04 completed format→Enter→task→Backspace marker→heading continues in the expected block',async()=>{
  await reset('');await select('',0);await type('**First**');await key('Enter');caret('',0);
  await type('- [x] Done');caret('Done');await key('Enter');await type('Next');caret('Next');assert.equal(shape().at(-1).checked,false);
  await select('Next',0);await key('Backspace');caret('Next',0);assert.equal(view.state.selection.$head.depth,1);
  await type('### ');assert.equal(view.state.selection.$head.parent.type.name,'heading');assert.equal(view.state.selection.$head.parent.attrs.level,3);caret('Next',0);
  await type('New ');caret('New Next',4);await reopen();
 });
 await test('D05 highlight with nested emphasis and adjacent sub/sup formulas retain semantics',async()=>{
  await reset('');await select('',0);await type('==**Bold**== H~2~O x^2^ tail');
  await blur();assert.ok(view.dom.querySelector('mark strong, strong mark'),'nested bold highlight displays');assert.equal(view.dom.textContent,'Bold H2O x2 tail');
  assert.equal(view.dom.querySelector('sub')?.textContent,'2');assert.equal(view.dom.querySelector('sup')?.textContent,'2');await reopen();
 });
 await test('D06 undo typed peer then continue a replacement without restoring abandoned text',async()=>{
  await reset('- One\n');await select('One');await key('Enter');const emptyPeer=content();await type('Second');caret('Second');
  await key('z',{...commandModifier});assert.equal(content(),emptyPeer);caret('',0);
  await type('Replacement');caret('Replacement');assert.deepEqual(shape().map(i=>i.text),['One','Replacement']);
  await key('z',{...commandModifier});assert.equal(content(),emptyPeer);await key('z',{...commandModifier,shiftKey:true});caret('Replacement');
  await type('!');caret('Replacement!');assert.ok(!content().includes('Second'));await reopen();
 });
 await test('D07 ModB and ModI toggle formatting off while inline source is active',async()=>{
  await reset('');await select('',0);await key('b',{...commandModifier});await type('bold');
  await key('b',{...commandModifier});await type(' normal ');await key('i',{...commandModifier});await type('italic');await key('i',{...commandModifier});await type(' tail');
  await blur();assert.equal(content(),'**bold** normal *italic* tail');
  assert.equal(view.dom.querySelector('strong')?.textContent,'bold');assert.equal(view.dom.querySelector('em')?.textContent,'italic');await reopen();
 });
 await test('D08 repeated bold italic and strike toggles each end before ordinary text',async()=>{
  for(const [name,mods,tag] of [['b',{},'strong'],['i',{},'em'],['x',{altKey:true},'del']]){
   await reset('');await select('',0);const mod={...commandModifier,...mods};
   await key(name,mod);await type('first');await key(name,mod);await type(' plain ');
   await key(name,mod);await type('second');await key(name,mod);await type(' end');await blur();
   assert.deepEqual([...view.dom.querySelectorAll(tag)].map(n=>n.textContent),['first','second'],name);
   assert.equal(view.dom.textContent,'first plain second end');await reopen();
  }
 });
 await test('D09 formatting inside existing inline source preserves caret and selected text boundaries',async()=>{
  await reset('**alphabeta**\n');await select('alphabeta',5);assert.equal(view.state.selection.$head.parent.type.name,'deditor_inline_source');
  await key('b',{...commandModifier});await type('X');await blur();
  assert.equal(view.dom.textContent,'alphaXbeta');assert.deepEqual([...view.dom.querySelectorAll('strong')].map(n=>n.textContent),['alpha','beta']);await reopen();
  for(const reverse of [false,true]){
   await reset('**alphabet**\n');await select('alphabet',3);const start=view.state.selection.$head.start(),a=start+4,b=start+7;
   await act(async()=>view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,reverse?b:a,reverse?a:b))));
   await key('b',{...commandModifier});assert.equal(view.state.doc.textBetween(view.state.selection.from,view.state.selection.to),'pha');
   assert.equal(view.state.selection.anchor>view.state.selection.head,reverse,'shortcut preserves selection direction');
   await type('NEW');await blur();assert.equal(view.dom.textContent,'alNEWbet');assert.deepEqual([...view.dom.querySelectorAll('strong')].map(n=>n.textContent),['al','bet']);await reopen();
  }
 });
 await test('D10 readonly and active composition do not apply mark shortcuts to a source projection',async()=>{
  await reset('**alpha**\n');await select('alpha',2);await render(true);const readonlySource=content();
  for(const [name,mods] of [['b',{}],['i',{}],['x',{altKey:true}]])await key(name,{...commandModifier,...mods});
  assert.equal(content(),readonlySource);assert.equal(view.dom.querySelector('strong')?.textContent,'alpha');
  await render(false);await select('alpha',2);await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true})));
  const before=content(),selection=view.state.selection;
  for(const name of ['b','i'])await key(name,{...commandModifier,isComposing:true,keyCode:229});
  assert.equal(content(),before);assert.ok(view.state.selection.eq(selection));
  await act(async()=>view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true})));await blur();await reopen();
 });
 await test('D11 undo redo after format toggle restores plain-tail caret for continued typing',async()=>{
  await reset('');await select('',0);await key('b',{...commandModifier});await type('bold');await key('b',{...commandModifier});
  const bold=content();await type(' plain');await key('z',{...commandModifier});assert.equal(content(),bold);
  await key('z',{...commandModifier,shiftKey:true});await type(' again');await blur();
  assert.equal(view.dom.textContent,'bold plain again');assert.equal(view.dom.querySelector('strong')?.textContent,'bold');await reopen();
 });
 assert.deepEqual(runtimeErrors,[]);if(failures.length)throw new Error(`${failures.length} failed groups: ${failures.map(([name])=>name).join('; ')}`);
 console.log(`${passed} daily input workflow groups passed (DOM input/keydown, not native IME)`);
} finally {MilkdownEditor.make=make;await act(async()=>root.render(null));dom.window.close();fs.rmSync(output,{force:true});}
