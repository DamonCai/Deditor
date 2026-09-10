import { useEffect, useState } from "react";
import { useT } from "../lib/i18n";
import { useModalFocus } from "../lib/useModalFocus";
import { Button } from "./ui/Button";
import {
  EXPORT_FORMATS,
  exportMarkdown,
  type ExportFormat,
} from "../lib/export";
import {
  listDiagrams,
  type ExportDiagram,
  type ExportSnapshot,
} from "../lib/markdownExport/document";
import { logError } from "../lib/logger";

export default function MarkdownExportDialog({
  snapshot,
  onClose,
}: {
  snapshot: ExportSnapshot;
  onClose: () => void;
}) {
  const t = useT();
  const [format, setFormat] = useState<ExportFormat>("html");
  const [diagrams, setDiagrams] = useState<ExportDiagram[] | null>(null);
  const [diagramIndex, setDiagramIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useModalFocus(true, () => {
    if (!busy) onClose();
  });
  const diagram = format === "svg" || format === "png";
  useEffect(() => {
    if (!diagram || diagrams !== null) return;
    let alive = true;
    listDiagrams(snapshot)
      .then((result) => {
        if (alive) setDiagrams(result);
      })
      .catch((err) => {
        logError("list export diagrams failed", err);
        if (alive) {
          setError(String(err));
          setDiagrams([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [diagram, diagrams, snapshot]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (await exportMarkdown(snapshot, format, diagramIndex)) onClose();
    } catch (err) {
      logError("Markdown export failed", err);
      setError(
        t("export.failed", {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="md-insert-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        className="md-insert-dialog md-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="md-export-title"
        tabIndex={-1}
      >
        <h2 id="md-export-title">{t("export.title")}</h2>
        <p className="md-export-filename">
          {snapshot.filePath?.split(/[\\/]/).pop() || t("export.untitled")}
        </p>
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="md-export-formats">
            <legend>{t("export.format")}</legend>
            {EXPORT_FORMATS.map((value) => (
              <label key={value} className={format === value ? "selected" : ""}>
                <input
                  type="radio"
                  name="export-format"
                  value={value}
                  checked={value === format}
                  onChange={() => {
                    setFormat(value);
                    setError("");
                  }}
                />
                <span>
                  <strong>{t(`export.${value}.name`)}</strong>
                  <small>{t(`export.${value}.short`)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="md-export-hint">{t(`export.${format}.hint`)}</p>
          {diagram && (
            <label>
              {t("export.diagram")}
              <select
                className="deditor-input"
                value={diagramIndex}
                disabled={busy || !diagrams?.length}
                onChange={(e) => setDiagramIndex(Number(e.target.value))}
              >
                {diagrams?.length ? (
                  diagrams.map((item) => (
                    <option key={item.index} value={item.index}>
                      {item.label}
                    </option>
                  ))
                ) : (
                  <option>
                    {t(diagrams ? "export.noDiagrams" : "export.loading")}
                  </option>
                )}
              </select>
            </label>
          )}
          {format !== "txt" && (
            <p className="md-export-note">{t("export.assetsNote")}</p>
          )}
          {error && (
            <p role="alert" className="md-insert-error">
              {error}
            </p>
          )}
          <div className="md-insert-actions">
            <Button onClick={onClose} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || (diagram && !diagrams?.length)}
            >
              {t(
                busy
                  ? "export.working"
                  : format === "pdf"
                    ? "export.print"
                    : "export.save",
              )}
            </Button>
          </div>
          <span role="status" className="md-export-status">
            {busy ? t("export.working") : ""}
          </span>
        </form>
      </div>
    </div>
  );
}
