import { useEffect, useRef, useState } from "react";
import { FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { renderMarkdown, renderCode } from "../lib/markdown";
import { hydratePlantuml } from "../lib/plantumlHydrate";
import { isMarkdown } from "../lib/lang";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";

interface Props {
  source: string;
  filePath: string | null;
  theme: "light" | "dark";
  /** Editor's current top line — preview will scroll to match. */
  scrollLine?: number;
  /** Called when user scrolls preview; reports the source line at the top. */
  onScroll?: (line: number) => void;
}

export default function Preview({ source, filePath, theme, scrollLine, onScroll }: Props) {
  const t = useT();
  const [html, setHtml] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const isMd = isMarkdown(filePath);
  const { previewMaximized, togglePreviewMaximized } = useEditorStore();
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
  useEffect(() => {
    if (!containerRef.current) return;
    const ctrl = hydratePlantuml(containerRef.current);
    return () => ctrl.abort();
  }, [html]);

  // Apply incoming scrollLine from editor (programmatic scroll).
  useEffect(() => {
    if (scrollLine == null) return;
    const root = containerRef.current;
    if (!root) return;
    const all = Array.from(root.querySelectorAll<HTMLElement>("[data-line]"));
    if (all.length === 0) return;
    let target = all[0];
    for (const el of all) {
      const ln = Number(el.dataset.line);
      if (ln <= scrollLine) target = el;
      else break;
    }
    const top = Math.max(0, target.offsetTop - 16);
    suppressOutgoingUntil.current = Date.now() + 200;
    root.scrollTo({ top, behavior: "auto" });
  }, [scrollLine, html]);

  // Outgoing: report which source line is at the top when user scrolls preview.
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
        const all = root.querySelectorAll<HTMLElement>("[data-line]");
        if (all.length === 0) return;
        const top = root.scrollTop;
        let chosen: HTMLElement | null = null;
        for (const el of all) {
          if (el.offsetTop > top + 1) break;
          chosen = el;
        }
        if (!chosen) chosen = all[0];
        const line = Number(chosen.dataset.line);
        if (Number.isFinite(line) && line > 0) onScrollRef.current?.(line);
      });
    };
    root.addEventListener("scroll", handler, { passive: true });
    return () => {
      root.removeEventListener("scroll", handler);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      {isMd && (
        <div
          className="flex items-center justify-end px-2 select-none"
          style={{
            height: 32,
            background: "var(--bg-soft)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
          }}
        >
          <button
            onClick={togglePreviewMaximized}
            title={previewMaximized ? t("preview.restore") : t("preview.maximize")}
            style={{
              height: 24,
              padding: "0 5px",
              display: "inline-flex",
              alignItems: "center",
              borderRadius: 4,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: previewMaximized ? "var(--accent)" : "var(--text)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--bg-mute)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            {previewMaximized ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="preview"
        style={{ flex: 1 }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
