import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { openFileByPath } from "../lib/fileio";
import { getActiveView } from "../lib/editorBridge";
import { useT } from "../lib/i18n";
import { logError } from "../lib/logger";
import LangIcon from "./LangIcon";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface SearchHit {
  path: string;
  line: number;
  col: number;
  text: string;
}

interface SearchResult {
  hits: SearchHit[];
  truncated: boolean;
  files_scanned: number;
}

export default function FindInFiles({ open, onClose }: Props) {
  const t = useT();
  const workspaces = useEditorStore((s) => s.workspaces);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounce search by 300ms after typing stops.
  useEffect(() => {
    if (!open) return;
    if (!query.trim()) {
      setResults(null);
      return;
    }
    const id = ++reqIdRef.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await invoke<SearchResult>("find_in_files", {
          roots: workspaces,
          query,
          caseSensitive,
        });
        if (reqIdRef.current === id) {
          setResults(res);
          setSearching(false);
        }
      } catch (err) {
        if (reqIdRef.current === id) {
          logError("find_in_files failed", err);
          setSearching(false);
          setResults({ hits: [], truncated: false, files_scanned: 0 });
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query, caseSensitive, workspaces]);

  // Group hits by file path for the result list.
  const grouped = useMemo(() => {
    if (!results) return [];
    const map = new Map<string, SearchHit[]>();
    for (const h of results.hits) {
      const arr = map.get(h.path);
      if (arr) arr.push(h);
      else map.set(h.path, [h]);
    }
    return Array.from(map.entries()).map(([path, hits]) => ({ path, hits }));
  }, [results]);

  const total = results?.hits.length ?? 0;

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const openHit = async (path: string, line: number, col: number) => {
    await openFileByPath(path);
    // Defer one frame so the editor mounts / state restores before we jump.
    requestAnimationFrame(() => {
      const view = getActiveView();
      if (!view) return;
      try {
        const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
        const pos = lineInfo.from + Math.max(0, col - 1);
        view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        /* doc shorter than expected */
      }
    });
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
        paddingTop: "8vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
          }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              workspaces.length === 0
                ? t("find.placeholderNoWorkspace")
                : t("find.placeholder")
            }
            spellCheck={false}
            style={{
              flex: 1,
              padding: "6px 10px",
              fontSize: 13,
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              outline: "none",
            }}
          />
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            title={t("find.caseSensitive")}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontFamily: "var(--font-mono, ui-monospace, monospace)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              background: caseSensitive ? "var(--accent)" : "var(--bg)",
              color: caseSensitive ? "#fff" : "var(--text-soft)",
              cursor: "pointer",
            }}
          >
            Aa
          </button>
        </div>

        <div
          style={{
            padding: "6px 12px",
            fontSize: 11,
            color: "var(--text-soft)",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
          }}
        >
          {workspaces.length === 0
            ? t("find.noWorkspaceHint")
            : searching
            ? t("find.searching")
            : results
            ? t("find.summary", {
                hits: String(total),
                files: String(grouped.length),
                scanned: String(results.files_scanned),
              }) + (results.truncated ? " · " + t("find.truncated") : "")
            : t("find.idle")}
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {grouped.map(({ path, hits }) => (
            <div key={path} style={{ borderBottom: "1px solid var(--border)" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 12px",
                  background: "var(--bg-soft)",
                  fontSize: 12,
                  color: "var(--text-soft)",
                }}
              >
                <LangIcon filePath={path} size={14} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {path}
                </span>
                <span className="tabular-nums">{hits.length}</span>
              </div>
              {hits.map((h, i) => (
                <div
                  key={i}
                  onClick={() => void openHit(h.path, h.line, h.col)}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 12,
                    padding: "3px 24px",
                    fontSize: 12,
                    fontFamily: "var(--font-mono, ui-monospace, monospace)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-mute)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "";
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-soft)",
                      minWidth: 50,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {h.line}:{h.col}
                  </span>
                  <span
                    style={{
                      color: "var(--text)",
                      flex: 1,
                      whiteSpace: "pre",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {h.text}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
