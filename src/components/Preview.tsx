import { useEffect, useRef, useState } from "react";
import { FiMaximize2, FiMinimize2 } from "react-icons/fi";
import { openUrl } from "@tauri-apps/plugin-opener";
import { renderMarkdown, renderCode } from "../lib/markdown";
import { hydratePlantuml } from "../lib/plantumlHydrate";
import { hydrateMermaid } from "../lib/mermaidHydrate";
import { hydrateLocalImages } from "../lib/localImgHydrate";
import { isMarkdown } from "../lib/lang";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";
import { logError } from "../lib/logger";
import { openFileByPath } from "../lib/fileio";
import {
  dirname,
  isExternalUrl,
  isLocalRef,
  resolveAgainst,
  stripFileScheme,
} from "../lib/pathUtil";

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
  const previewMaximized = useEditorStore((s) => s.previewMaximized);
  const togglePreviewMaximized = useEditorStore(
    (s) => s.togglePreviewMaximized,
  );
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
          <Button
            variant="ghost"
            size="icon"
            pressed={previewMaximized}
            onClick={togglePreviewMaximized}
            title={previewMaximized ? t("preview.restore") : t("preview.maximize")}
            style={{
              color: previewMaximized ? "var(--accent)" : "var(--text)",
            }}
          >
            {previewMaximized ? <FiMinimize2 size={13} /> : <FiMaximize2 size={13} />}
          </Button>
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
