import { useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../store/editor";
import { parseCsv, type CsvDelimiter } from "../lib/csv";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import "./csv-preview.css";

const PAGE_SIZE = 100;

export default function CsvPreview({ tabId, visible = true }: { tabId: string; visible?: boolean }) {
  const t = useT();
  const source = useEditorStore(s => visible ? s.tabs.find(tab => tab.id === tabId)?.content ?? "" : "");
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(",");
  const [hasHeader, setHasHeader] = useState(true);
  const [page, setPage] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  // Keep display options while the source-only view is open, without parsing
  // hidden documents on every keystroke. Reparse current source on re-entry.
  const lastParsed = useRef<ReturnType<typeof parseCsv>>(parseCsv(""));
  const parsed = useMemo(() => {
    if (visible) lastParsed.current = parseCsv(source, delimiter);
    return lastParsed.current;
  }, [source, delimiter, visible]);
  const offset = hasHeader && parsed.rows.length ? 1 : 0;
  const rowCount = parsed.rows.length - offset;
  const pages = Math.max(1, Math.ceil(rowCount / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const start = offset + currentPage * PAGE_SIZE;
  const rows = parsed.rows.slice(start, start + PAGE_SIZE);
  const columns = Array.from({ length: parsed.columns }, (_, index) => index);
  useEffect(() => { setPage(currentPage); }, [currentPage]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [currentPage, delimiter, hasHeader]);

  return <section className="csv-preview" aria-label={t("csv.previewTitle")}>
    <div className="csv-preview-options">
      <label className="csv-header-toggle"><input type="checkbox" checked={hasHeader} onChange={event => { setHasHeader(event.target.checked); setPage(0); }} />{t("csv.firstRowHeader")}</label>
      <label className="csv-delimiter">{t("csv.delimiter")}
        <select className="deditor-input deditor-input--compact" value={delimiter} onChange={event => { setDelimiter(event.target.value as CsvDelimiter); setPage(0); }}>
          <option value=",">{t("csv.comma")}</option><option value=";">{t("csv.semicolon")}</option><option value={"\t"}>{t("csv.tab")}</option>
        </select>
      </label>
      <span className="csv-summary">{t("csv.summary", { rows: String(rowCount), columns: String(parsed.columns) })}</span>
    </div>
    {parsed.issue && <div className="deditor-notice" data-tone="error" role="alert">{t(`csv.${parsed.issue}`)}</div>}
    {parsed.ragged && <div className="deditor-notice" role="status">{t("csv.ragged")}</div>}
    {!parsed.rows.length ? <div className="csv-empty" role="status">{t("csv.empty")}</div> :
      <div className="csv-table-scroll" ref={scroller} tabIndex={0} role="region" aria-label={t("csv.previewTitle")}>
        <table className="csv-table">
          <thead><tr><th scope="col" className="csv-row-number">{t("csv.rowNumber")}</th>{columns.map(column =>
            <th scope="col" key={column}>{hasHeader ? parsed.rows[0][column] ?? "" : t("csv.column", { number: String(column + 1) })}</th>,
          )}</tr></thead>
          <tbody>{rows.map((cells, index) => <tr key={start + index}>
            <th scope="row" className="csv-row-number">{currentPage * PAGE_SIZE + index + 1}</th>
            {columns.map(column => <td key={column}>{cells[column] ?? ""}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
    {pages > 1 && <div className="csv-pagination" role="group" aria-label={t("csv.pagination")}>
      <Button size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("csv.previous")}</Button>
      <span aria-live="polite">{t("csv.page", { page: String(currentPage + 1), pages: String(pages) })}</span>
      <Button size="sm" disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)}>{t("csv.next")}</Button>
    </div>}
  </section>;
}
