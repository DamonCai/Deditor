import css from "katex/dist/katex.min.css?raw";
// Vite embeds WOFF2 bytes in this lazy export chunk: exported HTML is portable.
const fonts = import.meta.glob<string>(
  "/node_modules/katex/dist/fonts/*.woff2",
  { query: "?inline", import: "default", eager: true },
);
export function katexExportCss(): string {
  return css.replace(/src:[^;}]+/g, (rule) => {
    const name = rule.match(/fonts\/([^\s)]+\.woff2)/)?.[1];
    const data = name
      ? fonts[`/node_modules/katex/dist/fonts/${name}`]
      : undefined;
    return data ? `src:url(${data}) format("woff2")` : rule;
  });
}
