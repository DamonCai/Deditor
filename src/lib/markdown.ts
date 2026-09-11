import footnote from "markdown-it-footnote";
import { markdownExtensions } from "./markdownExtensions";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";
import taskLists from "markdown-it-task-lists";
import { markdownTableLists } from "./markdownTableLists";
import { ensureLanguage, getHighlighter } from "./highlight";
import { detectLang } from "./lang";
import { tStatic } from "./i18n";

const PLANTUML_LANGS = new Set(["plantuml", "puml", "uml"]);
const MERMAID_LANGS = new Set(["mermaid"]);

// Lazy loaders for the two heavy plugins:
//   - katex (~628 KB minified) — only docs with `$...$` need this
//   - plantuml-encoder (~250 KB minified) — only docs with ```plantuml``` need it
// Eager-importing both at module load adds ~880 KB to the cold-start bundle
// for every user, including those who never write math or UML.
// Cache: once loaded, the promise is reused (returns instantly).
let katexLoaded = false;
let katexLoading: Promise<void> | null = null;
async function loadKatex(): Promise<void> {
  if (katexLoaded) return;
  if (!katexLoading) {
    katexLoading = (async () => {
      const [{ default: katex }] = await Promise.all([
        import("@vscode/markdown-it-katex"),
        // The CSS provides the math glyph layout — must be present before
        // KaTeX HTML is mounted into the preview.
        import("katex/dist/katex.min.css"),
      ]);
      md.use(katex);
      katexLoaded = true;
    })();
  }
  await katexLoading;
}

let plantumlEncoderPromise: Promise<typeof import("plantuml-encoder")> | null = null;
function loadPlantumlEncoder(): Promise<typeof import("plantuml-encoder")> {
  if (!plantumlEncoderPromise) plantumlEncoderPromise = import("plantuml-encoder");
  return plantumlEncoderPromise;
}

// Cheap regex pre-check on the source — only triggers the lazy import when
// the doc actually contains the relevant syntax. Saves the network round-trip
// + parse cost on docs that don't.
const KATEX_HINT_RE = /\$[^$\n]+\$|\$\$/;
function sourceMaybeHasKatex(src: string): boolean {
  return KATEX_HINT_RE.test(src);
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * Emit a placeholder `<div>` instead of an `<img src=remote>` so markdown
 * rendering stays fully synchronous and offline-safe. The actual SVG is
 * fetched (with cache + timeout) by `hydratePlantuml` in Preview.tsx after
 * the HTML is mounted.
 */
/**
 * Emit a placeholder `<div>` for mermaid blocks. The actual SVG is rendered
 * by `hydrateMermaid` in Preview.tsx after mount (mermaid is large + lazy).
 */
function renderMermaid(source: string, line: number): string {
  return (
    `<div class="mermaid-diagram" data-line="${line}" ` +
    `data-mermaid-source="${escapeAttr(source)}">` +
    `<div class="mermaid-loading">${escapeAttr(
      tStatic("markdown.mermaidLoading"),
    )}</div>` +
    `</div>`
  );
}

function renderPlantumlPlaceholder(source: string, line: number, encoded: string): string {
  return (
    `<div class="plantuml-diagram" data-line="${line}" ` +
    `data-plantuml-encoded="${escapeAttr(encoded)}" ` +
    `data-plantuml-source="${escapeAttr(source)}">` +
    `<div class="plantuml-loading">${escapeAttr(
      tStatic("markdown.plantumlLoading"),
    )}</div>` +
    `</div>`
  );
}

const md = new MarkdownIt({
  // Allow inline HTML so `<span style="color:…">` / `<mark>` / `<sup>` etc.
  // emitted by the toolbar's Color / Highlight buttons render as expected.
  // Local editor on local content — no XSS surface to worry about.
  html: true,
  linkify: true,
  breaks: false,
  typographer: false,
});

md.use(anchor, { permalink: false });
md.use(markdownTableLists);
md.use(taskLists, { enabled: false });
md.use(footnote);
md.use(markdownExtensions);
const footnoteOpen = md.renderer.rules.footnote_open!;
md.renderer.rules.footnote_open = (tokens, i, options, env, renderer) => {
  const label = env.footnotes?.list?.[tokens[i].meta.id]?.label ?? "";
  return footnoteOpen(tokens, i, options, env, renderer).replace("<li", `<li data-footnote-label="${escapeAttr(label)}"`);
};
// KaTeX is registered lazily by renderMarkdown() when the source actually
// contains math — see loadKatex().

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

["paragraph_open", "heading_open", "blockquote_open", "list_item_open", "table_open"].forEach(
  (rule) => {
    const original = md.renderer.rules[rule];
    md.renderer.rules[rule] = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      if (token.map) token.attrSet("data-line", String(token.map[0] + 1));
      // Ordered-list items: token.info holds the digits the author actually
      // typed (CommonMark normally renumbers 1,2,3…). Inject `value="N"` so
      // `1. / 5. / 9.` renders as 1 / 5 / 9 instead of 1 / 2 / 3.
      if (rule === "list_item_open" && token.info) {
        token.attrSet("value", token.info);
      }
      return original
        ? original(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    };
  },
);

// Tag images with their raw `src`. Preview.tsx walks these after mount, resolves
// relative paths against the active markdown file's directory, and rewrites the
// `src` to a Tauri asset:// URL so the WebView can actually load local files.
const originalImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcAttr = token.attrGet("src") ?? "";
  if (srcAttr) token.attrSet("data-raw-src", srcAttr);
  return originalImage(tokens, idx, options, env, self);
};

export interface RenderOptions {
  theme: "light" | "dark";
}

export async function renderMarkdown(
  source: string,
  opts: RenderOptions,
): Promise<string> {
  // Lazy-load KaTeX only if the source LOOKS like it might have math.
  // Wrong positives (a `$` in code) are harmless — the plugin just won't
  // find valid expressions to render. The real win is on the 99% of docs
  // that have no math: we skip 628 KB of parse + load.
  if (sourceMaybeHasKatex(source)) {
    await loadKatex();
  }
  const hl = await getHighlighter();
  const env: Record<string, unknown> = {};
  const tokens = md.parse(source, env);
  // Pre-scan for plantuml — if any fence is plantuml, load the encoder once
  // before the synchronous render pass below.
  let needsPlantuml = false;
  for (const t of tokens) {
    if (t.type !== "fence") continue;
    const lang = (t.info || "").trim().split(/\s+/)[0].toLowerCase();
    if (PLANTUML_LANGS.has(lang)) { needsPlantuml = true; break; }
  }
  const plantumlEnc = needsPlantuml ? (await loadPlantumlEncoder()).default : null;

  const highlighted = new Map<number, string>();
  const shikiTheme = opts.theme === "dark" ? "one-dark-pro" : "github-light";

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "fence") continue;
    const lang = (t.info || "").trim().split(/\s+/)[0].toLowerCase() || "text";
    if (PLANTUML_LANGS.has(lang)) {
      const line = t.map ? t.map[0] + 1 : 0;
      let encoded = "";
      try {
        encoded = plantumlEnc!.encode(t.content);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        highlighted.set(
          i,
          `<div class="plantuml-diagram error" data-line="${line}">${escapeAttr(
            tStatic("markdown.plantumlError", { error: err }),
          )}</div>`,
        );
        continue;
      }
      highlighted.set(i, renderPlantumlPlaceholder(t.content, line, encoded));
      continue;
    }
    if (MERMAID_LANGS.has(lang)) {
      const line = t.map ? t.map[0] + 1 : 0;
      highlighted.set(i, renderMermaid(t.content, line));
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

  return md.renderer.render(tokens, md.options, { ...env, __highlighted: highlighted });
}

export async function renderCode(
  source: string,
  filePath: string | null,
  opts: RenderOptions,
): Promise<string> {
  const hl = await getHighlighter();
  const langDef = detectLang(filePath);
  const resolved = await ensureLanguage(hl, langDef.shiki);
  const shikiTheme = opts.theme === "dark" ? "one-dark-pro" : "github-light";
  try {
    if (resolved === "text" && langDef.shiki === "text" && langDef.label !== "Text") {
      const { renderLanguageFallback } = await import("./codeHighlightFallback");
      return await renderLanguageFallback(source, langDef, opts.theme);
    }
    return hl.codeToHtml(source, { lang: resolved, theme: shikiTheme });
  } catch {
    return hl.codeToHtml(source, { lang: "text", theme: shikiTheme });
  }
}
