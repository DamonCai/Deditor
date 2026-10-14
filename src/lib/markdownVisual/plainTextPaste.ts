import type { Node as ProseNode, Slice } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";

/** Preserve whitespace in ordinary text before the Markdown clipboard roundtrip trims it. */
export function pastePlainText(view: EditorView, event: ClipboardEvent, slice: Slice, parse: (source: string) => ProseNode) {
  const data = event.clipboardData, text = data?.getData("text/plain");
  if (!view.editable || view.composing || view.state.selection.$from.parent.type.spec.code || !text ||
      data?.getData("text/html") || data?.getData("vscode-editor-data")) return false;
  // Structured Markdown, references, entities and escaped syntax keep the
  // Markdown paste path. Only unformatted text uses the browser's text slice.
  const parsed = parse(text);
  let plain = true;
  parsed.descendants(node => {
    if (!["paragraph", "text", "hardbreak"].includes(node.type.name) || node.marks.length) plain = false;
  });
  const normalized = (value: string) => value.replace(/\s+/g, " ").trim();
  if (!plain || normalized(parsed.textBetween(0, parsed.content.size, " ", " ")) !== normalized(text)) return false;
  view.dispatch(view.state.tr.replaceSelection(slice).setMeta("paste", true).setMeta("uiEvent", "paste").scrollIntoView());
  return true;
}
