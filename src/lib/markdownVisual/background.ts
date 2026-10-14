import type { NodeSchema } from "@milkdown/kit/transformer";
import { backgroundMarker, backgroundStyle, validBackground } from "../markdownBackground";

/** Keep block shading separate from inline text highlight marks. */
export function withBackground(base: NodeSchema): NodeSchema {
  return { ...base,
    attrs: { ...base.attrs, background: { default: null } },
    toDOM(node) {
      const spec = base.toDOM!(node) as [string, Record<string, unknown>, number];
      const color = validBackground(node.attrs.background);
      return [spec[0], { ...spec[1], ...(color ? { "data-deditor-background": color, style: `${spec[1].style ?? ""};${backgroundStyle(color)}` } : {}) }, spec[2]];
    },
    parseDOM: base.parseDOM?.map(rule => !("tag" in rule) ? rule : { ...rule, getAttrs(dom: HTMLElement) {
      const attrs = rule.getAttrs ? rule.getAttrs(dom) : rule.attrs;
      return attrs === false ? false : { ...attrs, background: validBackground(dom.getAttribute("data-deditor-background")) };
    } }),
    parseMarkdown: { ...base.parseMarkdown, runner(state, node, type) {
      state.openNode(type, { ...(node.type === "heading" ? { level: node.depth } : {}), background: validBackground(node.deditorBackground) });
      state.next(node.children ?? []); state.closeNode();
    } },
    toMarkdown: { ...base.toMarkdown, runner(state, node) {
      const color = validBackground(node.attrs.background);
      if (!color) { base.toMarkdown.runner(state, node); return; }
      state.openNode(node.type.name, undefined, node.type.name === "heading" ? { depth: node.attrs.level } : undefined);
      state.addNode("html", undefined, backgroundMarker(color));
      const terminalBreak = node.lastChild?.type.name === "hardbreak" && !node.lastChild.attrs.isInline;
      state.next(terminalBreak ? node.content.cut(0, node.content.size - 1) : node.content);
      if (terminalBreak) state.addNode("html", undefined, "<br>");
      state.closeNode();
    } },
  };
}
