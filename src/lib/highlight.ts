import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  bundledLanguages,
} from "shiki";

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

// We used to PRELOAD 23 languages eagerly — every first .md open paid for
// all of them even if the doc had zero code blocks (or just one in a
// language the user never writes). Now we start with no languages and
// rely on ensureLanguage() to load each one the first time a fence in
// that language is rendered. After the lang is cached the cost is zero.
//
// Trade-off: the very first code block in a never-seen language paints
// without highlight, then re-renders ~10–50 ms later when the grammar
// arrives. Acceptable because renderMarkdown is already debounced by 80 ms
// in Preview, and the second render uses the cached grammar.

export function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ["github-light", "one-dark-pro"],
      langs: [],
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
