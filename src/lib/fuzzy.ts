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

/** True if every char in s is ASCII (0–127). When BOTH query and target are
 *  ASCII we can compare via char-code arithmetic; otherwise we need
 *  String.prototype.toLowerCase, which handles Unicode case folding (é→e,
 *  Φ→φ, etc.) at the cost of allocating two strings. */
function isPureAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return false;
  return true;
}

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const qlen = query.length;
  if (qlen === 0) return { score: 0, matchedIdx: [] };
  const tlen = target.length;
  if (qlen > tlen) return null;

  // If either side has non-ASCII, fold via toLowerCase so accented Latin
  // chars (École, naïve, …) still match against ASCII queries. We pay one
  // allocation per call but only for the (rare) Unicode path.
  const pureAscii = isPureAscii(query) && isPureAscii(target);
  const ql = pureAscii ? query : query.toLowerCase();
  const tl = pureAscii ? target : target.toLowerCase();

  // First pass: subsequence check on char codes only, NO allocation. The
  // pureAscii path uses `toLowerCode` (ASCII case-fold via | 0x20). The
  // Unicode path consults already-lowercased strings.
  {
    let qi = 0;
    let qc = pureAscii ? toLowerCode(ql.charCodeAt(0)) : ql.charCodeAt(0);
    for (let ti = 0; ti < tlen; ti++) {
      const tc = pureAscii ? toLowerCode(tl.charCodeAt(ti)) : tl.charCodeAt(ti);
      if (tc === qc) {
        qi++;
        if (qi === qlen) break;
        qc = pureAscii ? toLowerCode(ql.charCodeAt(qi)) : ql.charCodeAt(qi);
      }
    }
    if (qi < qlen) return null;
  }

  // Second pass: we now know it matches; collect indices and score.
  const matched: number[] = new Array(qlen);
  let mi = 0;
  let qi = 0;
  let qc = pureAscii ? toLowerCode(ql.charCodeAt(0)) : ql.charCodeAt(0);
  let qcOrig = query.charCodeAt(0);
  let lastMatchAt = -2;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < tlen && qi < qlen; ti++) {
    const tcOrig = target.charCodeAt(ti);
    const tc = pureAscii ? toLowerCode(tl.charCodeAt(ti)) : tl.charCodeAt(ti);
    if (tc !== qc) continue;
    matched[mi++] = ti;
    if (ti === 0 || isBoundaryCode(target.charCodeAt(ti - 1))) score += 10;
    if (tcOrig === qcOrig) score += 2;
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
      qc = pureAscii ? toLowerCode(ql.charCodeAt(qi)) : ql.charCodeAt(qi);
    }
  }

  // Whole-prefix bonus (compare first qlen chars; Unicode-safe via the
  // lowercased mirrors when needed).
  let isPrefix = true;
  for (let i = 0; i < qlen; i++) {
    const a = pureAscii ? toLowerCode(tl.charCodeAt(i)) : tl.charCodeAt(i);
    const b = pureAscii ? toLowerCode(ql.charCodeAt(i)) : ql.charCodeAt(i);
    if (a !== b) {
      isPrefix = false;
      break;
    }
  }
  if (isPrefix) score += 30;
  score -= matched[0] ?? 0;
  score -= tlen / 50;

  return { score, matchedIdx: matched };
}
