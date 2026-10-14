import { shorthandRemark, highlightRemark, shorthandMarks, emojiSchema, shorthandInputRules, configureShorthand } from "../src/lib/markdownVisual/shorthand";
import { strikethroughInputRule } from "@milkdown/kit/preset/gfm";
import { editableBlockquote, footnoteReference, footnoteDefinition, footnoteUpdates } from "../src/lib/markdownVisual/structuredBlocks";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { url: "http://localhost", pretendToBeVisual: true });
for (const name of ["window", "document", "Node", "HTMLElement", "Element", "MutationObserver", "DOMParser", "DOMRect", "Text", "SVGElement", "HTMLInputElement", "HTMLDivElement", "HTMLButtonElement", "CustomEvent", "Event"] as const) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.assign(globalThis, { getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} } });
Object.assign(globalThis, { addEventListener: dom.window.addEventListener.bind(dom.window), removeEventListener: dom.window.removeEventListener.bind(dom.window), dispatchEvent: dom.window.dispatchEvent.bind(dom.window) });
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}} as unknown as MediaQueryList);
window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
window.Range.prototype.getBoundingClientRect=()=>new DOMRect();
Object.defineProperty(globalThis, "localStorage", {value:dom.window.localStorage,configurable:true});
const { CrepeBuilder } = await import("@milkdown/crepe/builder");
const { codeMirror } = await import("@milkdown/crepe/feature/code-mirror");
const { imageBlock } = await import("@milkdown/crepe/feature/image-block");
const { absoluteHeadingInputRule } = await import("../src/lib/markdownVisual/heading");
const { faithfulLink } = await import("../src/lib/markdownVisual/references");
const { faithfulImage } = await import("../src/lib/markdownVisual/image");
const { latex } = await import("@milkdown/crepe/feature/latex");
const { parserCtx, serializerCtx, editorViewCtx } = await import("@milkdown/kit/core");
const { remarkInlineLinkPlugin, remarkPreserveEmptyLinePlugin, wrapInHeadingInputRule } = await import("@milkdown/kit/preset/commonmark");
const { extendedTableCells } = await import("../src/lib/markdownVisual/tableLists");
const { inlineSchemas, faithfulInlineHtml, configureInlineSerialization } = await import("../src/lib/markdownVisual/inline");
const { rawSchema, rawRemark, frontmatter } = await import("../src/lib/markdownVisual/raw");
const { MarkdownDocument } = await import("../src/lib/markdownVisual/document");
const { EditorState, TextSelection } = await import("@milkdown/kit/prose/state");
const { history } = await import("@milkdown/kit/plugin/history");
const { trailing } = await import("@milkdown/kit/plugin/trailing");
const { inlineSourceSchema, installInlineSource } = await import("../src/lib/markdownVisual/inlineSource");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(inlineSourceSchema).use(absoluteHeadingInputRule).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();

// Actual ProseMirror/controller operations in JSDOM. This excludes native layout/IME.
// Run the identical file before/after a change; five independent trials retain exact source checks.
const report=[];
await crepe.editor.action(async ctx => {
 const parser=ctx.get(parserCtx), serialize=ctx.get(serializerCtx), view=ctx.get(editorViewCtx);
 for(const paragraphs of [100,1000]) for(const operation of ['selection','input-delete']) {
  const source=Array.from({length:paragraphs},(_,i)=>`段落 ${i}：中文 English **强调片段** 与长文编辑。`).join('\n\n')+'\n';
  const trials=[];
  for(let trial=0;trial<5;trial++) {
   const model=new MarkdownDocument(source,parser,serialize);
   let edits=0, editMs=0;
   const edit=model.editInline.bind(model);
   model.editInline=(...args)=>{const start=performance.now();edits++;try{return edit(...args);}finally{editMs+=performance.now()-start;}};
   view.updateState(EditorState.create({doc:model.doc,plugins:view.state.plugins}));
   const controller=installInlineSource(view,model,()=>{});
   view.setProps({dispatchTransaction(tr){view.updateState(view.state.apply(tr));if(!controller.apply(tr))model.apply(view.state.doc);controller.update();}});
   view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,model.positionAtSource(source.lastIndexOf('强调片段')+1))));
   await Promise.resolve();await Promise.resolve();assert.ok(view.dom.querySelector('.md-inline-source'));
   const origin=view.state.selection.head;
   // Warm the active projection with the same two caret positions.
   for(let i=0;i<4;i++){view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,origin+i%2)));await Promise.resolve();}
   edits=0;editMs=0;
   const start=performance.now();
   for(let i=0;i<20;i++) {
    if(operation==='selection') view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,origin+i%2)));
    else {
     view.dispatch(view.state.tr.insertText('中'));
     const head=view.state.selection.head;
     view.dispatch(view.state.tr.delete(head-1,head));
    }
    await Promise.resolve();
   }
   const elapsed=performance.now()-start;
   assert.equal(model.source,source,`${operation}: exact source after interactions`);
   controller.close();await Promise.resolve();
   assert.equal(model.source,source,'close preserves exact source');
   assert.equal(serialize(parser(source)),serialize(view.state.doc),'projection remains semantically equivalent');
   controller.destroy();
   trials.push({totalMs:+elapsed.toFixed(3),editInlineCalls:edits,editInlineMs:+editMs.toFixed(3)});
  }
  const times=trials.map(t=>t.totalMs).sort((a,b)=>a-b);
  report.push({paragraphs,operation,iterations:20,medianMs:times[2],trials});
 }
});
console.log(JSON.stringify(report,null,2));
await crepe.destroy();dom.window.close();
