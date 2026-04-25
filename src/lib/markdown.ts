import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import plantumlEncoder from "plantuml-encoder";
import { ensureLanguage, getHighlighter } from "./highlight";
import { detectLang } from "./lang";

const PLANTUML_LANGS = new Set(["plantuml", "puml", "uml"]);
const PLANTUML_SERVER = "https://www.plantuml.com/plantuml/svg";

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function renderPlantuml(source: string, line: number): string {
  let url: string;
  let error: string | null = null;
  try {
    const encoded = plantumlEncoder.encode(source);
    url = `${PLANTUML_SERVER}/${encoded}`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    url = "";
  }
  if (error) {
    return `<div class="plantuml-diagram error" data-line="${line}">PlantUML 编码失败: ${escapeAttr(error)}</div>`;
  }
  return (
    `<div class="plantuml-diagram" data-line="${line}">` +
    `<img src="${url}" alt="PlantUML diagram" loading="lazy" />` +
    `</div>`
  );
}

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

md.use(anchor, { permalink: false });
md.use(taskLists, { enabled: false });

const originalFence = md.renderer.rules.fence!;
md.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const line = token.map ? token.map[0] + 1 : 0;
  token.attrSet("data-line", String(line));
  const cached = (env as { __highlighted?: Map<number, string> })
    .__highlighted;
  if (cached && cached.has(idx)) {
    const html = cached.get(idx)!;
    // Plantuml renderer already injects data-line; for shiki <pre> we add it.
    if (html.startsWith("<div class=\"plantuml-diagram")) return html;
    return html.replace(/^<pre/, `<pre data-line="${line}"`);
  }
  return originalFence(tokens, idx, options, env, self);
};

["paragraph_open", "heading_open", "blockquote_open", "list_item_open"].forEach(
  (rule) => {
    const original = md.renderer.rules[rule];
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map) token.attrSet("data-line", String(token.map[0] + 1));
      return original
        ? original(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    };
  },
);

export interface RenderOptions {
  theme: "light" | "dark";
}

export async function renderMarkdown(
  source: string,
  opts: RenderOptions,
): Promise<string> {
  const hl = await getHighlighter();
  const tokens = md.parse(source, {});
  const highlighted = new Map<number, string>();
  const shikiTheme = opts.theme === "dark" ? "github-dark" : "github-light";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "fence") continue;
    const lang = (t.info || "").trim().split(/\s+/)[0].toLowerCase() || "text";
    if (PLANTUML_LANGS.has(lang)) {
      const line = t.map ? t.map[0] + 1 : 0;
      highlighted.set(i, renderPlantuml(t.content, line));
      continue;
    }
    const resolved = await ensureLanguage(hl, lang);
    try {
      highlighted.set(
        i,
        hl.codeToHtml(t.content, { lang: resolved, theme: shikiTheme }),
      );
    } catch {
      highlighted.set(
        i,
        hl.codeToHtml(t.content, { lang: "text", theme: shikiTheme }),
      );
    }
  }

  return md.renderer.render(tokens, md.options, { __highlighted: highlighted });
}

export async function renderCode(
  source: string,
  filePath: string | null,
  opts: RenderOptions,
): Promise<string> {
  const hl = await getHighlighter();
  const langDef = detectLang(filePath);
  const resolved = await ensureLanguage(hl, langDef.shiki);
  const shikiTheme = opts.theme === "dark" ? "github-dark" : "github-light";
  try {
    return hl.codeToHtml(source, { lang: resolved, theme: shikiTheme });
  } catch {
    return hl.codeToHtml(source, { lang: "text", theme: shikiTheme });
  }
}
