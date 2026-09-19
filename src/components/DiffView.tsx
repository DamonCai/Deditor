import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { computeDiff, diffDisplayRows, diffHunks, type DiffRow } from "../lib/diff";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";
import { Button } from "./ui/Button";
import "./diff-view.css";
import LangIcon from "./LangIcon";
import { useT } from "../lib/i18n";
import type { DiffSpec } from "../store/editor";

interface Props {
  spec: DiffSpec;
  navigation?: boolean;
}

const ROW_PAD = "0 8px";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function DiffView({ spec, navigation = false }: Props) {
  const t = useT();
  const { rows, stats } = useMemo(
    () => computeDiff(spec.leftContent, spec.rightContent),
    [spec.leftContent, spec.rightContent],
  );

  const hunks = useMemo(() => diffHunks(rows), [rows]);
  const hasUnchanged = useMemo(() => rows.some(row => row.changeType === "eq"), [rows]);
  const [collapsed, setCollapsed] = useState(navigation);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [active, setActive] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const displayRows = useMemo(() => diffDisplayRows(rows, navigation && collapsed, expanded), [rows, navigation, collapsed, expanded]);
  useLayoutEffect(() => {
    setActive(0);
    setCollapsed(navigation);
    setExpanded(new Set());
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [rows, navigation]);
  function scrollToHunk(index: number) {
    const container = scroller.current;
    const hunk = hunks[index];
    if (!container || !hunk) return;
    const row = container.querySelector<HTMLElement>(`[data-diff-row="${hunk.start}"]`);
    if (row) container.scrollTo({ top: container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientHeight / 3 });
  }
  useLayoutEffect(() => {
    if (navigation) scrollToHunk(active);
  }, [active, hunks, collapsed, navigation]);
  useLayoutEffect(() => {
    const container = scroller.current;
    if (!navigation || !container || typeof ResizeObserver === "undefined") return;
    // Full view and window resizing change wrapping and thus each row's height.
    const observer = new ResizeObserver(() => scrollToHunk(active));
    observer.observe(container);
    return () => observer.disconnect();
  }, [active, hunks, navigation]);

  const leftName = basename(spec.leftPath);
  const rightName = basename(spec.rightPath);

  return (
    <div className="diff-view flex flex-col h-full w-full" style={{ background: "var(--bg)" }}>
      {/* Header: paths + stats */}
      <div
        className="flex items-center px-3 text-xs"
        style={{
          height: 32,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-soft)",
          color: "var(--text-soft)",
          flexShrink: 0,
          gap: 12,
        }}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1" title={spec.leftPath}>
          <LangIcon filePath={spec.leftPath} size={14} />
          <span className="truncate">{leftName}</span>
        </div>
        <span style={{ color: "var(--text-soft)" }}>↔</span>
        <div className="flex items-center gap-1 min-w-0 flex-1" title={spec.rightPath}>
          <LangIcon filePath={spec.rightPath} size={14} />
          <span className="truncate">{rightName}</span>
        </div>
        <span className="tabular-nums" style={{ color: "var(--success-text)" }}>+{stats.addedLines}</span>
        <span className="tabular-nums" style={{ color: "var(--error-text)" }}>−{stats.removedLines}</span>
        <span className="tabular-nums" style={{ color: "var(--text-soft)" }}>~{stats.modifiedLines}</span>
      </div>

      {navigation && <div className="diff-navigation">
        <Button size="sm" pressed={collapsed} disabled={!hasUnchanged} onClick={() => { setCollapsed(!collapsed); setExpanded(new Set()); }}>{t("diff.collapseUnchanged")}</Button>
        <div className="diff-navigation-steps">
          <Button size="icon" title={t("diff.previous")} disabled={!hunks.length || active <= 0} onClick={() => setActive(active - 1)}><FiChevronUp /></Button>
          <span className="diff-position" role="status">{t("diff.position", { current: hunks.length ? active + 1 : 0, total: hunks.length })}</span>
          <Button size="icon" title={t("diff.next")} disabled={!hunks.length || active >= hunks.length - 1} onClick={() => setActive(active + 1)}><FiChevronDown /></Button>
        </div>
      </div>}
      {navigation && !hunks.length && <div className="diff-identical" role="status">{t("diff.identical")}</div>}
      {/* One shared scroll container keeps both sides and their line numbers aligned. */}
      <div className="diff-body">
      <div ref={scroller} className="diff-scroll flex-1 min-h-0 overflow-auto" tabIndex={navigation ? 0 : undefined} aria-label={navigation ? t("diff.content") : undefined}>

        {rows.length === 0 && !navigation ? (
          <div className="p-6 text-sm" style={{ color: "var(--text-soft)" }}>
            {t("diff.identical")}
          </div>
        ) : (
          <table
            style={{
              borderCollapse: "collapse",
              width: "100%",
              tableLayout: "fixed",
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              fontSize: 12,
              lineHeight: "18px",
            }}
          >
            <colgroup>
              <col style={{ width: 48 }} />
              <col style={{ width: "calc(50% - 48px)" }} />
              <col style={{ width: 48 }} />
              <col style={{ width: "calc(50% - 48px)" }} />
            </colgroup>
            <tbody>
              {displayRows.map(item => item.kind === "fold" ? (
                <tr key={`fold-${item.start}`} className="diff-fold"><td colSpan={4}>
                  <Button size="sm" variant="ghost" onClick={() => { setExpanded(previous => new Set([...previous, item.start])); scroller.current?.focus({ preventScroll: true }); }}>{t("diff.expandLines", { count: item.end - item.start })}</Button>
                </td></tr>
              ) : <Row key={item.index} row={rows[item.index]} index={item.index} active={navigation && item.index >= (hunks[active]?.start ?? -1) && item.index < (hunks[active]?.end ?? -1)} />)}
            </tbody>
          </table>
        )}
      </div>
      {navigation && <div className="diff-overview" role="navigation" aria-label={t("diff.overview")}>
        {hunks.map((hunk, index) => <Button key={hunk.start} size="icon" variant="ghost" className="diff-overview-marker" pressed={active === index} title={t("diff.jump", { index: index + 1, start: hunk.start + 1, end: hunk.end })} style={{ top: `calc(${hunk.start / Math.max(rows.length, 1) * 100}% - ${hunk.start / Math.max(rows.length, 1) * 24}px)` }} onClick={() => { setActive(index); scrollToHunk(index); }}><span data-change={rows[hunk.start].changeType} /></Button>)}
      </div>}
      </div>
    </div>
  );
}

function Row({ row, index, active }: { row: DiffRow; index: number; active: boolean }) {
  const leftBg = bgFor(row, "left");
  const rightBg = bgFor(row, "right");
  return (
    <tr data-diff-row={index} data-change={row.changeType} className={active ? "diff-row-active" : undefined}>
      <td style={{ ...lineNumStyle, background: leftBg }}>{row.leftLineNum ?? ""}</td>
      <td style={{ ...cellStyle, background: leftBg }}>
        {row.left == null ? "" : row.left || " "}
      </td>
      <td style={{ ...lineNumStyle, background: rightBg }}>{row.rightLineNum ?? ""}</td>
      <td style={{ ...cellStyle, background: rightBg }}>
        {row.right == null ? "" : row.right || " "}
      </td>
    </tr>
  );
}

function bgFor(row: DiffRow, side: "left" | "right"): string {
  if (row.changeType === "eq") return "transparent";
  if (row.changeType === "del") return side === "left" ? "var(--diff-del-bg)" : "var(--diff-empty-bg)";
  if (row.changeType === "add") return side === "left" ? "var(--diff-empty-bg)" : "var(--diff-add-bg)";
  // mod: both sides shown; missing one of the two becomes empty
  if (side === "left") return row.left == null ? "var(--diff-empty-bg)" : "var(--diff-del-bg)";
  return row.right == null ? "var(--diff-empty-bg)" : "var(--diff-add-bg)";
}

const lineNumStyle: React.CSSProperties = {
  textAlign: "right",
  padding: ROW_PAD,
  color: "var(--text-soft)",
  userSelect: "none",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  borderRight: "1px solid var(--border)",
};

const cellStyle: React.CSSProperties = {
  padding: ROW_PAD,
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  color: "var(--text)",
};
