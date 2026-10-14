/** A shared, transient footnote preview. It lives outside the editable document. */
export function installFootnotePreview(container: HTMLElement, language: "zh" | "en") {
  let popup: HTMLElement | null = null, anchor: HTMLAnchorElement | null = null;
  let suppressFocus = false;
  const focusAnchor = (target: HTMLAnchorElement | null) => { suppressFocus = true; target?.focus({ preventScroll: true }); suppressFocus = false; };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const id = `md-footnote-preview-${crypto.randomUUID()}`;
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  const close = () => {
    clearTimer(); anchor?.removeAttribute("aria-describedby"); popup?.remove(); popup = null; anchor = null;
  };
  const deferClose = () => { clearTimer(); timer = setTimeout(close, 180); };
  const position = () => {
    if (!popup || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const bounds = popup.getBoundingClientRect();
    popup.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, rect.left))}px`;
    popup.style.top = `${Math.max(8, rect.bottom + bounds.height + 8 <= window.innerHeight ? rect.bottom + 6 : rect.top - bounds.height - 6)}px`;
  };
  const show = (link: HTMLAnchorElement) => {
    clearTimer(); if (anchor === link) return;
    const href = link.getAttribute("href"); if (!href?.startsWith("#")) return;
    const definition = Array.from(container.querySelectorAll<HTMLElement>(".footnote-item[id]")).find(el => `#${el.id}` === href);
    if (!definition) return;
    close(); anchor = link;
    popup = document.createElement("aside"); popup.id = id; popup.className = "preview md-footnote-preview";
    popup.setAttribute("role", "dialog"); popup.setAttribute("aria-label", language === "zh" ? "脚注预览" : "Footnote preview");
    popup.contentEditable = "false"; popup.tabIndex = -1;
    // Clone the already-rendered content, so math, formatting and hydrated
    // images agree with the same document's preview. No HTML is re-evaluated.
    const body = definition.cloneNode(true) as HTMLElement;
    body.removeAttribute("id");
    const ids = new Map<string, string>();
    body.querySelectorAll("[id]").forEach((el, index) => { const previous = el.id; el.id = `${id}-content-${index}`; ids.set(previous, el.id); });
    body.querySelectorAll("*").forEach(el => {
      for (const attribute of Array.from(el.attributes)) {
        let value = attribute.value.replace(/url\(#([^)]*)\)/g, (whole, target) => ids.has(target) ? `url(#${ids.get(target)})` : whole);
        if (["href", "xlink:href"].includes(attribute.name) && value.startsWith("#") && ids.has(value.slice(1))) value = `#${ids.get(value.slice(1))}`;
        if (["aria-labelledby", "aria-describedby"].includes(attribute.name)) value = value.split(/\s+/).map(target => ids.get(target) ?? target).join(" ");
        if (value !== attribute.value) el.setAttribute(attribute.name, value);
      }
    });
    body.querySelectorAll('a[href^="#fnref"], button, input, textarea, select, script, iframe, object, embed').forEach(el => el.remove());
    body.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
    // Links use the original document's click handling, including local-file
    // and in-document navigation. Prevent popup clones gaining their own state.
    const originalLinks = Array.from(definition.querySelectorAll<HTMLAnchorElement>('a:not([href^="#fnref"])'));
    body.querySelectorAll<HTMLAnchorElement>('a:not([href^="#fnref"])').forEach((el, index) => {
      el.onclick = event => { event.preventDefault(); const target = originalLinks[index]; close(); target?.click(); };
    });
    body.querySelectorAll(".md-footnote-content").forEach(el => el.replaceWith(...Array.from(el.childNodes)));
    const content = document.createElement("div"); content.className = "md-footnote-preview-content"; content.append(...Array.from(body.childNodes));
    const jump = document.createElement("button"); jump.type = "button"; jump.className = "md-footnote-preview-jump";
    jump.textContent = language === "zh" ? "转到脚注" : "Go to footnote";
    jump.onclick = () => { const target = anchor; close(); target?.click(); };
    popup.append(content, jump); document.body.append(popup); link.setAttribute("aria-describedby", id);
    popup.addEventListener("pointerenter", clearTimer); popup.addEventListener("pointerleave", deferClose);
    position();
  };
  const enter = (event: Event) => {
    if (suppressFocus) return;
    const link = (event.target as Element)?.closest<HTMLAnchorElement>(".footnote-ref a");
    if (link && container.contains(link)) show(link);
  };
  const leave = (event: PointerEvent) => {
    const next = event.relatedTarget as Node | null;
    if (anchor?.contains(next) || popup?.contains(next)) return;
    if ((event.target as Element)?.closest(".footnote-ref")) deferClose();
  };
  const focus = (event: FocusEvent) => {
    if (popup?.contains(event.target as Node) || anchor?.contains(event.target as Node)) clearTimer();
    else close();
  };
  const key = (event: KeyboardEvent) => {
    if (!popup) return;
    if (event.key === "Tab") {
      const focusable = Array.from(popup.querySelectorAll<HTMLElement>("a[href], button"));
      if (!event.shiftKey && document.activeElement === anchor) { event.preventDefault(); focusable[0]?.focus({ preventScroll: true }); return; }
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); const target = anchor; close(); focusAnchor(target); return; }
      if (!event.shiftKey && document.activeElement === focusable.at(-1)) { const target = anchor; close(); focusAnchor(target); }
      return;
    }
    if (event.key !== "Escape") return;
    const returnFocus = popup.contains(document.activeElement), target = anchor;
    close(); if (returnFocus) focusAnchor(target);
    event.preventDefault(); event.stopPropagation();
  };
  const scroll = (event: Event) => { if (!popup?.contains(event.target as Node)) close(); };
  // Content changes invalidate clones, preventing stale definitions after edits.
  const observer = new MutationObserver(records => { if (popup && records.some(r => r.type !== "attributes" || r.attributeName !== "aria-describedby")) close(); });
  observer.observe(container, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["src", "href", "id"] });
  container.addEventListener("pointerover", enter); container.addEventListener("pointerout", leave); container.addEventListener("focusin", enter);
  document.addEventListener("focusin", focus); document.addEventListener("keydown", key, true); document.addEventListener("scroll", scroll, true); window.addEventListener("resize", close);
  return () => { close(); observer.disconnect(); container.removeEventListener("pointerover", enter); container.removeEventListener("pointerout", leave); container.removeEventListener("focusin", enter); document.removeEventListener("focusin", focus); document.removeEventListener("keydown", key, true); document.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", close); };
}
