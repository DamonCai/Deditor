import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { sourceTree, type SourceNode } from "./document";
import { emojiValue } from "../markdownShorthand";

const titles = new WeakMap<ProseNode, string>();
/** Inline source expansion must not expose Markdown markers in the outline. */
export function outlineHeadingText(node: ProseNode) {
  const cached = titles.get(node); if (cached !== undefined) return cached;
  const plain = (part: SourceNode): string => ["text", "inlineCode"].includes(part.type)
    ? part.value ?? "" : part.children?.map(plain).join("") ?? "";
  let text = "";
  node.descendants(child => {
    if (child.type.name === "deditor_inline_source") { text += plain(sourceTree(child.textContent)); return false; }
    if (child.isText) text += child.text;
    else if (child.type.name === "deditor_emoji") text += emojiValue(child.attrs.name) ?? `:${child.attrs.name}:`;
  });
  titles.set(node, text); return text;
}

