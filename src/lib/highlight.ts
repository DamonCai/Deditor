import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  bundledLanguages,
} from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

const PRELOAD: BundledLanguage[] = [
  "javascript",
  "typescript",
  "tsx",
  "jsx",
  "json",
  "html",
  "css",
  "scss",
  "markdown",
  "bash",
  "python",
  "rust",
  "go",
  "java",
  "c",
  "cpp",
  "yaml",
  "toml",
  "sql",
  "php",
  "vue",
  "xml",
];

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "one-dark-pro"],
      langs: PRELOAD,
    }).then((hl) => {
      PRELOAD.forEach((l) => loadedLangs.add(l));
      return hl;
    });
  }
  return highlighterPromise;
}

export async function ensureLanguage(
  hl: Highlighter,
  lang: string,
): Promise<string> {
  const normalized = lang.toLowerCase();
  if (loadedLangs.has(normalized)) return normalized;
  if (normalized in bundledLanguages) {
    try {
      await hl.loadLanguage(normalized as BundledLanguage);
      loadedLangs.add(normalized);
      return normalized;
    } catch {
      return "text";
    }
  }
  return "text";
}

/** One token from shiki's tokenizer — `content` is the substring, `color`
 *  is the hex string the active theme assigns. */
export interface ShikiTok {
  content: string;
  color?: string;
}

/** Tokenize a whole document into lines × tokens. Returns null until both
 *  Shiki and the requested language have loaded. Caller passes the SHIKI
 *  language id (from LangDef.shiki) and a theme name ("github-light" /
 *  "one-dark-pro"). */
export async function tokenizeLines(
  text: string,
  lang: string,
  theme: "github-light" | "one-dark-pro",
): Promise<ShikiTok[][]> {
  const hl = await getHighlighter();
  const resolvedLang = await ensureLanguage(hl, lang);
  // codeToTokensBase: ThemedToken[][] — outer = lines, inner = tokens.
  const tokens = hl.codeToTokensBase(text, {
    lang: resolvedLang as BundledLanguage,
    theme,
  });
  return tokens.map((line) =>
    line.map((tok) => ({ content: tok.content, color: tok.color })),
  );
}
