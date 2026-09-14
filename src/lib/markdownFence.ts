/**
 * Accept fence openers that were split with extra backticks or escaped while
 * being copied through rich text, for example `\``` ` ```html`. Both Markdown
 * parsers reject a backtick in the info string, so preview and visual reading
 * otherwise render the whole region as ordinary text.
 *
 * Replacements keep every line the same length. This is important because the
 * visual editor maps remark offsets back to the untouched source and must not
 * rewrite a compatible document merely by opening it.
 */
export function normalizeMarkdownFences(source: string): string {
  // Ordinary documents, including normal fenced code, stay on the existing
  // hot path without allocating an array of every source line.
  if (!/^ {0,3}(?:\\[\\` \t]*|`{3,}[\\` \t]+)[A-Za-z0-9_+#-]+[ \t]*\r?$/m.test(source)) return source;
  let fenceLength = 0;
  return source.split(/(?<=\n)/).map(part => {
    const newline = part.endsWith("\n") ? "\n" : "";
    const lineWithCr = newline ? part.slice(0, -1) : part;
    const cr = lineWithCr.endsWith("\r") ? "\r" : "";
    const line = cr ? lineWithCr.slice(0, -1) : lineWithCr;

    if (fenceLength) {
      const standardClose = line.match(/^ {0,3}(`{3,})[ \t]*$/);
      if (standardClose && standardClose[1].length >= fenceLength) fenceLength = 0;
      else {
        const tolerantClose = line.match(/^( {0,3})([\\` \t]+)$/);
        const ticks = tolerantClose?.[2].match(/`/g)?.length ?? 0;
        if (tolerantClose && ticks >= fenceLength) {
          const marker = tolerantClose[2];
          fenceLength = 0;
          return tolerantClose[1] + "`".repeat(Math.min(ticks, marker.length))
            + " ".repeat(Math.max(0, marker.length - ticks)) + cr + newline;
        }
      }
      return part;
    }

    const standardOpen = line.match(/^ {0,3}(`{3,})[^`]*$/);
    if (standardOpen) {
      fenceLength = standardOpen[1].length;
      return part;
    }

    const tolerantOpen = line.match(/^( {0,3})([\\` \t]+?)([A-Za-z0-9_+#-]+)([ \t]*)$/);
    if (!tolerantOpen) return part;
    const marker = tolerantOpen[2];
    const runs = marker.match(/`+/g) ?? [];
    const ticks = runs.reduce((count, run) => count + run.length, 0);
    if (ticks < 3) return part;
    // Requiring an escape or more than one run avoids touching valid fences.
    if (!marker.includes("\\") && runs.length < 2) return part;
    fenceLength = Math.max(3, runs[0]?.length ?? 0);
    const normalized = "`".repeat(fenceLength) + " ".repeat(marker.length - fenceLength);
    return tolerantOpen[1] + normalized + tolerantOpen[3] + tolerantOpen[4] + cr + newline;
  }).join("");
}
