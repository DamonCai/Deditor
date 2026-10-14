import { renderMarkdown, renderMarkdownTocs, readMarkdownTocs, type MarkdownToc, type RenderOptions } from "./markdown";

interface FragmentContext {
  source: string; optionsKey: string; owner?: object;
  template?: Promise<HTMLTemplateElement>;
  tocs?: Promise<Map<number, string>>;
  tocData?: Promise<Map<number, MarkdownToc>>;
}
export async function readMarkdownTocFragment(source: string, line: number, options: RenderOptions, owner?: object) {
  const entry = context(source, options, owner);
  const tocs = await (entry.tocData ??= retryable(entry, readMarkdownTocs(source, options)));
  return tocs.get(line);
}
let cached: FragmentContext | undefined;
export function clearMarkdownFragmentContext(owner: object) {
  if (owner === cached?.owner) cached = undefined;
}
function context(source: string, options: RenderOptions, owner?: object): FragmentContext {
  const optionsKey = JSON.stringify([options.theme, options.documentSource, options.mathAutoNumber, options.mathOrdinal]);
  if (!cached || source !== cached.source || optionsKey !== cached.optionsKey || owner !== cached.owner) cached = { source, optionsKey, owner };
  return cached;
}
function retryable<T>(entry: FragmentContext, promise: Promise<T>): Promise<T> {
  return promise.catch(error => {
    // Failed requests remain retryable without evicting a newer source/owner.
    if (cached === entry) cached = undefined;
    throw error;
  });
}
function contextTemplate(entry: FragmentContext, options: RenderOptions) {
  return entry.template ??= retryable(entry, renderMarkdown(entry.source, options).then(html => {
    const template = document.createElement("template"); template.innerHTML = html;
    return template;
  }));
}
/** References and document directives need the same context as the full preview. */
export async function renderMarkdownFragment(raw: string, source: string, line: number, options: RenderOptions, owner?: object) {
  if (!/\[\^|^\s*\[(?:toc|\[toc\])\]|^\s*(?:>\s*)*#{1,6}\s/im.test(raw)) return renderMarkdown(raw, options);
  const entry = context(source, options, owner);
  if (/^\s*\[(?:toc|\[toc\])\]\s*(?:\n|$)/i.test(raw)) {
    const tocs = await (entry.tocs ??= retryable(entry, renderMarkdownTocs(source, options)));
    const toc = tocs.get(line);
    if (toc !== undefined) return toc;
  }
  // Read one parsed context per source/theme. Return HTML strings below so each
  // caller creates its own DOM; no shared nodes can be moved out of the cache.
  const template = await contextTemplate(entry, options);
  const definition = raw.match(/^\[\^([^\]]+)\]:/);
  if (definition) {
    const item = Array.from(template.content.querySelectorAll<HTMLElement>(".footnote-item")).find(e => e.dataset.footnoteLabel?.toLowerCase() === definition[1].toLowerCase());
    if (item) return `<section class="footnotes"><ol start="${Number(item.id.replace(/^fn/, "")) || 1}">${item.outerHTML}</ol></section>`;
    // Unreferenced definitions remain visible and editable without inventing a reference.
    return `<section class="footnotes"><p>[${definition[1].replace(/[<>"&]/g, "")}]</p>${await renderMarkdown(raw.replace(/^\[\^[^\]]+\]:\s*/, ""), options)}</section>`;
  }
  const block = template.content.querySelector(`[data-line="${line}"]`);
  return block?.outerHTML ?? renderMarkdown(raw, options);
}
