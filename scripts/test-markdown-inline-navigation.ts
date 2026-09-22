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
const { EditorState, TextSelection, Plugin } = await import("@milkdown/kit/prose/state");
const { history } = await import("@milkdown/kit/plugin/history");
const { trailing } = await import("@milkdown/kit/plugin/trailing");
const { inlineSourceSchema, installInlineSource } = await import("../src/lib/markdownVisual/inlineSource");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(inlineSourceSchema).use(absoluteHeadingInputRule).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();

// Selection-only transactions may append real edits; exercise the final state,
// including projections nested in paragraphs, quotes, lists, and table cells.
let passed=0;
await crepe.editor.action(async ctx => {
 const parser=ctx.get(parserCtx), serialize=ctx.get(serializerCtx), view=ctx.get(editorViewCtx);
 for(const source of ['Before **目标文字** after.\n\nTail\n','> Before **目标文字** after.\n\nTail\n','- Before **目标文字** after.\n\nTail\n','| A | B |\n| --- | --- |\n| Before **目标文字** after. | two |\n\nTail\n']) {
  const model=new MarkdownDocument(source,parser,serialize);
  const appended=new Plugin({appendTransaction(transactions,_previous,state){
   return transactions.some(tr=>tr.getMeta('test-append-inline')) ? state.tr.insertText('中文') : null;
  }});
  const originalPlugins=view.state.plugins;
  view.updateState(EditorState.create({doc:model.doc,plugins:[...originalPlugins,appended]}));
  const controller=installInlineSource(view,model,()=>{});
  view.setProps({dispatchTransaction(tr){view.updateState(view.state.applyTransaction(tr).state);if(!controller.apply(tr))model.apply(view.state.doc);controller.update();}});
  view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,model.positionAtSource(source.indexOf('目标文字')+1))));
  await Promise.resolve();await Promise.resolve();assert.ok(view.dom.querySelector('.md-inline-source'));
  const origin=view.state.selection.head;
  for(let i=0;i<6;i++){view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,origin+i%2)));await Promise.resolve();}
  assert.equal(model.source,source,'navigation preserves original source');
  // Simulate a plugin which appends a document edit to a selection transaction.
  const tr=view.state.tr.setSelection(TextSelection.create(view.state.doc,origin)).setMeta('test-append-inline',true);
  assert.equal(tr.docChanged,false);
  view.dispatch(tr);await Promise.resolve();
  const expected=source.replace('目标文字','目中文标文字');
  assert.equal(model.source,expected,'appended edit is flushed despite selection-only root transaction');
  // A cross-block selection leaves the inline projection and preserves both ends.
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,view.state.selection.head,view.state.doc.content.size-2)));
  await Promise.resolve();await Promise.resolve();
  assert.equal(view.dom.querySelector('.md-inline-source'),null);
  assert.equal(model.source,expected,'closing preserves the appended edit');
  assert.equal(serialize(parser(expected)),serialize(view.state.doc));
  assert.ok(!view.state.selection.empty);
  assert.ok(view.state.doc.textBetween(view.state.selection.from,view.state.selection.to,'\n').includes('Tail'.slice(0,3)));
  controller.destroy();
  view.updateState(EditorState.create({doc:model.doc,plugins:originalPlugins}));
  console.log('PASS inline navigation and appended Chinese edit: '+source.split('\n')[0]);passed++;
 }
});
await crepe.destroy();dom.window.close();
console.log(`${passed} inline controller regression groups passed`);
