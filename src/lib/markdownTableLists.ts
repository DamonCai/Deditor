import type MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";

const cellBreaks = Symbol("table-list-breaks");
const LIST_START = /^[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+/;
const LIST_TOKENS = new Set([
  "bullet_list_open", "bullet_list_close", "ordered_list_open", "ordered_list_close",
  "list_item_open", "list_item_close", "paragraph_open", "paragraph_close", "inline",
]);

/** Extend pipe-table cells with lists, including items separated by HTML breaks. */
export function markdownTableLists(md: MarkdownIt): void {
  // Let the inline parser identify real breaks: escaped HTML, code spans and
  // HTML attributes containing `<br>` must remain literal content.
  md.inline.ruler.before("html_inline", "table_list_breaks", (state, silent) => {
    const positions: Array<[number, number]> | undefined = state.env[cellBreaks];
    if (!silent && positions && state.md.options.html && state.src[state.pos] === "<") {
      const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos));
      if (match && LIST_START.test(state.src.slice(state.pos + match[0].length))) {
        positions.push([state.pos, state.pos + match[0].length]);
      }
    }
    return false;
  });

  // Run before inline/task-list processing so checkboxes, emphasis, links and
  // lazy-loaded math use the same rules as lists outside tables.
  md.core.ruler.after("block", "table_lists", (state) => {
    const result: Token[] = [];
    let rowLine = 0;
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type === "tr_open") rowLine = token.map?.[0] ?? 0;
      const previous = state.tokens[i - 1];
      if (token.type !== "inline" || !["td_open", "th_open"].includes(previous?.type)) {
        result.push(token);
        continue;
      }

      const positions: Array<[number, number]> = [];
      md.inline.parse(token.content, md, { ...state.env, [cellBreaks]: positions }, []);
      let source = token.content;
      for (const [from, to] of positions.reverse()) {
        source = source.slice(0, from) + "\n" + source.slice(to);
      }
      if (!source.split("\n").some(line => LIST_START.test(line))) {
        result.push(token);
        continue;
      }
      const blocks: Token[] = [];
      md.block.parse(source, md, state.env, blocks);
      // Only extend list syntax. A heading, rule or fenced block in a cell
      // keeps its existing inline interpretation.
      if (!blocks.some(t => t.type === "list_item_open") ||
          blocks.some(t => !LIST_TOKENS.has(t.type))) {
        result.push(token);
        continue;
      }
      for (const block of blocks) {
        block.level += token.level;
        // All virtual lines belong to the original table row for scroll sync.
        if (block.map) block.map = [rowLine, rowLine + 1];
        result.push(block);
      }
    }
    state.tokens = result;
  });
}
