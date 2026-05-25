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
  useActiveTabContent,
  useActiveTabFilePath,
  useEditorStore,
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
  theme: "light" | "dark";
  /** Editor's current top line — preview will scroll to match. */
  scrollLine?: number;
  /** Called when user scrolls preview; reports the source line at the top. */
  onScroll?: (line: number) => void;
}

export default function Preview({ theme, scrollLine, onScroll }: Props) {
  // Self-subscribed: Preview owns its content + filePath subscription so App
  // doesn't have to pass them down (and therefore App doesn't re-render on
  // every keystroke just to feed the preview).
  const source = useActiveTabContent();
  const filePath = useActiveTabFilePath();
  const [html, setHtml] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const isMd = isMarkdown(filePath);
  // Suppress outgoing scroll events for this many ms after a programmatic scroll
  // (set when applying incoming scrollLine from editor).
  const suppressOutgoingUntil = useRef(0);
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;

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

  // Apply incoming scrollLine from editor (programmatic scroll).
  //
  // Strategy: each [data-line] marker is a sample of (sourceLine → previewTop).
  // For an incoming fractional line L:
  //   • L > totalLines  → editor signalled atBottom; pin preview to scrollMax.
  //   • L ≤ lines[0]    → above the first marker; scroll to 0.
  //   • interior        → linearly interpolate between the two markers that
  //                       bracket L, using the editor's actual sub-line offset.
  //   • past last       → interpolate between (lines[last], tops[last]) and
  //                       (totalLines, scrollMax) so the tail of the document
  //                       maps cleanly to the tail of the preview.
  useEffect(() => {
    if (scrollLine == null) return;
    const root = containerRef.current;
    if (!root) return;
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

    const scrollMax = Math.max(0, root.scrollHeight - root.clientHeight);
    const totalLines = totalLinesRef.current;
    let top: number;

    if (scrollLine > totalLines) {
      top = scrollMax;
    } else if (scrollLine <= lines[0]) {
      top = 0;
    } else {
      // Largest i such that lines[i] <= scrollLine.
      let i = 0;
      for (let k = 0; k < lines.length; k++) {
        if (lines[k] <= scrollLine) i = k;
        else break;
      }
      if (i < lines.length - 1) {
        const span = lines[i + 1] - lines[i];
        const t = span > 0 ? (scrollLine - lines[i]) / span : 0;
        top = tops[i] + t * (tops[i + 1] - tops[i]);
      } else {
        // Past the last marker — interpolate toward scrollMax using
        // (totalLines, scrollMax) as the virtual end-of-doc anchor.
        const denom = Math.max(1, totalLines - lines[i]);
        const t = Math.max(0, Math.min(1, (scrollLine - lines[i]) / denom));
        top = tops[i] + t * (scrollMax - tops[i]);
      }
    }
    suppressOutgoingUntil.current = Date.now() + 200;
    root.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  }, [scrollLine, html]);

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
        if (raw.startsWith("#")) return;
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
    root.scrollTo({ top: Math.max(0, target.offsetTop - 16), behavior: "auto" });
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
