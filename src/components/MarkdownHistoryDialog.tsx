import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { useModalFocus } from "../lib/useModalFocus";
import { flushDocument } from "../lib/documentFlush";
import { Button } from "./ui/Button";
import DiffView from "./DiffView";
import { useT } from "../lib/i18n";
import { logError } from "../lib/logger";
interface Entry { id: string; path: string; timestamp: number; draft: boolean; bytes: number }
export default function MarkdownHistoryDialog({tabId, onClose}: {tabId: string; onClose: () => void}) {
  const zh = useEditorStore(s => s.language === "zh"), tab = useEditorStore(s => s.tabs.find(tab => tab.id === tabId));
  const [drafts, setDrafts] = useState(false), [entries, setEntries] = useState<Entry[]>([]), [selected, setSelected] = useState<Entry | null>(null);
  const [preview, setPreview] = useState<string | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true);
  const t = useT();
  const [overview, setOverview] = useState(false);
  const [comparisonOverview, setComparisonOverview] = useState(false);
  const comparisonButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const leaveComparison = () => { setComparisonOverview(false); requestAnimationFrame(() => comparisonButton.current?.focus()); };
  const dismiss = () => { if (comparisonOverview) leaveComparison(); else if (overview) setOverview(false); else onClose(); };
  const ref = useModalFocus(true, dismiss);
  const [compare, setCompare] = useState(false);
  const [current, setCurrent] = useState("");
  const toggleCompare = () => {
    if (!compare) { flushDocument(tabId); setCurrent(useEditorStore.getState().tabs.find(tab => tab.id === tabId)?.content ?? ""); }
    setCompare(!compare);
  };
  useEffect(() => {
    let cancelled = false; setLoading(true); setEntries([]); setSelected(null); setPreview(null); setError("");
    invoke<Entry[]>("list_markdown_history", {path: drafts ? null : tab?.filePath ?? `untitled:${tabId}`}).then(items => {if (!cancelled) setEntries(items ?? []);}, error => {logError("List Markdown history failed", error); if (!cancelled) setError(String(error));}).finally(()=>{if(!cancelled)setLoading(false);});
    return () => {cancelled = true;};
  }, [drafts, tab?.filePath, tabId]);
  useEffect(() => {
    let cancelled = false; setPreview(null); if (!selected) return;
    invoke<string>("read_markdown_history", {id:selected.id}).then(text=>{if(!cancelled)setPreview(text);}, error=>{logError("Read Markdown history failed", error); if(!cancelled)setError(String(error));});
    return () => {cancelled = true;};
  }, [selected]);
  return createPortal(<div className="md-history-overlay" onMouseDown={event => {if(event.target===event.currentTarget)dismiss();}}>
    <div ref={ref} className={`md-history-dialog${overview || comparisonOverview ? " md-history-dialog--overview" : ""}${comparisonOverview ? " md-history-dialog--comparison-overview" : ""}`} role="dialog" aria-modal="true" aria-label={zh ? "历史版本与草稿" : "Versions and drafts"}>
      <div className="md-history-actions"><strong>{comparisonOverview ? t("md.historyComparisonOverview") : zh ? "历史版本与草稿" : "Versions and drafts"}</strong><div className="md-history-window-actions"><Button hidden={comparisonOverview} pressed={overview} onClick={() => setOverview(!overview)}>{t(overview ? "md.historyExitOverview" : "md.historyOverview")}</Button><Button ref={closeButton} onClick={dismiss}>{zh ? "关闭" : "Close"}</Button></div></div>
      <div hidden={comparisonOverview} className="md-history-actions"><Button pressed={!drafts} onClick={()=>setDrafts(false)}>{zh ? "当前文档版本" : "Document versions"}</Button><Button pressed={drafts} onClick={()=>setDrafts(true)}>{zh ? "恢复草稿" : "Recover drafts"}</Button></div>
      <small hidden={comparisonOverview}>{zh ? "从启用此功能后开始记录。每份文档最多 30 个版本，单份不超过 2 MB，历史总计不超过 100 MB。" : "Records start with this feature. Up to 30 versions per document, 2 MB per version and 100 MB in total."}</small>
      {error && <p hidden={comparisonOverview} className="deditor-notice md-history-error" data-tone="error" role="alert">{error}</p>}
      {loading && <p role="status">{zh ? "正在读取…" : "Loading…"}</p>}
      <div className="md-history-body"><div hidden={comparisonOverview} className="md-history-list">
        {!loading && !error && !entries.length && <p>{zh ? "暂无历史记录" : "No versions yet"}</p>}
        {entries.map(entry=><Button key={entry.id} pressed={selected?.id===entry.id} onClick={()=>{setError("");setSelected(entry);}}>{new Date(entry.timestamp).toLocaleString(zh ? "zh-CN" : "en-US")} · {entry.draft ? (zh ? "草稿" : "Draft") : (zh ? "保存" : "Saved")}<br/>{entry.path}</Button>)}
      </div><div className="md-history-preview">
        <div hidden={comparisonOverview} className="md-history-preview-actions"><Button disabled={preview===null || !tab} pressed={compare} onClick={toggleCompare}>{t(compare ? "md.historyContent" : "md.historyCompare")}</Button>{compare && <Button ref={comparisonButton} disabled={preview===null} onClick={() => { setComparisonOverview(true); requestAnimationFrame(() => closeButton.current?.focus()); }}>{t("md.historyComparisonOverview")}</Button>}</div>
        {compare && preview !== null ? <div className="md-history-diff"><DiffView key={selected?.id} navigation spec={{leftPath:t("md.historySelected"),rightPath:t("md.historyCurrent"),leftContent:preview,rightContent:current}} /></div>
          : <textarea readOnly aria-label={zh ? "版本内容" : "Version content"} value={preview ?? ""} />}
      </div></div>
      <div hidden={comparisonOverview} className="md-history-actions">
        <Button disabled={preview===null} onClick={()=>{if(preview===null)return; const id=useEditorStore.getState().openTab(null, ""); useEditorStore.getState().setContent(preview,id,"command"); onClose();}}>{zh ? "作为新文档打开" : "Open as new document"}</Button>
        <Button disabled={preview===null || !tab || selected?.path !== (tab.filePath ?? `untitled:${tabId}`)} onClick={()=>{if(preview===null || !tab)return;flushDocument(tabId);useEditorStore.getState().setContent(preview,tabId,"command");onClose();}}>{zh ? "恢复到编辑器（可撤销）" : "Restore in editor (undoable)"}</Button>
      </div>
    </div>
  </div>, document.body);
}
