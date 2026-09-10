import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkFrontmatter from "remark-frontmatter";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { sourceChange } from "../markdownSession";

export interface SourceNode {
  type: string; value?: string; children?: SourceNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}
const syntax = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkFrontmatter, ["yaml", "toml"]);
export function sourceTree(source: string): SourceNode { return syntax.parse(source) as SourceNode; }
const protectedTypes = new Set(["html", "definition", "linkReference", "imageReference", "yaml", "toml", "footnoteDefinition", "footnoteReference"]);
export function protectedBlock(node: SourceNode): boolean {
  return protectedTypes.has(node.type) || !!node.children?.some(protectedBlock);
}
export function range(node: SourceNode): [number, number] {
  return [node.position?.start.offset ?? 0, node.position?.end.offset ?? 0];
}
export function protectedTree(tree: SourceNode, source: string, mdx: boolean) {
  if (mdx && source) tree.children = [{ type: "deditorRaw", value: source }];
  else tree.children = tree.children?.map(node => protectedBlock(node)
    ? { type: "deditorRaw", value: source.slice(...range(node)), position: node.position } : node);
}
function children(node: ProseNode) { const result: ProseNode[] = []; node.forEach(n => result.push(n)); return result; }
function sameStructure(a: ProseNode, b: ProseNode): boolean {
  if (!a.sameMarkup(b) || a.childCount !== b.childCount) return false;
  return a.isText || children(a).every((n, i) => sameStructure(n, b.child(i)));
}
/** Text-only edits use original token offsets, retaining list markers, escapes and CRLF. */
function patchText(raw: string, ast: SourceNode, before: ProseNode, after: ProseNode): string | null {
  if (!sameStructure(before, after)) return null;
  const leaves: SourceNode[] = [];
  const walk = (n: SourceNode) => { if (["text", "inlineCode", "code", "math"].includes(n.type)) leaves.push(n); else n.children?.forEach(walk); };
  walk(ast);
  const oldText: string[] = [], newText: string[] = [];
  before.descendants(n => { if (n.isText) oldText.push(n.text!); });
  after.descendants(n => { if (n.isText) newText.push(n.text!); });
  if (leaves.length !== oldText.length || oldText.length !== newText.length) return null;
  const base = range(ast)[0];
  const edits: { from: number; to: number; insert: string }[] = [];
  for (let i = 0; i < leaves.length; i++) {
    if (oldText[i] === newText[i]) continue;
    const leaf = leaves[i], [start, end] = range(leaf);
    const token = raw.slice(start - base, end - base);
    const value = leaf.value ?? "";
    if (value !== oldText[i]) return null;
    // Never guess through escapes/entities, indentation, or ambiguous fence content.
    let inner = token === value ? 0 : -1;
    if (leaf.type === "inlineCode") inner = token.indexOf(value);
    if (leaf.type === "code" || leaf.type === "math") inner = token.indexOf(value, token.indexOf("\n") + 1);
    if (inner < 0 || token.slice(inner, inner + value.length) !== value) return null;
    const diff = sourceChange(value, newText[i]);
    edits.push({ from: start - base + inner + diff.from, to: start - base + inner + diff.from + diff.removed.length, insert: diff.inserted });
  }
  for (const e of edits.reverse()) raw = raw.slice(0, e.from) + e.insert + raw.slice(e.to);
  return raw;
}

function patchTasks(raw: string, ast: SourceNode, before: ProseNode, after: ProseNode): string | null {
  if (before.textContent !== after.textContent) return null;
  const oldItems: ProseNode[] = [], newItems: ProseNode[] = [], items: SourceNode[] = [];
  before.descendants(n => { if (n.type.name === "list_item") oldItems.push(n); });
  after.descendants(n => { if (n.type.name === "list_item") newItems.push(n); });
  const walk = (n: SourceNode) => { if (n.type === "listItem") items.push(n); n.children?.forEach(walk); }; walk(ast);
  if (!oldItems.length || oldItems.length !== newItems.length || items.length !== oldItems.length) return null;
  const base = range(ast)[0];
  for (let i = items.length - 1; i >= 0; i--) {
    if (oldItems[i].attrs.checked === newItems[i].attrs.checked) continue;
    const start = range(items[i])[0] - base;
    const match = raw.slice(start).match(/^(?:[-+*]|\d+[.)])\s+\[([ xX])\]/);
    if (!match || typeof newItems[i].attrs.checked !== "boolean") return null;
    const at = start + match[0].length - 2;
    raw = raw.slice(0, at) + (newItems[i].attrs.checked ? "x" : " ") + raw.slice(at + 1);
  }
  return raw;
}

/** Keeps original source ranges; only the transaction's changed blocks are serialized. */
export class MarkdownDocument {
  source: string;
  doc: ProseNode;
  private ast: SourceNode[] = [];
  constructor(source: string, private parse: (source: string) => ProseNode, private serialize: (doc: ProseNode) => string, private mdx = false, initialDoc?: ProseNode) {
    this.source = source; this.doc = initialDoc ?? parse(source); this.index();
  }
  private index() {
    this.ast = this.mdx && this.source ? [{ type: "deditorRaw", value: this.source, position: { start: { offset: 0 }, end: { offset: this.source.length } } }] : sourceTree(this.source).children ?? [];
    if (this.ast.length > this.doc.childCount) throw new Error("Markdown source ranges do not match the editable document");
    // Crepe may append an empty paragraph for a terminal table/code/atom.
    while (this.ast.length < this.doc.childCount) this.ast.push({ type: "paragraph", position: { start: { offset: this.source.length }, end: { offset: this.source.length } } });
  }
  reset(source: string) { this.source = source; this.doc = this.parse(source); this.index(); return this.doc; }
  apply(next: ProseNode): string {
    if (next.eq(this.doc)) return this.source;
    const before = children(this.doc), after = children(next);
    let first = 0;
    while (first < before.length && first < after.length && before[first].eq(after[first])) first++;
    let oldEnd = before.length, newEnd = after.length;
    while (oldEnd > first && newEnd > first && before[oldEnd - 1].eq(after[newEnd - 1])) { oldEnd--; newEnd--; }
    const from = first < this.ast.length ? range(this.ast[first])[0] : this.source.length;
    const to = oldEnd > first ? range(this.ast[oldEnd - 1])[1] : from;
    const eol = this.source.includes("\r\n") ? "\r\n" : "\n";
    const changed = after.slice(first, newEnd);
    const serializeBlock = (block: ProseNode) => block.type.name === "deditor_raw" ? block.textContent : this.serialize(next.type.create(null, block)).replace(/\n$/, "").replace(/\r?\n/g, eol);
    let parts = changed.map(serializeBlock);
    if (oldEnd - first === 1 && changed.length === 1 && changed[0].type.name !== "deditor_raw") {
      const raw = this.source.slice(from, to);
      const patched = patchText(raw, this.ast[first], before[first], changed[0]) ?? patchTasks(raw, this.ast[first], before[first], changed[0]);
      if (patched !== null) {
        // A literal '*' or a newline must not turn into unintended Markdown
        // when saved. Only retain token spelling if it reparses equivalently.
        const reparsed = this.parse(patched);
        const expected = this.serialize(next.type.create(null, changed[0]));
        if (this.serialize(reparsed) === expected) parts = [patched];
      }
    }
    let replacement = parts.join(eol + eol), leading = "", trailing = "";
    if (oldEnd === first && replacement) {
      if (from > 0 && !this.source.slice(0, from).endsWith(eol + eol)) leading = eol + eol;
      if (from < this.source.length) trailing = eol + eol;
    }
    replacement = leading + replacement + trailing;
    const delta = replacement.length - (to - from);
    const shifted = (node: SourceNode, offset: number): SourceNode => ({ ...node,
      position: node.position ? { start: { offset: (node.position.start.offset ?? 0) + offset }, end: { offset: (node.position.end.offset ?? 0) + offset } } : undefined,
      children: node.children?.map(child => shifted(child, offset)),
    });
    let cursor = from + leading.length;
    const spans = parts.map((part, index) => {
      const parsed = sourceTree(part).children ?? [];
      const ast = changed[index].type.name !== "deditor_raw" && parsed.length === 1
        ? shifted(parsed[0], cursor)
        : { type: "deditorRaw", position: { start: { offset: cursor }, end: { offset: cursor + part.length } } };
      cursor += part.length + eol.length * 2;
      return ast;
    });
    this.ast = [...this.ast.slice(0, first), ...spans, ...this.ast.slice(oldEnd).map(node => shifted(node, delta))];
    this.source = this.source.slice(0, from) + replacement + this.source.slice(to);
    this.doc = next;
    return this.source;
  }
  private textRanges(node: ProseNode, index: number, start: number) {
    const ast = this.ast[index], leaves: SourceNode[] = [];
    if (!ast) return [];
    const walk = (n: SourceNode) => { if (["text", "inlineCode", "code", "math"].includes(n.type)) leaves.push(n); else n.children?.forEach(walk); }; walk(ast);
    const prose: { text: string; pos: number }[] = [];
    node.descendants((child, pos) => { if (child.isText) prose.push({ text: child.text!, pos: start + pos + 1 }); });
    if (leaves.length !== prose.length) return [];
    return leaves.flatMap((leaf, i) => {
      const [from, to] = range(leaf), text = prose[i];
      if (leaf.value !== text.text) return [];
      const at = this.source.slice(from, to).indexOf(text.text);
      return at < 0 ? [] : [{ from: from + at, to: from + at + text.text.length, pos: text.pos }];
    });
  }
  sourceOffset(position: number) {
    let found = this.source.length;
    this.doc.forEach((node, offset, index) => {
      if (position >= offset && position <= offset + node.nodeSize && this.ast[index]) {
        const [from, to] = range(this.ast[index]);
        found = Math.min(to, from + Math.max(0, position - offset - 1));
        const segment = this.textRanges(node, index, offset).find(r => position >= r.pos && position <= r.pos + r.to - r.from);
        if (segment) found = segment.from + position - segment.pos;
      }
    });
    return found;
  }
  positionAtSource(offset: number) {
    let pos = 1;
    this.doc.forEach((node, start, index) => {
      const [from, to] = this.ast[index] ? range(this.ast[index]) : [0, 0];
      if (offset >= from && (offset <= to || index === this.doc.childCount - 1)) {
        pos = start + Math.min(node.nodeSize - 1, Math.max(1, offset - from + 1));
        const segment = this.textRanges(node, index, start).find(r => offset >= r.from && offset <= r.to);
        if (segment) pos = segment.pos + offset - segment.from;
      }
    });
    return Math.min(this.doc.content.size, Math.max(0, pos));
  }
}
