/** Prettier wrapper. Loads parser + plugin bundles lazily so the editor's main
 *  bundle doesn't carry a parser the user may never use. Returns the formatted
 *  text, or `null` if the extension isn't supported / formatting failed (caller
 *  falls back to writing the original buffer). */

import { format as prettierFormat } from "prettier/standalone";
import type { Plugin } from "prettier";

type PluginLoader = () => Promise<Plugin[]>;

interface ParserConfig {
  parser: string;
  plugins: PluginLoader;
}

// Each loader returns the plugin objects (the whole module namespace —
// prettier looks up `parsers` / `printers` / `languages` / `options` keys on
// the plugin object, which is exactly the shape of these modules' named
// exports; there is no `default` export to unwrap). estree is shared by every
// JS-flavour parser.
const asPlugin = (m: unknown): Plugin => m as Plugin;

const loadEstreeJs: PluginLoader = async () => {
  const [estree, babel] = await Promise.all([
    import("prettier/plugins/estree"),
    import("prettier/plugins/babel"),
  ]);
  return [asPlugin(estree), asPlugin(babel)];
};

const loadEstreeTs: PluginLoader = async () => {
  const [estree, ts] = await Promise.all([
    import("prettier/plugins/estree"),
    import("prettier/plugins/typescript"),
  ]);
  return [asPlugin(estree), asPlugin(ts)];
};

const loadCss: PluginLoader = async () => {
  const m = await import("prettier/plugins/postcss");
  return [asPlugin(m)];
};

const loadHtml: PluginLoader = async () => {
  const m = await import("prettier/plugins/html");
  return [asPlugin(m)];
};

const loadMarkdown: PluginLoader = async () => {
  const m = await import("prettier/plugins/markdown");
  return [asPlugin(m)];
};

const loadYaml: PluginLoader = async () => {
  const m = await import("prettier/plugins/yaml");
  return [asPlugin(m)];
};

const EXT_MAP: Record<string, ParserConfig> = {
  ".js":     { parser: "babel", plugins: loadEstreeJs },
  ".jsx":    { parser: "babel", plugins: loadEstreeJs },
  ".mjs":    { parser: "babel", plugins: loadEstreeJs },
  ".cjs":    { parser: "babel", plugins: loadEstreeJs },
  ".ts":     { parser: "typescript", plugins: loadEstreeTs },
  ".tsx":    { parser: "typescript", plugins: loadEstreeTs },
  ".mts":    { parser: "typescript", plugins: loadEstreeTs },
  ".cts":    { parser: "typescript", plugins: loadEstreeTs },
  ".json":   { parser: "json", plugins: loadEstreeJs },
  ".jsonc":  { parser: "json", plugins: loadEstreeJs },
  ".css":    { parser: "css", plugins: loadCss },
  ".scss":   { parser: "scss", plugins: loadCss },
  ".less":   { parser: "less", plugins: loadCss },
  ".html":   { parser: "html", plugins: loadHtml },
  ".htm":    { parser: "html", plugins: loadHtml },
  ".vue":    { parser: "vue", plugins: loadHtml },
  ".md":     { parser: "markdown", plugins: loadMarkdown },
  ".mdx":    { parser: "markdown", plugins: loadMarkdown },
  ".markdown": { parser: "markdown", plugins: loadMarkdown },
  ".yaml":   { parser: "yaml", plugins: loadYaml },
  ".yml":    { parser: "yaml", plugins: loadYaml },
};

export function isFormattable(filePath: string | null): boolean {
  if (!filePath) return false;
  const ext = extname(filePath);
  return ext != null && ext in EXT_MAP;
}

function extname(path: string): string | null {
  const idx = path.lastIndexOf(".");
  if (idx < 0) return null;
  // Reject paths whose only "." is in a directory name.
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (idx < slash) return null;
  return path.slice(idx).toLowerCase();
}

/** Format `text` using the parser keyed off `filePath`'s extension. Returns the
 *  formatted text, or `null` if the extension is unsupported or prettier
 *  rejected the input. Errors are logged (so the user sees something in the
 *  log if format silently no-ops) but never re-thrown — save must succeed
 *  even when format can't. */
export async function formatBuffer(
  text: string,
  filePath: string | null,
): Promise<string | null> {
  if (!filePath) return null;
  const ext = extname(filePath);
  if (!ext) return null;
  const cfg = EXT_MAP[ext];
  if (!cfg) return null;
  try {
    const plugins = await cfg.plugins();
    const out = await prettierFormat(text, {
      parser: cfg.parser,
      plugins,
    });
    return out;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[format] prettier failed for ${filePath} (${cfg.parser}):`, msg);
    return null;
  }
}
