import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";

/** Keep upstream table controls within their scroll viewport without changing document flow. */
export const tableMenuPlacement = $prose(() => new Plugin({
  view(view) {
    const scroll = view.dom.closest<HTMLElement>(".md-visual-scroll");
    const pending = new Set<HTMLElement>(); let frame = 0, focusFrame = 0;
    const place = (menu: HTMLElement) => {
      const handle = menu.parentElement;
      if (!handle || handle.dataset.show !== "true" || menu.dataset.show !== "true" || !menu.isConnected) return;
      const viewport = scroll?.getBoundingClientRect();
      const left = Math.max(0, viewport?.left ?? 0) + 4, right = Math.min(window.innerWidth, viewport?.right ?? window.innerWidth) - 4;
      const top = Math.max(0, viewport?.top ?? 0) + 4, bottom = Math.min(window.innerHeight, viewport?.bottom ?? window.innerHeight) - 4;
      const anchor = handle.getBoundingClientRect(), width = menu.offsetWidth, height = menu.offsetHeight;
      const x = Math.max(left, Math.min(anchor.left, right - width));
      const below = anchor.bottom + 8, above = anchor.top - height - 8;
      const y = below + height <= bottom ? below : above >= top ? above : Math.max(top, bottom - height);
      menu.style.left = `${x - anchor.left}px`; menu.style.top = `${y - anchor.top}px`;
      menu.dataset.placement = y < anchor.top ? "above" : "below";
    };
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; pending.forEach(place); pending.clear(); });
    };
    const all = () => {view.dom.querySelectorAll<HTMLElement>('.cell-handle .button-group[data-show="true"]').forEach(menu => pending.add(menu));schedule();};
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        if (!(record.target instanceof HTMLElement)) return;
        const target = record.target;
        if (target.matches('.cell-handle .button-group')) pending.add(target);
        else if (target.matches('.cell-handle')) target.querySelectorAll<HTMLElement>('.button-group').forEach(menu => pending.add(menu));
      });
      if (pending.size) schedule();
    });
    observer.observe(view.dom, {subtree:true,attributes:true,attributeFilter:['data-show']});
    const focusAfterAdd = (event: MouseEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.milkdown-table-block .line-handle .add-button')) return;
      if (focusFrame) cancelAnimationFrame(focusFrame);
      focusFrame = requestAnimationFrame(() => {focusFrame = 0;if(view.editable)view.focus();});
    };
    view.dom.addEventListener('click',focusAfterAdd,true);
    scroll?.addEventListener('scroll',all,{passive:true}); window.addEventListener('resize',all);
    return {destroy() {observer.disconnect();view.dom.removeEventListener('click',focusAfterAdd,true);if(focusFrame)cancelAnimationFrame(focusFrame);scroll?.removeEventListener('scroll',all);window.removeEventListener('resize',all);if(frame)cancelAnimationFrame(frame);pending.clear();}};
  },
}));
