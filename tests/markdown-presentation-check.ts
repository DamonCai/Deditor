/** Browser geometry contract for the self-created complex fixture. No application
 * state writes: invoke after images/diagrams settle, at matching pane widths. */
export function checkMarkdownPresentation() {
  const preview = document.querySelector<HTMLElement>('[data-testid="parity-preview"] .preview');
  const visual = document.querySelector<HTMLElement>('.ProseMirror.md-document');
  if (!preview || !visual) return { checked: 0, differences: ['Both document panes must be open.'] };
  const differences: string[] = []; let checked = 0;
  const styles = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'color', 'backgroundColor', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'borderTopWidth', 'borderBottomWidth', 'overflowWrap'] as const;
  const compare = (label: string, a: Element | null, b: Element | null, geometry = true) => {
    if (!a || !b) { differences.push(`${label}: missing block`); return; }
    const left = getComputedStyle(a), right = getComputedStyle(b);
    for (const key of styles) { checked++; if (left[key] !== right[key]) differences.push(`${label}.${key}: ${left[key]} / ${right[key]}`); }
    if (a.matches('pre, pre code')) { checked++; if (left.whiteSpace !== right.whiteSpace) differences.push(`${label}.whiteSpace: ${left.whiteSpace} / ${right.whiteSpace}`); }
    if (geometry) for (const key of ['width', 'height'] as const) {
      checked++; const l = a.getBoundingClientRect()[key], r = b.getBoundingClientRect()[key];
      if (Math.abs(l - r) > 1) differences.push(`${label}.${key}: ${l.toFixed(2)} / ${r.toFixed(2)}`);
    }
  };
  for (let level = 1; level <= 6; level++) compare(`H${level}`, preview.querySelector(`h${level}`), visual.querySelector(`h${level}`));
  const paragraph = (root: Element, marker: string) => [...root.querySelectorAll('p')].find(p => p.textContent?.startsWith(marker)) ?? null;
  for (const marker of ['正文定位点', '引用定位点', '提示块定位点', '文末定位点']) compare(marker, paragraph(preview, marker), paragraph(visual, marker));
  for (const selector of ['.md-callout', 'th', 'td', 'pre.shiki', 'pre.shiki code', '.md-frontmatter', '.md-toc', '.katex-display', '.mermaid-diagram']) compare(selector, preview.querySelector(selector), visual.querySelector(selector));
  compare('table', preview.querySelector('table'), visual.querySelector('table.children'));
  for (let row = 0; row < 3; row++) compare(`table body row ${row + 1}`, preview.querySelectorAll('tbody tr')[row]?.querySelector('td') ?? null, visual.querySelectorAll('table.children tr:not([data-is-header])')[row]?.querySelector('td') ?? null);
  for (const alt of ['自建图片定位点', '自建定宽图片']) {
    const a = preview.querySelector<HTMLImageElement>(`img[alt="${alt}"]`), b = visual.querySelector<HTMLImageElement>(`img[alt="${alt}"]`);
    if (!a?.complete || !a.naturalWidth || !b?.complete || !b.naturalWidth) differences.push(`${alt}: image not loaded`);
    compare(alt, a, b);
  }
  // Editable wrappers own list item spacing; compare the displayed text metrics.
  for (const marker of ['无序定位点', '有序定位点', '任务定位点']) {
    const item = (root: Element) => [...root.querySelectorAll('li')].find(li => li.textContent?.includes(marker)) ?? null;
    compare(marker, item(preview), item(visual), false);
    const list = (root: Element) => [...root.children].find(e => e.matches('ul,ol') && e.textContent?.includes(marker)) ?? null;
    compare(`${marker} list`, list(preview), list(visual));
  }
  // Compare document flow as well as isolated boxes: nested wrapper margins can
  // otherwise accumulate a visible offset by the first table/code block.
  const originA = preview.querySelector('h1')!.getBoundingClientRect().top;
  const originB = visual.querySelector('h1')!.getBoundingClientRect().top;
  for (const [leftSelector, rightSelector] of [['h2', 'h2'], ['h6', 'h6'], ['table', 'table.children'], ['pre.shiki', 'pre.shiki']]) {
    const a = preview.querySelector(leftSelector)!, b = visual.querySelector(rightSelector)!;
    const delta = (a.getBoundingClientRect().top - originA) - (b.getBoundingClientRect().top - originB);
    checked++; if (Math.abs(delta) > 1) differences.push(`${leftSelector}.documentOffset: ${delta.toFixed(2)}px`);
  }
  return { checked, differences };
}
