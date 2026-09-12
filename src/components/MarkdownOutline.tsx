import { useEffect, useId, useRef, useState } from "react";
import { RiPushpinLine, RiPushpinFill } from "react-icons/ri";
import { Button } from "./ui/Button";
import { useEditorStore } from "../store/editor";
import { useT } from "../lib/i18n";

export interface OutlineItem { id: string; level: number; text: string }
/** Shared preview outline: the rail peeks on hover; only pinning reserves space. */
export default function MarkdownOutline({ items: tocItems, current: activeTocId, navigate: handleTocJump, active = true }: {
  items: OutlineItem[]; current: string; navigate: (id: string) => void; active?: boolean;
}) {
  const t = useT();
  const tocVisible = useEditorStore(s => s.tocVisible);
  const toggleTocVisible = useEditorStore(s => s.toggleTocVisible);
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
    if (!active) setTocPeek(false);
    return () => clearTimeout(tocLeaveTimer.current);
  }, [active]);
  return (
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
  );
}
