/** Fuzzy subsequence match used by the Goto Anything palette.
 *
 *  The matcher requires every character of `query` to appear in `target` in
 *  order, but doesn't require them to be contiguous. Returns null when no
 *  such subsequence exists. When it matches, the score boosts:
 *    - matches at word boundaries (after `/`, `_`, `-`, `.`, ` `)
 *    - consecutive runs (typing "edit" should rank "Editor" above "Eat dirt")
 *    - case-exact hits over case-folded ones
 *    - prefix matches at the start of the target
 *  And penalizes:
 *    - skipping a lot of chars before the first match (later first-match = worse)
 *    - target length (very long paths shouldn't beat short ones at equal match)
 *
 *  This is intentionally simple and dependency-free; it's fine for tens of
 *  thousands of items because we walk the target string once per item.
 */

export interface FuzzyMatch {
  score: number;
  /** Indices in `target` that matched a query char, in order — used for
   *  rendering highlights in the result list. */
  matchedIdx: number[];
}

// Boundary chars (./_\-, space) by char code — faster than regex.test() in
// a per-char hot loop at 50k×N cost.
const BC_SLASH = 0x2f;
const BC_BACKSLASH = 0x5c;
const BC_DASH = 0x2d;
const BC_UNDERSCORE = 0x5f;
const BC_DOT = 0x2e;
const BC_SPACE = 0x20;

function isBoundaryCode(c: number): boolean {
  return c === BC_SLASH || c === BC_BACKSLASH || c === BC_DASH
      || c === BC_UNDERSCORE || c === BC_DOT || c === BC_SPACE;
}

/** True if `c` is an uppercase ASCII letter. */
function isUpper(c: number): boolean {
  return c >= 0x41 && c <= 0x5a;
}
/** Lowercase an ASCII code; non-ASCII falls through. */
function toLowerCode(c: number): number {
  return isUpper(c) ? c | 0x20 : c;
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const qlen = query.length;
  if (qlen === 0) return { score: 0, matchedIdx: [] };
  const tlen = target.length;
  if (qlen > tlen) return null;

  // First pass: subsequence check on char codes only, NO allocation. This
  // is the early-out for the vast majority of (target, query) pairs in
  // a 50k-file workspace — Cmd+P typing a single char like 't' will hit
  // many candidates but reject many more, and we want the reject path
  // to be essentially free (no array alloc, no boundary scoring).
  {
    let qi = 0;
    let qc = toLowerCode(query.charCodeAt(0));
    for (let ti = 0; ti < tlen; ti++) {
      if (toLowerCode(target.charCodeAt(ti)) === qc) {
        qi++;
        if (qi === qlen) break;
        qc = toLowerCode(query.charCodeAt(qi));
      }
    }
    if (qi < qlen) return null;
  }

  // Second pass: we now know it matches; collect indices and score.
  const matched: number[] = new Array(qlen);
  let mi = 0;
  let qi = 0;
  let qc = toLowerCode(query.charCodeAt(0));
  let qcOrig = query.charCodeAt(0);
  let lastMatchAt = -2;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < tlen && qi < qlen; ti++) {
    const tc = target.charCodeAt(ti);
    if (toLowerCode(tc) !== qc) continue;
    matched[mi++] = ti;
    // Boundary bonus (the char BEFORE this match is a boundary)
    if (ti === 0 || isBoundaryCode(target.charCodeAt(ti - 1))) score += 10;
    // Case-exact bonus
    if (tc === qcOrig) score += 2;
    // Consecutive bonus, scaled by streak length
    if (lastMatchAt === ti - 1) {
      streak++;
      score += 4 + streak;
    } else {
      streak = 0;
    }
    lastMatchAt = ti;
    qi++;
    if (qi < qlen) {
      qcOrig = query.charCodeAt(qi);
      qc = toLowerCode(qcOrig);
    }
  }

  // Whole-prefix bonus (cheap: compare first qlen chars)
  let isPrefix = true;
  for (let i = 0; i < qlen; i++) {
    if (toLowerCode(target.charCodeAt(i)) !== toLowerCode(query.charCodeAt(i))) {
      isPrefix = false;
      break;
    }
  }
  if (isPrefix) score += 30;
  // Earlier first match is better; later one means the query is buried.
  score -= matched[0] ?? 0;
  // Slight penalty for very long targets so a 200-char path can't accidentally
  // outscore a tight match in a short path.
  score -= tlen / 50;

  return { score, matchedIdx: matched };
}
