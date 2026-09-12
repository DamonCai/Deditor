import MarkdownHistoryDialog from "./MarkdownHistoryDialog";
import { open as chooseDirectory } from "@tauri-apps/plugin-dialog";
import { getVisualEditor } from "../lib/markdownVisualBridge";
import { getActiveView, getActiveViewTabId } from "../lib/editorBridge";
import "./markdown-writing-settings.css";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editor";
import { imageDirectory, picgoEndpoint, markdownLabels, type MarkdownPreferences } from "../lib/markdownPreferences";
import { Button } from "./ui/Button";
import { collectMarkdownImages, type ImageTransfer } from "../lib/markdownImageCollect";
import { documentImageDirectory } from "../lib/markdownImageSettings";
export default function MarkdownWritingSettings() {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [open, setOpen] = useState(false), [position, setPosition] = useState({ left: 12, top: 100 });
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!host.current?.contains(event.target as Node)) setOpen(false); };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", close); window.addEventListener("resize", hide);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("resize", hide); };
  }, [open]);
  const settings = useEditorStore(s => s.markdownSettings), language = useEditorStore(s => s.language);
  const t = markdownLabels[language];
  const [folder, setFolder] = useState(settings.imageDirectory);
  const [collecting, setCollecting] = useState(false), [result, setResult] = useState("");
  const [endpoint, setEndpoint] = useState(settings.picgoEndpoint), [token, setToken] = useState("");
  const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  const tab = useEditorStore(s => s.tabs.find(tab => tab.id === s.activeId));
  const documentFolder = documentImageDirectory(tab?.content ?? "", tab?.filePath ?? null, settings.imageDirectory);
  const collect = async (operation: ImageTransfer = { kind: "collect" }) => {
    if (!tab || collecting) return;
    set({ imageDirectory: imageDirectory(folder) }); setCollecting(true); setResult(""); cancelled.current = false;
    try {
      const outcome = await collectMarkdownImages(tab.id, operation, () => cancelled.current);
      setResult(language === "zh" ? `${outcome.stopped ? "已停止。" : ""}${operation.kind === "upload" ? "已上传" : operation.kind === "download" ? "已下载" : "已复制"} ${outcome.copied} 张，跳过 ${outcome.skipped} 项，失败 ${outcome.failures.length} 项。${outcome.failures.length ? "失败的引用保持原样。" : ""}` : `${outcome.stopped ? "Stopped. " : ""}${operation.kind === "upload" ? "Uploaded" : operation.kind === "download" ? "Downloaded" : "Copied"} ${outcome.copied}, skipped ${outcome.skipped}, failed ${outcome.failures.length}.${outcome.failures.length ? " Failed references are unchanged." : ""}`);
    } catch (error) { setResult(String(error)); }
    finally { setCollecting(false); }
  };
  const closeAndFocus = () => {
    setOpen(false);
    const state = useEditorStore.getState(), visual = getVisualEditor();
    if (state.markdownMode === "visual" && visual?.tabId === state.activeId) visual.focus();
    else if (getActiveViewTabId() === state.activeId) getActiveView()?.focus();
  };
  const set = (patch: Partial<MarkdownPreferences>) => useEditorStore.setState(s => ({ markdownSettings: { ...s.markdownSettings, ...patch } }));
  return <div className="md-writing-settings" ref={host}>
    <Button variant="ghost" size="sm" aria-expanded={open} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(12, Math.min(window.innerWidth - 312, rect.left)), top: rect.bottom + 4 }); setFolder(settings.imageDirectory); setEndpoint(settings.picgoEndpoint); setOpen(!open); }}>{t.settings}</Button>
    {historyOpen && tab && <MarkdownHistoryDialog tabId={tab.id} onClose={()=>setHistoryOpen(false)} />}
    {open && <div className="md-writing-panel" style={{ ...position, maxHeight: `calc(100vh - ${position.top + 12}px)` }} role="dialog" aria-label={t.settings} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeAndFocus(); } }}>
      <label>{t.theme}<select aria-label={t.theme} value={settings.documentTheme} onChange={e => set({ documentTheme: e.target.value as MarkdownPreferences["documentTheme"] })}>{(["default", "compact"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}</select></label>
      <label><input type="checkbox" checked={settings.focusParagraph} onChange={e => set({ focusParagraph: e.target.checked })} />{t.focus}</label>
      <label><input type="checkbox" checked={settings.typewriter} onChange={e => set({ typewriter: e.target.checked })} />{t.typewriter}</label>
      <small>{t.typewriterHelp}</small>
      <Button onClick={()=>{setOpen(false);setHistoryOpen(true);}}>{language === "zh" ? "历史版本与草稿…" : "Versions and drafts…"}</Button>
      <label><input type="checkbox" checked={settings.mathAutoNumber} onChange={e => set({mathAutoNumber:e.target.checked})} />{language === "zh" ? "公式自动编号" : "Automatically number equations"}</label>
      <label><input type="checkbox" checked={settings.spellcheck} onChange={e => set({spellcheck:e.target.checked})} />{language === "zh" ? "系统拼写检查" : "System spellcheck"}</label>
      <label><input type="checkbox" checked={settings.codeLineNumbers} onChange={e => set({codeLineNumbers:e.target.checked})} />{language === "zh" ? "代码块行号" : "Code block line numbers"}</label>
      <label><input type="checkbox" checked={settings.codeWrap} onChange={e => set({codeWrap:e.target.checked})} />{language === "zh" ? "代码块自动换行" : "Wrap code blocks"}</label>
      <label>{language === "zh" ? "代码缩进" : "Code indentation"}<select value={settings.codeIndent} onChange={e => set({codeIndent:Number(e.target.value)})}>{[2,4,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
      <label>{language === "zh" ? "新代码块默认语言" : "Default language for new code blocks"}<input value={settings.defaultCodeLanguage} maxLength={40} onChange={e => {if (/^[a-zA-Z0-9_+#.-]*$/.test(e.target.value)) set({defaultCodeLanguage:e.target.value});}} /></label>
      <details><summary>{language === "zh" ? "自定义文章样式（CSS）" : "Custom document styles (CSS)"}</summary>
        <textarea aria-label={language === "zh" ? "文章样式" : "Document CSS"} rows={5} maxLength={32768} value={settings.customCss} onChange={e=>set({customCss:e.target.value})} />
        <small>{language === "zh" ? "支持文章颜色、间距、边框和对齐。两种视图共用，不改变字体类型。" : "Document colors, spacing, borders and alignment apply to both views. Font families stay unchanged."}</small>
        <Button onClick={()=>set({customCss:""})}>{language === "zh" ? "恢复默认文章样式" : "Reset document styles"}</Button>
      </details>
      <label>{t.images}<input aria-label={t.images} value={folder} placeholder="assets" onChange={e => setFolder(e.target.value)} onBlur={() => { const next = imageDirectory(folder); setFolder(next); set({ imageDirectory: next }); }} /></label>
      <Button disabled={collecting} onClick={async () => {
        try { const selected = await chooseDirectory({ directory: true, multiple: false }); if (typeof selected === "string") { const value = imageDirectory(selected); setFolder(value); set({ imageDirectory: value }); } }
        catch (error) { setResult(String(error)); }
      }}>{language === "zh" ? "选择图片目录…" : "Choose image folder…"}</Button>
      <small>{language === "zh" ? `当前文档目录：${documentFolder}。文档中的 typora-copy-images-to 优先。` : `Current document folder: ${documentFolder}. The document's typora-copy-images-to takes precedence.`}</small>
      <Button disabled={collecting || !tab?.filePath} onClick={() => void collect()}>{language === "zh" ? "整理本地图片" : "Collect local images"}</Button>
      <small>{language === "zh" ? "复制到目标目录并更新引用，保留原图片。" : "Copy to the destination and update references, keeping originals."}</small>
      <Button disabled={collecting || !tab?.filePath} onClick={() => void collect({ kind: "download" })}>{language === "zh" ? "下载远程图片" : "Download remote images"}</Button>
      <small>{language === "zh" ? "将本文网络图片下载到图片目录，成功后替换引用。每张最多 20 MB。" : "Download this document's web images to the image folder and replace successful references. Up to 20 MB each."}</small>
      <details className="md-image-host"><summary>{language === "zh" ? "图床（PicGo）" : "Image hosting (PicGo)"}</summary>
        <small>{language === "zh" ? "先在 PicGo 配置图床并开启服务。仅在点击上传时发送本文本地图片。" : "Configure an image host and enable the server in PicGo. Local images are sent only when you click Upload."}</small>
        <label>{language === "zh" ? "PicGo 服务地址" : "PicGo server URL"}<input value={endpoint} disabled={collecting} aria-invalid={!picgoEndpoint(endpoint)} onChange={e => setEndpoint(e.target.value)} onBlur={() => { const value = picgoEndpoint(endpoint); if (value) set({ picgoEndpoint: value }); }} /></label>
        {!picgoEndpoint(endpoint) && <small role="alert">{language === "zh" ? "请输入本机 PicGo 地址，例如 http://127.0.0.1:36677/upload。" : "Enter a local PicGo URL, such as http://127.0.0.1:36677/upload."}</small>}
        <label>{language === "zh" ? "访问令牌（可选，仅本次使用）" : "Access token (optional, this session only)"}<input type="password" autoComplete="off" value={token} disabled={collecting} onChange={e => setToken(e.target.value)} /></label>
        <Button disabled={collecting || !tab?.filePath || !picgoEndpoint(endpoint)} onClick={() => { const value = picgoEndpoint(endpoint); if (value) { set({ picgoEndpoint: value }); void collect({ kind: "upload", endpoint: value, token }); } }}>{language === "zh" ? "上传本文本地图片" : "Upload this document’s local images"}</Button>
        <small>{language === "zh" ? "使用 PicGo 当前图床。成功后替换引用并保留本地文件；撤销恢复引用，不删除图床文件。" : "Uses PicGo's current image host. Successful references are replaced; local files are kept. Undo restores references without deleting hosted files."}</small>
      </details>
      {collecting && <><small role="status">{language === "zh" ? "正在处理图片…" : "Processing images…"}</small><Button onClick={() => { cancelled.current = true; setResult(language === "zh" ? "当前图片处理完后停止。" : "Stopping after the current image."); }}>{language === "zh" ? "停止" : "Stop"}</Button></>}
      {result && <small role="status">{result}</small>}
      <label><input type="checkbox" checked={settings.preserveImageTargets} onChange={e => set({ preserveImageTargets: e.target.checked })} />{t.preserve}</label>
      <label>{t.template}<select aria-label={t.template} value={settings.exportTemplate} onChange={e => set({ exportTemplate: e.target.value as MarkdownPreferences["exportTemplate"] })}>{(["default", "report", "compact"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}</select></label>
      <Button onClick={() => { set({ imageDirectory: imageDirectory(folder) }); closeAndFocus(); }}>{t.close}</Button>
    </div>}
  </div>;
}
