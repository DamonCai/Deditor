/**
 * In-place text search/highlight for the markdown preview pane.
 *
 * Walks all text nodes under a root element, wraps occurrences of `query`
 * (case-insensitive) in <span class="preview-search-match"> nodes, and
 * returns them in document order so the caller can navigate prev/next and
 * mark a "current" one with `.current`.
 *
 * Skips text inside <svg> (mermaid / plantuml rendered diagrams — wrapping
 * pieces of their <text> nodes corrupts the SVG layout) and <script>/<style>.
 */

const MARK_CLASS = "preview-search-match";
const CURRENT_CLASS = "current";
// A result set owns its current marker. Navigation only changes the previous
// and next marker; scanning every hit makes repeated Enter expensive on long
// documents. Weak keys release replaced/closed searches without cleanup hooks.
const currentMatches = new WeakMap<HTMLSpanElement[], HTMLSpanElement | null>();

/** Remove every highlight from `root` and merge the surrounding text nodes
 *  back together. Idempotent — safe to call when no highlights exist. */
export function clearHighlights(root: HTMLElement): void {
  const marks = root.querySelectorAll<HTMLSpanElement>(`.${MARK_CLASS}`);
  if (marks.length === 0) return;
  marks.forEach((m) => {
    const parent = m.parentNode;
    if (!parent) return;
    while (m.firstChild) parent.insertBefore(m.firstChild, m);
    parent.removeChild(m);
  });
  // After unwrapping, adjacent text nodes need to be merged so subsequent
  // searches can find query strings that straddled the old mark boundary.
  root.normalize();
}

export interface SearchResult {
  /** Total number of matches found. */
  total: number;
  /** Matches in document order; caller picks one as "current" and may call
   *  `setCurrentMatch` to highlight + scroll to it. */
  matches: HTMLSpanElement[];
}

/** Apply a case-insensitive search for `query` under `root`, wrapping each
 *  occurrence in a `<span class="preview-search-match">`. Always clears any
 *  pre-existing highlights first so repeated calls are safe. */
export function applySearch(root: HTMLElement, query: string): SearchResult {
  clearHighlights(root);
  if (!query) return { total: 0, matches: [] };
  const lcQuery = query.toLowerCase();
  const qLen = query.length;
  const matches: HTMLSpanElement[] = [];

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // SVG <text>: splitting & wrapping breaks the rendered diagram. The
      // diagram source is held elsewhere (data attribute) and isn't part
      // of the user-visible prose anyway.
      if (parent.closest("svg, script, style")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  // Snapshot the matching text nodes BEFORE mutating — modifying the tree
  // mid-walk invalidates the walker.
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const text = node.nodeValue || "";
    const lcText = text.toLowerCase();
    let idx = lcText.indexOf(lcQuery, 0);
    if (idx === -1) continue;
    const parent = node.parentNode;
    if (!parent) continue;
    let cursor = 0;
    while (idx !== -1) {
      if (idx > cursor) {
        parent.insertBefore(
          document.createTextNode(text.slice(cursor, idx)),
          node,
        );
      }
      const mark = document.createElement("span");
      mark.className = MARK_CLASS;
      mark.textContent = text.slice(idx, idx + qLen);
      parent.insertBefore(mark, node);
      matches.push(mark);
      cursor = idx + qLen;
      idx = lcText.indexOf(lcQuery, cursor);
    }
    if (cursor < text.length) {
      parent.insertBefore(document.createTextNode(text.slice(cursor)), node);
    }
    parent.removeChild(node);
  }
  currentMatches.set(matches, null);
  return { total: matches.length, matches };
}

/** Mark the i-th match (if any) as `current` and scroll it into view. The
 *  scroll uses `block: "center"` so the user always sees context above and
 *  below the match instead of having it pinned at the very edge. */
export function setCurrentMatch(
  matches: HTMLSpanElement[],
  idx: number,
): void {
  if (!currentMatches.has(matches)) {
    // Support independently supplied result sets, including pre-marked hits.
    for (const match of matches) match.classList.remove(CURRENT_CLASS);
  }
  const previous = currentMatches.get(matches);
  const next = matches[idx] ?? null;
  if (previous !== next) {
    previous?.classList.remove(CURRENT_CLASS);
    next?.classList.add(CURRENT_CLASS);
  }
  currentMatches.set(matches, next);
  next?.scrollIntoView({ block: "center", behavior: "auto" });
}

/** Paint only the workspace result's block/occurrence, preserving syntax spans. */
export function highlightSourceHit(root: HTMLElement, source: string, line: number, column: number, length: number): HTMLSpanElement[] {
  clearHighlights(root);
  const lines = source.split("\n"), query = lines[line - 1]?.slice(column - 1, column - 1 + length);
  if (!query) return [];
  const markers = [...root.querySelectorAll<HTMLElement>("[data-line]")];
  let block: HTMLElement | undefined;
  for (const marker of markers) {
    const start = Number(marker.dataset.line);
    if (start <= line && (!block || start >= Number(block.dataset.line))) block = marker;
  }
  if (!block || block.matches(".mermaid-diagram, .plantuml-diagram, .html-render-block, .legacy-diagram")) return [];
  const startLine = Number(block.dataset.line) + (block.tagName === "PRE" ? 1 : 0);
  const endLine = Math.min(lines.length + 1, ...markers.map(marker => Number(marker.dataset.line)).filter(value => value > line));
  const prefix = lines.slice(startLine - 1, line - 1).join("\n") + "\n" + lines[line - 1].slice(0, column - 1);
  let ordinal = 0, offset = 0;
  while ((offset = prefix.indexOf(query, offset)) >= 0) { ordinal++; offset += query.length; }
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest("svg, script, style, iframe") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: {node: Text; from: number; to: number}[] = [];
  let text = "";
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    nodes.push({node, from: text.length, to: text.length + node.length}); text += node.data;
  }
  // Source-only matches (URLs, formatting, attributes) have no visible range.
  // Avoid assigning their occurrence number to another rendered occurrence.
  const count = (value: string) => value.split(query).length - 1;
  if (count(text) !== count(lines.slice(startLine - 1, endLine - 1).join("\n"))) return [];
  let from = -query.length;
  for (let i = 0; i <= ordinal; i++) {
    from = text.indexOf(query, from + query.length);
    if (from < 0) return [];
  }
  const marks: HTMLSpanElement[] = [];
  for (const item of nodes) {
    const start = Math.max(from, item.from) - item.from, end = Math.min(from + query.length, item.to) - item.from;
    if (start >= end) continue;
    const matching = item.node.splitText(start); matching.splitText(end - start);
    const mark = document.createElement("span"); mark.className = `${MARK_CLASS} ${CURRENT_CLASS}`;
    matching.replaceWith(mark); mark.append(matching); marks.push(mark);
  }
  return marks;
}
