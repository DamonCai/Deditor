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
  return { total: matches.length, matches };
}

/** Mark the i-th match (if any) as `current` and scroll it into view. The
 *  scroll uses `block: "center"` so the user always sees context above and
 *  below the match instead of having it pinned at the very edge. */
export function setCurrentMatch(
  matches: HTMLSpanElement[],
  idx: number,
): void {
  for (let i = 0; i < matches.length; i++) {
    matches[i].classList.toggle(CURRENT_CLASS, i === idx);
  }
  if (idx >= 0 && idx < matches.length) {
    matches[idx].scrollIntoView({ block: "center", behavior: "auto" });
  }
}
