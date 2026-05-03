/// <reference lib="webworker" />
//
// DiffView's Shiki tokenize used to block the main thread for 150-400ms on
// big diffs. Running it in a worker keeps the renderer thread free, so the
// diff (which already renders plain text immediately) can scroll, fold,
// and respond to clicks while the highlights stream in behind.
//
// The worker has its own Shiki instance — no shared state with the main
// thread's `getHighlighter()` (used by markdown-it, which can't use a
// worker because it needs sync highlight callbacks).

import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  bundledLanguages,
} from "shiki";

interface TokenizeRequest {
  id: number;
  text: string;
  lang: string;
  theme: "github-light" | "one-dark-pro";
}

interface TokenizeResponse {
  id: number;
  tokens: { content: string; color?: string }[][];
}

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

let highlighterPromise: Promise<Highlighter> | null = null;
const loadedLangs = new Set<string>();

function getHl(): Promise<Highlighter> {
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

async function ensureLang(hl: Highlighter, lang: string): Promise<string> {
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

self.onmessage = async (e: MessageEvent<TokenizeRequest>) => {
  const { id, text, lang, theme } = e.data;
  try {
    const hl = await getHl();
    const resolved = await ensureLang(hl, lang);
    const raw = hl.codeToTokensBase(text, {
      lang: resolved as BundledLanguage,
      theme,
    });
    const tokens = raw.map((line) =>
      line.map((tok) => ({ content: tok.content, color: tok.color })),
    );
    const reply: TokenizeResponse = { id, tokens };
    (self as DedicatedWorkerGlobalScope).postMessage(reply);
  } catch {
    const reply: TokenizeResponse = { id, tokens: [] };
    (self as DedicatedWorkerGlobalScope).postMessage(reply);
  }
};
