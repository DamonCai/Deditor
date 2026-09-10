import {
  createHighlighter,
  type Highlighter,
  type BundledLanguage,
  bundledLanguages,
  bundledLanguagesAlias,
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
  if (normalized in bundledLanguages || normalized in bundledLanguagesAlias) {
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
