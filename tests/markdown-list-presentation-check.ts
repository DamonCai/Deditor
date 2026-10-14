/** Compare rendered list content across the two real document surfaces. Text
 * ranges deliberately bypass the editor's extra wrappers; equal LI styles do
 * not guarantee equal indentation, control placement, or native markers. */
export function checkMarkdownListPresentation(preview: HTMLElement, visual: HTMLElement) {
  const differences: string[] = []; let checked = 0;
  const equal = (label: string, a: string | number | boolean, b: string | number | boolean) => {
    checked++;
    if (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) > 1 : a !== b) {
      differences.push(`${label}: ${typeof a === 'number' ? a.toFixed(2) : a} / ${typeof b === 'number' ? b.toFixed(2) : b}`);
    }
  };
  const visible = (element: Element) => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility === 'visible' && rect.width > 0 && rect.height > 0;
  };
  const items = (root: HTMLElement) => [...root.querySelectorAll<HTMLLIElement>('li')]
    .filter(item => !item.closest('.md-toc, .footnotes, [data-md-footnote-definition]'));
  const content = (item: HTMLLIElement) => {
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.parentElement?.closest('li') === item && !node.parentElement.closest('.label-wrapper, .ProseMirror-widget')) nodes.push(node);
    }
    const first = nodes.find(node => node.data.trim());
    let rect: DOMRect | null = null;
    if (first) {
      const range = document.createRange(), start = first.data.search(/\S/);
      range.setStart(first, start); range.setEnd(first, start + 1); rect = range.getBoundingClientRect();
    }
    // DOM textContent does not include a separator between editor paragraphs.
    // Keep inline fragments contiguous; only a paragraph boundary adds space.
    const text = nodes.map((node, index) => {
      const paragraph = node.parentElement?.closest('p');
      const previousParagraph = nodes[index - 1]?.parentElement?.closest('p');
      return `${index > 0 && paragraph !== previousParagraph ? ' ' : ''}${node.data}`;
    }).join('').replace(/\s+/g, ' ').trim();
    return { text, rect };
  };
  const controls = (item: HTMLLIElement) => {
    const input = item.querySelector<HTMLInputElement>(':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]');
    if (input) return { element: input as HTMLElement, checked: input.checked };
    const label = item.querySelector<HTMLElement>(':scope > .label-wrapper[role="checkbox"]');
    const painted = label?.querySelector<HTMLElement>('.label.checked, .label.unchecked');
    return label && painted ? { element: painted, checked: label.getAttribute('aria-checked') === 'true' } : null;
  };
  const rootA = preview.getBoundingClientRect(), rootB = visual.getBoundingClientRect();
  const left = items(preview), right = items(visual);
  equal('lists.itemCount', String(left.length), String(right.length));
  const painting = ['appearance', 'backgroundColor', 'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize', 'borderTopColor', 'borderTopStyle', 'borderTopWidth', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius', 'opacity', 'filter', 'boxShadow'] as const;
  const effectiveOpacity = (element: Element, root: HTMLElement) => {
    let opacity = 1;
    for (let current: Element | null = element; current; current = current.parentElement) {
      opacity *= Number(getComputedStyle(current).opacity);
      if (current === root) break;
    }
    return opacity.toFixed(3);
  };
  const parentItem = (item: HTMLLIElement) => item.parentElement?.closest<HTMLLIElement>('li') ?? null;
  left.forEach((a, index) => {
    const b = right[index];
    if (!b) return;
    const ca = content(a), cb = content(b), label = `list item ${index + 1} (${ca.text.slice(0, 22) || 'empty'})`;
    equal(`${label}.text`, ca.text, cb.text);
    equal(`${label}.listKind`, a.closest('ul,ol')?.tagName ?? '', b.closest('ul,ol')?.tagName ?? '');
    if (ca.rect && cb.rect) {
      equal(`${label}.textInset`, ca.rect.left - rootA.left, cb.rect.left - rootB.left);
      // Relative to each item's own first line, independent of preceding blocks.
      const pa = parentItem(a), pb = parentItem(b);
      equal(`${label}.nested`, !!pa, !!pb);
      const pra = pa && content(pa).rect, prb = pb && content(pb).rect;
      if (pra && prb) {
        equal(`${label}.parentTextIndent`, ca.rect.left - pra.left, cb.rect.left - prb.left);
        equal(`${label}.parentTextVerticalGap`, ca.rect.top - pra.top, cb.rect.top - prb.top);
      }
    } else equal(`${label}.hasTextGeometry`, !!ca.rect, !!cb.rect);
    const ta = controls(a), tb = controls(b);
    equal(`${label}.taskControl`, !!ta, !!tb);
    if (ta && tb) {
      equal(`${label}.checked`, ta.checked, tb.checked);
      equal(`${label}.previewControlVisible`, visible(ta.element), true);
      equal(`${label}.editorControlVisible`, visible(tb.element), true);
      const sa = getComputedStyle(ta.element), sb = getComputedStyle(tb.element);
      for (const property of painting) equal(`${label}.control.${property}`, sa[property], sb[property]);
      equal(`${label}.control.effectiveOpacity`, effectiveOpacity(ta.element, preview), effectiveOpacity(tb.element, visual));
      const ra = ta.element.getBoundingClientRect(), rb = tb.element.getBoundingClientRect();
      equal(`${label}.control.width`, ra.width, rb.width);
      equal(`${label}.control.height`, ra.height, rb.height);
      equal(`${label}.control.documentInset`, ra.left - rootA.left, rb.left - rootB.left);
      if (ca.rect && cb.rect) {
        equal(`${label}.control.textGap`, ca.rect.left - ra.right, cb.rect.left - rb.right);
        equal(`${label}.control.textCenterOffset`, (ra.top + ra.bottom - ca.rect.top - ca.rect.bottom) / 2, (rb.top + rb.bottom - cb.rect.top - cb.rect.bottom) / 2);
      }
      // A shared background is insufficient if an old SVG is still overpainted.
      equal(`${label}.control.extraVisibleSvg`, [...tb.element.querySelectorAll('svg')].some(visible), false);
    } else if (!ta && !tb && a.closest('ul,ol')?.tagName === 'UL') {
      const sa = getComputedStyle(a), sb = getComputedStyle(b);
      equal(`${label}.marker.display`, sa.display, sb.display);
      equal(`${label}.marker.nativePreview`, sa.display === 'list-item' && sa.listStyleType !== 'none', true);
      equal(`${label}.marker.nativeEditor`, sb.display === 'list-item' && sb.listStyleType !== 'none', true);
      equal(`${label}.marker.type`, sa.listStyleType, sb.listStyleType);
      equal(`${label}.marker.position`, sa.listStylePosition, sb.listStylePosition);
      const ma = getComputedStyle(a, '::marker'), mb = getComputedStyle(b, '::marker');
      for (const property of ['content', 'fontFamily', 'fontSize', 'color'] as const) equal(`${label}.marker.${property}`, ma[property], mb[property]);
      equal(`${label}.marker.extraVisibleGlyph`, [...b.querySelectorAll(':scope > .label-wrapper .bullet')].some(visible), false);
    }
  });
  return { checked, differences };
}
