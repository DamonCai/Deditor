import type { Node as ProseNode } from "@milkdown/kit/prose/model";

export interface MarkdownMatch { from: number; to: number }

/** Cache unchanged text blocks; results always use original UTF-16 document positions. */
export class MarkdownSearch {
  private query = "";
  private pattern: RegExp | null = null;
  private blocks = new WeakMap<ProseNode, MarkdownMatch[]>();

  find(doc: ProseNode, query: string): MarkdownMatch[] {
    if (query !== this.query) {
      this.query = query;
      this.pattern = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu") : null;
      this.blocks = new WeakMap();
    }
    if (!this.pattern) return [];
    const result: MarkdownMatch[] = [];
    doc.descendants((node, pos) => {
      if (!node.isTextblock) return;
      let matches = this.blocks.get(node);
      if (!matches) {
        let text = "";
        const positions: number[] = [];
        node.descendants((child, offset) => {
          const value = child.isText ? child.text! : child.isLeaf ? "\ufffc" : "";
          text += value;
          for (let index = 0; index < value.length; index++) positions.push(offset + index);
        });
        matches = [];
        this.pattern!.lastIndex = 0;
        for (const match of text.matchAll(this.pattern!)) {
          matches.push({ from: positions[match.index!], to: positions[match.index! + match[0].length - 1] + 1 });
        }
        this.blocks.set(node, matches);
      }
      for (const match of matches) result.push({ from: pos + 1 + match.from, to: pos + 1 + match.to });
      return false;
    });
    return result;
  }
}
