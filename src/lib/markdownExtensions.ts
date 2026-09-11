import type MarkdownIt from "markdown-it";

/** Document-level syntax shared by live preview, preserved blocks and exports. */
export function markdownExtensions(md: MarkdownIt) {
  md.block.ruler.before("hr", "deditor_frontmatter", (state, start, end, silent) => {
    if (start !== 0 || state.src.slice(state.bMarks[start], state.eMarks[start]).trim() !== "---") return false;
    let close = start + 1;
    while (close < end && !/^(---|\.\.\.)\s*$/.test(state.src.slice(state.bMarks[close], state.eMarks[close]))) close++;
    if (close === end) return false;
    if (silent) return true;
    const token = state.push("deditor_frontmatter", "", 0); token.block = true; token.map = [start, close + 1];
    token.content = state.src.slice(state.bMarks[start + 1], state.bMarks[close]).trimEnd();
    state.line = close + 1; return true;
  });
  md.renderer.rules.deditor_frontmatter = (tokens, i) => `<details class="md-frontmatter" data-line="1"><summary>YAML</summary><pre><code>${md.utils.escapeHtml(tokens[i].content)}</code></pre></details>\n`;
  md.block.ruler.before("paragraph", "deditor_toc", (state, start, _end, silent) => {
    if (!/^\[(?:toc|\[toc\])\]\s*$/i.test(state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]))) return false;
    if (silent) return true;
    const token = state.push("deditor_toc", "", 0); token.block = true; token.map = [start, start + 1]; state.line = start + 1; return true;
  });
  md.core.ruler.push("deditor_document_blocks", state => {
    const headings = state.tokens.flatMap((token, i) => token.type === "heading_open" ? [{ level: Number(token.tag.slice(1)), id: token.attrGet("id") ?? "", text: (state.tokens[i + 1]?.children ?? []).map(child => ["text", "code_inline", "image"].includes(child.type) ? child.content : child.type === "softbreak" ? " " : "").join("") }] : []);
    for (let i = 0; i < state.tokens.length; i++) {
      const token = state.tokens[i];
      if (token.type === "deditor_toc") token.meta = { headings };
      if (token.type !== "blockquote_open" || state.tokens[i + 1]?.type !== "paragraph_open") continue;
      const inline = state.tokens[i + 2], match = inline?.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\s*\n|\s*$)/i);
      if (!match) continue;
      token.attrJoin("class", `md-callout md-callout-${match[1].toLowerCase()}`);
      inline.content = inline.content.slice(match[0].length);
      inline.children = md.parseInline(inline.content, state.env)[0]?.children ?? [];
      const title = new state.Token("html_inline", "", 0);
      title.content = `<span class="md-callout-title">${match[1].toUpperCase()}</span>`;
      inline.children.unshift(title);
    }
  });
  md.renderer.rules.deditor_toc = (tokens, i) => {
    const headings = tokens[i].meta.headings as { level: number; id: string; text: string }[];
    return `<nav class="md-toc" data-line="${(tokens[i].map?.[0] ?? 0) + 1}"><ol>${headings.map(h => `<li style="margin-left:${(h.level - 1) * 16}px"><a href="#${md.utils.escapeHtml(h.id)}">${md.utils.escapeHtml(h.text)}</a></li>`).join("")}</ol></nav>\n`;
  };
}
