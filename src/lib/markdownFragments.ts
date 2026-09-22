import { renderMarkdown, type RenderOptions } from "./markdown";

let cachedSource = "", cachedTheme = "", cached: Promise<HTMLTemplateElement> | null = null;
let cachedOwner: object | undefined;
export function clearMarkdownFragmentContext(owner: object) {
  if (owner !== cachedOwner) return;
  cached = null; cachedSource = ""; cachedTheme = ""; cachedOwner = undefined;
}
function contextTemplate(source: string, options: RenderOptions, owner?: object) {
  if (!cached || source !== cachedSource || options.theme !== cachedTheme || owner !== cachedOwner) {
    cachedSource = source; cachedTheme = options.theme; cachedOwner = owner;
    const next: Promise<HTMLTemplateElement> = renderMarkdown(source, options).then(html => {
      const template = document.createElement("template"); template.innerHTML = html;
      return template;
    }).catch(error => {
      // A failed render must remain retryable, without clearing a newer context.
      if (cached === next) { cached = null; cachedSource = ""; cachedTheme = ""; cachedOwner = undefined; }
      throw error;
    });
    cached = next;
  }
  return cached;
}
/** References and document directives need the same context as the full preview. */
export async function renderMarkdownFragment(raw: string, source: string, line: number, options: RenderOptions, owner?: object) {
  if (!/\[\^|^\s*\[(?:toc|\[toc\])\]|^\s*(?:>\s*)*#{1,6}\s/im.test(raw)) return renderMarkdown(raw, options);
  // Read one parsed context per source/theme. Return HTML strings below so each
  // caller creates its own DOM; no shared nodes can be moved out of the cache.
  const template = await contextTemplate(source, options, owner);
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
