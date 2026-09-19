import type { MarkdownClipboardPayload } from './markdownVisual/clipboardFormats';
export type MarkdownCopyFormat = 'markdown' | 'rich' | 'spreadsheet';

export async function writeMarkdownClipboard(payload: MarkdownClipboardPayload, format: MarkdownCopyFormat) {
  const text = format === 'markdown' ? payload.markdown : format === 'spreadsheet' ? payload.tsv : payload.text;
  if (text === undefined) throw new Error('No table selected');
  if (format !== 'rich') { await navigator.clipboard.writeText(text); return; }
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([text], {type:'text/plain'}), 'text/html': new Blob([payload.html], {type:'text/html'}) })]);
    return;
  }
  // Older webviews support the user-initiated copy event but not ClipboardItem.
  let copied = false;
  const copy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault(); event.clipboardData.setData('text/plain', text); event.clipboardData.setData('text/html', payload.html); copied = true;
  };
  document.addEventListener('copy', copy, true);
  try { document.execCommand('copy'); } finally { document.removeEventListener('copy', copy, true); }
  if (!copied) throw new Error('Rich text clipboard unavailable');
}
