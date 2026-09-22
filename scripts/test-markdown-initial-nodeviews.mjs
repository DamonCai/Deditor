import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><body><div id="root"></div></body>',{url:'http://localhost',pretendToBeVisual:true});
for(const key of ['window','document','Node','HTMLElement','Element','MutationObserver','DOMParser','Text','CustomEvent','Event'])globalThis[key]=dom.window[key];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
for(const key of ['getComputedStyle','addEventListener','removeEventListener','dispatchEvent','requestAnimationFrame','cancelAnimationFrame'])globalThis[key]=dom.window[key].bind(dom.window);
const {Editor,rootCtx,defaultValueCtx,editorViewCtx}=await import('@milkdown/kit/core');
const {commonmark,paragraphSchema}=await import('@milkdown/kit/preset/commonmark');
const {$viewAsync}=await import('@milkdown/kit/utils');
const {TextSelection}=await import('@milkdown/kit/prose/state');
const built=await build({entryPoints:['src/lib/markdownVisual/initialNodeViews.ts'],bundle:true,write:false,platform:'node',format:'esm',packages:'external'});
// Use a file URL so bundled external Milkdown imports resolve exactly as the app.
const fs=await import('node:fs/promises'),path=await import('node:path'),url=await import('node:url');
const out=path.resolve('node_modules/.cache/deditor-initial-nodeviews.mjs');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,built.outputFiles[0].text);
const {initialNodeViews}=await import(url.pathToFileURL(out));
let release;const gate=new Promise(resolve=>release=resolve);
let registered=false,created=0,wrapped=0,destroyed=0,builtFactories=0;
const deferred=$viewAsync(paragraphSchema.node,async()=>{
 registered=true;await gate;
 return (node)=>{created++;const element=document.createElement('p');return {dom:element,contentDOM:element,update(next){return next.type===node.type;},destroy(){destroyed++;}};};
});
const final=initialNodeViews(originals=>{
 builtFactories++;assert.equal(typeof originals.paragraph,'function','async feature registered before override');
 const original=originals.paragraph;
 return {...originals,paragraph:(...args)=>{wrapped++;const result=original(...args);result.dom.dataset.finalView='true';return result;}};
});
const editor=Editor.make().config(ctx=>{ctx.set(rootCtx,document.getElementById('root'));ctx.set(defaultValueCtx,'First paragraph\n\nSecond paragraph\n');}).use(commonmark).use(deferred).use(final);
try{
 const creating=editor.create();
 while(!registered)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created,0);assert.equal(builtFactories,0,'final setup waits for async view feature');
 release();await creating;
 assert.equal(builtFactories,1);assert.equal(created,2);assert.equal(wrapped,2);assert.equal(document.querySelectorAll('[data-final-view]').length,2);
 editor.action(ctx=>{const view=ctx.get(editorViewCtx),factory=view.props.nodeViews.paragraph;
  view.setProps({handleScrollToSelection:()=>true});
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,2)));
  view.dispatch(view.state.tr.insertText('X'));
  assert.equal(view.props.nodeViews.paragraph,factory);assert.equal(view.state.doc.firstChild.textContent,'FXirst paragraph');
 });
 assert.equal(created,2,'ordinary setup/selection/edit preserves initial node views');
 console.log('PASS delayed factory is installed before first render; follow-up props and edits retain both node views');
 await editor.destroy();assert.equal(destroyed,2,'each view destroyed exactly once');
 console.log('PASS initial node view lifecycle releases all views');
}finally{if(editor.status==='Created')await editor.destroy();dom.window.close();}
