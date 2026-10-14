import { StateField, type EditorState } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { ensureLanguage, getHighlighter } from "../highlight";
import type { BundledLanguage } from "shiki";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";

/** Use the same grammar and token theme as the document's static code blocks. */
export async function codePresentation(language: string, theme: "light" | "dark") {
  const highlighter = await getHighlighter();
  const lang = await ensureLanguage(highlighter, language);
  const decorate = (state: EditorState) => {
    const { tokens } = highlighter.codeToTokens(state.doc.toString(), {
      lang: lang as BundledLanguage | "text", theme: theme === "dark" ? "one-dark-pro" : "github-light",
    });
    const ranges = [];
    for (let index = 0; index < state.doc.lines; index++) {
      const line = state.doc.line(index + 1);
      ranges.push(Decoration.line({ attributes: { "data-code-line": String(index + 1) } }).range(line.from));
      let offset = line.from;
      for (const token of tokens[index] ?? []) {
        if (token.content.length) {
          const flags = token.fontStyle ?? 0;
          ranges.push(Decoration.mark({ attributes: { style:
            `color:${token.color ?? "inherit"};font-style:${flags & 1 ? "italic" : "normal"};font-weight:${flags & 2 ? "bold" : "normal"};text-decoration:${flags & 4 ? "underline" : "none"}`,
          } }).range(offset, offset + token.content.length));
          offset += token.content.length;
        }
      }
    }
    return Decoration.set(ranges, true);
  };
  const field = StateField.define({
    create: decorate,
    update: (value, tr) => tr.docChanged ? decorate(tr.state) : value,
    provide: field => EditorView.decorations.from(field),
  });
  // Suppress basicSetup's fallback palette, including nested token spans.
  return [syntaxHighlighting(HighlightStyle.define([])), field];
}
