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
