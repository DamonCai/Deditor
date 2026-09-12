import { orderFootnoteTree } from "./markdownVisual/footnoteOrder";
import type { KatexOptions } from "katex";
import { sourceTree, type SourceNode } from "./markdownVisual/document";
type MathContext = { labels: Map<string, string>; blocks: {source: string; number: string; labels: string[]}[] };
const contexts: {key: string; value: MathContext}[] = [];
export function markdownMathContext(source: string): MathContext {
  // Prose edits do not invalidate mathematical numbering. Parse only when math changes.
  const key = JSON.stringify([source.match(/^[^\n]*\$\$[\s\S]*?\$\$[^\n]*$|^[ \t>]*(?:`{3,}|~{3,}).*$/gm), source.match(/\[\^[^\]]+\]/g)]);
  const found = contexts.find(item => item.key === key); if (found) return found.value;
  const value: MathContext = {labels: new Map(), blocks: []};
  const visit = (node: SourceNode) => {
    if (node.type === "math") {
      const raw = node.value ?? "", labels = Array.from(raw.matchAll(/\\label\{([^{}]+)\}/g), match => match[1]);
      const number = raw.match(/\\tag\*?\{([^{}]+)\}/)?.[1] ?? String(value.blocks.length + 1);
      value.blocks.push({source:raw, number, labels});
      labels.forEach(label => {if (!value.labels.has(label)) value.labels.set(label, number);});
    }
    node.children?.forEach(visit);
  };
  const tree = sourceTree(source); orderFootnoteTree(tree); visit(tree); contexts.unshift({key,value}); if(contexts.length>4)contexts.pop(); return value;
}
const escapeHtml = (text: string) => text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
let engine: typeof import("katex").default | undefined;
let loading: Promise<void> | undefined;
export function loadMarkdownMath() {
  return loading ??= Promise.all([import("katex"), import("katex/contrib/mhchem")]).then(([module]) => {engine=module.default;});
}
export function markdownMathHtml(latex: string, display: boolean, documentSource = "", autoNumber = false, ordinal?: number) {
  if (!engine) throw new Error("Math renderer is not initialized");
  const context = /\\(?:label|eqref|ref)\{|\$\$/.test(documentSource) ? markdownMathContext(documentSource) : {labels:new Map<string,string>(),blocks:[]};
  const ownLabels = Array.from(latex.matchAll(/\\label\{([^{}]+)\}/g), match => match[1]);
  let code = latex.replace(/\\label\{[^{}]+\}/g, "").replace(/\\(eqref|ref)\{([^{}]+)\}/g, (_match, kind: string, label: string) => {
    const number = context.labels.get(label);
    if (!number) return "\\text{??}";
    const safe = number.replace(/[{}\\]/g, "");
    return `\\href{#md-equation-${encodeURIComponent(label)}}{\\text{${kind === "eqref" ? `(${safe})` : safe}}}`;
  });
  if (display && autoNumber && !/\\tag\*?\{/.test(code)) {
    const block = ordinal === undefined ? context.blocks.find(block => block.source.trim() === latex.trim()) : context.blocks[ordinal];
    if (block) code += `\\tag{${block.number.replace(/[{}\\]/g, "")}}`;
  }
  const options: KatexOptions = {throwOnError:false, displayMode:display, trust: context => context.command === "\\href" && typeof context.url === "string" && context.url.startsWith("#md-equation-")};
  const html = engine.renderToString(code, options);
  const anchors = ownLabels.map(label => `<span id="md-equation-${escapeHtml(encodeURIComponent(label))}"></span>`).join("");
  return display ? `<p class="katex-block">${anchors}${html}</p>` : html;
}
