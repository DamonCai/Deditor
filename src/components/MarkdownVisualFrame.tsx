import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { registerEditorFrame } from "../lib/editorFrame";
import { useT } from "../lib/i18n";
import "./markdown-visual-frame.css";

type Sheet = HTMLStyleElement | HTMLLinkElement;
const sheets = 'style, link[rel~="stylesheet"]';
const embeds = "iframe,video,audio,object,embed";
const overview = "dialog.md-diagram-overview";

function elevateOverview(frame: HTMLIFrameElement, portal: HTMLElement): () => void {
  // Keep the original browsing context. Moving an iframe into a parent
  // dialog would reload it and discard the live editor and its selection.
  portal.style.width = `${frame.clientWidth}px`;
  portal.style.height = `${frame.clientHeight}px`;
  frame.setAttribute("data-editor-frame-overview", "");
  if (typeof frame.showPopover === "function") {
    frame.setAttribute("popover", "manual");
    try { frame.showPopover(); }
    catch { frame.removeAttribute("popover"); }
  }
  const locked: Element[] = [];
  for (let path: Element | null = frame; path?.parentElement; path = path.parentElement) {
    if (path === frame.ownerDocument.body) break;
    for (const sibling of path.parentElement.children) {
      if (sibling === path || sibling.hasAttribute("inert")) continue;
      sibling.setAttribute("inert", "");
      locked.push(sibling);
    }
  }
  return () => {
    if (frame.hasAttribute("popover")) {
      if (frame.matches(":popover-open")) frame.hidePopover();
      frame.removeAttribute("popover");
    }
    frame.removeAttribute("data-editor-frame-overview");
    portal.style.width = "100%";
    portal.style.height = "100%";
    for (const sibling of locked) {
      // A switch can hide another retained slot while the overview closes.
      if (!sibling.matches('.md-visual-slot[aria-hidden="true"]')) sibling.removeAttribute("inert");
    }
  };
}

/** Keep each rendered editor in its own layout tree and share the app runtime. */
export default function MarkdownVisualFrame({ children, active }: { children: ReactNode; active: boolean }) {
  const t = useT();
  const frame = useRef<HTMLIFrameElement>(null);
  const visible = useRef(active);
  visible.current = active;
  const endOverview = useRef<() => void>(() => {});
  const [target, setTarget] = useState<HTMLElement | null>();
  useLayoutEffect(() => {
    if (!active) endOverview.current();
  }, [active]);
  useLayoutEffect(() => {
    const element = frame.current;
    if (!element) return;
    const parent = element.ownerDocument;
    const parentWindow = parent.defaultView!;
    let cleanup = () => {};
    let owner: Document | null = null;
    let failed = false;
    let waiting = 0;
    const fallback = () => {
      if (failed) return;
      failed = true;
      parentWindow.clearTimeout(waiting);
      cleanup();
      cleanup = () => {};
      setTarget(null);
    };
    const attach = () => {
      if (failed) return;
      const child = element.contentDocument;
      if (!child?.head || !child.body || child === owner) return;
      if (owner) {
        setTarget(undefined);
        parentWindow.clearTimeout(waiting);
        waiting = parentWindow.setTimeout(fallback, 3000);
      }
      cleanup();
      owner = child;
      const root = child.documentElement;
      const fill = { margin: "0", width: "100%", height: "100%", overflow: "hidden" };
      Object.assign(root.style, fill);
      Object.assign(child.body.style, fill);
      const styles = new Map<Sheet, Sheet>();
      const pending = new Set<Sheet>();
      let mounted = false;
      const boundary = child.createComment("app styles");
      child.head.prepend(boundary);
      const portal = child.createElement("div");
      portal.style.width = "100%";
      portal.style.height = "100%";
      child.body.append(portal);
      const unregister = registerEditorFrame(element);
      const ready = () => {
        if (!pending.size && !failed) {
          parentWindow.clearTimeout(waiting);
          mounted = true;
          setTarget(portal);
        }
      };
      const copyStyles = () => {
        const live = new Set(parent.head.querySelectorAll<Sheet>(sheets));
        for (const [source, clone] of styles) {
          if (live.has(source)) continue;
          pending.delete(clone);
          clone.remove();
          styles.delete(source);
        }
        let previous: ChildNode = boundary;
        for (const source of live) {
          let clone = styles.get(source);
          if (!clone) {
            clone = child.createElement(source.localName) as Sheet;
            styles.set(source, clone);
          }
          if (clone.media !== source.media) clone.media = source.media;
          if (clone.localName === "link") {
            const link = clone as HTMLLinkElement;
            const original = source as HTMLLinkElement;
            const fetches = link.href !== original.href || link.disabled && !original.disabled && !link.sheet;
            link.disabled = original.disabled;
            if (fetches) {
              link.rel = "stylesheet";
              if (!original.disabled) pending.add(link);
              link.onload = () => { pending.delete(link); ready(); };
              link.onerror = () => {
                pending.delete(link);
                // A late stylesheet must never remount a live editor.
                if (!mounted) fallback();
              };
              link.href = original.href;
            }
            if (original.disabled) pending.delete(link);
          } else if (clone.textContent !== source.textContent) {
            clone.textContent = source.textContent;
          }
          if (previous.nextSibling !== clone) child.head.insertBefore(clone, previous.nextSibling);
          previous = clone;
        }
        ready();
      };
      const appearance = () => {
        const original = parent.documentElement;
        root.classList.toggle("dark", original.classList.contains("dark"));
        for (const name of ["data-platform", "lang", "dir"]) {
          const value = original.getAttribute(name);
          if (value === null) root.removeAttribute(name);
          else if (root.getAttribute(name) !== value) root.setAttribute(name, value);
        }
      };
      const embeddedMedia = () => {
        element.toggleAttribute("data-editor-frame-media", !!portal.querySelector(embeds));
      };
      const styleObserver = new MutationObserver(copyStyles);
      const themeObserver = new MutationObserver(appearance);
      let lower: (() => void) | undefined;
      const closeOverview = () => {
        lower?.();
        lower = undefined;
      };
      endOverview.current = closeOverview;
      const syncOverview = () => {
        if (!visible.current || !portal.querySelector(`${overview}[open]`)) closeOverview();
        else lower ??= elevateOverview(element, portal);
      };
      const contentObserver = new MutationObserver(records => {
        // Text editing is frequent. Only check the document when an element
        // capable of containing media or an overview was inserted or removed.
        const changed = (selector: string) => records.some(record =>
          [...record.addedNodes, ...record.removedNodes].some(node => {
            if (node.nodeType !== 1) return false;
            const element = node as Element;
            return element.matches(selector) || !!element.querySelector(selector);
          }));
        if (changed(embeds)) embeddedMedia();
        if (records.some(record => record.type === "attributes" && (record.target as Element).matches(overview))
          || changed(overview)) syncOverview();
      });
      cleanup = () => {
        closeOverview();
        child.removeEventListener("deditor-close-diagram-overview", closeOverview);
        unregister();
        styleObserver.disconnect();
        themeObserver.disconnect();
        contentObserver.disconnect();
        for (const clone of styles.values()) {
          clone.onload = clone.onerror = null;
          clone.remove();
        }
        boundary.remove();
        portal.remove();
        element.removeAttribute("data-editor-frame-media");
      };
      appearance();
      styleObserver.observe(parent.head, { subtree: true, childList: true, characterData: true, attributes: true });
      themeObserver.observe(parent.documentElement, { attributes: true, attributeFilter: ["class", "data-platform", "lang", "dir"] });
      contentObserver.observe(portal, { subtree: true, childList: true, attributes: true, attributeFilter: ["open"] });
      // Release parent chrome synchronously before a parent modal tries to focus.
      child.addEventListener("deditor-close-diagram-overview", closeOverview);
      copyStyles();
    };
    element.addEventListener("load", attach);
    waiting = parentWindow.setTimeout(fallback, 3000);
    attach();
    return () => {
      parentWindow.clearTimeout(waiting);
      element.removeEventListener("load", attach);
      cleanup();
    };
  }, []);
  if (target === null) return children;
  return <>
    <iframe ref={frame} className="md-visual-frame" title={t("md.visualEditor")}
      tabIndex={active ? undefined : -1} style={{ display: "block", width: "100%", height: "100%", border: 0 }} />
    {target && createPortal(children, target)}
  </>;
}
