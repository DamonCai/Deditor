import { renderMarkdown, type RenderOptions } from "./markdown";

let cachedSource = "", cachedTheme = "", cached: Promise<string> | null = null;
function contextHtml(source: string, options: RenderOptions) {
  if (!cached || source !== cachedSource || options.theme !== cachedTheme) {
    cachedSource = source; cachedTheme = options.theme; cached = renderMarkdown(source, options);
  }
  return cached;
}
/** References and document directives need the same context as the full preview. */
export async function renderMarkdownFragment(raw: string, source: string, line: number, options: RenderOptions) {
  if (!/\[\^|^\s*\[(?:toc|\[toc\])\]|^\s*(?:>\s*)*#{1,6}\s/im.test(raw)) return renderMarkdown(raw, options);
  const html = await contextHtml(source, options), template = document.createElement("template"); template.innerHTML = html;
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
