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

// Worker-backed tokenizer for the heavy DiffView path. The worker creates
// its own Shiki instance — separate memory from the main thread's
// `getHighlighter()`, but the doc-blocking codeToTokensBase call (150-400ms
// for big diffs) runs off the renderer thread so the diff stays scrollable
// while highlights stream in.
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, (toks: ShikiTok[][]) => void>();

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./shikiWorker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e: MessageEvent<{ id: number; tokens: ShikiTok[][] }>) => {
    const cb = pending.get(e.data.id);
    if (cb) {
      pending.delete(e.data.id);
      cb(e.data.tokens);
    }
  };
  return worker;
}

/** Tokenize a whole document into lines × tokens via the Shiki worker.
 *  Caller passes the SHIKI language id (from LangDef.shiki) and a theme
 *  name ("github-light" / "one-dark-pro"). The Promise resolves with `[]`
 *  on any worker-side error (caller should fall back to plain text). */
export function tokenizeLines(
  text: string,
  lang: string,
  theme: "github-light" | "one-dark-pro",
): Promise<ShikiTok[][]> {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    ensureWorker().postMessage({ id, text, lang, theme });
  });
}
