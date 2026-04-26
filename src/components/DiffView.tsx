import { useMemo } from "react";
import { computeDiff, type DiffRow } from "../lib/diff";
import LangIcon from "./LangIcon";
import { useT } from "../lib/i18n";
import type { DiffSpec } from "../store/editor";

interface Props {
  spec: DiffSpec;
}

const ROW_PAD = "0 8px";

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export default function DiffView({ spec }: Props) {
  const t = useT();
  const { rows, stats } = useMemo(
    () => computeDiff(spec.leftContent, spec.rightContent),
    [spec.leftContent, spec.rightContent],
  );

  const leftName = basename(spec.leftPath);
  const rightName = basename(spec.rightPath);

  return (
    <div className="flex flex-col h-full w-full" style={{ background: "var(--bg)" }}>
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
        <span className="tabular-nums" style={{ color: "#16a34a" }}>+{stats.addedLines}</span>
        <span className="tabular-nums" style={{ color: "#dc2626" }}>−{stats.removedLines}</span>
        <span className="tabular-nums" style={{ color: "var(--text-soft)" }}>~{stats.modifiedLines}</span>
      </div>

      {/* Diff body */}
      <div className="flex-1 min-h-0 overflow-auto">
        {rows.length === 0 ? (
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
              {rows.map((row, i) => (
                <Row key={i} row={row} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Row({ row }: { row: DiffRow }) {
  const leftBg = bgFor(row, "left");
  const rightBg = bgFor(row, "right");
  return (
    <tr>
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
