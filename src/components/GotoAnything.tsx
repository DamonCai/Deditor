import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { openFileByPath } from "../lib/fileio";
import { fuzzyMatch, type FuzzyMatch } from "../lib/fuzzy";
import LangIcon from "./LangIcon";
import { useT } from "../lib/i18n";
import { logError } from "../lib/logger";

interface WorkspaceFile {
  path: string;
  name: string;
  workspace: string;
  rel: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

interface RankedFile {
  file: WorkspaceFile;
  match: FuzzyMatch;
  /** Indices into `file.rel` (forward-slash form) that the matched chars
   *  correspond to — used to render highlights. */
  highlightIdx: number[];
  /** Source string the match was computed against (rel path), for rendering. */
  display: string;
}

const MAX_RESULTS = 80;

export default function GotoAnything({ open, onClose }: Props) {
  const t = useT();
  const workspaces = useEditorStore((s) => s.workspaces);
  const [files, setFiles] = useState<WorkspaceFile[] | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Re-index every time the palette opens. Walks are cheap enough on typical
  // projects, and this guarantees we pick up new files the user just created
  // without managing an explicit invalidation signal.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIdx(0);
      return;
    }
    setLoading(true);
    invoke<WorkspaceFile[]>("list_workspace_files", { roots: workspaces })
      .then((res) => setFiles(res))
      .catch((err) => {
        logError("list_workspace_files failed", err);
        setFiles([]);
      })
      .finally(() => setLoading(false));
  }, [open, workspaces]);

  // Focus the input on every open.
  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const results: RankedFile[] = useMemo(() => {
    if (!files) return [];
    if (!query.trim()) {
      // No query: show first MAX_RESULTS files with no highlight, sorted by
      // workspace then path so the list is stable and predictable.
      return files
        .slice(0, MAX_RESULTS)
        .map((f) => ({ file: f, match: { score: 0, matchedIdx: [] }, highlightIdx: [], display: f.rel }));
    }
    const q = query.trim();
    const out: RankedFile[] = [];
    for (const f of files) {
      // Match against the rel path, which puts both filename and folder
      // structure in scope. Boundary/streak bonuses already weight filename
      // hits higher than mid-folder hits.
      const m = fuzzyMatch(q, f.rel);
      if (m) out.push({ file: f, match: m, highlightIdx: m.matchedIdx, display: f.rel });
    }
    out.sort((a, b) => b.match.score - a.match.score);
    return out.slice(0, MAX_RESULTS);
  }, [files, query]);

  // Keep selection in range whenever the result list shrinks/grows.
  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(0);
  }, [results.length, selectedIdx]);

  // Scroll selected row into view.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-result-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  const choose = (idx: number) => {
    const r = results[idx];
    if (!r) return;
    void openFileByPath(r.file.path);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(selectedIdx);
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedIdx(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setSelectedIdx(results.length - 1);
    } else if ((e.key === "n" || e.key === "p") && (e.ctrlKey || e.metaKey)) {
      // Emacs-ish secondary nav (Ctrl+N/P) for users who prefer it.
      e.preventDefault();
      const dir = e.key === "n" ? 1 : -1;
      setSelectedIdx((i) => Math.max(0, Math.min(results.length - 1, i + dir)));
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        paddingTop: "12vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedIdx(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={
            workspaces.length === 0
              ? t("goto.placeholderNoWorkspace")
              : t("goto.placeholder")
          }
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: 14,
            background: "transparent",
            color: "var(--text)",
            border: "none",
            borderBottom: "1px solid var(--border)",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
          {loading && files == null && (
            <div style={dimRow}>{t("goto.indexing")}</div>
          )}
          {!loading && files != null && results.length === 0 && (
            <div style={dimRow}>
              {workspaces.length === 0
                ? t("goto.noWorkspaceHint")
                : query
                ? t("goto.noMatch")
                : t("goto.empty")}
            </div>
          )}
          {results.map((r, i) => {
            const isSel = i === selectedIdx;
            return (
              <div
                key={r.file.path}
                data-result-idx={i}
                onMouseEnter={() => setSelectedIdx(i)}
                onClick={() => choose(i)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 12px",
                  cursor: "pointer",
                  background: isSel ? "var(--selection-bg)" : undefined,
                  color: "var(--text)",
                }}
              >
                <LangIcon filePath={r.file.path} size={16} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 13 }}>
                  <div style={{ fontWeight: 500, color: "var(--text)" }}>
                    {highlightString(r.file.name, lastNameMatchedIdx(r))}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--text-soft)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      // RTL container truncates at the *start*, so a long
                      // `src/components/.../foo.tsx` keeps `…/foo.tsx` visible.
                      // `unicodeBidi: plaintext` keeps the inner text rendering
                      // LTR so slashes / chars don't get visually reordered.
                      direction: "rtl",
                      textAlign: "left",
                      unicodeBidi: "plaintext",
                    }}
                    title={r.file.path}
                  >
                    {highlightString(r.display, r.highlightIdx)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {files && files.length >= 50000 && (
          <div
            style={{
              padding: "6px 12px",
              fontSize: 11,
              color: "var(--text-soft)",
              borderTop: "1px solid var(--border)",
              background: "var(--bg-soft)",
            }}
          >
            {t("goto.truncated")}
          </div>
        )}
      </div>
    </div>
  );
}

const dimRow: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 12,
  color: "var(--text-soft)",
};

/** Slice the rel-path's matchedIdx down to the indices that fall inside the
 *  filename portion (after the last "/") and rebase to be relative to the
 *  filename. Used to highlight matches inside the bold name line. */
function lastNameMatchedIdx(r: RankedFile): number[] {
  const rel = r.display;
  const slash = rel.lastIndexOf("/");
  const start = slash + 1;
  const out: number[] = [];
  for (const i of r.highlightIdx) {
    if (i >= start) out.push(i - start);
  }
  return out;
}

function highlightString(s: string, idx: number[]): React.ReactNode {
  if (idx.length === 0) return s;
  // idx is sorted ascending; walk the string and bold matched chars.
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let mark: string[] = [];
  let plain: string[] = [];
  const flushPlain = () => {
    if (plain.length) {
      parts.push(plain.join(""));
      plain = [];
    }
  };
  const flushMark = () => {
    if (mark.length) {
      parts.push(
        <mark
          key={`m-${cursor}-${parts.length}`}
          style={{ background: "transparent", color: "var(--accent)", fontWeight: 700 }}
        >
          {mark.join("")}
        </mark>,
      );
      mark = [];
    }
  };
  let mi = 0;
  for (let i = 0; i < s.length; i++) {
    if (mi < idx.length && i === idx[mi]) {
      flushPlain();
      mark.push(s[i]);
      mi++;
    } else {
      flushMark();
      plain.push(s[i]);
    }
    cursor = i;
  }
  flushPlain();
  flushMark();
  return parts;
}
