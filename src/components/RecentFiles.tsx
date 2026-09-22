import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../store/editor";
import { filterRecentFiles } from "../lib/recentFiles";
import { useModalFocus } from "../lib/useModalFocus";
import { focusRecentFile } from "../lib/recentFileFocus";
import { openFileByPath } from "../lib/fileio";
import { isWindowCloseCommitted } from "../lib/windowCloseGuard";
import { useT } from "../lib/i18n";
import { logError } from "../lib/logger";
import LangIcon from "./LangIcon";

export default function RecentFiles({ onClose }: { onClose: () => void }) {
  const t = useT();
  const panelRef = useModalFocus(true, onClose);
  const paths = useEditorStore(s => s.recentFiles);
  const activePath = useEditorStore(s => s.tabs.find(tab => tab.id === s.activeId)?.filePath);
  // Keep ordering stable while navigating; another window may publish history.
  const [snapshot, setSnapshot] = useState(paths);
  const [query, setQuery] = useState("");
  const results = useMemo(() => filterRecentFiles(snapshot, query), [snapshot, query]);
  const [selected, setSelected] = useState(() => snapshot[0] === activePath && snapshot.length > 1 ? 1 : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const disposed = useRef(false);
  const openedTab = useRef<string | null>(null);
  const opening = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  // This effect cleans up after useModalFocus has restored the invoker. Only
  // a successful selection transfers focus onward; Escape keeps that invoker.
  useEffect(() => () => { if (openedTab.current) focusRecentFile(openedTab.current); }, []);
  useLayoutEffect(() => { disposed.current = false; return () => { disposed.current = true; }; }, []);
  useEffect(() => {
    if (!snapshot.length && paths.length) { setSnapshot(paths); setSelected(paths[0] === activePath && paths.length > 1 ? 1 : 0); }
  }, [snapshot.length, paths, activePath]);
  useLayoutEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-recent-index="${selected}"]`)?.scrollIntoView({ block: "nearest" }); }, [selected, results]);
  const choose = async (index: number) => {
    const path = results[index];
    if (!path || opening.current || isWindowCloseCommitted()) return;
    opening.current = true;
    setBusy(true); setError(false);
    try {
      await openFileByPath(path);
      if (disposed.current) return;
      const target = useEditorStore.getState().tabs.find(tab => tab.filePath === path);
      if (target) { openedTab.current = target.id; onClose(); }
      else setError(true);
    } catch (error) {
      logError("Open recent file failed", error);
      if (!disposed.current) setError(true);
    } finally {
      opening.current = false;
      if (!disposed.current) setBusy(false);
    }
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.nativeEvent.isComposing || busy) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(i => Math.max(0, Math.min(results.length - 1, i + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter") { event.preventDefault(); void choose(selected); }
  };
  return <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1040, background: "var(--modal-backdrop)", display: "flex", justifyContent: "center", paddingTop: "12vh" }}>
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label={t("recent.title")} tabIndex={-1} onClick={e => e.stopPropagation()} onKeyDown={onKey}
      style={{ width: "min(640px, 92vw)", maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "var(--shadow-modal)", overflow: "hidden" }}>
      <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--text-soft)" }}><span>{t("recent.title")}</span><span>Cmd/Ctrl+E</span></div>
      <input className="deditor-palette-input" aria-label={t("recent.title")} role="combobox" aria-expanded="true" aria-controls="recent-files-list" aria-activedescendant={results[selected] ? `recent-file-${selected}` : undefined}
        value={query} onChange={e => { setQuery(e.target.value); setSelected(0); setError(false); }} placeholder={t("recent.placeholder")} spellCheck={false} autoCorrect="off" autoCapitalize="off"
        style={{ width: "100%", padding: "12px 14px", fontSize: 14, background: "transparent", color: "var(--text)", border: "none", borderBottom: "1px solid var(--border)", boxSizing: "border-box" }} />
      <div ref={listRef} id="recent-files-list" role="listbox" aria-label={t("recent.title")} aria-busy={busy} style={{ overflowY: "auto", flex: 1 }}>
        {!results.length && <div role="status" style={{ padding: "20px 14px", fontSize: 13, color: "var(--text-soft)" }}>{t(snapshot.length ? "recent.noMatch" : "recent.empty")}</div>}
        {results.map((path, i) => <div key={path} role="option" id={`recent-file-${i}`} aria-selected={i === selected} aria-disabled={busy} data-recent-index={i}
          onMouseEnter={() => { if (!busy) setSelected(i); }} onClick={() => void choose(i)}
          style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: busy ? "wait" : "pointer", background: i === selected ? "var(--selection-bg)" : undefined, color: "var(--text)" }}>
          <LangIcon filePath={path} size={16} />
          <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path.split(/[\\/]/).pop()}</div>
            <div title={path} style={{ fontSize: 11, color: "var(--text-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", direction: "rtl", textAlign: "left", unicodeBidi: "plaintext" }}>{path}</div></div>
          {path === activePath && <span style={{ fontSize: 11, color: "var(--text-soft)", whiteSpace: "nowrap" }}>{t("recent.current")}</span>}
        </div>)}
      </div>
      {error && <div className="deditor-notice" data-tone="error" role="alert" style={{ margin: "8px 12px" }}>{t("recent.openFailed")}</div>}
      <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--text-soft)", borderTop: "1px solid var(--border)" }}>{t("recent.hint")}</div>
    </div>
  </div>;
}
