import type { Node as ProseNode } from "@milkdown/kit/prose/model";

export interface MarkdownMatch { from: number; to: number; text?: string; captures?: (string | undefined)[]; groups?: Record<string, string> }
export interface MarkdownSearchOptions { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }

/** Expand captures only in regular-expression mode; literal replacement stays literal. */
export function markdownReplacement(match: MarkdownMatch, replacement: string, regex: boolean): string {
  if (!regex) return replacement;
  return replacement.replace(/\$(\$|&|[1-9][0-9]?|<[^>]+>)/g, (token, key: string) => {
    if (key === "$" ) return "$";
    if (key === "&") return match.text ?? "";
    if (key.startsWith("<")) return match.groups ? match.groups[key.slice(1, -1)] ?? "" : token;
    const n = Number(key), captures = match.captures ?? [];
    if (n <= captures.length) return captures[n - 1] ?? "";
    const first = Number(key[0]);
    return key.length === 2 && first <= captures.length ? (captures[first - 1] ?? "") + key[1] : token;
  });
}

/** Cache unchanged text blocks; results always use original UTF-16 document positions. */
export class MarkdownSearch {
  private key = "";
  private pattern: RegExp | null = null;
  private blocks = new WeakMap<ProseNode, MarkdownMatch[]>();
  error = false;

  find(doc: ProseNode, query: string, options: MarkdownSearchOptions = {}): MarkdownMatch[] {
    const key = JSON.stringify([query, !!options.caseSensitive, !!options.wholeWord, !!options.regex]);
    if (key !== this.key) {
      this.key = key; this.error = false; this.pattern = null;
      try { this.pattern = query ? new RegExp(options.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), options.caseSensitive ? "gu" : "giu") : null; }
      catch { this.error = true; }
      this.blocks = new WeakMap();
    }
    if (!this.pattern) return [];
    const pattern = this.pattern;
    const result: MarkdownMatch[] = [];
    const word = (value: string) => /[\p{L}\p{N}\p{M}_]/u.test(value);
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
        pattern.lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
          // Never replace an embedded object or turn a zero-width match into a broken selection.
          if (!match[0].length || match[0].includes("\ufffc")) continue;
          const index = match.index!, end = index + match[0].length;
          if (options.wholeWord) {
            const after = Array.from(text.slice(end, end + 2))[0] ?? "";
            if (word(Array.from(text.slice(Math.max(0, index - 2), index)).at(-1) ?? "") || word(after)) continue;
          }
          matches.push({ from: positions[index], to: positions[end - 1] + 1,
            ...(options.regex ? {text: match[0], captures: match.slice(1), groups: match.groups} : {}) });
        }
        this.blocks.set(node, matches);
      }
      for (const match of matches) result.push({ ...match, from: pos + 1 + match.from, to: pos + 1 + match.to });
      return false;
    });
    return result;
  }
}
