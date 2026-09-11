import "./markdown-writing-settings.css";
import { useEffect, useRef, useState } from "react";
import { useEditorStore } from "../store/editor";
import { imageDirectory, markdownLabels, type MarkdownPreferences } from "../lib/markdownPreferences";
import { Button } from "./ui/Button";
export default function MarkdownWritingSettings() {
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
  const set = (patch: Partial<MarkdownPreferences>) => useEditorStore.setState(s => ({ markdownSettings: { ...s.markdownSettings, ...patch } }));
  return <div className="md-writing-settings" ref={host}>
    <Button variant="ghost" size="sm" aria-expanded={open} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(12, Math.min(window.innerWidth - 312, rect.left)), top: rect.bottom + 4 }); setFolder(settings.imageDirectory); setOpen(!open); }}>{t.settings}</Button>
    {open && <div className="md-writing-panel" style={{ ...position, maxHeight: `calc(100vh - ${position.top + 12}px)` }} role="dialog" aria-label={t.settings} onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}>
      <label>{t.theme}<select aria-label={t.theme} value={settings.documentTheme} onChange={e => set({ documentTheme: e.target.value as MarkdownPreferences["documentTheme"] })}>{(["default", "serif", "compact"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}</select></label>
      <label><input type="checkbox" checked={settings.focusParagraph} onChange={e => set({ focusParagraph: e.target.checked })} />{t.focus}</label>
      <label><input type="checkbox" checked={settings.typewriter} onChange={e => set({ typewriter: e.target.checked })} />{t.typewriter}</label>
      <small>{t.typewriterHelp}</small>
      <label>{t.images}<input aria-label={t.images} value={folder} placeholder="assets" onChange={e => setFolder(e.target.value)} onBlur={() => { const next = imageDirectory(folder); setFolder(next); set({ imageDirectory: next }); }} /></label>
      <label><input type="checkbox" checked={settings.preserveImageTargets} onChange={e => set({ preserveImageTargets: e.target.checked })} />{t.preserve}</label>
      <label>{t.template}<select aria-label={t.template} value={settings.exportTemplate} onChange={e => set({ exportTemplate: e.target.value as MarkdownPreferences["exportTemplate"] })}>{(["default", "report", "compact"] as const).map(value => <option key={value} value={value}>{t[value]}</option>)}</select></label>
      <Button onClick={() => { set({ imageDirectory: imageDirectory(folder) }); setOpen(false); }}>{t.close}</Button>
    </div>}
  </div>;
}
