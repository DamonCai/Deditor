// SQL beautifier. Wraps `sql-formatter` (battle-tested tokenizer — it never
// drops or reorders tokens, only changes whitespace) and exposes three
// well-accepted layout styles plus their post-processing.
//
// `sql-formatter` is a sizable dependency, so it's imported LAZILY inside the
// transforms — the cold bundle never pays for it; the chunk loads the first
// time a user clicks a SQL toolbar button (mirrors how format.ts / highlight.ts
// lazy-load prettier / shiki).

type SqlFormatterModule = typeof import("sql-formatter");

let formatterPromise: Promise<SqlFormatterModule> | null = null;
function loadFormatter(): Promise<SqlFormatterModule> {
  if (!formatterPromise) formatterPromise = import("sql-formatter");
  return formatterPromise;
}

/** The layout styles surfaced as toolbar buttons. */
export type SqlStyle = "river" | "tabular" | "compact" | "minify";

/**
 * Collapse pure comma-separated leaf lists that `sql-formatter`'s "standard"
 * style breaks one-item-per-line back onto a single line, while leaving clause
 * keywords and AND/OR structure untouched. SAFE by construction: it only joins
 * sibling lines that are already at the same indent and individually bracket-
 * balanced, and only when the run terminates on a non-comma line (a complete
 * list). It never moves a token across a clause boundary or into/out of a
 * paren group, so no SQL is ever restructured — only whitespace collapses.
 */
function inlineLists(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  const indentOf = (s: string) => s.length - s.trimStart().length;
  const balanced = (s: string) => {
    let d = 0;
    for (const c of s) {
      if (c === "(") d++;
      else if (c === ")") d--;
    }
    return d === 0;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.endsWith(",") && balanced(line)) {
      const ind = indentOf(line);
      const group = [trimmed];
      let j = i + 1;
      let ok = true;
      while (j < lines.length) {
        const l = lines[j];
        if (indentOf(l) !== ind || !balanced(l)) {
          ok = false;
          break;
        }
        const t = l.trim();
        group.push(t);
        j++;
        if (!t.endsWith(",")) break;
      }
      // Only collapse a *complete* list: >1 item and ends on a non-comma line.
      if (ok && group.length > 1 && !group[group.length - 1].endsWith(",")) {
        out.push(" ".repeat(ind) + group.join(" "));
        i = j;
        continue;
      }
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

async function run(
  text: string,
  indentStyle: "standard" | "tabularLeft" | "tabularRight",
): Promise<string> {
  const { format } = await loadFormatter();
  return format(text, {
    language: "sql",
    keywordCase: "upper",
    indentStyle,
  });
}

/**
 * PL/SQL-Developer / Toad "river" style: clause keywords right-aligned into a
 * vertical river, the first item kept on the keyword line, the rest aligned
 * under it. One item per line, but neatly columnar.
 */
export async function formatRiver(text: string): Promise<string> {
  return run(text, "tabularRight");
}

/**
 * Tabular-left style: clause keywords left-aligned into a fixed-width column,
 * content trailing on the same line. Same one-item-per-line layout as river
 * but flush-left.
 */
export async function formatTabular(text: string): Promise<string> {
  return run(text, "tabularLeft");
}

/**
 * Compact style: standard layout (clause keyword + content on the same line)
 * with comma lists collapsed back inline, so SELECT columns / GROUP BY / ORDER
 * BY stay on one line instead of one-per-line. The most space-efficient of the
 * three.
 */
export async function formatCompact(text: string): Promise<string> {
  return inlineLists(await run(text, "standard"));
}

/**
 * Minify to a single line. Pure string work (no sql-formatter), so it's the
 * one transform that needs no lazy chunk. It collapses all runs of whitespace
 * to a single space while carefully NOT touching the insides of:
 *
 *   - string literals  '...'  "..."  `...`  (with \-escapes and '' doubling)
 *   - dollar-quoted strings  $$...$$ / $tag$...$tag$  (PostgreSQL)
 *   - block comments  /* ... *\/  — kept verbatim (apart from collapsing their
 *     own internal newlines) because they can be semantic: MySQL executable
 *     comments  /*! ... *\/  and optimizer hints  /*+ ... *\/  must survive.
 *
 * Line comments  -- ...  and  # ...  run to end-of-line, so naively dropping
 * the newline would comment out everything after them. They're converted to
 * block comments  /* ... *\/  to stay on one line losslessly (any `*\/` inside
 * the comment text is neutralised to `* /` so the block stays well-formed).
 */
export function minifySql(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  const isSpace = (c: string) =>
    c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v";
  // Append a single separating space, but never two in a row. Used only by the
  // whitespace / comment branches — string and dollar-quote bodies are copied
  // verbatim and never go through here, so their internal spacing is preserved.
  const space = () => {
    if (out.length && out[out.length - 1] !== " ") out += " ";
  };

  while (i < n) {
    const c = text[i];

    // Quoted string literals.
    if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const ch = text[i];
        if (ch === "\\" && (quote === "'" || quote === '"') && i + 1 < n) {
          out += ch + text[i + 1];
          i += 2;
          continue;
        }
        out += ch;
        i++;
        if (ch === quote) {
          // Doubled-quote escape: '' "" `` — consume the pair, stay in string.
          if (text[i] === quote) {
            out += text[i];
            i++;
            continue;
          }
          break;
        }
      }
      continue;
    }

    // Dollar-quoted string (PostgreSQL): $$ ... $$ or $tag$ ... $tag$.
    if (c === "$") {
      const m = /^\$([A-Za-z_]\w*)?\$/.exec(text.slice(i));
      if (m) {
        const tag = m[0];
        const end = text.indexOf(tag, i + tag.length);
        const stop = end < 0 ? n : end + tag.length;
        out += text.slice(i, stop);
        i = stop;
        continue;
      }
    }

    // Block comment — keep, collapsing its own internal whitespace to spaces.
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      space();
      out += text.slice(i, stop).replace(/\s+/g, " ");
      space();
      i = stop;
      continue;
    }

    // Line comment ( -- … or # … ) → convert to a block comment.
    if ((c === "-" && text[i + 1] === "-") || c === "#") {
      let j = i;
      while (j < n && text[j] !== "\n") j++;
      const marker = c === "#" ? 1 : 2;
      const body = text
        .slice(i + marker, j)
        .replace(/\*\//g, "* /")
        .trim();
      if (body) {
        space();
        out += "/* " + body + " */";
        space();
      }
      i = j; // newline handled by the whitespace branch on the next iteration
      continue;
    }

    // Any whitespace run → single space.
    if (isSpace(c)) {
      let j = i;
      while (j < n && isSpace(text[j])) j++;
      space();
      i = j;
      continue;
    }

    out += c;
    i++;
  }

  return out.trim();
}

/** Dispatch by style id. */
export function formatSql(text: string, style: SqlStyle): Promise<string> {
  switch (style) {
    case "river":
      return formatRiver(text);
    case "tabular":
      return formatTabular(text);
    case "compact":
      return formatCompact(text);
    case "minify":
      return Promise.resolve(minifySql(text));
  }
}
