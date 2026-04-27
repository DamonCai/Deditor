import JSON5 from "json5";

const MAX_UNWRAP_DEPTH = 5;

/**
 * Convert Python-style literals (`True` / `False` / `None`) outside of strings
 * to their JSON equivalents. JSON5 already handles single quotes, unquoted
 * keys, and trailing commas, so the only remaining gap when someone pastes a
 * Python `repr(dict)` dump is these three keywords.
 *
 * The scan tracks whether we're inside a `'...'` or `"..."` string (with `\`
 * escapes) so literal-looking words inside string values aren't rewritten.
 * Replacements happen only at word boundaries to avoid touching identifiers
 * like `TrueColor` or property keys that happen to contain the substring.
 */
function convertPythonLiterals(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;
  const isWordChar = (c: string) => /[A-Za-z0-9_$]/.test(c);
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const ch = text[i];
        if (ch === "\\" && i + 1 < n) {
          out += ch + text[i + 1];
          i += 2;
          continue;
        }
        out += ch;
        i++;
        if (ch === quote) break;
      }
      continue;
    }
    const prev = i > 0 ? text[i - 1] : " ";
    if (!isWordChar(prev)) {
      const tryReplace = (kw: string, repl: string) => {
        if (text.startsWith(kw, i)) {
          const after = text[i + kw.length] ?? " ";
          if (!isWordChar(after)) {
            out += repl;
            i += kw.length;
            return true;
          }
        }
        return false;
      };
      if (tryReplace("True", "true")) continue;
      if (tryReplace("False", "false")) continue;
      if (tryReplace("None", "null")) continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * Parse a piece of text into a JSON value, peeling away common forms of
 * "wrapping" the user might have pasted:
 *
 *   1. Strict JSON                                  {"a":1}
 *   2. Loose JSON (JSON5: single quotes, unquoted keys, trailing commas, …)
 *      {'a':1,}     {a:1}
 *   3. JSON-encoded *string* whose contents are JSON:
 *      "{\"a\":1}"      → JSON.parse returns the string, we recurse
 *   4. Raw escaped text without outer quotes:
 *      {\"a\":1}        → wrap in quotes, parse, recurse
 *   5. Multiple layers of (3) / (4) up to MAX_UNWRAP_DEPTH
 *
 * Throws when nothing works; the error from the first JSON.parse attempt
 * is re-raised because it tends to point at the most informative location.
 */
function smartParse(text: string, depth = 0): unknown {
  if (depth > MAX_UNWRAP_DEPTH) {
    throw new Error("too many levels of escaping");
  }
  const t = text.trim();
  if (!t) throw new Error("empty input");

  let parsed: unknown;
  let parseErr: unknown;
  let parsedSuccessfully = false;

  // 1. Strict.
  try {
    parsed = JSON.parse(t);
    parsedSuccessfully = true;
  } catch (e) {
    parseErr = e;
  }
  // 2. Loose JSON5.
  if (!parsedSuccessfully) {
    try {
      parsed = JSON5.parse(t);
      parsedSuccessfully = true;
    } catch {
      /* fall through */
    }
  }
  // 2b. Python-style: convert True/False/None outside strings, then JSON5.
  //     Covers `repr(dict)` output that mixes single quotes with Python
  //     keywords. Cheap to try; only runs after strict + JSON5 both fail.
  if (!parsedSuccessfully) {
    const pyConverted = convertPythonLiterals(t);
    if (pyConverted !== t) {
      try {
        parsed = JSON5.parse(pyConverted);
        parsedSuccessfully = true;
      } catch {
        /* fall through */
      }
    }
  }
  // 4. Raw escaped text — wrap in quotes and parse as a JSON string, then
  //    recurse on the unescaped contents. We escape any unescaped `"` first.
  if (!parsedSuccessfully) {
    const wrapped = '"' + t.replace(/(?<!\\)"/g, '\\"') + '"';
    try {
      const inner = JSON.parse(wrapped);
      if (typeof inner === "string") {
        return smartParse(inner, depth + 1);
      }
    } catch {
      /* fall through */
    }
  }
  // 5. Manual unescape, recurse once.
  if (!parsedSuccessfully) {
    const unescaped = t
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\r/g, "\r");
    if (unescaped !== t) {
      return smartParse(unescaped, depth + 1);
    }
    // No more strategies — re-throw the original strict error for clarity.
    throw parseErr instanceof Error ? parseErr : new Error(String(parseErr));
  }

  // 3. We parsed something. If it's a string, it might *itself* be JSON —
  //    recurse. If recursion fails, the value really is a plain string.
  if (typeof parsed === "string") {
    try {
      return smartParse(parsed, depth + 1);
    } catch {
      return parsed;
    }
  }
  return parsed;
}

/** Smart format: handles strict / loose / escaped JSON and any nesting of those. */
export function smartFormat(text: string): string {
  return JSON.stringify(smartParse(text), null, 2);
}

/** Compact (one-line) standard JSON. Accepts loose / escaped input. */
export function compactJson(text: string): string {
  return JSON.stringify(smartParse(text));
}

/** Pretty-print with object keys sorted alphabetically (recursive). */
export function sortKeysFormat(text: string): string {
  return JSON.stringify(sortKeysDeep(smartParse(text)), null, 2);
}

function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}
