import type MarkdownIt from "markdown-it";
import type { SourceNode } from "./markdownVisual/document";

// An empty inline span keeps paragraphs (including empty ones) editable Markdown.
// Unlike a leading HTML comment, it cannot turn the paragraph into an HTML block.
export const backgroundPrefix = /^<span data-deditor-background="(#[\da-f]{6})"><\/span>/i;
export const backgroundMarker = (color: string | null) => color ? `<span data-deditor-background="${color}"></span>` : "";
export const validBackground = (value: unknown): string | null => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value : null;

/** Preserve readable inherited text in either theme; explicit inline colors still win. */
export function backgroundStyle(color: string): string {
  const channels = [1, 3, 5].map(at => parseInt(color.slice(at, at + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return `background-color:${color};color:${luminance > 0.179 ? "#000000" : "#FFFFFF"}`;
}

export function takeBackground(node: SourceNode) {
  const children = node.children ?? [];
  const first = children[0], second = children[1];
  if (first?.type !== "html" || second?.type !== "html" || second.value !== "</span>") return;
  const match = /^<span data-deditor-background="(#[\da-f]{6})">$/i.exec(first.value ?? "");
  if (!match) return;
  (node as SourceNode & { deditorBackground: string }).deditorBackground = match[1];
  node.children = children.slice(2);
}
export function backgroundTree(node: SourceNode) {
  if (["paragraph", "heading"].includes(node.type)) takeBackground(node);
  node.children?.forEach(backgroundTree);
}
export function markdownBackground(md: MarkdownIt) {
  md.core.ruler.after("block", "block_background", state => {
    state.tokens.forEach((token, i) => {
      const previous = state.tokens[i - 1];
      if (token.type !== "inline" || !["paragraph_open", "heading_open"].includes(previous?.type)) return;
      const prefix = /^(?:\[!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n|(?:\[[ xX]\] )?(?:<!-- deditor-task-indent:\d+ --> )?)/i.exec(token.content)?.[0] ?? "";
      const match = backgroundPrefix.exec(token.content.slice(prefix.length));
      if (!match) return;
      previous.attrJoin("style", backgroundStyle(match[1]));
      previous.attrSet("data-deditor-background", match[1]);
      // Tight list paragraphs need their own box when they have shading.
      previous.hidden = false;
      if (state.tokens[i + 1]?.type === "paragraph_close") state.tokens[i + 1].hidden = false;
      token.content = prefix + token.content.slice(prefix.length + match[0].length);
    });
  });
}
