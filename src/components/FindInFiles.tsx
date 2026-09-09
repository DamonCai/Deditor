import { useModalFocus } from "../lib/useModalFocus";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { openFileByPath } from "../lib/fileio";
import { getActiveView, getActiveViewTabId } from "../lib/editorBridge";
import { useT, tStatic } from "../lib/i18n";
import { logError, logInfo } from "../lib/logger";
import { chooseAction } from "./ConfirmDialog";
import { Button } from "./ui/Button";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
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

interface ReplaceResult {
  total: number;
  files_changed: number;
  errors?: string[];
}

export default function FindInFiles({ open, onClose }: Props) {
  const t = useT();
  const panelRef = useModalFocus(open, onClose);
  const workspaces = useEditorStore((s) => s.workspaces);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqIdRef = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [resultsKey, setResultsKey] = useState("");
  const searchKey = JSON.stringify([query, caseSensitive, workspaces]);
  useEffect(() => () => { reqIdRef.current++; }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Debounce search by 300ms after typing stops.
  useEffect(() => {
    const id = ++reqIdRef.current;
    setReplacing(false);
    setResults(null);
    setResultsKey("");
    setError("");
    setNotice("");
    if (!open || !query.trim()) {
      setSearching(false);
      return;
    }
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
          setResultsKey(searchKey);
          setSearching(false);
        }
      } catch (err) {
        if (reqIdRef.current === id) {
          logError("find_in_files failed", err);
          setSearching(false);
          setError(String(err));
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [open, query, caseSensitive, workspaces, retry]);

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

  const onReplaceAll = async () => {
    if (!results || !results.hits.length || replacing || searching || resultsKey !== searchKey) return;
    const uniquePaths = Array.from(new Set(results.hits.map((h) => h.path)));
    const id = ++reqIdRef.current;
    setReplacing(true);
    setError("");
    setNotice("");
    try {
      const choice = await chooseAction({
        title: tStatic("find.replaceConfirmTitle"),
        message: tStatic("find.replaceConfirmMsg", { count: results.hits.length, files: uniquePaths.length }),
        buttons: [
          { label: tStatic("common.cancel"), value: "cancel" },
          { label: tStatic("find.replaceAll"), value: "ok", primary: true, danger: true },
        ],
      });
      if (choice !== "ok" || id !== reqIdRef.current) return;
      const res = await invoke<ReplaceResult>("replace_in_files", { paths: uniquePaths, query, replacement, caseSensitive });
      if (id !== reqIdRef.current) return;
      setNotice(t("find.replaceDone", { count: res.total, files: res.files_changed }));
      if (res.errors?.length) setError(res.errors.join("\n"));
      logInfo(`replace_in_files: ${res.total} replacement(s) across ${res.files_changed} file(s)`);
      const fresh = await invoke<SearchResult>("find_in_files", { roots: workspaces, query, caseSensitive });
      if (id === reqIdRef.current) {
        setResults(fresh);
        setResultsKey(searchKey);
      }
    } catch (err) {
      logError("replace_in_files failed", err);
      if (id === reqIdRef.current) setError(String(err));
    } finally {
      if (id === reqIdRef.current) setReplacing(false);
    }
  };

  const openHit = async (path: string, line: number, col: number) => {
    await openFileByPath(path);
    const target = useEditorStore.getState().tabs.find((tab) => tab.filePath === path);
    if (!target) return;
    let attempts = 0;
    const jump = () => {
      if (useEditorStore.getState().activeId !== target.id) return;
      const view = getActiveView();
      if (!view || getActiveViewTabId() !== target.id) {
        if (++attempts < 10) requestAnimationFrame(jump);
        return;
      }
      try {
        const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
        const pos = lineInfo.from + Math.min(lineInfo.length, Math.max(0, col - 1));
        view.dispatch({
          selection: { anchor: pos },
          scrollIntoView: true,
        });
        view.focus();
      } catch {
        /* doc shorter than expected */
      }
    };
    requestAnimationFrame(jump);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--modal-backdrop)",
        zIndex: 1050,
        display: "flex",
        justifyContent: "center",
        paddingTop: "8vh",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("find.title")}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 95vw)",
          maxHeight: "82vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: "10px 12px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              variant="ghost"
              size="icon"
              pressed={showReplace}
              onClick={() => setShowReplace((v) => !v)}
              title={t("find.toggleReplace")}
            >
              {showReplace ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
            </Button>
            <input
              className="deditor-input"
              ref={inputRef}
              aria-label={t("find.title")}
              disabled={replacing}
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
              }}
            />
            <Button
              variant={caseSensitive ? "primary" : "secondary"}
              pressed={caseSensitive}
              size="sm"
              disabled={replacing}
              onClick={() => setCaseSensitive((v) => !v)}
              title={t("find.caseSensitive")}
              style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}
            >
              Aa
            </Button>
          </div>
          {showReplace && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 24, flexShrink: 0 }} />
              <input
                className="deditor-input"
                aria-label={t("find.replacePlaceholder")}
                disabled={replacing}
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={t("find.replacePlaceholder")}
                spellCheck={false}
                style={{
                  flex: 1,
                }}
              />
              <Button
                variant="primary"
                size="sm"
                onClick={() => void onReplaceAll()}
                disabled={!results || results.hits.length === 0 || replacing || searching || resultsKey !== searchKey}
                title={t("find.replaceAll")}
              >
                {replacing ? t("find.replacing") : t("find.replaceAll")}
              </Button>
            </div>
          )}
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

        {notice && <div role="status" className="deditor-notice">{notice}</div>}
        {error && <div role="alert" className="deditor-notice" data-tone="error">
          {t("find.failed", { error })}
          <Button size="sm" disabled={replacing} onClick={() => setRetry((v) => v + 1)}>{t("common.retry")}</Button>
        </div>}
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
                    e.currentTarget.style.background = "var(--hover-bg)";
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
