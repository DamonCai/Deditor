import { footnoteOrder } from "../src/lib/markdownVisual/footnoteOrder";
import { markdownInputAssist } from "../src/lib/markdownVisual/inputAssist";
import { useEditorStore } from "../src/store/editor";
import { readFileSync } from "node:fs";
import { shorthandRemark, highlightRemark, shorthandMarks, emojiSchema, shorthandInputRules, configureShorthand } from "../src/lib/markdownVisual/shorthand";
import { strikethroughInputRule } from "@milkdown/kit/preset/gfm";
import { editableBlockquote, footnoteReference, footnoteDefinition, footnoteUpdates, footnoteNodeView } from "../src/lib/markdownVisual/structuredBlocks";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { MarkdownSession } from "../src/lib/markdownSession";
import { MarkdownSearch, markdownReplacement } from "../src/lib/markdownVisual/search";
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
const { MarkdownDocument } = await import("../src/lib/markdownVisual/document");
const { EditorState, TextSelection } = await import("@milkdown/kit/prose/state");
const { history } = await import("@milkdown/kit/plugin/history");
const { trailing } = await import("@milkdown/kit/plugin/trailing");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(shorthandRemark).use(highlightRemark).use(shorthandMarks.flat()).use(emojiSchema).use(shorthandInputRules).config(configureShorthand).use(editableBlockquote).use(footnoteReference).use(footnoteDefinition).use(footnoteUpdates).use(footnoteOrder).use(absoluteHeadingInputRule).use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(wrapInHeadingInputRule); await crepe.editor.remove(strikethroughInputRule);
crepe.editor.use(nativeMarkdownCursor).use(markdownInputAssist);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`PASS ${name}`); };
crepe.editor.action(ctx => {
 const parse = ctx.get(parserCtx), serialize = ctx.get(serializerCtx);
 const make = (source: string) => new MarkdownDocument(source, parse, serialize);
 test("native caret: mark affinity keeps arrow behavior and yields to composition", () => {
   const view = ctx.get(editorViewCtx), previous = view.state;
   const doc = parse('plain **bold** plain'); let end = 0;
   doc.descendants((node, pos) => { if (node.isText && node.text === 'bold') end = pos + node.nodeSize; });
   view.updateState(EditorState.create({doc, plugins: previous.plugins, selection: TextSelection.create(doc, end)}));
   view.dispatch(view.state.tr.setStoredMarks([]));
   const key = (name: string, composing = false) => view.someProp('handleKeyDown', handler => handler(view, new dom.window.KeyboardEvent('keydown', {key:name, isComposing:composing})));
   key('ArrowLeft'); assert.equal(view.state.selection.head, end); assert.ok(view.state.storedMarks?.some(mark=>mark.type.name==='strong'));
   key('ArrowRight', true); assert.ok(view.state.storedMarks?.some(mark=>mark.type.name==='strong'));
   key('ArrowRight'); assert.equal(view.state.selection.head, end); assert.deepEqual(view.state.storedMarks, []);
   assert.equal(view.dom.classList.contains('virtual-cursor-enabled'),false);
   assert.equal(view.dom.querySelector('.prosemirror-virtual-cursor'),null);
   view.updateState(previous);
 });
 test("native caret: right arrow exits terminal inline HTML before leaving its paragraph", () => {
   const view = ctx.get(editorViewCtx), previous = view.state;
   for (const source of ['* [引用文字][guide] 和 <kbd>Ctrl</kbd>\n\n[guide]: https://example.com\n', '<kbd>Ctrl</kbd>', '> <span style="color:#ff0000">彩色</span>', '| A |\n| --- |\n| <kbd>Ctrl</kbd> |']) {
     const doc = parse(source); let end = 0;
     doc.descendants((node, pos) => { if (node.isText && node.marks.some(mark => mark.type.name.startsWith('deditor_'))) end = pos + node.nodeSize; });
     view.updateState(EditorState.create({doc, plugins: previous.plugins, selection: TextSelection.create(doc, end)}));
     const key = (name: string, composing = false) => view.someProp('handleKeyDown', handler => handler(view, new dom.window.KeyboardEvent('keydown', {key:name, isComposing:composing})));
     key('ArrowRight', true); assert.equal(view.state.storedMarks, null);
     assert.equal(key('ArrowRight'), true, source);
     assert.equal(view.state.selection.head, end); assert.deepEqual(view.state.storedMarks, [], source);
     assert.equal(view.state.tr.insertText('Z').doc.textBetween(end, end + 1), 'Z');
     assert.equal(view.state.tr.insertText('Z').doc.nodeAt(end)!.marks.length, 0);
     key('ArrowLeft'); assert.equal(view.state.selection.head, end); assert.ok(view.state.storedMarks?.length);
     assert.equal(view.dom.querySelector('[data-md-mark-boundary]'), null);
     view.focus();
     const block = view.nodeDOM(view.state.selection.$head.before()) as HTMLElement;
     const html = block.lastChild as HTMLElement;
     html.getBoundingClientRect = () => ({left:10, right:50, top:10, bottom:30, width:40, height:20, x:10, y:10, toJSON(){}});
     const click = (x: number) => view.someProp('handleClick', handler => handler(view, end, new dom.window.MouseEvent('click', {clientX:x, clientY:20})));
     assert.equal(click(30), undefined); assert.ok(view.state.storedMarks?.length);
     assert.equal(click(60), true); assert.deepEqual(view.state.storedMarks, []);
     assert.ok(view.dom.querySelector('[data-md-mark-boundary]'));
     assert.equal(make(source).apply(view.state.doc), source, 'navigation cannot insert a source spacer');
     const outside = make(source).apply(view.state.tr.insertText('Z').doc);
     assert.ok(!outside.includes('\u200b')); assert.match(outside, /<\/(?:kbd|span)>Z/);

   }
   view.updateState(previous);
 });
 test("input assist: paired brackets, selection wrapping, backspace, disabled setting and IME", () => {
   const view = ctx.get(editorViewCtx), old = view.state;
   const set = (text: string, from: number, to = from) => view.updateState(EditorState.create({doc: parse(text), plugins: old.plugins, selection: TextSelection.create(parse(text), from, to)}));
   const type = (text: string) => view.someProp('handleTextInput', fn => fn(view, view.state.selection.from, view.state.selection.to, text, () => view.state.tr.insertText(text)));
   useEditorStore.setState({autoCloseBrackets:true}); set('text',5);
   assert.equal(type('('),true); assert.equal(view.state.doc.textContent,'text()');
   view.someProp('handleKeyDown', fn => fn(view, new dom.window.KeyboardEvent('keydown',{key:'Backspace'})));
   assert.equal(view.state.doc.textContent,'text');
   set('word',1,5);assert.equal(type('['),true);assert.equal(view.state.doc.textContent,'[word]');
   set('word',5);useEditorStore.setState({autoCloseBrackets:false});assert.notEqual(type('('),true);
   useEditorStore.setState({autoCloseBrackets:true});
   view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionstart',{bubbles:true}));assert.notEqual(type('('),true);
   view.dom.dispatchEvent(new dom.window.CompositionEvent('compositionend',{bubbles:true}));
   view.updateState(old);
 });
 test("search: Unicode case matching and inline atoms preserve exact selection offsets", () => {
   const doc = parse("İ 😀 **Target** [link](https://example.test) target [x]\\n".replace('\\n', '\n'));
   const search = new MarkdownSearch();
   for (const query of ['target', '😀', '[x]', 'link', 'İ']) {
     const results = search.find(doc, query);
     assert.equal(results.length, query === 'target' ? 2 : 1);
     for (const match of results) assert.equal(doc.textBetween(match.from, match.to).toLowerCase(), query.toLowerCase());
   }
   assert.deepEqual(search.find(doc, ''), []);
 });
 test("search: options, invalid and zero-width regex, Unicode boundaries and capture replacement", () => {
   const doc = parse("Cat cat scatter 中文词 中文 😀 **item12** item34");
   const search = new MarkdownSearch();
   assert.equal(search.find(doc, 'cat').length, 3);
   assert.equal(search.find(doc, 'cat', {caseSensitive:true, wholeWord:true}).length, 1);
   assert.equal(search.find(doc, '中文', {wholeWord:true}).length, 1);
   const matches = search.find(doc, 'item(\\d+)', {regex:true});
   assert.equal(matches.length, 2);
   assert.equal(markdownReplacement(matches[0], '$1-$$-$&', true), '12-$-item12');
   assert.equal(markdownReplacement(matches[0], '$1', false), '$1');
   assert.equal(search.find(doc, '[', {regex:true}).length, 0); assert.equal(search.error,true);
   assert.equal(search.find(doc, '(?=cat)', {regex:true}).length, 0); assert.equal(search.error,false);
 });
 test("search: cached blocks follow insertions, deletions and undo across a long document", () => {
   const source = Array.from({length: 500}, (_, i) => `## Section ${i}\n\nİ **target ${i}** 中文\n\n> target quote ${i}\n`).join('\n');
   const original = parse(source), search = new MarkdownSearch();
   let state = EditorState.create({doc: original});
   assert.equal(search.find(state.doc, 'target').length, 1000);
   for (let i = 0; i < 20; i++) {
     const found = search.find(state.doc, 'target');
     const selected = found[(i * 47) % found.length];
     state = state.apply(state.tr.insertText(i % 2 ? '中文 replacement' : 'TARGET new', selected.from, selected.to));
     const results = search.find(state.doc, 'target');
     assert.equal(results.length, 1000 - Math.ceil(i / 2));
     for (const match of results) assert.equal(state.doc.textBetween(match.from, match.to).toLowerCase(), 'target');
   }
   assert.equal(search.find(original, 'target').length, 1000);
 });
 const editText = (model: InstanceType<typeof MarkdownDocument>, text: string, replacement: string) => {
   let position = -1; model.doc.descendants((node, pos) => { if (position < 0 && node.isText && node.text!.includes(text)) position = pos + node.text!.indexOf(text); });
   assert(position >= 0, `Find ${text}`);
   const state = EditorState.create({ doc: model.doc });
   const tr = state.tr.insertText(replacement, position, position + text.length);
   return model.apply(tr.doc);
 };
 test("inline index: repeated CJK and syntax edits match a fresh whole-document index", () => {
   for (const original of [
     "# title\n\nText **target** end.\n\nTail *last*.\n",
     "intro\r\n\r\nText **target**\r\nnext line\r\n\r\nTail *last*.\r\n",
     "> [!NOTE]\n> Text **target** end\n>\n> - nested\n\nTail *last*.\n",
     "| Item | Value |\n|---|---|\n| **target** | text |\n\nTail *last*.\n",
     "Text **target** [link][ref] and note[^n].\n\n[ref]: https://example.test\n\n[^n]: original\n\nTail *last*.\n",
     "Before\n\n## **target**\n\nTail *last*.\n",
   ]) {
     const model = make(original); const from = original.indexOf("**target**"); let length = "**target**".length;
     for (const raw of ["**中文 target**", "**中X文 target**", "**中文 target**", "**target**", "**[target][ref]**", "**target\\*literal**", "**target**\n\nnew paragraph", "**target**"]) {
       const structural = raw.includes("\n") || model.source.slice(from,from+length).includes("\n");
       const expected = model.source.slice(0,from) + raw + model.source.slice(from+length);
       model.editInline(from,length,raw,parse(expected)); length=raw.length;
       assert.equal(model.source,expected);
       const fresh=make(expected);
       // Structural pastes intentionally defer exact indexing until reset. The
       // live inline editor keeps one raw range while it is open.
       if (structural || model.doc.childCount !== fresh.doc.childCount) { model.reset(expected); continue; }
       model.doc.descendants((node,pos)=>{if(node.isText) for(const at of [pos,pos+node.nodeSize]) assert.equal(model.sourceOffset(at),fresh.sourceOffset(at),JSON.stringify({original,raw,at}));});
       assert.deepEqual(model.inlineAt(model.positionAtSource(expected.indexOf("*last*"))+1),fresh.inlineAt(fresh.positionAtSource(expected.indexOf("*last*"))+1));
     }
   }
 });
 test("structured: footnotes and alert prose are editable and patch exact source", () => {
   const source = "正文[^n] 后文。\n\n> [!NOTE]\n> 提示 **重点**。\n\n[^n]: 脚注解释。\n";
   const model = make(source);
   assert.equal(model.doc.firstChild!.child(1).type.name, "footnote_reference");
   assert.equal(editText(model, "后文", "更多"), source.replace("后文", "更多"));
   assert.equal(editText(model, "提示", "注意"), source.replace("后文", "更多").replace("提示", "注意"));
   assert.equal(editText(model, "脚注解释", "新的解释"), source.replace("后文", "更多").replace("提示", "注意").replace("脚注解释", "新的解释"));
 });
 test("footer: reference-order display preserves interleaved source and repeated edits", () => {
   for (const eol of ["\n", "\r\n"]) {
     const source = ["[^a]: Alpha **bold**", "", "Intro[^b] then[^a].", "", "[^b]: Beta", "", "Tail *word*", ""].join(eol);
     const model = make(source);
     assert.deepEqual(Array.from({length:model.doc.childCount},(_,i)=>model.doc.child(i).type.name),["paragraph","paragraph","footnote_definition","footnote_definition"]);
     assert.equal(model.doc.child(2).attrs.identifier,"b");
     let expected=source;
     for (const [from,to] of [["Alpha","中文解释"],["Tail","Later"],["Beta","第二条"],["Intro","Start"],["中文解释","Alpha again"],["word","new word"]]) {
       expected=expected.replace(from,to); assert.equal(editText(model,from,to),expected);
       const fresh=make(expected); assert.equal(model.doc.eq(fresh.doc),true);
       model.doc.descendants((node,pos)=>{if(node.isText)for(const point of [pos,pos+node.nodeSize])assert.equal(model.sourceOffset(point),fresh.sourceOffset(point),`offset ${point}`);});
       for(const token of ["Start","Later","Alpha again","第二条"]) if(expected.includes(token)) assert.equal(model.positionAtSource(expected.indexOf(token)),fresh.positionAtSource(expected.indexOf(token)));
     }
   }
 });
 test("footer: split, join, insert and remove prose cannot consume definitions between source blocks", () => {
   const source="Start[^a]\n\n[^a]: Keep **exact**\n\nMiddle text\n\n[^b]: Unused \n\nTail\n";
   const model=make(source);
   const compare=()=>{const fresh=make(model.source);assert.equal(model.doc.eq(fresh.doc),true,JSON.stringify({source:model.source,actual:model.doc.toJSON(),expected:fresh.doc.toJSON()}));model.doc.descendants((node,pos)=>{if(node.isText)assert.equal(model.sourceOffset(pos),fresh.sourceOffset(pos));});assert.ok(model.source.includes("[^a]: Keep **exact**"));assert.ok(model.source.includes("[^b]: Unused "))};
   let state=EditorState.create({doc:model.doc});let point=model.positionAtSource(source.indexOf("Middle")+3);model.apply(state.tr.split(point).doc);compare();
   editText(model,"text","changed");compare();
   state=EditorState.create({doc:model.doc});const inserted=parse("New block").firstChild!;model.apply(state.tr.insert(model.doc.firstChild!.nodeSize,inserted).doc);compare();
   state=EditorState.create({doc:model.doc});model.apply(state.tr.delete(model.doc.firstChild!.nodeSize,model.doc.firstChild!.nodeSize+inserted.nodeSize).doc);compare();
   // Joining across the original definition location keeps that definition intact.
   state=EditorState.create({doc:model.doc});model.apply(state.tr.join(model.doc.firstChild!.nodeSize).doc);compare();
 });
 test("footer: adding multiple definitions at EOF retains separators and correct source mappings", () => {
   for(const ending of ["", "\n", "\n\n"]) {
     const model=make("Body"+ending), additions=parse("[^a]: First\n\n[^b]: Second");
     model.apply(EditorState.create({doc:model.doc}).tr.insert(model.doc.content.size,additions.content).doc);
     assert.equal(make(model.source).doc.eq(model.doc),true,model.source);
     editText(model,"Second","第二");editText(model,"First","第一");
     const fresh=make(model.source);assert.equal(fresh.doc.eq(model.doc),true);
     model.doc.descendants((node,pos)=>{if(node.isText)assert.equal(model.sourceOffset(pos),fresh.sourceOffset(pos));});
   }
 });
 test("footer: changing reference order moves display definitions while keeping source and selection", () => {
   const view=ctx.get(editorViewCtx), previous=view.state;
   const source="Body[^a] then[^b]\n\n[^a]: Alpha\n\n[^b]: Beta\n";
   view.updateState(EditorState.create({doc:parse(source),plugins:previous.plugins}));
   const model=new MarkdownDocument(source,parse,serialize,false,view.state.doc);
   let first=0;view.state.doc.descendants((node,pos)=>{if(node.type.name==="footnote_reference"&&!first)first=pos;});
   view.dispatch(view.state.tr.delete(first,first+1));
   assert.equal(view.state.doc.child(1).attrs.identifier,"b");
   assert.equal(model.apply(view.state.doc),source.replace("[^a] then"," then"));
   view.updateState(previous);
 });
 test("structured: alerts preserve CRLF, nesting and marker spelling during repeated edits", () => {
   for (const source of ["> [!tip]\r\n> message **bold**\r\n\r\ntail\r\n", "> > [!WARNING]\n> > message\n> >\n> > - nested\n\nend\n", "> [!NOTE]\n>\n> ## message\n>\n> - nested\n\nend\n"]) {
     const model = make(source);
     assert.equal(model.apply(model.doc), source);
     assert.equal(editText(model, "message", "中文"), source.replace("message", "中文"));
     assert.equal(editText(model, "中文", "新的内容"), source.replace("message", "新的内容"));
     assert.equal(make(model.source).doc.eq(model.doc), true);
   }
 });
 test("structured: footnote identifiers and literal markers survive structural edits", () => {
   const source = "Text[^Note-One] again[^Note-One].\n\n[^Note-One]: explanation\n\n    second paragraph\n\ntail\n";
   const model = make(source); let raw = 0; model.doc.descendants(n => { if (n.type.name === "deditor_raw") raw++; }); assert.equal(raw, 0);
   editText(model, "explanation", "a *literal* explanation");
   assert.equal(make(model.source).doc.textContent, model.doc.textContent);
   assert.match(model.source, /\[\^Note-One\]:/);
   assert.equal(editText(model, "second paragraph", "changed paragraph"), model.source);
   assert.equal(make(model.source).doc.textContent, model.doc.textContent);
 });
 test("structured: alert structure serializes with its marker and editable children", () => {
   for (const source of ["> [!NOTE]\n> message\n", "> [!TIP]\n>\n> - item\n", "> [!CAUTION]\n"]) {
     const model = make(source); assert.match(serialize(model.doc), /\[!(NOTE|TIP|CAUTION)\]/);
     assert.equal(parse(serialize(model.doc)).eq(model.doc), true, JSON.stringify({source, output: serialize(model.doc), before:model.doc.toJSON(), after:parse(serialize(model.doc)).toJSON()}));
   }
 });
 test("shorthand: highlight, scripts and emoji load as editable semantic nodes", () => {
   const source = "==highlight **bold**== H~2~O X^2^ :smile: :unknown_name: `H~2~O :smile:`\\n".replace(/\\n$/, "\n");
   const model = make(source); let types: string[] = []; model.doc.descendants(n => { types.push(...n.marks.map(m => m.type.name)); if (n.type.name === "deditor_emoji") types.push(n.type.name); });
   for (const type of ["deditor_mark", "deditor_subscript", "deditor_superscript", "deditor_emoji"]) assert.ok(types.includes(type), type);
   assert.equal(model.apply(model.doc), source);
   assert.equal(editText(model, "highlight", "中文"), source.replace("highlight", "中文"));
   assert.equal(editText(model, "2", "3"), source.replace("highlight", "中文").replace("~2~", "~3~"));
   assert.equal(make(model.source).doc.eq(model.doc), true);
   assert.equal(parse(serialize(model.doc)).eq(model.doc), true);
 });
 test("shorthand: escapes, invalid delimiters, code and strikethrough stay distinct", () => {
   for (const source of [String.raw`\==literal== \~sub~ \^sup^ \:smile:`, "== == H~two words~ X^two words^ :not_an_emoji:", "`==mark== ~sub~ ^sup^ :smile:`", "```md\n==mark== ~sub~ ^sup^ :smile:\n```\n"]) {
     const model = make(source); let shorthand = 0; model.doc.descendants(n => { if (n.type.name === "deditor_emoji" || n.marks.some(m => /deditor_(mark|subscript|superscript)/.test(m.type.name))) shorthand++; });
     assert.equal(shorthand, 0, source); assert.equal(model.apply(model.doc), source);
   }
   const model = make("~~deleted~~ H~2~O");assert.equal(model.doc.firstChild!.firstChild!.marks[0].type.name, "strike_through");
 });
 test("complex: complete review fixture loads without loss", () => { const source = readFileSync("tests/fixtures/markdown-complex.md", "utf8"); const model = make(source); assert.equal(model.apply(model.doc), source); });
 const samples = ["", "\n\n", "# 中文标题\n\n正文  \n下一行\n", "标题\n====\n\n正文\n", "+ 一\n+ 二\n\n后文\n", "7. 一\n8. 二\n", "# CRLF\r\n\r\n中文\r\n", "\\*原样\\* &amp; **粗体**\n", "[label][ref]\n\n[ref]: <https://example.com> 'title'\n", "<span style=\"color:#e53e3e\">红色</span>\n\n尾部\n", "---\ntitle: demo\n---\n\n正文\n", "$$\nx^2\n$$\n\n```mermaid\ngraph LR\n A-->B\n```\n", "| 项目 | 内容 |\n| :--- | ---: |\n| 测试 | - a<br>- b |\n", "~~~js\nconst x=1;\n~~~\n\n尾段\n"];
 test("round 1: switching all 14 syntax fixtures preserves exact source", () => { for (const source of samples) { const model = make(source); assert.equal(model.apply(model.doc), source); assert.equal(model.reset(source).eq(model.doc), true); assert.equal(model.source, source); } });
 test("round 1: edit paragraph leaves headings, gaps and unknown blocks byte-identical", () => {
   const source = "Title\n=====\n\n\nHello **world**.\n\n<span x=\"unknown\">原文</span>\n\n[ref]: https://example.com\n";
   const model = make(source); assert.equal(editText(model, "Hello", "你好"), source.replace("Hello", "你好"));
 });
 test("round 1: repeated prose input patches current offsets", () => { const model = make("# Title\n\none\n\ntail\n"); editText(model, "one", "one two"); assert.equal(editText(model, "two", "three"), "# Title\n\none three\n\ntail\n"); });
 test("round 1: table text edit preserves table alignment and spacing", () => { const source = "| A     | B |\n| :---  | ---: |\n| one   | two |\n\ntail\n"; assert.equal(editText(make(source), "one", "中文"), source.replace("one", "中文")); });
 test("round 2: table-cell lists are editable nodes and preserve unrelated content", () => {
   const source = "| A | B |\n| --- | --- |\n| - one<br>- two | tail |\n\nUnchanged\n";
   const model = make(source); let lists = 0; model.doc.descendants(n => { if (n.type.name === "bullet_list") lists++; }); assert.equal(lists, 1);
   editText(model, "two", "中文"); assert.ok(model.source.endsWith("\n\nUnchanged\n")); assert.match(model.source, /中文/); assert.match(model.source, /<br>/);
   const reloaded = make(model.source); assert.match(reloaded.doc.textContent, /中文/);
 });
 test("round 2: literal Markdown markers remain literal after saving", () => {
   const model = make("# Title\n\nplain\n\ntail\n"); editText(model, "plain", "a *literal* value"); const reloaded = make(model.source);
   assert.equal(reloaded.doc.child(1).textContent, "a *literal* value"); assert.equal(reloaded.doc.child(1).firstChild?.marks.length, 0);
 });
 test("round 3: expanded raw block keeps subsequent block ranges", () => {
   const model = make("<custom>raw</custom>\n\ntail\n"); editText(model, "raw", "first\n\nsecond");
   assert.equal(editText(model, "tail", "end"), "<custom>first\n\nsecond</custom>\n\nend\n");
 });
 test("round 2: CRLF remains unchanged outside and inside edited paragraph", () => { const source = "# Title\r\n\r\nHello world\r\n\r\ntail\r\n"; assert.equal(editText(make(source), "world", "世界"), source.replace("world", "世界")); });
 test("round 2: ordered and bullet list markers survive text edits", () => { for (const source of ["7. one\n8. two\n", "+ one\n+ two\n"]) assert.equal(editText(make(source), "two", "中文"), source.replace("two", "中文")); });
 test("round 2: fenced code marker and language spelling survive text edits", () => { const source = "~~~TypeScript\nconst message = 'hello';\n~~~\n\ntail\n"; assert.equal(editText(make(source), "hello", "你好"), source.replace("hello", "你好")); });
 test("round 2: reference definitions stay addressable and never disappear", () => { const source = "[label][ref]\n\n[ref]: <https://example.com> 'title'\n\ntail\n"; const model = make(source); assert.equal(model.doc.childCount, 3); assert.equal(editText(model, "tail", "end"), source.replace("tail", "end")); });
 test("round 2: frontmatter remains opaque", () => { const source = "---\ntitle: Test\n---\n\ntext\n"; assert.equal(editText(make(source), "text", "edited"), source.replace("text", "edited")); });
 test("round 2: edit preserved HTML block writes its exact source", () => { const source = '<span style="color:#e53e3e">红色</span>\n\ntail\n'; assert.equal(editText(make(source), "红色", "蓝色"), source.replace("红色", "蓝色")); });
 test("round 3: insert and delete whole blocks retains neighboring source", () => { const model = make("# Title\n\none\n\ntail\n"); const state = EditorState.create({ doc: model.doc }); const pos = model.doc.firstChild!.nodeSize; const node = parse("new").firstChild!; model.apply(state.tr.insert(pos, node).doc); assert.equal(model.source, "# Title\n\nnew\n\none\n\ntail\n"); const next = EditorState.create({ doc: model.doc }); model.apply(next.tr.delete(pos, pos + node.nodeSize).doc); assert.match(model.source, /# Title\n+one\n\ntail\n$/); });
 test("round 5: image edits retain standard alt text and relative paths", () => {
   const source = '# Image\n\n![中文描述](assets/picture.svg "caption")\n\ntail\n', model = make(source);
   const at = model.doc.firstChild!.nodeSize, image = model.doc.child(1);
   assert.equal(image.attrs.alt, "中文描述");
   const tr = EditorState.create({ doc: model.doc }).tr.setNodeMarkup(at, undefined, { ...image.attrs, caption: "updated" });
   model.apply(tr.doc); assert.match(model.source, /!\[中文描述\]\(assets\/picture.svg "updated"\)/); assert.ok(model.source.endsWith("\n\ntail\n"));
 });
 test("round 5: checkbox edit preserves task markers and neighboring bytes", () => {
   const source = "+ [ ] one\n+ [X] two\n\ntail\n", model = make(source);
   let at = -1; model.doc.descendants((n, pos) => { if (at < 0 && n.type.name === "list_item") at = pos; });
   const state = EditorState.create({ doc: model.doc }), item = model.doc.nodeAt(at)!;
   assert.equal(model.apply(state.tr.setNodeMarkup(at, undefined, { ...item.attrs, checked: true }).doc), source.replace("[ ]", "[x]"));
 });
 test("round 5: source positions round-trip across headings, marks and tables", () => {
   const source = "# Heading\n\n**bold** and plain\n\n| A | B |\n| --- | --- |\n| one | two |\n", model = make(source);
   for (const word of ["Heading", "bold", "plain", "one", "two"]) {
     const offset = source.indexOf(word) + 1;
     assert.equal(model.sourceOffset(model.positionAtSource(offset)), offset, word);
   }
 });
 test("round 5: empty cells and authored line breaks reopen as editable tables", () => {
   for (const source of ["| A | B |\n| --- | --- |\n| | |\n", "| A | B |\n| --- | --- |\n| one<br>two | <br /> |\n"]) {
     const model = make(source); assert.equal(model.doc.firstChild!.type.name, "table");
     const serialized = serialize(model.doc); const reloaded = parse(serialized); assert.equal(reloaded.firstChild!.type.name, "table");
     assert.equal(reloaded.textContent, model.doc.textContent);
   }
 });
 test("reported editing bug: references and inline HTML never lock the surrounding list", () => {
   const source = '+ normal\n+ [label][ref] with <kbd>Ctrl</kbd> and <span style="color: red">color</span><br>next\n+ bottom\n\n[ref]: https://example.com \'title\'\n';
   const model = make(source); assert.equal(model.doc.firstChild!.type.name, "bullet_list");
   let raw = 0; model.doc.firstChild!.descendants(node => { if (node.type.name === "deditor_raw") raw++; }); assert.equal(raw, 0);
   assert.equal(editText(model, "bottom", "lower edited"), source.replace("bottom", "lower edited"));
   assert.equal(editText(model, "label", "changed"), source.replace("bottom", "lower edited").replace("label", "changed"));
   assert.equal(make(model.source).doc.firstChild!.type.name, "bullet_list");
 });
 test("reported editing bug: reference images do not lock adjacent list text", () => {
   const source = '+ ![icon][image] adjacent\n+ bottom\n\n[image]: assets/picture.svg\n';
   const model = make(source); assert.equal(model.doc.firstChild!.type.name, "bullet_list");
   assert.equal(editText(model, "bottom", "edited"), source.replace("bottom", "edited"));
 });
 test("reported editing bug: collapsed and shortcut reference labels remain links after editing", () => {
   for (const reference of ["[name]", "[name][]", "[name][name]"]) {
     const model = make(reference + "\n\n[name]: https://example.com\n");
     assert.equal(model.doc.firstChild!.type.name, "paragraph");
     editText(model, "name", "renamed");
     const node = make(model.source).doc.firstChild!.firstChild!;
     assert.equal(node.text, "renamed"); assert.equal(node.marks[0].attrs.href, "https://example.com");
     assert.ok(model.source.endsWith("[name]: https://example.com\n"));
   }
 });
 test("reported editing bug: HTML styles and keyboard labels preserve source while editing", () => {
   for (const source of ['press <kbd>Ctrl</kbd> then type\n', '<span style="color: rgb(200, 10, 20)">colored</span> text<br>tail\n']) {
     const model = make(source); assert.equal(model.doc.firstChild!.type.name, "paragraph");
     const text = source.includes("Ctrl") ? "Ctrl" : "tail";
     assert.equal(editText(model, text, "edited"), source.replace(text, "edited"));
   }
 });
 const view = ctx.get(editorViewCtx);
 const inputInto = (model: InstanceType<typeof MarkdownDocument>, position: number, text: string) => {
   view.updateState(EditorState.create({ doc: model.doc, selection: TextSelection.create(model.doc, position), plugins: view.state.plugins }));
   for (const character of text) {
     const {from,to} = view.state.selection;
     const insert = () => view.state.tr.insertText(character,from,to);
     if (!view.someProp("handleTextInput", handler => handler(view,from,to,character,insert))) view.dispatch(insert());
     model.apply(view.state.doc);
   }
 };
 test("shorthand: character-by-character typing creates marks without multiplying delimiters", () => {
   for (const [source, type, text] of [["==high==", "deditor_mark", "high"],["~2~","deditor_subscript","2"],["^2^","deditor_superscript","2"],["~~gone~~","strike_through","gone"]]) {
     const model=make("");inputInto(model,1,source);
     assert.equal(model.doc.firstChild!.textContent,text,source);assert.equal(model.doc.firstChild!.firstChild!.marks[0].type.name,type);
     assert.equal(make(model.source).doc.eq(model.doc),true);
   }
   const model=make("");inputInto(model,1,":smile:");assert.equal(model.doc.firstChild!.firstChild!.type.name,"deditor_emoji");assert.equal(model.source.trim(),":smile:");
 });
 test("reported heading bug: typed hashes set an absolute level across all 42 prior/target combinations", () => {
   for(let previous=0;previous<=6;previous++) for(let level=1;level<=6;level++) {
     const original=(previous ? "#".repeat(previous)+" " : "")+"Title\n\nTail\n";
     const model=make(original);inputInto(model,1,"#".repeat(level)+" ");
     assert.equal(model.doc.firstChild!.attrs.level,level,`H${previous} + ${level} hashes`);
     assert.equal(model.source,"#".repeat(level)+" Title\n\nTail\n");
     inputInto(model,1,"#".repeat(level)+" ");
     assert.equal(model.source,"#".repeat(level)+" Title\n\nTail\n","repeating a prefix never increments the level");
   }
 });
 test("reported heading bug: an empty paragraph or empty heading stays H1 after one hash", () => {
   for(const source of ["", "\n", "# ", "#### ", "###### "]) {
     const model=make(source);inputInto(model,1,"# ");
     assert.equal(model.doc.firstChild!.attrs.level,1);inputInto(model,1,"New title");
     assert.match(model.source,/^\s*# New title\s*$/);
   }
 });
 test("reported heading bug: seven hashes, mid-line hashes and code remain literal", () => {
   for(const [source,position,text] of [["Title\n",1,"####### "],["Title\n",3,"# "],["```\ncode\n```\n",1,"# "]] as const) {
     const model=make(source),type=model.doc.firstChild!.type.name;
     inputInto(model,position,text);assert.equal(model.doc.firstChild!.type.name,type);
     assert.equal(make(model.source).doc.firstChild!.textContent,model.doc.firstChild!.textContent);
   }
 });
 test("round 3: text edits with 2000 paragraphs preserve the full document", () => { const source = Array.from({ length: 2000 }, (_, i) => `Paragraph ${i} 中文`).join("\n\n"); const start = performance.now(); const model = make(source); const load = performance.now() - start; const edit = performance.now(); assert.equal(editText(model, "Paragraph 1777", "修改 1777"), source.replace("Paragraph 1777", "修改 1777")); console.log(`PERF 2000 blocks load=${load.toFixed(1)}ms edit=${(performance.now() - edit).toFixed(1)}ms`); });
});
test("round 3: source and visual share ordered undo/redo", () => { const s = new MarkdownSession("hello"); s.commit("hello visual", "visual", 0); s.commit("hello visual source", "source", 1); s.undo(); assert.equal(s.source, "hello visual"); s.undo(); assert.equal(s.source, "hello"); s.redo(); s.redo(); assert.equal(s.source, "hello visual source"); });
test("round 3: tab histories remain independent", () => { const a = new MarkdownSession("A"), b = new MarkdownSession("B"); a.commit("AA", "visual"); b.commit("BB", "source"); a.undo(); assert.equal(b.source, "BB"); assert.equal(a.source, "A"); });
test("round 4: external replacement clears stale history", () => { const s = new MarkdownSession("old"); s.commit("edited", "source"); s.sync("disk"); assert.equal(s.undo(), false); assert.equal(s.source, "disk"); });
test("round 4: divergent edits invalidate redo", () => { const s = new MarkdownSession("a"); s.commit("ab", "source"); s.undo(); s.commit("ac", "visual"); assert.equal(s.redo(), false); });
test("round 4: composition-like adjacent edits form one undo group", () => { const s = new MarkdownSession(""); s.commit("n", "visual", 0); s.commit("ni", "visual", 10); s.commit("你", "visual", 20); s.breakGroup(); s.commit("你好", "visual", 30); s.undo(); assert.equal(s.source, "你"); s.undo(); assert.equal(s.source, ""); });
test("IME history: long candidate pauses undo the complete word, never provisional pinyin", () => {
 for (const origin of ["visual", "source"] as const) {
  const s = new MarkdownSession("正文"); s.commit("正文前",origin,0);
  s.beginComposition(origin); s.commit("正文前n",origin,100); s.commit("正文前ni",origin,1400); s.commit("正文前你",origin,3000); s.endComposition();
  s.undo(); assert.equal(s.source,"正文前"); s.undo(); assert.equal(s.source,"正文"); s.redo(); s.redo(); assert.equal(s.source,"正文前你");
 }
});
test("IME history: cancellation creates no history and preserves redo", () => {
 const s = new MarkdownSession("正文"); s.commit("正文后","visual"); s.undo();
 s.beginComposition(); s.commit("正文zhong","visual"); s.commit("正文","visual"); s.endComposition();
 assert.equal(s.canUndo,false); assert.equal(s.canRedo,true); s.redo(); assert.equal(s.source,"正文后");
});
test("IME history: consecutive words, external replacement and command boundaries stay separate", () => {
 const s = new MarkdownSession(""); s.beginComposition(); s.commit("ni","visual"); s.commit("你","visual"); s.endComposition();
 s.beginComposition(); s.commit("你hao","visual"); s.commit("你好","visual"); s.endComposition();
 s.undo(); assert.equal(s.source,"你"); s.redo(); assert.equal(s.source,"你好");
 s.beginComposition(); s.commit("你好a","visual"); s.commit("# 你好a","command"); s.undo(); assert.equal(s.source,"你好a"); s.undo(); assert.equal(s.source,"你好");
 s.beginComposition(); s.commit("你好x","visual"); s.sync("磁盘"); s.endComposition(); assert.equal(s.undo(),false); assert.equal(s.source,"磁盘");
});
await crepe.destroy(); dom.window.close(); console.log(`${passed} Markdown visual tests passed`);
