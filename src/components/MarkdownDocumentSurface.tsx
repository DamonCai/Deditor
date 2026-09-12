import { forwardRef, type CSSProperties, type HTMLAttributes } from "react";
import type { MarkdownPreferences } from "../lib/markdownPreferences";

interface Props extends HTMLAttributes<HTMLDivElement> {
  fontSize: number;
  documentTheme: MarkdownPreferences["documentTheme"];
  /** The editable document is owned by ProseMirror below this surface. */
  editorHost?: boolean;
}

/** Shared appearance boundary. Never replaces the editor's content DOM. */
const MarkdownDocumentSurface = forwardRef<HTMLDivElement, Props>(function MarkdownDocumentSurface(
  { fontSize, documentTheme, editorHost = false, className = "", style, ...props }, ref,
) {
  return <div {...props} ref={ref} data-md-theme={documentTheme}
    className={`md-surface${editorHost ? "" : " md-document"} ${className}`}
    style={{ ...style, "--md-visual-font-size": `${fontSize}px`, "--md-document-zoom": `${fontSize - 14}px` } as CSSProperties} />;
});
export default MarkdownDocumentSurface;
