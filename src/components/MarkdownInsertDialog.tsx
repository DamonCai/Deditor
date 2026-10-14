import { useState } from "react";
import { useT } from "../lib/i18n";
import { useModalFocus } from "../lib/useModalFocus";
import {
  captureEditorTarget,
  escapeMarkdownLabel,
  insertBlock,
  insertCodeBlock,
  insertLink,
  insertText,
  markdownDestination,
} from "../lib/editorBridge";
import { Button } from "./ui/Button";

export type InsertKind = "link" | "image" | "table" | "codeblock";
export default function MarkdownInsertDialog({
  kind,
  target,
  onClose,
}: {
  kind: InsertKind;
  target: NonNullable<ReturnType<typeof captureEditorTarget>>;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useModalFocus(true, onClose);
  const [label, setLabel] = useState(
    target.selected ||
      t(kind === "image" ? "md.imageDefaultAlt" : "md.linkDefaultText"),
  );
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("");
  const [columns, setColumns] = useState(2);
  const [rows, setRows] = useState(3);
  const [error, setError] = useState("");
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if ((kind === "link" || kind === "image") && !url.trim()) return;
    if (
      kind === "table" &&
      (!Number.isInteger(columns) ||
        columns < 1 ||
        columns > 20 ||
        !Number.isInteger(rows) ||
        rows < 1 ||
        rows > 50)
    )
      return;
    const applied = target.apply(() => {
      if (kind === "link") insertLink(url, label);
      if (kind === "image")
        insertText(
          `![${escapeMarkdownLabel(label)}](${markdownDestination(url)})`,
        );
      if (kind === "codeblock") insertCodeBlock(language.trim());
      if (kind === "table") {
        const headers = Array.from({ length: columns }, (_, i) =>
          t("md.tableColumn", { n: String(i + 1) }),
        );
        const row = (cells: string[]) => `| ${cells.join(" | ")} |`;
        const text = [
          row(headers),
          row(Array(columns).fill("---")),
          ...Array.from({ length: rows }, () => row(Array(columns).fill(" "))),
        ].join("\n");
        insertBlock(text, 2, headers[0].length);
      }
    });
    if (applied) onClose();
    else setError(t("md.targetChanged"));
  };
  return (
    <div
      className="md-insert-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="md-insert-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={t(`md.${kind}`)}
        tabIndex={-1}
      >
        <h2>{t(`md.${kind}`)}</h2>
        <form onSubmit={submit}>
          {(kind === "link" || kind === "image") && (
            <>
              <label>
                {t(kind === "image" ? "md.imageAltLabel" : "md.linkText")}
                <input
                  className="deditor-input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </label>
              <label>
                {t(kind === "image" ? "md.imageUrlLabel" : "md.linkUrl")}
                <input
                  className="deditor-input"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={
                    kind === "image"
                      ? "assets/image.png"
                      : "https://example.com"
                  }
                  required
                />
              </label>
            </>
          )}
          {kind === "codeblock" && (
            <label>
              {t("md.codeLanguage")}
              <input
                className="deditor-input"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="typescript / python / sql"
                pattern="[^`\r\n]*"
                list="md-code-languages"
              />
              <datalist id="md-code-languages">
                {[
                  "text",
                  "typescript",
                  "javascript",
                  "python",
                  "rust",
                  "json",
                  "sql",
                  "bash",
                  "html",
                  "css",
                  "yaml",
                ].map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
          )}
          {kind === "table" && (
            <div className="md-insert-dimensions">
              <label>
                {t("md.tableColumns")}
                <input
                  className="deditor-input"
                  type="number"
                  min={1}
                  max={20}
                  required
                  value={Number.isNaN(columns) ? "" : columns}
                  onChange={(e) => setColumns(e.target.valueAsNumber)}
                />
              </label>
              <label>
                {t("md.tableRows")}
                <input
                  className="deditor-input"
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={Number.isNaN(rows) ? "" : rows}
                  onChange={(e) => setRows(e.target.valueAsNumber)}
                />
              </label>
            </div>
          )}
          {error && (
            <div className="deditor-notice" role="alert" data-tone="error">
              {error}
            </div>
          )}
          <div className="md-insert-actions">
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" type="submit">
              {t("md.insert")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
