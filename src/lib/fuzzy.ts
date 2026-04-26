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

const BOUNDARY_RE = /[\\/\-_. ]/;

export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query) return { score: 0, matchedIdx: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const matched: number[] = [];
  let qi = 0;
  let lastMatchAt = -2;
  let score = 0;
  let streak = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t.charCodeAt(ti) !== q.charCodeAt(qi)) continue;
    matched.push(ti);
    // Boundary bonus
    if (ti === 0 || BOUNDARY_RE.test(target[ti - 1])) score += 10;
    // Case-exact bonus
    if (target.charCodeAt(ti) === query.charCodeAt(qi)) score += 2;
    // Consecutive bonus, scaled by streak length
    if (lastMatchAt === ti - 1) {
      streak++;
      score += 4 + streak;
    } else {
      streak = 0;
    }
    lastMatchAt = ti;
    qi++;
  }

  if (qi < q.length) return null;

  // Whole-prefix bonus
  if (t.startsWith(q)) score += 30;
  // Earlier first match is better; later one means the query is buried.
  score -= matched[0] ?? 0;
  // Slight penalty for very long targets so a 200-char path can't accidentally
  // outscore a tight match in a short path.
  score -= target.length / 50;

  return { score, matchedIdx: matched };
}
