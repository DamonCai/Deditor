import { faithfulParagraph } from "../src/lib/markdownVisual/paragraph";
import { arrowNavigationMarkdown, arrowNavigationContextMarkdown } from "../tests/fixtures/markdown-arrow-navigation";
import { footnoteOrder } from "../src/lib/markdownVisual/footnoteOrder";
import { markdownInputAssist } from "../src/lib/markdownVisual/inputAssist";
import { readFileSync } from "node:fs";
import { shorthandRemark, highlightRemark, shorthandMarks, emojiSchema, shorthandInputRules, configureShorthand } from "../src/lib/markdownVisual/shorthand";
import { strikethroughInputRule } from "@milkdown/kit/preset/gfm";
import { editableBlockquote, footnoteReference, footnoteDefinition, footnoteUpdates, footnoteNodeView } from "../src/lib/markdownVisual/structuredBlocks";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { nativeMarkdownCursor } from "../src/lib/markdownVisual/cursor";
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
const { MarkdownDocument, range } = await import("../src/lib/markdownVisual/document");
const { EditorState, TextSelection } = await import("@milkdown/kit/prose/state");
const { history } = await import("@milkdown/kit/plugin/history");
const { trailing } = await import("@milkdown/kit/plugin/trailing");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(footnoteOrder).use(absoluteHeadingInputRule).use(faithfulParagraph).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
crepe.editor.use(nativeMarkdownCursor).use(markdownInputAssist);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();

function uncached(model: any, position: number) {
    let found = model.source.length;
    model.doc.forEach((node, offset, index) => {
      if (position >= offset && position <= offset + node.nodeSize && model.ast[index]) {
        const [from, to] = range(model.ast[index]);
        found = Math.min(to, from + Math.max(0, position - offset - 1));
        const ranges = model.textRanges(node, index, offset);
        const segment = ranges.find(r => position === r.pos) ?? ranges.find(r => position > r.pos && position <= r.end);
        if (segment) found = position === segment.end ? segment.to : segment.from + Math.min(position - segment.pos, segment.to - segment.from);
        else if (ranges.length) {
          const nearest = ranges.reduce((best, r) => Math.min(Math.abs(position-r.pos), Math.abs(position-r.end)) < Math.min(Math.abs(position-best.pos), Math.abs(position-best.end)) ? r : best);
          found = position < nearest.pos ? nearest.from : nearest.to;
        }
      }
    });
    return found;
  }
let checks = 0;
await crepe.editor.action(async ctx => {
 const parse=ctx.get(parserCtx),serialize=ctx.get(serializerCtx);
 const all=(model:MarkdownDocument,label:string)=>{
  for(let pos=-1;pos<=model.doc.content.size+1;pos++){
   const expected=uncached(model,pos);
   assert.equal(model.sourceOffset(pos),expected,`${label} ${pos}`);
   assert.equal(model.sourceOffset(pos),expected,`${label} repeat ${pos}`);assert.ok((model as any).sourceOffsets.values.size<=32);checks+=2;
  }
 };
 const fixtures=['','段落 中文 𝄞 é &amp; **粗体**。\n\nSecond.\n', '- [x] parent\n  - child\n\n> 引用 **格式**\n\n| A | B |\n|---|---|\n|中文|内容|\n', '```ts\nconst a = 1;\n\n```\n\n$$\nx^2\n$$\n\n<details>raw</details>\n', '[引用][ref] 和 footnote[^a]\n\n[ref]: https://example.com\n\n[^a]: 脚注\n',readFileSync(new URL('../tests/fixtures/markdown-complex.md',import.meta.url),'utf8'),arrowNavigationContextMarkdown];
 for(const source of fixtures){
  const model=new MarkdownDocument(source,parse,serialize);all(model,'initial');
  const snapshot=model.snapshot();
  const next=model.doc.type.create(model.doc.attrs,model.doc.content,model.doc.marks);model.project(next);all(model,'project');
  model.restore(source,snapshot);all(model,'restore');
 }
 const source='**bold** &amp; 文本\n\nSecond paragraph.\n';
 const model=new MarkdownDocument(source,parse,serialize);all(model,'initial edit');const snapshot=model.snapshot();
 model.apply(EditorState.create({doc:model.doc}).tr.insertText('X',model.doc.content.size-2).doc);all(model,'apply');
 model.restore(source,snapshot);all(model,'undo');
 model.reset(source.replace('Second','Changed'));all(model,'reset');
 model.restore(source,snapshot);model.editInline(0,8,'**BOLD**',parse(source.replace('**bold**','**BOLD**')));all(model,'inline');
 // Same ProseMirror document, different original spelling/source AST.
 const plain=new MarkdownDocument('Plain text.\n',parse,serialize),entity=new MarkdownDocument('Plain te&#120;t.\n',parse,serialize);
 const shared=plain.doc;plain.sourceOffset(9);plain.restore(entity.source,{...entity.snapshot(),doc:shared});all(plain,'same doc new AST');
 plain.source=plain.source+'\n';all(plain,'same doc and AST changed source');
 const median=(v:number[])=>[...v].sort((a,b)=>a-b)[2];
 const rows=[];
 for(const count of [100,1000,5000]){
  const text=Array.from({length:count},(_,i)=>`段落 ${i} 中文 English **内容**。`).join('\n\n');const m=new MarkdownDocument(text,parse,serialize),pos=m.doc.content.size-3;
  const repeats=(fn:(pos:number)=>number)=>Array.from({length:5},()=>{const started=performance.now();for(let i=0;i<100;i++)for(let j=0;j<5;j++)fn(pos);return(performance.now()-started)/100;});
  uncached(m,pos);m.sourceOffset(pos);
  const before=repeats(p=>uncached(m,p)),after=repeats(p=>m.sourceOffset(p));
  // A fresh projection must pay the real lookup once, then reuse duplicate queries.
  const fresh=(fn:(pos:number)=>number)=>Array.from({length:5},()=>{let elapsed=0;for(let i=0;i<100;i++){m.project(m.doc.type.create(m.doc.attrs,m.doc.content,m.doc.marks));const start=performance.now();for(let j=0;j<5;j++)fn(pos);elapsed+=performance.now()-start;}return elapsed/100;});
  const freshBefore=fresh(p=>uncached(m,p)),freshAfter=fresh(p=>m.sourceOffset(p));
  let visits=0;const original=m.doc.forEach.bind(m.doc);m.doc.forEach=(fn:any)=>original((...args:any[])=>{visits++;fn(...args);});
  for(let i=0;i<5;i++)m.sourceOffset(pos);assert.equal(visits,0,'published position already cached');
  m.doc.forEach=original;
  rows.push({paragraphs:count,chars:text.length,beforeMs:before,afterMs:after,beforeMedian:median(before),afterMedian:median(after),freshBeforeMs:freshBefore,freshAfterMs:freshAfter,freshBeforeMedian:median(freshBefore),freshAfterMedian:median(freshAfter)});
 }
 console.log(JSON.stringify({checks,rows},null,2));
 console.log('PASS initial, all positions, source/AST/projection invalidation, inline edit, reset and restore');
});
await crepe.destroy();dom.window.close();
