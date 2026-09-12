declare module "markdown-it-task-lists";

declare module "plantuml-encoder" {
  export function encode(source: string): string;
  const _default: { encode: (source: string) => string };
  export default _default;
}

declare module "markdown-it-emoji/lib/data/full.mjs" {
  const emoji: Record<string, string>;
  export default emoji;
}

declare module "markdown-it-mark" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-sub" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-sup" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}

declare module "katex/contrib/mhchem";

declare module "flowchart.js" { const flowchart: {parse(source: string): {drawSVG(id: string, options: Record<string, unknown>): void}}; export default flowchart; }
