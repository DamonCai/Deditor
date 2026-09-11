import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { MarkdownSession } from "../src/lib/markdownSession";
const dom = new JSDOM('<!doctype html><html><body><div id="editor"></div></body></html>', { url: "http://localhost", pretendToBeVisual: true });
for (const name of ["window", "document", "Node", "HTMLElement", "Element", "MutationObserver", "DOMParser", "DOMRect", "Text", "SVGElement", "HTMLInputElement", "HTMLDivElement", "HTMLButtonElement", "CustomEvent", "Event"] as const) Object.defineProperty(globalThis, name, { value: dom.window[name], configurable: true });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
Object.assign(globalThis, { getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), ResizeObserver: class { observe() {} unobserve() {} disconnect() {} }, IntersectionObserver: class { observe() {} unobserve() {} disconnect() {} } });
Object.assign(globalThis, { addEventListener: dom.window.addEventListener.bind(dom.window), removeEventListener: dom.window.removeEventListener.bind(dom.window), dispatchEvent: dom.window.dispatchEvent.bind(dom.window) });
const { CrepeBuilder } = await import("@milkdown/crepe/builder");
const { codeMirror } = await import("@milkdown/crepe/feature/code-mirror");
const { imageBlock } = await import("@milkdown/crepe/feature/image-block");
const { faithfulLink } = await import("../src/lib/markdownVisual/references");
const { faithfulImage } = await import("../src/lib/markdownVisual/image");
const { latex } = await import("@milkdown/crepe/feature/latex");
const { parserCtx, serializerCtx } = await import("@milkdown/kit/core");
const { remarkInlineLinkPlugin, remarkPreserveEmptyLinePlugin } = await import("@milkdown/kit/preset/commonmark");
const { extendedTableCells } = await import("../src/lib/markdownVisual/tableLists");
const { inlineSchemas, faithfulInlineHtml, configureInlineSerialization } = await import("../src/lib/markdownVisual/inline");
const { rawSchema, rawRemark, frontmatter } = await import("../src/lib/markdownVisual/raw");
const { MarkdownDocument } = await import("../src/lib/markdownVisual/document");
const { EditorState } = await import("@milkdown/kit/prose/state");
const { history } = await import("@milkdown/kit/plugin/history");
const { trailing } = await import("@milkdown/kit/plugin/trailing");
const crepe = new CrepeBuilder({ root: document.querySelector("#editor") }).addFeature(codeMirror).addFeature(latex).addFeature(imageBlock);
crepe.editor.use(faithfulLink).use(faithfulInlineHtml).use(faithfulImage).use(extendedTableCells.flat()).use(inlineSchemas.flat()).config(configureInlineSerialization).use(frontmatter).use(rawRemark(false)).use(rawSchema);
await crepe.editor.remove(remarkInlineLinkPlugin.plugin); await crepe.editor.remove(remarkPreserveEmptyLinePlugin.plugin);
await crepe.editor.remove(history); await crepe.editor.remove(trailing); await crepe.create();
let passed = 0;
const test = (name: string, fn: () => void) => { fn(); passed++; console.log(`PASS ${name}`); };
crepe.editor.action(ctx => {
 const parse = ctx.get(parserCtx), serialize = ctx.get(serializerCtx);
 const make = (source: string) => new MarkdownDocument(source, parse, serialize);
 const editText = (model: InstanceType<typeof MarkdownDocument>, text: string, replacement: string) => {
   let position = -1; model.doc.descendants((node, pos) => { if (position < 0 && node.isText && node.text!.includes(text)) position = pos + node.text!.indexOf(text); });
   assert(position >= 0, `Find ${text}`);
   const state = EditorState.create({ doc: model.doc });
   const tr = state.tr.insertText(replacement, position, position + text.length);
   return model.apply(tr.doc);
 };
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
 test("round 3: text edits with 2000 paragraphs preserve the full document", () => { const source = Array.from({ length: 2000 }, (_, i) => `Paragraph ${i} 中文`).join("\n\n"); const start = performance.now(); const model = make(source); const load = performance.now() - start; const edit = performance.now(); assert.equal(editText(model, "Paragraph 1777", "修改 1777"), source.replace("Paragraph 1777", "修改 1777")); console.log(`PERF 2000 blocks load=${load.toFixed(1)}ms edit=${(performance.now() - edit).toFixed(1)}ms`); });
});
test("round 3: source and visual share ordered undo/redo", () => { const s = new MarkdownSession("hello"); s.commit("hello visual", "visual", 0); s.commit("hello visual source", "source", 1); s.undo(); assert.equal(s.source, "hello visual"); s.undo(); assert.equal(s.source, "hello"); s.redo(); s.redo(); assert.equal(s.source, "hello visual source"); });
test("round 3: tab histories remain independent", () => { const a = new MarkdownSession("A"), b = new MarkdownSession("B"); a.commit("AA", "visual"); b.commit("BB", "source"); a.undo(); assert.equal(b.source, "BB"); assert.equal(a.source, "A"); });
test("round 4: external replacement clears stale history", () => { const s = new MarkdownSession("old"); s.commit("edited", "source"); s.sync("disk"); assert.equal(s.undo(), false); assert.equal(s.source, "disk"); });
test("round 4: divergent edits invalidate redo", () => { const s = new MarkdownSession("a"); s.commit("ab", "source"); s.undo(); s.commit("ac", "visual"); assert.equal(s.redo(), false); });
test("round 4: composition-like adjacent edits form one undo group", () => { const s = new MarkdownSession(""); s.commit("n", "visual", 0); s.commit("ni", "visual", 10); s.commit("你", "visual", 20); s.breakGroup(); s.commit("你好", "visual", 30); s.undo(); assert.equal(s.source, "你"); s.undo(); assert.equal(s.source, ""); });
await crepe.destroy(); dom.window.close(); console.log(`${passed} Markdown visual tests passed`);
