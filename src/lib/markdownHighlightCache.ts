/** In-memory fence output only; source positions are attached after lookup. */
export class MarkdownHighlightCache {
  private entries = new Map<string, { html: string; bytes: number }>();
  private bytes = 0;

  // Bound both small-fence count and large HTML output. The byte budget counts
  // UTF-16 key/output payloads; Map and string object overhead is additional.
  constructor(private maxEntries = 256, private maxBytes = 8 * 1024 * 1024) {}

  get(code: string, language: string, theme: string): string | undefined {
    const key = JSON.stringify([language, theme, code]);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.html;
  }

  set(code: string, language: string, theme: string, html: string): void {
    const key = JSON.stringify([language, theme, code]);
    const bytes = (key.length + html.length) * 2;
    const previous = this.entries.get(key);
    if (previous) {
      this.entries.delete(key);
      this.bytes -= previous.bytes;
    }
    // One huge fence should neither consume the cache nor evict useful entries.
    if (bytes > this.maxBytes || this.maxEntries < 1) return;
    this.entries.set(key, { html, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
  }
}
