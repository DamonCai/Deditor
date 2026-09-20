import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useEditorStore, useActiveTabMeta, useEditorPaneId, paneViewKey } from "../store/editor";
import { beginPaneResize } from "../lib/paneResize";
import { flushDocument } from "../lib/documentFlush";
import { useT } from "../lib/i18n";
import { isMarkdown, isJson, isSql, isHtml, isCsv } from "../lib/lang";
import { Button } from "./ui/Button";
import EditorHost from "./EditorHost";
import PreviewHost from "./PreviewHost";
import MarkdownVisualHost from "./MarkdownVisualHost";
import HtmlPreview from "./HtmlPreview";
import HtmlToolbar from "./HtmlToolbar";
import CsvToolbar from "./CsvToolbar";
import CsvPreview from "./CsvPreview";
import TabBar from "./TabBar";
import MarkdownToolbar from "./MarkdownToolbar";
import JsonToolbar from "./JsonToolbar";
import SqlToolbar from "./SqlToolbar";

export default function EditorPane({ initialPreviewPct = 50, onPreviewPctChange }: { initialPreviewPct?: number; onPreviewPctChange?: (pct: number) => void }) {
  const paneId = useEditorPaneId();
  const focused = useEditorStore(s => !s.panes || s.activePane === paneId);
  const theme = useEditorStore(s => s.theme);
  const zenMode = useEditorStore(s => s.zenMode);
  const htmlShowPreview = useEditorStore((s) => s.showPreview);
  const csvMode = useEditorStore(s => s.csvMode);
  const markdownMode = useEditorStore(s => s.markdownMode);
  const htmlPreviewMaximized = useEditorStore((s) => s.previewMaximized);
  const editorFontSize = useEditorStore((s) => s.editorFontSize);
  // Only structural metadata at this level. Content lives in EditorHost /
  // EditorSlot / Preview, which subscribe directly. App no longer re-renders
  // on every keystroke.
  const activeMeta = useActiveTabMeta();
  const filePath = activeMeta?.filePath ?? null;
  const isDiffTab = !!activeMeta?.isDiff;
  const htmlFile = isHtml(filePath);
  const csvFile = isCsv(filePath);
  const showPreview = isMarkdown(filePath) ? markdownMode !== "source" : csvFile ? csvMode !== "source" : htmlShowPreview;
  const previewMaximized = isMarkdown(filePath) ? markdownMode === "visual" : csvFile ? csvMode === "read" : htmlPreviewMaximized;
  const previewEnabled = !isDiffTab && showPreview && (isMarkdown(filePath) || htmlFile || csvFile);
  // Initial caret + scroll for the active tab. Read imperatively so subscribing
  // components don't re-render every cursor move; Editor only consumes these
  // on mount (a fresh instance is created via `key={tab.id}` per active tab).
  const initialPos = activeMeta
    ? useEditorStore.getState().tabPositions[paneViewKey(activeMeta.id, paneId)]
    : undefined;

  const [previewPct, setPreviewPct] = useState(initialPreviewPct);
  useEffect(() => { setPreviewPct(initialPreviewPct); }, [initialPreviewPct]);
  // Editor↔Preview scroll sync. We track the latest line + which side originated
  // the scroll so each side only reacts to scrolls coming from the OTHER side.
  // `tabId` is required: scrollSync state is global across tabs, but a scroll
  // value emitted while tab A was active must not be applied to tab B after a
  // tab switch (Preview's [scrollLine, html] effect re-runs on html change and
  // would otherwise scroll B's preview to A's line).
  const [scrollSync, setScrollSync] = useState<
    { line: number; from: "editor" | "preview"; tabId: string } | null
  >(null);
  const activeTabId = activeMeta?.id ?? null;
  const scrollSyncForActive =
    scrollSync && scrollSync.tabId === activeTabId ? scrollSync : null;

  const stopResize = useRef<(() => void) | null>(null);
  useEffect(() => () => stopResize.current?.(), []);
  useEffect(() => { stopResize.current?.(); }, [activeTabId, previewEnabled, previewMaximized]);
  const activate = () => {
    const state = useEditorStore.getState();
    if (!paneId || !state.panes || state.activePane === paneId) return;
    if (state.activeId) flushDocument(state.activeId);
    flushSync(() => state.activatePane(paneId));
  };
  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
    stopResize.current?.();
    stopResize.current = beginPaneResize(event.currentTarget, event.nativeEvent, e => {
      const pct = 100 - Math.min(85, Math.max(15, (e.clientX - bounds.left) / bounds.width * 100));
      setPreviewPct(pct); onPreviewPctChange?.(pct);
    });
  };
  const editorPct = 100 - previewPct;
  return (
        <section className="editor-group flex flex-col flex-1 min-w-0" data-editor-pane={paneId} data-focused={focused}
          onPointerDownCapture={activate} onClickCapture={activate} onContextMenuCapture={activate} onFocusCapture={activate}>
          {!zenMode && <TabBar />}
          {/* Markdown toolbar is lifted out of the editor pane so it spans the
              full editor+preview row (still shown when preview is maximized). */}
          {!isDiffTab && isMarkdown(filePath) && <MarkdownToolbar />}
          {!isDiffTab && htmlFile && <HtmlToolbar />}
          {!isDiffTab && csvFile && <CsvToolbar />}
          {!isDiffTab && (htmlFile || csvFile) && activeMeta?.hasExternalChange && (
            <ExternalChangeBanner tabId={activeMeta.id} />
          )}
          {isMarkdown(filePath) && activeMeta?.hasExternalChange && <ExternalChangeBanner tabId={activeMeta.id} />}
          {/* Editor + Preview row. Editor pane is ALWAYS mounted (display:none
              in reading mode) — not for memory but for sync correctness: when
              the user navigates preview to a section while in reading mode,
              the active editor's externalScrollLine effect needs to fire so
              the editor follows. Unmounting+remounting the editor pane on
              every reading-mode toggle would also re-mount EditorHost and
              every visited tab's editor, undoing all the warm CodeMirror
              state. Consistent with EditorHost's existing "keep visited
              editors alive" pattern. */}
          <div className="flex flex-1 min-h-0">
            <div
              key="editor-pane"
              className="min-w-0 flex-1 flex flex-col"
              style={{
                width: previewEnabled
                  ? previewMaximized
                    ? 0
                    : `${editorPct}%`
                  : "100%",
                display:
                  previewEnabled && previewMaximized ? "none" : undefined,
              }}
            >
                {!isDiffTab && isJson(filePath) && <JsonToolbar />}
                {!isDiffTab && isSql(filePath) && <SqlToolbar />}
                {!htmlFile && !csvFile && !isMarkdown(filePath) && activeMeta?.hasExternalChange && (
                  <ExternalChangeBanner tabId={activeMeta.id} />
                )}
                <div className="flex-1 min-h-0 flex">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <EditorHost
                      activeId={activeTabId}
                      focused={focused && !(previewEnabled && previewMaximized)}
                      theme={theme}
                      fontSize={editorFontSize}
                      initialCursor={initialPos?.cursor}
                      initialScrollLine={initialPos?.scrollTopLine}
                      externalScrollLine={
                        scrollSyncForActive?.from === "preview"
                          ? scrollSyncForActive.line
                          : undefined
                      }
                      onScroll={(line) => {
                        if (activeTabId)
                          setScrollSync({ line, from: "editor", tabId: activeTabId });
                      }}
                      onPositionChange={(pos) => {
                        if (activeMeta) {
                          useEditorStore
                            .getState()
                            .setTabPosition(paneViewKey(activeMeta.id, paneId), pos);
                        }
                      }}
                    />
                  </div>

                </div>
              </div>
            {previewEnabled && !previewMaximized && (
              <div
                key="splitter"
                className="splitter"
                onPointerDown={event => startResize(event)}
              />
            )}
            <MarkdownVisualHost focused={focused} activeId={activeTabId} active={previewEnabled && markdownMode === "visual" && isMarkdown(filePath)} theme={theme} />
            {(previewEnabled || (!isDiffTab && csvFile)) && !(isMarkdown(filePath) && markdownMode === "visual") && (
              <div
                key="preview-pane"
                className="min-w-0"
                hidden={!previewEnabled}
                style={{
                  width: previewMaximized ? "100%" : `${previewPct}%`,
                  flex: previewMaximized ? "1 1 0" : undefined,
                }}
              >
                {csvFile && activeTabId ? (
                  <CsvPreview key={activeTabId} tabId={activeTabId} visible={previewEnabled} />
                ) : htmlFile && activeTabId ? (
                  <HtmlPreview key={activeTabId} tabId={activeTabId} />
                ) : (
                  <PreviewHost
                    activeId={activeTabId}
                    theme={theme}
                    scrollLine={
                      scrollSyncForActive?.from === "editor"
                        ? scrollSyncForActive.line
                        : undefined
                    }
                    onScroll={(line) => {
                      if (activeTabId)
                        setScrollSync({ line, from: "preview", tabId: activeTabId });
                    }}
                  />
                )}
              </div>
            )}
          </div>
        </section>
  );
}

function ExternalChangeBanner({ tabId }: { tabId: string }) {
  const t = useT();
  const reload = () => {
    const tab = useEditorStore.getState().tabs.find((x) => x.id === tabId);
    if (!tab || tab.externalChange == null) return;
    const fresh = tab.externalChange;
    useEditorStore.setState({
      tabs: useEditorStore.getState().tabs.map((x) =>
        x.id === tabId ? { ...x, content: fresh, savedContent: fresh, externalChange: undefined } : x,
      ),
    });
  };
  const dismiss = () => {
    useEditorStore.setState({
      tabs: useEditorStore.getState().tabs.map((x) =>
        x.id === tabId ? { ...x, externalChange: undefined } : x,
      ),
    });
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        background: "var(--warning-bg)",
        borderBottom: "1px solid var(--border)",
        fontSize: 12,
      }}
    >
      <span style={{ flex: 1, color: "var(--text)" }}>{t("watch.externalChanged")}</span>
      <Button variant="primary" size="sm" onClick={reload}>
        {t("watch.reload")}
      </Button>
      <Button variant="secondary" size="sm" onClick={dismiss}>
        {t("watch.keepMine")}
      </Button>
    </div>
  );
}
