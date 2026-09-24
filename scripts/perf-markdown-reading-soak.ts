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
const { build } = await import("esbuild");
const fs = await import("node:fs/promises"), path = await import("node:path"), url = await import("node:url");
const modelPath=path.resolve(process.env.DEDITOR_READING_BASELINE ?? '.', 'src/lib/markdownVisual/document.ts');
const output=path.resolve('node_modules/.cache/deditor-reading-soak-model.mjs');
await fs.mkdir(path.dirname(output),{recursive:true});
await build({stdin:{contents:await fs.readFile(modelPath,'utf8'),resolveDir:path.resolve('src/lib/markdownVisual'),loader:'ts'},outfile:output,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const { MarkdownDocument } = await import(url.pathToFileURL(output).href);
const { EditorState } = await import("@milkdown/kit/prose/state");
const { history } = await import("@milkdown/kit/plugin/history");
const { trailing } = await import("@milkdown/kit/plugin/trailing");
const { inlineSourceSchema } = await import("../src/lib/markdownVisual/inlineSource");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(inlineSourceSchema).use(absoluteHeadingInputRule).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();


const { MarkdownSession } = await import("../src/lib/markdownSession");
await crepe.editor.action(async ctx => {
 const parse=ctx.get(parserCtx), serialize=ctx.get(serializerCtx);
 const source=Array.from({length:Number(process.env.MD_SOAK_BLOCKS ?? 1000)},(_,i)=>`段落 ${i}：中文正文 **加粗文字** 和 [链接](https://example.com/${i})，${'保存撤销核对。'.repeat(8)}`).join("\n\n")+"\n";
 const model=new MarkdownDocument(source,parse,serialize), session=new MarkdownSession(source);
 const state=()=>({document:model.snapshot(),selection:{anchor:2,head:2},sourceSelection:{anchor:2,head:2}});
 const collect=()=>{global.gc?.();return process.memoryUsage().heapUsed;};
 const insertionOffset=model.sourceOffset(2);
 const before=collect(), times=[];
 const edits=Number(process.env.MD_SOAK_EDITS ?? 150), retainedEdits=Math.min(500,edits);
 for(let i=0;i<edits;i++) {
  const start=performance.now(), previous=state();
  const next=EditorState.create({doc:model.doc}).tr.insertText('中',2).doc;
  const value=model.apply(next);session.breakGroup();session.commit(value,'visual');session.recordVisual(previous,state());
  times.push(performance.now()-start);
 }
 const retained=collect()-before;
 const final=model.source;
 for(let i=0;i<retainedEdits;i++){assert.ok(session.undo());const saved=session.takeHistoryVisual();assert.ok(saved);model.restore(session.source,saved.document);}
 assert.equal(model.source,source.slice(0,insertionOffset)+'中'.repeat(edits-retainedEdits)+source.slice(insertionOffset),'all retained history restores exact source');
 for(let i=0;i<retainedEdits;i++){assert.ok(session.redo());const saved=session.takeHistoryVisual();assert.ok(saved);model.restore(session.source,saved.document);}
 assert.equal(model.source,final,'all redo restores exact source');
 assert.equal(serialize(parse(final)),serialize(model.doc),'final model equivalence');
 session.sync('');model.reset('');
 const releasedMB=(collect()-before)/1048576;
 if(global.gc && !process.env.DEDITOR_READING_BASELINE && !process.env.MD_SOAK_BLOCKS && edits===150) {
  assert.ok(retained/1048576<140,'150 edit groups must not retain whole deep AST copies');
  assert.ok(releasedMB<25,'reset releases history trees');
 }
 const median=(a:number[])=>a.toSorted((a,b)=>a-b)[Math.floor(a.length/2)];
 console.log(JSON.stringify({chars:source.length,bytes:Buffer.byteLength(source),edits,releasedMB,retainedMB:retained/1048576,first25Ms:median(times.slice(0,25)),last25Ms:median(times.slice(-25)),medianMs:median(times)},null,2));
});
await crepe.destroy();dom.window.close();
