import { isWindowCloseCommitted } from "../lib/windowCloseGuard";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiClipboard } from 'react-icons/fi';
import { useT } from '../lib/i18n';
import { getVisualEditor, type VisualEditorBridge } from '../lib/markdownVisualBridge';
import { writeMarkdownClipboard, type MarkdownCopyFormat } from '../lib/markdownClipboard';
import type { MarkdownClipboardPayload } from '../lib/markdownVisual/clipboardFormats';
import { Button } from './ui/Button';

export default function MarkdownClipboardMenu({ visual }: { visual: VisualEditorBridge | null }) {
  const t = useT(), root = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<{ bridge: VisualEditorBridge; payload: MarkdownClipboardPayload } | null>(null);
  const [error, setError] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({left:0, top:0});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSnapshot(null); setError(''); }, [visual?.owner, visual?.tabId]);
  useLayoutEffect(() => {
    if (!snapshot) return;
    const place = () => { const anchor = root.current?.getBoundingClientRect(), bounds = panel.current?.getBoundingClientRect(); if (anchor && bounds) setPosition({left:Math.max(8, Math.min(anchor.left, window.innerWidth-bounds.width-8)), top:Math.max(8, Math.min(anchor.bottom+6, window.innerHeight-bounds.height-8))}); };
    place(); window.addEventListener('resize',place); return () => window.removeEventListener('resize',place);
  }, [snapshot]);
  useEffect(() => {
    if (!snapshot) return;
    panel.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target) && !panel.current?.contains(event.target)) setSnapshot(null); };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [snapshot]);
  const execute = async (format?: MarkdownCopyFormat) => {
    if (!snapshot || busy) return;
    setBusy(true); setError('');
    try {
      if (format) await writeMarkdownClipboard(snapshot.payload, format);
      else {
        const current = getVisualEditor();
        if (current?.owner !== snapshot.bridge.owner || current?.tabId !== snapshot.bridge.tabId || !await snapshot.bridge.pastePlain?.()) {
          if (isWindowCloseCommitted()) setSnapshot(null);
          else setError(t('md.clipboardChanged'));
          return;
        }
      }
      setSnapshot(null);
      if (getVisualEditor()?.owner === snapshot.bridge.owner) snapshot.bridge.focus();
    } catch { if (isWindowCloseCommitted()) setSnapshot(null); else setError(t('md.clipboardError')); }
    finally { setBusy(false); }
  };
  return <div className="md-clipboard" ref={root}>
    <Button variant="ghost" size="icon" className="md-tool" title={t('md.clipboardFormats')} aria-label={t('md.clipboardFormats')} aria-haspopup="menu" aria-expanded={!!snapshot} disabled={!visual?.clipboard}
      onMouseDown={event => event.preventDefault()} onClick={() => {
        setError('');
        if (snapshot) setSnapshot(null);
        else { const bridge = getVisualEditor(); if (bridge?.clipboard) setSnapshot({ bridge, payload: bridge.clipboard() }); }
      }}><FiClipboard /></Button>
    {snapshot && createPortal(<div ref={panel} style={position} className="md-clipboard-menu" role="menu" aria-label={t('md.clipboardFormats')} onKeyDown={event => {
      if (event.key === 'Escape' || event.key === 'Tab') { event.preventDefault(); setSnapshot(null); root.current?.querySelector('button')?.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); const items = Array.from(panel.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      }
    }}>
      {(['markdown', 'rich', 'spreadsheet'] as const).map((format, i) => <button className="deditor-btn" data-variant="ghost" data-size="sm" key={format} type="button" role="menuitem" disabled={busy || format === 'spreadsheet' && snapshot.payload.tsv === undefined} onClick={() => void execute(format)}>{t(['md.copyMarkdown', 'md.copyRichText', 'md.copySpreadsheet'][i])}</button>)}
      <div role="separator" />
      <button className="deditor-btn" data-variant="ghost" data-size="sm" type="button" role="menuitem" disabled={busy || !snapshot.bridge.editable} onClick={() => void execute()}>{t('md.pastePlain')}</button>
      <p className="md-clipboard-hint">{t('md.clipboardHint')}</p>
      {error && <p role="alert">{error}</p>}
    </div>, document.body)}
  </div>;
}
