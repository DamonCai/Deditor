import { isWindowCloseCommitted } from "../windowCloseGuard";
import { $prose } from '@milkdown/kit/utils';
import { Plugin, AllSelection, Selection } from '@milkdown/kit/prose/state';
import { EditorView as CodeView } from '@codemirror/view';
import { serializerCtx } from '@milkdown/kit/core';
import { tStatic } from '../i18n';
import { markdownHistory } from '../markdownHistory';
import { clipboardPayload } from './clipboardFormats';
import { writeMarkdownClipboard } from '../markdownClipboard';
import { showError } from '../feedback';

/** WebKit's native menu follows the OS language, so editing uses application actions. */
export const markdownContextMenu = (tabId: string, enabled: () => boolean) => $prose(ctx => new Plugin({
  view(view) {
    let menu: HTMLElement | undefined, disposed = false;
    const host = view.dom.parentElement!;
    const close = () => { if (!menu) return; menu.remove(); menu = undefined; view.dom.dispatchEvent(new Event('deditor-contextmenu-close')); };
    const open = (event: MouseEvent | KeyboardEvent) => {
      if (!enabled() || event.defaultPrevented || !(event.target instanceof Element)) return;
      if (event.target.closest('input,select,textarea') && !event.target.closest('.cm-editor')) return;
      const keyboard = event.type === 'keydown';
      const target = event.target, cmRoot = target.closest<HTMLElement>('.cm-editor');
      // Keep normal right-click localized, but let the system offer spelling
      // corrections for prose when explicitly requested with Option/Alt.
      if (event.altKey && view.editable && view.dom.spellcheck && !cmRoot
        && !target.closest('.md-code-block, .md-raw-block, [data-md-inline-source]')) { close(); return; }
      const cm = cmRoot ? CodeView.findFromDOM(cmRoot) : null;
      event.preventDefault(); event.stopPropagation(); close();
      // A right click outside the current range moves the insertion point.
      if (view.editable && !keyboard && !cm && view.state.selection.empty && !target.closest('.md-code-block')) {
        const mouse = event as MouseEvent, at = view.posAtCoords({ left: mouse.clientX, top: mouse.clientY });
        if (at) view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(at.pos))));
      }
      const state = view.state, cmState = cm?.state;
      const unchanged = () => !disposed && view.state.doc === state.doc && view.state.selection.eq(state.selection)
        && (!cm || cm.state.doc === cmState!.doc && cm.state.selection.eq(cmState!.selection));
      const focus = () => cm ? cm.focus() : view.focus();
      const guard = () => { if (isWindowCloseCommitted()) return false; if (!enabled() || !view.editable || cm?.state.readOnly || !unchanged()) throw new Error(tStatic('md.clipboardChanged')); return true; };
      menu = document.createElement('div'); menu.className = 'md-editor-menu'; menu.setAttribute('role', 'menu');
      const reportError = () => { if (!isWindowCloseCommitted()) void showError(tStatic('md.clipboardError')); };
      const action = (key: string, run: () => unknown, disabled = false) => {
        const button = document.createElement('button'); button.className = 'deditor-btn'; button.dataset.variant = 'ghost'; button.dataset.size = 'sm'; button.type = 'button';
        button.setAttribute('role', 'menuitem'); button.textContent = tStatic(key); button.disabled = disabled;
        button.onclick = () => { close(); focus(); try { void Promise.resolve(run()).catch(reportError); } catch { reportError(); } };
        menu!.append(button);
      };
      const separator = () => { const line = document.createElement('div'); line.className = 'md-table-menu-separator'; line.setAttribute('role', 'separator'); menu!.append(line); };
      const readonly = !view.editable || !!cm?.state.readOnly;
      const empty = cm ? cm.state.selection.main.empty : state.selection.empty;
      action('md.undo', () => markdownHistory(false, tabId), readonly);
      action('md.redo', () => markdownHistory(true, tabId), readonly); separator();
      const copy = async (cut = false) => {
        if (cm) {
          const { from, to } = cmState!.selection.main;
          await navigator.clipboard.writeText(cmState!.sliceDoc(from, to));
          if (cut) { if (!guard()) return; cm.dispatch({ changes: { from, to, insert: '' }, userEvent: 'delete.cut' }); }
        } else {
          await writeMarkdownClipboard(clipboardPayload(view, '', ctx.get(serializerCtx)), 'rich');
          if (cut) { if (!guard()) return; view.dispatch(view.state.tr.deleteSelection().setMeta('deditor-list-operation', true).scrollIntoView()); }
        }
      };
      action('editor.cut', () => copy(true), readonly || empty);
      action('editor.copy', () => copy(), empty);
      action('editor.paste', async () => {
        let text = '', html = '';
        if (!cm && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
            if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
            if (text || html) break;
          }
        } else text = await navigator.clipboard.readText();
        if (!guard()) return; focus();
        if (cm && text) cm.dispatch({ changes: { from: cmState!.selection.main.from, to: cmState!.selection.main.to, insert: text }, selection: { anchor: cmState!.selection.main.from + text.length }, userEvent: 'input.paste' });
        else if (html) view.pasteHTML(html);
        else if (text) view.pasteText(text);
      }, readonly);
      separator();
      action('editor.selectAll', () => {
        if (cm) cm.dispatch({ selection: { anchor: 0, head: cm.state.doc.length } });
        else view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc)));
      });
      const block = target.closest('.md-code-block');
      const remove = block?.querySelector<HTMLButtonElement>('.md-diagram-delete');
      if (remove && !remove.hidden) { separator(); action('md.selectDiagram', () => block!.querySelector<HTMLButtonElement>('.md-diagram-family')?.click(), readonly); action('md.deleteDiagram', () => remove.click(), readonly); }
      else if (block && !cm) { separator(); action('md.codeLanguage', () => block.querySelector<HTMLInputElement>('.md-code-bar input')?.focus(), readonly); }
      menu.onmousedown = e => { e.preventDefault(); e.stopPropagation(); };
      menu.onkeydown = e => {
        if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); focus(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault(); const items = Array.from(menu!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          const at = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
        }
      };
      (target.closest('dialog.md-diagram-overview[open]') ?? view.dom.closest('.md-visual-shell'))?.append(menu);
      const rect = target.getBoundingClientRect(), bounds = menu.getBoundingClientRect();
      const x = keyboard ? rect.left : (event as MouseEvent).clientX, y = keyboard ? rect.bottom : (event as MouseEvent).clientY;
      menu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
      menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) open(event); };
    const outside = (event: Event) => { if (!(event.target instanceof Node) || !menu?.contains(event.target)) close(); };
    host.addEventListener('contextmenu', open); host.addEventListener('keydown', key);
    window.addEventListener('mousedown', outside); window.addEventListener('blur', close);
    return { update(_view, previous) { if (!previous.doc.eq(view.state.doc)) close(); }, destroy() { disposed = true; close(); host.removeEventListener('contextmenu', open); host.removeEventListener('keydown', key); window.removeEventListener('mousedown', outside); window.removeEventListener('blur', close); } };
  },
}));
