import type MarkdownIt from "markdown-it";

export const taskIndentMarker = /^<!-- deditor-task-indent:(\d+) -->$/;
export const taskIndent = (value: unknown) => Math.max(0, Math.min(20, Math.floor(Number(value) || 0)));

/** A standalone task has no previous sibling to become its Markdown parent. */
export function markdownTaskIndent(md: MarkdownIt) {
  md.core.ruler.after("inline", "deditor-task-indent", state => {
    const items: typeof state.tokens = [];
    for (const token of state.tokens) {
      if (token.type === "list_item_open") items.push(token);
      else if (token.type === "list_item_close") items.pop();
      else if (token.type === "inline" && items.length && token.children) {
        const index = token.children.findIndex(child => child.type === "html_inline" && taskIndentMarker.test(child.content));
        if (index < 0) continue;
        const marker = token.children[index], indent = taskIndent(marker.content.match(taskIndentMarker)?.[1]);
        items.at(-1)!.attrSet("data-task-indent", String(indent));
        items.at(-1)!.attrJoin("style", `--md-task-indent:${indent};`);
        token.children.splice(index, 1);
        const next = token.children[index];
        if (next?.type === "text" && next.content.startsWith(" ")) next.content = next.content.slice(1);
      }
    }
  });
}
