import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useActiveTab } from "../store/editor";
import { extractSymbols, type Symbol } from "../lib/symbols";
import { fuzzyMatch } from "../lib/fuzzy";
import { useT } from "../lib/i18n";
import { getActiveView } from "../lib/editorBridge";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Ranked {
  sym: Symbol;
  score: number;
  matchedIdx: number[];
}

const MAX_RESULTS = 200;

export default function GotoSymbol({ open, onClose }: Props) {
  const t = useT();
  const active = useActiveTab();
  const content = active?.content ?? "";
  const filePath = active?.filePath ?? null;
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const symbols = useMemo(
    () => extractSymbols(filePath, content),
    [filePath, content],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIdx(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results: Ranked[] = useMemo(() => {
    if (!query.trim()) {
      return symbols
        .map((s) => ({ sym: s, score: 0, matchedIdx: [] }))
        .slice(0, MAX_RESULTS);
    }
    const q = query.trim();
    const out: Ranked[] = [];
    for (const s of symbols) {
      const m = fuzzyMatch(q, s.name);
      if (m) out.push({ sym: s, score: m.score, matchedIdx: m.matchedIdx });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, MAX_RESULTS);
  }, [symbols, query]);

  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(0);
  }, [results.length, selectedIdx]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-sym-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  const choose = (idx: number) => {
    const r = results[idx];
    if (!r) return;
    const view = getActiveView();
    if (view) {
      const total = view.state.doc.lines;
      const lineNum = Math.min(Math.max(1, r.sym.line), total);
      try {
        const line = view.state.doc.line(lineNum);
        view.dispatch({
          selection: { anchor: line.from },
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        /* doc has changed since extraction; just close */
      }
    }
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(selectedIdx);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1050,
        display: "flex",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 90vw)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            symbols.length === 0
              ? t("symbol.placeholderEmpty")
              : t("symbol.placeholder", { n: String(symbols.length) })
          }
          spellCheck={false}
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 14,
            background: "transparent",
            color: "var(--text)",
            border: "none",
            borderBottom: "1px solid var(--border)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {results.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-soft)" }}>
              {symbols.length === 0 ? t("symbol.unsupported") : t("symbol.noMatch")}
            </div>
          )}
          {results.map((r, i) => {
            const isSel = i === selectedIdx;
            return (
              <div
                key={`${r.sym.line}-${r.sym.name}`}
                data-sym-idx={i}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => choose(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "5px 12px 5px " + (12 + r.sym.depth * 12) + "px",
                  cursor: "pointer",
                  background: isSel ? "var(--bg-mute)" : undefined,
                  color: isSel ? "var(--accent)" : "var(--text)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    color: "var(--text-soft)",
                    minWidth: 32,
                    textAlign: "center",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "1px 4px",
                    flexShrink: 0,
                  }}
                >
                  {r.sym.kind}
                </span>
                <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                  {highlightString(r.sym.name, r.matchedIdx)}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-soft)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  :{r.sym.line}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function highlightString(s: string, idx: number[]): React.ReactNode {
  if (idx.length === 0) return s;
  const out: React.ReactNode[] = [];
  let mark: string[] = [];
  let plain: string[] = [];
  const flushP = () => {
    if (plain.length) {
      out.push(plain.join(""));
      plain = [];
    }
  };
  const flushM = () => {
    if (mark.length) {
      out.push(
        <mark
          key={`m-${out.length}`}
          style={{ background: "transparent", color: "var(--accent)", fontWeight: 700 }}
        >
          {mark.join("")}
        </mark>,
      );
      mark = [];
    }
  };
  let mi = 0;
  for (let i = 0; i < s.length; i++) {
    if (mi < idx.length && i === idx[mi]) {
      flushP();
      mark.push(s[i]);
      mi++;
    } else {
      flushM();
      plain.push(s[i]);
    }
  }
  flushP();
  flushM();
  return out;
}
