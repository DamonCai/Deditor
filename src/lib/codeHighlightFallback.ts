import { highlightCode, tagHighlighter } from "@lezer/highlight";
import { highlightStyle as lightStyle } from "./islandLightTheme";
import { highlightStyle as darkStyle } from "./islandDarkTheme";
import type { LangDef } from "./lang";

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Reuse the editor grammar for languages without a bundled Shiki grammar. */
export async function renderLanguageFallback(source: string, def: LangDef, theme: "light" | "dark"): Promise<string> {
  const support = await def.cm();
  const specs = (theme === "dark" ? darkStyle : lightStyle).specs;
  const styles = specs.map((spec) => [
    spec.color && `color:${spec.color}`,
    spec.fontWeight && `font-weight:${spec.fontWeight}`,
    spec.fontStyle && `font-style:${spec.fontStyle}`,
    spec.textDecoration && `text-decoration:${spec.textDecoration}`,
  ].filter(Boolean).join(";"));
  const highlighter = tagHighlighter(specs.map((spec, i) => ({ tag: spec.tag, class: `h${i}` })));
  const lines = [""];
  highlightCode(source, support.language.parser.parse(source), highlighter, (text, classes) => {
    const style = classes?.split(" ").map((cls) => styles[Number(cls.slice(1))]).filter(Boolean).join(";");
    lines[lines.length - 1] += style ? `<span style="${style}">${escape(text)}</span>` : escape(text);
  }, () => { lines.push(""); });
  const background = theme === "dark" ? "#1e1f22" : "#ffffff";
  const foreground = theme === "dark" ? "#dfe1e5" : "#000000";
  return `<pre class="shiki" style="background-color:${background};color:${foreground}"><code>${lines.map((line) => `<span class="line">${line}</span>`).join("\n")}</code></pre>`;
}
