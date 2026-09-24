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
const { inlineSourceSchema } = await import("../src/lib/markdownVisual/inlineSource");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(inlineSourceSchema).use(absoluteHeadingInputRule).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();



const { offsetSourceTree } = await import("../src/lib/markdownVisual/sourceOffsets");
const { createHeadingIdsPlugin } = await import("../src/lib/markdownVisual/headingIds");
const { Schema } = await import("@milkdown/kit/prose/model");
const leaf={type:'text',value:'中文',position:{start:{offset:2},end:{offset:4}}};
const tree={type:'paragraph',position:{start:{offset:0},end:{offset:4}},children:[leaf]};
let shifted=tree;
for(let i=0;i<20000;i++)shifted=offsetSourceTree(shifted,1) as typeof tree;
// Resolving a distant block must never recurse through 20,000 prior shifts.
assert.equal(shifted.children[0].position!.start.offset,20002);
assert.equal(offsetSourceTree(shifted,-20000),tree);
assert.equal(leaf.position.start.offset,2);
console.log('PASS 20,000 shifts flatten to original, preserve old snapshot, and reverse exactly');
const schema=new Schema({nodes:{doc:{content:'block+'},text:{group:'inline'},paragraph:{group:'block',content:'inline*'},heading:{group:'block',content:'inline*',attrs:{level:{default:1}}},blockquote:{group:'block',content:'block+'},deditor_raw:{group:'block',content:'text*'},deditor_inline_source:{inline:true,group:'inline',content:'text*'},deditor_emoji:{inline:true,group:'inline',attrs:{name:{}}}}});
const h=(text:string)=>schema.nodes.heading.create(null,schema.text(text)),p=(text:string)=>schema.nodes.paragraph.create(null,schema.text(text));
const plugin=createHeadingIdsPlugin();
let state=EditorState.create({doc:schema.nodes.doc.create(null,[h('Repeat'),p('Body'),h('Repeat'),schema.nodes.deditor_raw.create(null,schema.text('# Repeat')),schema.nodes.blockquote.create(null,h('Repeat')),h('中文')]),plugins:[plugin]});
const marks=(state: import('@milkdown/kit/prose/state').EditorState)=>plugin.getState(state)!.find().sort((a,b)=>a.from-b.from).map(d=>({from:d.from,to:d.to,id:d.spec.headingId}));
assert.deepEqual(marks(state).map(m=>m.id),['repeat','repeat-1','repeat-3',encodeURIComponent('中文')]);
const verify=()=>{const fresh=EditorState.create({doc:state.doc,plugins:[plugin]});assert.deepEqual(marks(state),marks(fresh));};
for(let i=0;i<60;i++) {
 const body=state.doc.firstChild!.nodeSize+2;
 state=state.apply(state.tr.insertText('中',body));verify();
 if(i%10===0){state=state.apply(state.tr.insertText('X',2));verify();}
}
state=state.apply(state.tr.insert(0,h('Repeat')));verify();
state=state.apply(state.tr.delete(0,state.doc.firstChild!.nodeSize));verify();
state=state.apply(state.tr.setNodeMarkup(0,schema.nodes.paragraph));verify();
state=state.apply(state.tr.replaceWith(0,state.doc.content.size,[h('Repeat'),h('Repeat'),p('tail')]));verify();
const same=plugin.getState(state);state=state.apply(state.tr.setSelection(TextSelection.create(state.doc,2)));assert.equal(plugin.getState(state),same);
console.log('PASS heading IDs: body edits, duplicates, raw/nested headings, rename, insert/delete, type changes, replace-all and selection');
await crepe.editor.action(ctx=>{
 const parse=ctx.get(parserCtx),serialize=ctx.get(serializerCtx);
 const normalize=(nodes: import('../src/lib/markdownVisual/document').SourceNode[]):unknown=>nodes.map(n=>({type:n.type,value:n.value,start:n.position?.start.offset,end:n.position?.end.offset,children:n.children?normalize(n.children):undefined}));
 for(const eol of ['\n','\r\n']) for(const footer of ['', '\n\nNote[^n].\n\n[^n]: Footnote body.']) {
  const source=('First plain paragraph.\n\n## 中文标题\n\n> 引用 **加粗**\n>\n> - [ ] 任务\n\n| A | B |\n| --- | --- |\n| 中文 | **strong** |\n\nLast **target** paragraph.'+footer+'\n').replace(/\n/g,eol);
  const model=new MarkdownDocument(source,parse,serialize),initial=model.snapshot();
  const saved=JSON.stringify(normalize(initial.ast));
  for(let i=0;i<24;i++) {
   const target=i%3===0?'First':i%3===1?'中文标题':'Last';
   const offset=model.source.indexOf(target)+1,pos=model.positionAtSource(offset);
   model.apply(EditorState.create({doc:model.doc}).tr.insertText('中',pos).doc);
   const fresh=new MarkdownDocument(model.source,parse,serialize);
   assert.deepEqual(normalize(model.snapshot().ast),normalize(fresh.snapshot().ast));
   for(const text of ['strong','target','任务']) {
    const sourceOffset=model.source.indexOf(text),at=model.positionAtSource(sourceOffset);
    assert.equal(model.sourceOffset(at),sourceOffset);
   }
  }
  const expected=model.source,final=model.snapshot();
  assert.equal(JSON.stringify(normalize(initial.ast)),saved,'old AST snapshots immutable');
  model.restore(source,initial);assert.equal(model.source,source);
  model.restore(expected,final);assert.equal(serialize(model.doc),serialize(parse(expected)));
  const changed=expected.replace('target','target中文');model.reset(changed);
  assert.deepEqual(normalize(model.snapshot().ast),normalize(new MarkdownDocument(changed,parse,serialize).snapshot().ast));
 }
 console.log('PASS mixed model: 96 edits, LF/CRLF, tables/lists/footnotes, old snapshots, source positions and reset');
});
await crepe.destroy();dom.window.close();
