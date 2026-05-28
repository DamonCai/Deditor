import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown, renderCode } from "../lib/markdown";
import { hydratePlantuml } from "../lib/plantumlHydrate";
import { hydrateMermaid } from "../lib/mermaidHydrate";
import { hydrateLocalImages } from "../lib/localImgHydrate";
import { isMarkdown } from "../lib/lang";
import { logError } from "../lib/logger";
import { openFileByPath } from "../lib/fileio";
import {
  useEditorStore,
  useTabContent,
  useTabFilePath,
} from "../store/editor";
import {
  dirname,
  isExternalUrl,
  isLocalRef,
  resolveAgainst,
  stripFileScheme,
} from "../lib/pathUtil";
import { useT } from "../lib/i18n";

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
  theme,
  scrollLine,
  initialScrollLine,
  onScroll,
}: Props) {
  // Self-subscribed per tab — each PreviewHost slot only re-renders for its
  // own tab's content / filePath / dirty flips.
  const source = useTabContent(tabId);
  const filePath = useTabFilePath(tabId);
  const [html, setHtml] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const isMd = isMarkdown(filePath);
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
    let cancelled = false;
    const id = setTimeout(async () => {
      const out = isMd
        ? await renderMarkdown(source, { theme })
        : await renderCode(source, filePath, { theme });
      if (!cancelled) setHtml(out);
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [source, filePath, theme, isMd]);

  // After every HTML refresh, walk the DOM and replace plantuml placeholders
  // with their rendered SVG (cache → network with short timeout). The returned
  // AbortController cancels in-flight fetches when html changes again.
  // NOTE: an earlier "optimization" tried to short-circuit these with
  // `html.includes(...)` before calling querySelectorAll. `perf-hydrate.ts`
  // proved that wrong: querySelectorAll with a class selector is backed by
  // an indexed lookup in jsdom (and Chromium) and runs in ~5 µs on an
  // 8000-element DOM, while String.includes() over a 200 KB html blob is
  // ~180 µs. Indexed DOM beats linear string scan; the obvious-looking
  // pre-check made things 30× slower. Don't add it back.
  useEffect(() => {
    if (!containerRef.current) return;
    const ctrl = hydratePlantuml(containerRef.current);
    return () => ctrl.abort();
  }, [html]);

  // Mermaid blocks: lazy-load mermaid.js, render each placeholder. Re-runs
  // whenever the html or theme changes (theme switch needs a re-render so the
  // diagram re-themes correctly).
  useEffect(() => {
    if (!containerRef.current) return;
    const ctrl = hydrateMermaid(containerRef.current, theme);
    return () => ctrl.abort();
  }, [html, theme]);

  // Local images: rewrite `<img>` src to a Tauri asset:// URL so the WebView
  // can load files outside its own origin. Relative paths resolve against the
  // active markdown file's directory.
  useEffect(() => {
    if (!containerRef.current) return;
    hydrateLocalImages(containerRef.current, filePath);
  }, [html, filePath]);

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
    const els = root.querySelectorAll<HTMLElement>("[data-line]");
    if (els.length === 0) return false;
    const lines: number[] = [];
    const tops: number[] = [];
    els.forEach((el) => {
      const ln = Number(el.dataset.line);
      if (Number.isFinite(ln)) {
        lines.push(ln);
        tops.push(el.offsetTop);
      }
    });
    if (lines.length === 0) return false;
    const scrollMax = Math.max(0, root.scrollHeight - root.clientHeight);
    const totalLines = totalLinesRef.current;
    let top: number;
    if (targetLine > totalLines) {
      top = scrollMax;
    } else if (targetLine <= lines[0]) {
      top = 0;
    } else {
      let i = 0;
      for (let k = 0; k < lines.length; k++) {
        if (lines[k] <= targetLine) i = k;
        else break;
      }
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
    const baseDir = filePath ? dirname(filePath) : "";
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
            target = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
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
          const stripped = stripFileScheme(raw);
          const cleanIdx = stripped.search(/[#?]/);
          const ref = cleanIdx >= 0 ? stripped.slice(0, cleanIdx) : stripped;
          const resolved = resolveAgainst(baseDir, ref);
          openFileByPath(resolved).catch((err) =>
            logError(`open local link failed: ${resolved}`, err),
          );
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
        const els = root.querySelectorAll<HTMLElement>("[data-line]");
        if (els.length === 0) return;
        const lines: number[] = [];
        const tops: number[] = [];
        els.forEach((el) => {
          const ln = Number(el.dataset.line);
          if (Number.isFinite(ln)) {
            lines.push(ln);
            tops.push(el.offsetTop);
          }
        });
        if (lines.length === 0) return;

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
          let i = 0;
          for (let k = 0; k < tops.length; k++) {
            if (tops[k] <= top) i = k;
            else break;
          }
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
  const t = useT();

  // Re-align scroll when the pane's width changes (split ↔ reading toggle).
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
  }, [previewMaximized]);

  // Extract the TOC from the rendered DOM. markdown-it-anchor stamps each
  // heading with an id derived from its text — that's what we use for jumping
  // and active-section highlighting.
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  useEffect(() => {
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
  }, [html, readingMode]);

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
  }, [tocItems, readingMode]);

  const handleTocJump = (id: string) => {
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
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
      <div className="preview-reading-host">
        <div
          ref={containerRef}
          className={`preview${readingMode ? " preview-fullwidth" : ""}`}
          style={{ flex: 1 }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
        {readingMode && tocVisible && (
          <aside className="preview-toc">
            <div className="preview-toc-title">{t("preview.toc")}</div>
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
                    >
                      {it.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
        {readingMode && (
          <button
            type="button"
            className="preview-toc-toggle"
            onClick={() => toggleTocVisible()}
            title={tocVisible ? t("preview.tocHide") : t("preview.tocShow")}
            aria-label={
              tocVisible ? t("preview.tocHide") : t("preview.tocShow")
            }
          >
            {tocVisible ? "✕" : "☰"}
          </button>
        )}
      </div>
    </div>
  );
}
