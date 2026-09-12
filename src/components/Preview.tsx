import { decodeAnchor, openMarkdownFileLink } from "../lib/markdownLinks";
import MarkdownDocumentSurface from "./MarkdownDocumentSurface";
import { markdownDisplayHtml, hydrateMarkdownDisplay } from "../lib/markdownDisplay";
import { installFootnotePreview } from "../lib/markdownFootnotePreview";
import { Button } from "./ui/Button";
import { FiX, FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { RiPushpinLine, RiPushpinFill } from "react-icons/ri";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown, renderCode } from "../lib/markdown";
import { hydrateLocalImages } from "../lib/localImgHydrate";
import { documentImageRoot } from "../lib/markdownImageSettings";
import { isMarkdown } from "../lib/lang";
import { logError } from "../lib/logger";
import { openFileByPath } from "../lib/fileio";
import {
  useEditorStore,
  useTabContent,
  useTabFilePath,
} from "../store/editor";
import {
  isExternalUrl,
  isLocalRef,
} from "../lib/pathUtil";
import { useT } from "../lib/i18n";
import {
  applySearch,
  clearHighlights,
  setCurrentMatch,
} from "../lib/previewSearch";

import { PreviewScrollIndex, markerFloor } from "../lib/previewScrollIndex";

interface TocItem {
  id: string;
  level: number;
  text: string;
}

interface Props {
  /** The tab id this Preview renders. Each Preview is bound to ONE tab so
   *  PreviewHost can keep one instance per visited tab; switching tabs is
   *  just a `display` toggle and never destroys the Preview's scroll, html
   *  cache, or TOC state. Without this prop Preview would self-subscribe to
   *  the active tab and become a singleton that cross-contaminates tabs. */
  tabId: string;
  /** True when this is the visible Preview slot. PreviewHost keeps every
   *  visited tab's Preview mounted (display:none for inactive); only the
   *  active one should own Cmd+F (in reading mode) and other window-level
   *  shortcuts, otherwise every hidden Preview would also register a
   *  handler and the keystroke would fire N times. */
  active?: boolean;
  /** Cold previews retain logical state but release their large HTML/SVG DOM. */
  retainDom?: boolean;
  theme: "light" | "dark";
  /** Editor's current top line — preview will scroll to match. Only set on
   *  the active Preview (inactive previews get undefined so their scrollTop
   *  is left alone). */
  scrollLine?: number;
  /** Source line to scroll to on FIRST html render only — used to align a
   *  freshly-mounted Preview with the tab's editor scroll position (which
   *  may have been restored from persistence). Read once; subsequent prop
   *  changes are ignored. */
  initialScrollLine?: number;
  /** Called when user scrolls preview; reports the source line at the top.
   *  Only set on the active Preview. */
  onScroll?: (line: number) => void;
}

export default function Preview({
  tabId,
  active,
  retainDom = true,
  theme,
  scrollLine,
  initialScrollLine,
  onScroll,
}: Props) {
  // Self-subscribed per tab — each PreviewHost slot only re-renders for its
  // own tab's content / filePath / dirty flips.
  const source = useTabContent(tabId);
  const footnoteLanguage = useEditorStore(s => s.language);
  useEffect(() => { if (containerRef.current) return installFootnotePreview(containerRef.current, footnoteLanguage); }, [footnoteLanguage]);
  const mathAutoNumber = useEditorStore(s => s.markdownSettings.mathAutoNumber);
  const documentTheme = useEditorStore(s => s.markdownSettings.documentTheme);
  const fontSize = useEditorStore(s => s.tabs.find(tab => tab.id === tabId)?.zoomFontSize ?? s.editorFontSize);
  const filePath = useTabFilePath(tabId);
  const [rendered, setRendered] = useState<{
    html: string; source: string; filePath: string | null;
    theme: "light" | "dark"; mathAutoNumber: boolean;
  } | null>(null);
  const html = retainDom ? rendered?.html ?? "" : "";
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIndexRef = useRef<PreviewScrollIndex | null>(null);
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const index = new PreviewScrollIndex(containerRef.current);
    scrollIndexRef.current = index;
    return () => { index.destroy(); scrollIndexRef.current = null; };
  }, []);
  useLayoutEffect(() => { scrollIndexRef.current?.reset(); }, [html]);
  // Invalidate before layout effects restore a retained or newly rendered DOM.
  useLayoutEffect(() => { scrollIndexRef.current?.invalidate(); }, [active, retainDom, theme, fontSize, documentTheme]);
  const isMd = isMarkdown(filePath);
  const imageRoot = isMd ? documentImageRoot(source, filePath) : null;
  // Inactive Markdown slots keep their last result, but do no new parsing or
  // diagram work until visible. Standalone previews default to being visible.
  const renderEnabled = !isMd || (active !== false && retainDom);
  const renderCurrent = rendered?.source === source && rendered.filePath === filePath &&
    rendered.theme === theme && rendered.mathAutoNumber === mathAutoNumber;
  // Suppress outgoing scroll events for this many ms after a programmatic scroll
  // (set when applying incoming scrollLine from editor).
  const suppressOutgoingUntil = useRef(0);
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  // Last known fractional source-line at the top of the preview viewport.
  // Updated by the outgoing scroll handler AND by the incoming scrollLine
  // effect. Used by the re-align effect when previewMaximized toggles (the
  // pane's width changes, so the same pixel scrollTop maps to a different
  // logical line — we need to scroll back to the line we were on).
  const lastTopLineRef = useRef(1);

  useEffect(() => {
    if (!renderEnabled || renderCurrent) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      const out = isMd
        ? await renderMarkdown(source, { theme, mathAutoNumber })
        : await renderCode(source, filePath, { theme });
      if (!cancelled) setRendered({
        html: isMd ? markdownDisplayHtml(out) : out,
        source, filePath, theme, mathAutoNumber,
      });
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [source, filePath, theme, isMd, mathAutoNumber, renderEnabled, renderCurrent]);

  // Hydrate the committed result's theme. Hidden source/theme changes retain
  // this result, so they neither start new diagram work nor abort in-flight
  // hydration on the retained DOM. A newly rendered result keeps the existing
  // replacement/unmount cleanup behavior.
  const renderedTheme = rendered?.theme ?? theme;
  useEffect(() => {
    if (!containerRef.current || !html) return;
    const display = hydrateMarkdownDisplay(containerRef.current, { theme: renderedTheme, filePath, imageRoot });
    return () => display.abort();
  }, [html, renderedTheme]);

  // Local images: rewrite `<img>` src to a Tauri asset:// URL so the WebView
  // can load files outside its own origin. Relative paths resolve against the
  // active markdown file's directory.
  useEffect(() => {
    if (!containerRef.current) return;
    hydrateLocalImages(containerRef.current, filePath, imageRoot);
  }, [html, filePath, imageRoot]);

  // totalLines: rounded-up newline count of the active source. Both sides of
  // the editor↔preview sync use this to encode an "atBottom" sentinel
  // (sender emits `total + 1` when pinned to scrollMax). Recomputed on every
  // source change and stashed in a ref so the scroll handler (which only
  // binds once) sees the latest count without re-attaching.
  const totalLinesRef = useRef(1);
  useEffect(() => {
    let n = 1;
    for (let i = 0; i < source.length; i++) {
      if (source.charCodeAt(i) === 10) n++;
    }
    totalLinesRef.current = n;
  }, [source]);

  // Marker-based "scroll the preview container to source line L". Returns
  // true if it found markers and scrolled; false if html isn't rendered yet
  // (caller can wait for the next html change). Mirrors the strategy used
  // by both incoming-scroll and re-align effects:
  //   • L > totalLines  → atBottom sentinel; pin preview to scrollMax.
  //   • L ≤ lines[0]    → above first marker; scroll to 0.
  //   • interior        → linearly interpolate between bracketing markers.
  //   • past last       → interpolate toward (totalLines, scrollMax).
  const scrollContainerToLine = (targetLine: number): boolean => {
    const root = containerRef.current;
    if (!root) return false;
    const markers = scrollIndexRef.current?.read();
    if (!markers || markers.lines.length === 0) return false;
    const { lines, tops } = markers;
    const scrollMax = Math.max(0, root.scrollHeight - root.clientHeight);
    const totalLines = totalLinesRef.current;
    let top: number;
    if (targetLine > totalLines) {
      top = scrollMax;
    } else if (targetLine <= lines[0]) {
      top = 0;
    } else {
      const i = markerFloor(lines, targetLine, markers.linesOrdered);
      if (i < lines.length - 1) {
        const span = lines[i + 1] - lines[i];
        const t = span > 0 ? (targetLine - lines[i]) / span : 0;
        top = tops[i] + t * (tops[i + 1] - tops[i]);
      } else {
        const denom = Math.max(1, totalLines - lines[i]);
        const t = Math.max(0, Math.min(1, (targetLine - lines[i]) / denom));
        top = tops[i] + t * (scrollMax - tops[i]);
      }
    }
    suppressOutgoingUntil.current = Date.now() + 200;
    root.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    return true;
  };

  const suspended = useRef(false);
  useLayoutEffect(() => {
    if (!retainDom) { suspended.current = true; return; }
    if (suspended.current && active) {
      scrollContainerToLine(lastTopLineRef.current);
      suspended.current = false;
    }
  }, [retainDom, active, html]);

  // Apply incoming scrollLine from editor (programmatic scroll). Re-runs on
  // html change so a scrollLine that arrived before html was ready will still
  // be applied once markers exist.
  useEffect(() => {
    if (scrollLine == null) return;
    lastTopLineRef.current = scrollLine;
    scrollContainerToLine(scrollLine);
  }, [scrollLine, html]);

  // Apply initialScrollLine ONCE, on the first html render that has data-line
  // markers. Used to align a freshly-mounted Preview with its tab's editor
  // scroll position (which may have been restored from persistence). After
  // it lands, this effect retires — subsequent sync goes through scrollLine.
  const didApplyInitialRef = useRef(false);
  useEffect(() => {
    if (didApplyInitialRef.current) return;
    if (initialScrollLine == null || initialScrollLine <= 1) {
      didApplyInitialRef.current = true;
      return;
    }
    // Try now; if html doesn't have markers yet, leave the flag false and
    // try again next html change.
    if (scrollContainerToLine(initialScrollLine)) {
      lastTopLineRef.current = initialScrollLine;
      didApplyInitialRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, initialScrollLine]);

  // Re-snap to the last known source line every time the rendered content's
  // scrollHeight changes. The markdown html state is set immediately, but
  // mermaid (~700 KB lazy) and plantuml (network-rendered SVG) hydrate into
  // the DOM AFTER our html is written. Their SVG insertions push every
  // [data-line] marker below them DOWN, so a scrollTop set at render time
  // points to an earlier line than intended once they finish — that's the
  // "reading view drifts upward each cycle" drift.
  //
  // A one-shot setTimeout(800) misses late-arriving mermaid renders; a
  // MutationObserver fires on every DOM mutation under the container, and
  // we re-snap whenever scrollHeight actually changed since the last fire.
  // Capped at 5 seconds (mermaid/plantuml typically finish well within).
  //
  // Uses `lastTopLineRef` (not `scrollLine`) so it also corrects drift for
  // user-initiated scrolls and TOC clicks within the preview.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let lastScrollHeight = root.scrollHeight;
    let pendingRaf = 0;
    const resnap = () => {
      pendingRaf = 0;
      const h = root.scrollHeight;
      if (h === lastScrollHeight) return;
      lastScrollHeight = h;
      const targetLine = lastTopLineRef.current;
      if (!Number.isFinite(targetLine) || targetLine <= 1) return;
      scrollContainerToLine(targetLine);
    };
    const observer = new MutationObserver(() => {
      if (pendingRaf) return;
      pendingRaf = requestAnimationFrame(resnap);
    });
    observer.observe(root, { childList: true, subtree: true });
    const stopTimer = setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      clearTimeout(stopTimer);
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  // Intercept clicks on anchors and images. External `http(s):` links go to
  // the OS browser; local file paths (relative or absolute, with or without
  // `file://`) open as a tab via `openFileByPath`. In-page anchors (`#foo`)
  // keep their default hash-jump behavior so heading links still work.
  // Clicks on local images also open the image as a tab (zoom-in affordance
  // in the rendered preview).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest("a") as HTMLAnchorElement | null;
      if (a) {
        const raw = a.getAttribute("href");
        if (!raw) return;
        if (raw.startsWith("#")) {
          // In a Tauri WebView the browser-default anchor jump scrolls the
          // wrong container (window/body instead of the preview pane) and
          // pins the preview at scrollTop=0, so we have to handle it here.
          //
          // We prefer the heading's `data-line` (set by markdown.ts on every
          // block) over its `offsetTop`. Reason: when mermaid/plantuml
          // hydrate AFTER the click, the heading's pixel position shifts
          // down. An offsetTop-based scroll lands at the heading initially,
          // but then the scroll-event handler computes the WRONG fracLine
          // (whatever was at scrollTop AFTER hydration), and that wrong
          // fracLine becomes the target our MutationObserver re-snaps to
          // forever — that's the flaky "click 5.4.3 sometimes works" case.
          // Anchoring on data-line keeps the logical target stable.
          e.preventDefault();
          let id = raw.slice(1);
          try { id = decodeURIComponent(id); } catch { /* malformed % escape */ }
          if (!id) return;
          let target: HTMLElement | null = null;
          try {
            target = Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(element => decodeAnchor(element.id) === id) ?? null;
          } catch { return; }
          if (!target) return;
          const dataLine = Number(target.dataset.line);
          if (Number.isFinite(dataLine) && dataLine > 0) {
            lastTopLineRef.current = dataLine;
            scrollContainerToLine(dataLine);
            // scrollContainerToLine sets suppressOutgoingUntil, so the
            // normal scroll listener won't propagate. Notify the parent
            // explicitly so the editor follows.
            onScrollRef.current?.(dataLine);
            return;
          }
          // Fallback when the heading lacks data-line (shouldn't happen
          // for markdown-it-rendered output, but keeps user-supplied raw
          // HTML anchors working).
          root.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: "auto" });
          return;
        }
        if (isExternalUrl(raw)) {
          e.preventDefault();
          openUrl(a.href).catch((err) => logError("openUrl failed", err));
          return;
        }
        if (isLocalRef(raw)) {
          e.preventDefault();
          openMarkdownFileLink(raw, filePath).catch(err => logError("Markdown local link open failed", err));
          return;
        }
        return;
      }
      // Image click → open in tab (image preview). The hydrator stores the
      // resolved absolute path on `data-abs-path`.
      const img = target.closest("img[data-abs-path]") as HTMLImageElement | null;
      if (img) {
        e.preventDefault();
        const abs = img.dataset.absPath;
        if (abs) {
          openFileByPath(abs).catch((err) =>
            logError(`open local image failed: ${abs}`, err),
          );
        }
      }
    };
    root.addEventListener("click", handler);
    return () => root.removeEventListener("click", handler);
  }, [filePath]);

  // Outgoing: when the user scrolls preview, compute the *fractional* source
  // line that corresponds to the current preview.scrollTop using the same
  // marker-interpolation scheme as the incoming effect (in reverse). End-of-
  // preview is signalled to the editor as `totalLines + 1` so it can pin its
  // own scrollMax — keeping bottoms aligned in either direction.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    let rafId = 0;
    const handler = () => {
      if (Date.now() < suppressOutgoingUntil.current) return;
      if (!onScrollRef.current) return;
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const markers = scrollIndexRef.current?.read();
        if (!markers || markers.lines.length === 0) return;
        const { lines, tops } = markers;

        const top = root.scrollTop;
        const scrollMax = Math.max(0, root.scrollHeight - root.clientHeight);
        const totalLines = totalLinesRef.current;
        let fracLine: number;

        if (scrollMax > 0 && scrollMax - top < 2) {
          fracLine = totalLines + 1;
        } else if (top <= tops[0]) {
          fracLine = lines[0];
        } else {
          // Largest i such that tops[i] <= top.
          const i = markerFloor(tops, top, markers.topsOrdered);
          if (i < tops.length - 1) {
            const span = tops[i + 1] - tops[i];
            const t = span > 0 ? (top - tops[i]) / span : 0;
            fracLine = lines[i] + t * (lines[i + 1] - lines[i]);
          } else {
            const denom = Math.max(1, scrollMax - tops[i]);
            const t = Math.max(0, Math.min(1, (top - tops[i]) / denom));
            fracLine = lines[i] + t * (totalLines - lines[i]);
          }
        }
        if (Number.isFinite(fracLine) && fracLine > 0) {
          lastTopLineRef.current = fracLine;
          onScrollRef.current?.(fracLine);
        }
      });
    };
    root.addEventListener("scroll", handler, { passive: true });
    return () => {
      root.removeEventListener("scroll", handler);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  // Reading-mode chrome (full-width + right-side outline). Self-subscribed so
  // App doesn't have to thread these props through.
  const previewMaximized = useEditorStore((s) => s.previewMaximized);
  const tocVisible = useEditorStore((s) => s.tocVisible);
  const toggleTocVisible = useEditorStore((s) => s.toggleTocVisible);
  const readingMode = previewMaximized && isMd;
  const tocId = useId();
  const [tocPeek, setTocPeek] = useState(false);
  const tocExpanded = tocVisible || tocPeek;
  const tocTriggerRef = useRef<HTMLButtonElement>(null);
  const tocPinRef = useRef<HTMLButtonElement>(null);
  const tocLeaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelTocClose = () => clearTimeout(tocLeaveTimer.current);
  const openTocPeek = () => { cancelTocClose(); setTocPeek(true); };
  const closeTocPeek = () => {
    cancelTocClose();
    tocLeaveTimer.current = setTimeout(() => setTocPeek(false), 180);
  };
  useEffect(() => {
    if (!active || !readingMode) setTocPeek(false);
    return () => clearTimeout(tocLeaveTimer.current);
  }, [active, readingMode]);
  const t = useT();

  // Re-align scroll when the pane's width changes (reading mode or outline).
  // The pixel scrollTop is preserved by the browser, but Markdown content
  // re-wraps at a different width and code blocks recompute their heights,
  // so the same scrollTop now points to a different source line. Without
  // this, toggling reading mode at section 6.1 can land on 5.4 or 6.4.
  //
  // Skip the very first run (mount) — there's no width transition to react
  // to and we'd just fight whatever scroll position the parent set.
  const didMountMaximizedRef = useRef(false);
  useEffect(() => {
    if (!didMountMaximizedRef.current) {
      didMountMaximizedRef.current = true;
      return;
    }
    const targetLine = lastTopLineRef.current;
    if (!Number.isFinite(targetLine) || targetLine <= 0) return;
    // rAF lets the browser apply the new width / re-layout markdown before
    // we measure offsetTop on the data-line markers.
    const raf = requestAnimationFrame(() => {
      scrollContainerToLine(targetLine);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewMaximized, tocVisible]);

  // Reading-mode in-pane search (Cmd/Ctrl+F). The editor's own Cmd+F goes
  // through CodeMirror's searchKeymap and won't fire when the editor is
  // display:none — so without this, there's no way to find text in reading
  // mode at all. We wrap matches in <span class="preview-search-match"> via
  // a TreeWalker, track the current index, and scroll it into view.
  //
  // Only the ACTIVE Preview owns the Cmd+F handler; otherwise every hidden
  // PreviewSlot would register one and the keystroke would fire N times.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [matchInfo, setMatchInfo] = useState<{ total: number; current: number }>(
    { total: 0, current: 0 },
  );
  const matchesRef = useRef<HTMLSpanElement[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    if (containerRef.current) clearHighlights(containerRef.current);
    matchesRef.current = [];
    setMatchInfo({ total: 0, current: 0 });
  };

  const gotoMatch = (idx: number) => {
    const matches = matchesRef.current;
    if (matches.length === 0) return;
    const clamped = ((idx % matches.length) + matches.length) % matches.length;
    setCurrentMatch(matches, clamped);
    setMatchInfo({ total: matches.length, current: clamped + 1 });
    // Pin lastTopLineRef to the match's enclosing block's data-line so the
    // MutationObserver re-snap (triggered by late mermaid renders) keeps
    // the preview ON the match instead of dragging it back to the pre-
    // search anchor. closest("[data-line]") walks up to the nearest block
    // (paragraph / heading / list-item) — accurate to the block, which is
    // close enough that the match stays in view after re-snap.
    const block = matches[clamped].closest<HTMLElement>("[data-line]");
    if (block) {
      const ln = Number(block.dataset.line);
      if (Number.isFinite(ln) && ln > 0) {
        lastTopLineRef.current = ln;
        // Forward to parent so the editor follows even though it's hidden
        // in reading mode — exiting reading mode then lands on the match.
        onScrollRef.current?.(ln);
      }
    }
    suppressOutgoingUntil.current = Date.now() + 200;
  };
  const goNext = () =>
    gotoMatch(matchInfo.current === 0 ? 0 : matchInfo.current);
  const goPrev = () =>
    gotoMatch(matchInfo.current === 0 ? 0 : matchInfo.current - 2);

  // Re-apply search whenever query or html changes — keeping highlights
  // stable as mermaid/plantuml hydrate (their innerHTML replacements wipe
  // any marks that landed inside; for marks elsewhere it's safe but cheap
  // to redo). Throttled implicitly by html being debounced upstream.
  useEffect(() => {
    if (!retainDom) { matchesRef.current = []; return; }
    if (!searchOpen) return;
    const root = containerRef.current;
    if (!root) {
      matchesRef.current = [];
      setMatchInfo({ total: 0, current: 0 });
      return;
    }
    if (!searchQuery) {
      clearHighlights(root);
      matchesRef.current = [];
      setMatchInfo({ total: 0, current: 0 });
      return;
    }
    const { total, matches } = applySearch(root, searchQuery);
    matchesRef.current = matches;
    if (total === 0) {
      setMatchInfo({ total: 0, current: 0 });
    } else {
      // Keep the user on the same logical match across re-applies if the
      // index is still valid; otherwise jump back to the first.
      const idx =
        matchInfo.current >= 1 && matchInfo.current <= total
          ? matchInfo.current - 1
          : 0;
      setCurrentMatch(matches, idx);
      setMatchInfo({ total, current: idx + 1 });
      // Pin lastTopLineRef to the match's block-line — same reasoning as
      // in gotoMatch (keeps re-snap from undoing the search jump).
      const block = matches[idx].closest<HTMLElement>("[data-line]");
      if (block) {
        const ln = Number(block.dataset.line);
        if (Number.isFinite(ln) && ln > 0) lastTopLineRef.current = ln;
      }
      suppressOutgoingUntil.current = Date.now() + 200;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, html, searchOpen, retainDom]);

  // Cmd/Ctrl+F to open the search bar. Bound at window level (capture phase)
  // so it intercepts before any WebView-native find handling.
  useEffect(() => {
    if (!active) return;
    if (!readingMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        setSearchOpen(true);
        // Focus + select after the input renders.
        setTimeout(() => {
          searchInputRef.current?.focus();
          searchInputRef.current?.select();
        }, 0);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, readingMode]);

  // Auto-close the search bar when leaving reading mode (the bar is only
  // visually anchored there). Also clears any leftover highlights.
  useEffect(() => {
    if (readingMode) return;
    if (!searchOpen && matchesRef.current.length === 0) return;
    closeSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingMode]);

  // Extract the TOC from the rendered DOM. markdown-it-anchor stamps each
  // heading with an id derived from its text — that's what we use for jumping
  // and active-section highlighting.
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  useEffect(() => {
    if (!retainDom) return;
    if (!readingMode) {
      if (tocItems.length) setTocItems([]);
      return;
    }
    const root = containerRef.current;
    if (!root) return;
    const headings = root.querySelectorAll<HTMLElement>(
      "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
    );
    const items: TocItem[] = [];
    headings.forEach((h) => {
      const id = h.id;
      if (!id) return;
      items.push({
        id,
        level: Number(h.tagName.slice(1)),
        text: h.textContent || "",
      });
    });
    setTocItems(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html, readingMode, retainDom]);

  // Active TOC item — driven by two signals so both natural scroll AND TOC
  // clicks are honored correctly:
  //
  //   • Natural scroll: the "last heading with offsetTop ≤ scrollTop + 80"
  //     rule. When the user scrolls to the bottom of the preview, the
  //     threshold widens to the full viewport so a long-tailed last heading
  //     that can't reach the viewport top still gets picked.
  //
  //   • TOC click: `scrollTo(heading.offsetTop - 16)` clamps to scrollMax when
  //     the heading is too close to the doc end. Multiple distinct headings
  //     can land at the SAME scrollMax, so scrollTop alone can't recover the
  //     user's intent. We remember which id was clicked and the post-clamp
  //     scrollTop; while the user hasn't drifted off that position, the
  //     clicked id wins. Once the user actually scrolls (delta > 3px), the
  //     click anchor is released and the rule takes over.
  const [activeTocId, setActiveTocId] = useState<string>("");
  const clickedTocRef = useRef<{ id: string; scrollTop: number } | null>(null);
  useEffect(() => {
    if (!retainDom) return;
    if (!readingMode || tocItems.length === 0) {
      if (activeTocId) setActiveTocId("");
      clickedTocRef.current = null;
      return;
    }
    const root = containerRef.current;
    if (!root) return;
    const update = () => {
      const headings = root.querySelectorAll<HTMLElement>(
        "h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]",
      );
      if (headings.length === 0) return;
      const top = root.scrollTop;
      const click = clickedTocRef.current;
      if (click) {
        if (Math.abs(top - click.scrollTop) <= 3) {
          setActiveTocId(click.id);
          return;
        }
        // User scrolled away from the click position — release the anchor.
        clickedTocRef.current = null;
      }
      // Threshold = "what offsetTop counts as having been passed by the
      // viewport". The naive rule (top + 80) works well mid-document, but
      // breaks near the doc end: a heading sitting in the last clientHeight
      // of content has offsetTop > top + 80 even at scrollMax, so the rule
      // can't pick it. Previously we patched that with a binary atBottom
      // switch (threshold jumps from `top+80` to `top+clientHeight` when
      // scrollMax-top < 2), but that introduced a 1px discontinuity — a
      // single scroll tick could skip from h3 straight to h5.
      //
      // Instead, ease the threshold linearly over the last `clientHeight`
      // pixels of scroll. `gradStart` = the scrollTop at which the LAST
      // heading enters the bottom of the viewport. Before gradStart we use
      // the section rule unchanged; from gradStart to scrollMax the
      // threshold ramps so each trailing heading gets passed in order.
      const scrollMax = Math.max(0, root.scrollHeight - root.clientHeight);
      const last = headings[headings.length - 1];
      const clientH = root.clientHeight;
      const gradStart = Math.max(0, last.offsetTop - clientH);
      let threshold: number;
      if (scrollMax <= gradStart || top < gradStart) {
        threshold = top + 80;
      } else {
        const t = Math.max(
          0,
          Math.min(1, (top - gradStart) / (scrollMax - gradStart)),
        );
        threshold = top + 80 + t * (clientH - 80);
      }
      let bestId = headings[0].id;
      for (const el of headings) {
        if (el.offsetTop <= threshold) bestId = el.id;
        else break;
      }
      setActiveTocId(bestId);
    };
    update();
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        update();
      });
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocItems, readingMode, retainDom]);

  const handleTocJump = (id: string) => {
    const root = containerRef.current;
    if (!root) return;
    const target = Array.from(root.querySelectorAll<HTMLElement>("[id]")).find(element => decodeAnchor(element.id) === id) ?? null;
    if (!target) return;
    // Anchor on the heading's data-line (markdown.ts stamps it) so the
    // logical target survives async mermaid/plantuml hydration shifts.
    // Fallback to offsetTop for headings without data-line.
    const dataLine = Number(target.dataset.line);
    if (Number.isFinite(dataLine) && dataLine > 0) {
      lastTopLineRef.current = dataLine;
      scrollContainerToLine(dataLine);
      onScrollRef.current?.(dataLine);
    } else {
      root.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: "auto" });
    }
    // Record the post-clamp scrollTop so the active-tracker can honor the
    // click even when scrollTo got clamped to scrollMax (which collapses
    // multiple distinct heading targets onto the same scroll position).
    clickedTocRef.current = { id, scrollTop: root.scrollTop };
    setActiveTocId(id);
  };

  // The DOM structure is identical in both modes — only classes / siblings of
  // the preview div toggle. Keeping the preview div at the same React position
  // means containerRef stays stable across mode flips, so the outgoing-scroll
  // listener (bound once with `[]` deps) doesn't get orphaned when the user
  // toggles between split and reading view.
  return (
    <div className="flex flex-col h-full">
      <div className={`preview-reading-host${readingMode ? " preview-reading-host--reading" : ""}`}>
        <MarkdownDocumentSurface
          ref={containerRef}
          fontSize={fontSize} customStyleEnabled={isMd} documentTheme={isMd ? documentTheme : "default"}
          className={`preview${readingMode ? " preview-fullwidth" : ""}`}
          style={{ flex: 1 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {readingMode && (
          <aside
            className="preview-toc"
            data-expanded={tocExpanded}
            data-pinned={tocVisible}
            aria-label={t("preview.toc")}
            onMouseEnter={openTocPeek}
            onMouseLeave={() => {
              if (!tocPinRef.current?.closest("aside")?.querySelector(":focus-visible")) closeTocPeek();
            }}
            onFocus={cancelTocClose}
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) closeTocPeek(); }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && !tocVisible) {
                e.stopPropagation();
                cancelTocClose();
                setTocPeek(false);
                requestAnimationFrame(() => tocTriggerRef.current?.focus());
              }
            }}
          >
            <button
              ref={tocTriggerRef}
              type="button"
              className="preview-toc-rail"
              hidden={tocExpanded}
              onClick={(e) => {
                openTocPeek();
                if (e.detail === 0) requestAnimationFrame(() => tocPinRef.current?.focus());
              }}
              aria-label={t("preview.tocShow")}
              title={t("preview.tocShow")}
              aria-expanded={tocExpanded}
              aria-controls={tocId}
            >
              {Array.from({ length: Math.min(20, Math.max(3, tocItems.length)) }, (_, index) => {
                const bucketSize = Math.max(1, tocItems.length / 20);
                const item = tocItems[Math.floor(index * bucketSize)];
                const currentIndex = tocItems.findIndex((it) => it.id === activeTocId);
                return <span key={index} data-level={item?.level ?? 2} data-current={currentIndex >= Math.floor(index * bucketSize) && currentIndex < Math.floor((index + 1) * bucketSize)} />;
              })}
            </button>
            <div className="preview-toc-panel" hidden={!tocExpanded}>
              <div className="preview-toc-header">
                <span className="preview-toc-title">{t("preview.toc")}</span>
                <Button
                  ref={tocPinRef}
                  variant="ghost"
                  size="iconLg"
                  className="preview-toc-toggle"
                  onClick={toggleTocVisible}
                  pressed={tocVisible}
                  title={tocVisible ? t("preview.tocUnpin") : t("preview.tocPin")}
                  aria-label={tocVisible ? t("preview.tocUnpin") : t("preview.tocPin")}
                >
                  {tocVisible ? <RiPushpinFill size={14} aria-hidden="true" /> : <RiPushpinLine size={14} aria-hidden="true" />}
                </Button>
              </div>
              <nav id={tocId} className="preview-toc-body" aria-label={t("preview.toc")}>
                {tocItems.length === 0 ? (
                  <div className="preview-toc-empty">{t("preview.tocEmpty")}</div>
                ) : (
                  <ul className="preview-toc-list">
                    {tocItems.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          data-lvl={it.level}
                          className={`preview-toc-item${
                            it.id === activeTocId ? " active" : ""
                          }`}
                          onClick={() => handleTocJump(it.id)}
                          title={it.text}
                          aria-current={it.id === activeTocId ? "location" : undefined}
                        >
                          {it.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </nav>
            </div>
          </aside>
        )}
        {readingMode && searchOpen && (
          <div className="preview-search-bar" role="search">
            <input
              ref={searchInputRef}
              type="text"
              className="deditor-input deditor-input--compact preview-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) goPrev();
                  else goNext();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  closeSearch();
                }
              }}
              placeholder={t("preview.search.placeholder")}
              spellCheck={false}
              autoCorrect="off"
            />
            <span className="preview-search-count">
              {matchInfo.total === 0
                ? searchQuery
                  ? t("preview.search.noMatch")
                  : ""
                : t("preview.search.matchN", {
                    cur: String(matchInfo.current),
                    total: String(matchInfo.total),
                  })}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrev}
              disabled={matchInfo.total === 0}
              title={t("preview.search.prev")}
              aria-label={t("preview.search.prev")}
            >
              <FiChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNext}
              disabled={matchInfo.total === 0}
              title={t("preview.search.next")}
              aria-label={t("preview.search.next")}
            >
              <FiChevronRight size={14} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={closeSearch}
              title={t("preview.search.close")}
              aria-label={t("preview.search.close")}
            >
              <FiX size={14} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
