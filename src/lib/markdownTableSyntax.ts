/** Display-only compatibility for table cells copied from document editors.
 * Every virtual character boundary maps back to the untouched Markdown source. */
export const tableListStart = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+/;

export function tableCellSource(source: string, breaks: Array<[number, number]>) {
  const ends = new Map(breaks);
  let text = ""; const offsets = [0];
  for (let cursor = 0; cursor < source.length;) {
    const end = ends.get(cursor);
    if (end !== undefined) { text += "\n"; cursor = end; }
    else text += source[cursor++];
    offsets.push(cursor);
  }
  const removed = new Set<number>(), spaces = new Set<number>();
  let lineStart = 0;
  for (const line of text.split("\n")) {
    const match = /^([ \t]*)(\\?[-+*]|\d{1,9}[.)])([ \t\u00a0]+)/.exec(line);
    if (match && match[3].includes("\u00a0")) {
      // Ordinary escaped markers ("\\- text") remain literal. The imported
      // escaped-marker + NBSP spelling is the compatibility case.
      if (match[2].startsWith("\\")) removed.add(lineStart + match[1].length);
      const start = lineStart + match[1].length + match[2].length;
      for (let i = start; i < lineStart + match[0].length; i++) if (text[i] === "\u00a0") spaces.add(i);
    }
    lineStart += line.length + 1;
  }
  let normalized = ""; const mapped = [0];
  for (let i = 0; i < text.length; i++) {
    if (removed.has(i)) continue;
    normalized += spaces.has(i) ? " " : text[i]; mapped.push(offsets[i + 1]);
  }
  return { text: normalized, offsets: mapped };
}

/** Plain bold labels ending in CJK punctuation can directly precede prose.
 * Other inline syntax, escaped stars and whitespace remain the parser's job. */
export function tableCjkStrongAt(source: string, at: number) {
  if (source[at] !== "*" || source[at + 1] !== "*") return null;
  if (at && /[\\*]/.test(source[at - 1])) return null;
  const match = /^\*\*([^*_~`\\<>\[\]&\r\n]+)\*\*(?=[\p{L}\p{N}])/u.exec(source.slice(at));
  if (!match || match[1].trim() !== match[1] || !/[：；，。！？、）】》」』〕〉］｝]$/.test(match[1])) return null;
  return { label: match[1], length: match[0].length };
}
