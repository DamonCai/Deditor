/** App-owned word spelling. This never reads or changes the system dictionary. */
export function normalizeSpellingWord(value: string): string | null {
  const word = value.trim().normalize("NFC").toLowerCase();
  return /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’_-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u.test(word) ? word : null;
}
export function spellingTokens(text: string) {
  return text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’_-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu);
}
export function normalizeSpellingWords(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.flatMap(item => typeof item === "string" ? normalizeSpellingWord(item) ?? [] : []))].sort() : [];
}
