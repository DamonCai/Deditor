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

// Measures the actual ProseMirror/controller path in JSDOM, not native layout or IME latency.
await crepe.editor.action(async ctx => {
 const parser=ctx.get(parserCtx), serialize=ctx.get(serializerCtx), view=ctx.get(editorViewCtx);
 const rows=[];
 for(const mode of ["unchanged", "changed-full", "changed-block"]) for(const paragraphs of [100,500,1000]) {
  const source=Array.from({length:paragraphs},(_,i)=>`段落 ${i}：中文 English **强调片段** 与长文编辑。`).join("\n\n")+"\n";
  let parses=0,fullParses=0;const parse=(s:string)=>{parses++;if(s.length>source.length/2)fullParses++;return parser(s);};
  const model=new MarkdownDocument(source,parse,serialize);
  if(mode === "changed-full") model.reparseInlineBlock=()=>null;
  view.updateState(EditorState.create({doc:model.doc,plugins:view.state.plugins}));
  const controller=installInlineSource(view,model,()=>{});
  view.setProps({dispatchTransaction(tr){view.updateState(view.state.apply(tr));if(!controller.apply(tr))model.apply(view.state.doc);controller.update();}});
  const offset=source.lastIndexOf('强调片段')+1, timings=[];
  for(let i=0;i<5;i++){
   controller.reset();view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,model.positionAtSource(offset))));
   await Promise.resolve();await Promise.resolve();assert.ok(view.dom.querySelector('.md-inline-source'));
   if(mode !== "unchanged") view.dispatch(view.state.tr.insertText("x"));
   const expected=model.source;
   const start=performance.now();controller.close();timings.push(performance.now()-start);
   assert.equal(model.source,expected);
   assert.equal(serialize(parser(model.source)),serialize(view.state.doc));assert.equal(view.dom.querySelector('.md-inline-source'),null);
  }
  controller.destroy();timings.sort((a,b)=>a-b);
  rows.push({mode,paragraphs,chars:source.length,parses,fullParses,closeMedianMs:+timings[2].toFixed(2),closeMaxMs:+timings[4].toFixed(2)});
 }
 console.log(JSON.stringify(rows,null,2));
});
await crepe.destroy();dom.window.close();
