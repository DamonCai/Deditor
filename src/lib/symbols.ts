/** Extract a flat outline of "symbols" from a file's text using simple
 *  regex per language. Not a real parser — fast and lightweight, good
 *  enough to power Cmd+R fuzzy navigation in code we author. Misses some
 *  edge cases (multi-line declarations, nested blocks) but those are
 *  acceptable trade-offs for zero deps and instant feedback.
 */

export interface Symbol {
  name: string;
  /** 1-based line number. */
  line: number;
  /** Heading depth for Markdown, indent depth for code (0 = top-level). */
  depth: number;
  /** Short tag rendered next to the name in the picker. */
  kind: string;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const JS_RE =
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(function\*?|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/;
const PY_RE = /^\s*(def|class|async\s+def)\s+([A-Za-z_][\w]*)/;
const RS_RE = /^\s*(?:pub\s+(?:\([^)]+\)\s+)?)?(fn|struct|enum|trait|impl|mod|type|const|static)\s+([A-Za-z_][\w]*)/;
const GO_RE = /^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z_][\w]*)/;
const RUBY_RE = /^\s*(def|class|module)\s+([A-Za-z_][\w]*[!?=]?)/;
const PHP_RE = /^\s*(?:public\s+|private\s+|protected\s+|static\s+|abstract\s+|final\s+)*(function|class|interface|trait)\s+([A-Za-z_][\w]*)/;
const SHELL_RE = /^\s*(?:function\s+([A-Za-z_][\w]*)|([A-Za-z_][\w]*)\s*\(\s*\))/;

function ext(path: string | null): string {
  if (!path) return "";
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function extractSymbols(filePath: string | null, text: string): Symbol[] {
  const e = ext(filePath);
  const lines = text.split(/\r?\n/);
  const out: Symbol[] = [];

  if (e === "md" || e === "markdown" || e === "mdx") {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(HEADING_RE);
      if (m) {
        out.push({
          name: m[2],
          line: i + 1,
          depth: m[1].length - 1,
          kind: `h${m[1].length}`,
        });
      }
    }
    return out;
  }

  // Pick a regex set by extension. Untyped extensions just get nothing.
  const re = pickRe(e);
  if (!re) return out;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re.pattern);
    if (m) {
      const name = m[re.nameGroup] ?? m[re.nameGroupAlt ?? -1];
      if (!name) continue;
      out.push({
        name,
        line: i + 1,
        depth: 0,
        kind: m[re.kindGroup ?? -1] ?? re.defaultKind,
      });
    }
  }
  return out;
}

interface ReSpec {
  pattern: RegExp;
  nameGroup: number;
  nameGroupAlt?: number;
  kindGroup?: number;
  defaultKind: string;
}

function pickRe(e: string): ReSpec | null {
  switch (e) {
    case "js": case "jsx": case "ts": case "tsx": case "mjs": case "cjs":
      return { pattern: JS_RE, nameGroup: 2, kindGroup: 1, defaultKind: "fn" };
    case "py": case "pyi":
      return { pattern: PY_RE, nameGroup: 2, kindGroup: 1, defaultKind: "fn" };
    case "rs":
      return { pattern: RS_RE, nameGroup: 2, kindGroup: 1, defaultKind: "fn" };
    case "go":
      return { pattern: GO_RE, nameGroup: 1, defaultKind: "fn" };
    case "rb":
      return { pattern: RUBY_RE, nameGroup: 2, kindGroup: 1, defaultKind: "fn" };
    case "php":
      return { pattern: PHP_RE, nameGroup: 2, kindGroup: 1, defaultKind: "fn" };
    case "sh": case "bash": case "zsh":
      return { pattern: SHELL_RE, nameGroup: 1, nameGroupAlt: 2, defaultKind: "fn" };
    default:
      return null;
  }
}
