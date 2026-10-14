import { $prose } from '@milkdown/kit/utils';
import { parserCtx } from '@milkdown/kit/core';
import { Plugin, Selection } from '@milkdown/kit/prose/state';
import { tStatic } from '../i18n';

const items = [
  { key: 'md.table', words: 'table 表格', source: '| A | B |\n| --- | --- |\n|   |   |' },
  { key: 'md.codeblock', words: 'code 代码', source: '```\n\n```' },
  { key: 'Mermaid', words: 'mermaid 流程图 图表', source: '```mermaid\nflowchart LR\n  A --> B\n```' },
  { key: 'PlantUML', words: 'plantuml uml 时序图 图表', source: '```plantuml\n@startuml\nAlice -> Bob: Hello\n@enduml\n```' },
  { key: 'md.tasklist', words: 'task todo 任务 待办', source: '- [ ] ' },
  { key: 'md.heading', words: 'heading title 标题', source: '## ' },
  { key: 'md.ulist', words: 'list bullet 列表 无序', source: '- ' },
  { key: 'md.quote', words: 'quote 引用', source: '> ' },
  { key: 'md.hr', words: 'divider rule 分隔线', source: '---' },
];
let nextId = 0;

/** Slash commands replace only a standalone top-level paragraph, as one edit. */
export const markdownQuickInsert = $prose(ctx => new Plugin({
  view(view) {
    const id = `md-quick-insert-${++nextId}`;
    let menu: HTMLDivElement | undefined, signature = '', dismissed = '', index = 0;
    let matches = items;
    const close = () => {
      menu?.remove(); menu = undefined;
      view.dom.removeAttribute('aria-controls'); view.dom.removeAttribute('aria-activedescendant');
    };
    const query = () => {
      const { selection } = view.state, { $from } = selection;
      if (!view.editable || view.composing || !view.hasFocus() || !selection.empty || $from.depth !== 1 || $from.parent.type.name !== 'paragraph' || $from.parentOffset !== $from.parent.content.size) return null;
      const text = $from.parent.textContent;
      return /^\/[^\n/]{0,48}$/.test(text) ? { text, from: $from.before(), to: $from.after() } : null;
    };
    const choose = (selected: number) => {
      const current = query(), item = matches[selected];
      if (!current || !item || `${current.from}:${current.text}` !== signature) return close();
      const parsed = ctx.get(parserCtx)(item.source);
      if (!parsed) return;
      close();
      const tr = view.state.tr.replaceWith(current.from, current.to, parsed.content);
      tr.setSelection(Selection.near(tr.doc.resolve(Math.min(current.from + 1, tr.doc.content.size))));
      view.dispatch(tr.setMeta('deditor-list-operation', true).scrollIntoView()); view.focus();
    };
    const highlight = () => {
      menu?.querySelectorAll<HTMLButtonElement>('button').forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
      const selected = menu?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (selected) { view.dom.setAttribute('aria-activedescendant', selected.id); selected.scrollIntoView({ block: 'nearest' }); }
      else view.dom.removeAttribute('aria-activedescendant');
    };
    const update = () => {
      const current = query();
      if (!current) { signature = ''; dismissed = ''; close(); return; }
      const next = `${current.from}:${current.text}`;
      if (next === dismissed) return close();
      if (next === signature && menu) return;
      signature = next; index = 0; close();
      const term = current.text.slice(1).trim().toLowerCase();
      matches = items.filter(item => `${item.words} ${tStatic(item.key)}`.toLowerCase().includes(term));
      menu = document.createElement('div'); menu.id = id; menu.className = 'md-quick-insert'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', tStatic('md.quickInsert'));
      matches.forEach((item, i) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'deditor-btn'; button.dataset.variant = 'ghost'; button.dataset.size = 'sm'; button.id = `${id}-${i}`; button.tabIndex = -1;
        button.textContent = item.key.startsWith('md.') ? tStatic(item.key) : item.key;
        button.setAttribute('role', 'option'); button.onmousedown = event => event.preventDefault(); button.onclick = () => choose(i); menu!.append(button);
      });
      const hint = document.createElement('p'); hint.textContent = tStatic(matches.length ? 'md.quickInsertHint' : 'md.quickInsertEmpty'); menu.append(hint);
      view.dom.closest('.md-visual-shell')?.append(menu);
      const rect = view.coordsAtPos(view.state.selection.head), bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(rect.left, window.innerWidth - bounds.width - 4))}px`;
      menu.style.top = `${Math.max(4, rect.bottom + bounds.height + 6 > window.innerHeight ? rect.top - bounds.height - 6 : rect.bottom + 6)}px`;
      view.dom.setAttribute('aria-controls', id); highlight();
    };
    const key = (event: KeyboardEvent) => {
      if (!menu || event.isComposing || view.composing) return;
      if (event.key === 'Escape' || event.key === 'Tab') { dismissed = signature; close(); if (event.key === 'Tab') return; }
      else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) { index = (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length; highlight(); }
      else if (event.key === 'Enter' && matches.length) choose(index);
      else return;
      event.preventDefault(); event.stopImmediatePropagation();
    };
    const dismiss = () => { dismissed = signature; close(); };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu?.contains(event.target)) dismiss(); };
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !menu?.contains(event.target)) dismiss(); };
    view.dom.addEventListener('keydown', key, true);
    view.dom.addEventListener('blur', dismiss); view.dom.addEventListener('compositionstart', dismiss);
    window.addEventListener('mousedown', outside); window.addEventListener('resize', dismiss); window.addEventListener('scroll', scroll, true);
    return { update, destroy() {
      close(); view.dom.removeEventListener('keydown', key, true); view.dom.removeEventListener('blur', dismiss); view.dom.removeEventListener('compositionstart', dismiss);
      window.removeEventListener('mousedown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('scroll', scroll, true);
    } };
  },
}));
