import { markdownCustomStyle } from "../lib/markdownCustomStyle";
import { useEditorStore } from "../store/editor";
import { forwardRef, useMemo, type CSSProperties, type HTMLAttributes } from "react";
import type { MarkdownPreferences } from "../lib/markdownPreferences";

interface Props extends HTMLAttributes<HTMLDivElement> {
  fontSize: number;
  documentTheme: MarkdownPreferences["documentTheme"];
  /** The editable document is owned by ProseMirror below this surface. */
  editorHost?: boolean;
  customStyleEnabled?: boolean;
}

/** Shared appearance boundary. Never replaces the editor's content DOM. */
const MarkdownDocumentSurface = forwardRef<HTMLDivElement, Props>(function MarkdownDocumentSurface(
  { fontSize, documentTheme, editorHost = false, customStyleEnabled = true, className = "", style, children, ...props }, ref,
) {
  const settings = useEditorStore(s => s.markdownSettings);
  const customCss = settings.customCss;
  const css = useMemo(() => customStyleEnabled ? markdownCustomStyle(customCss) : "", [customCss, customStyleEnabled]);
  return <>{css && <style>{css}</style>}<div {...props} ref={ref} data-md-theme={documentTheme} data-md-custom-style={customStyleEnabled} data-md-code-lines={customStyleEnabled && settings.codeLineNumbers} data-md-code-wrap={customStyleEnabled && settings.codeWrap}
    className={`md-surface${editorHost ? "" : " md-document"} ${className}`}
    style={{ ...style, "--md-visual-font-size": `${fontSize}px`, "--md-document-zoom": `${fontSize - 14}px`, "--md-code-indent": settings.codeIndent } as CSSProperties}>{children}</div></>;
});
export default MarkdownDocumentSurface;
