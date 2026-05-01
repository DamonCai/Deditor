import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { COMMANDS, type Command } from "../lib/commands";
import { fuzzyMatch, type FuzzyMatch } from "../lib/fuzzy";
import { useT } from "../lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Ranked {
  command: Command;
  match: FuzzyMatch;
  display: string; // already-resolved label, used for highlight indices
}

const MAX_RESULTS = 60;

const GROUP_ORDER: Command["group"][] = ["nav", "file", "view", "editor"];

export default function CommandPalette({ open, onClose }: Props) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedIdx(0);
      return;
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  const allLabels = useMemo(
    () => COMMANDS.map((c) => ({ command: c, label: t(c.labelKey) })),
    // re-resolve labels when language changes
    [t],
  );

  const results: Ranked[] = useMemo(() => {
    if (!query.trim()) {
      // No query: show every command, sorted by group then by id for stability.
      return allLabels
        .map(({ command, label }) => ({
          command,
          match: { score: 0, matchedIdx: [] },
          display: label,
        }))
        .sort((a, b) => {
          const ga = GROUP_ORDER.indexOf(a.command.group);
          const gb = GROUP_ORDER.indexOf(b.command.group);
          if (ga !== gb) return ga - gb;
          return a.display.localeCompare(b.display);
        })
        .slice(0, MAX_RESULTS);
    }
    const q = query.trim();
    const out: Ranked[] = [];
    for (const { command, label } of allLabels) {
      const m = fuzzyMatch(q, label);
      if (m) out.push({ command, match: m, display: label });
    }
    out.sort((a, b) => b.match.score - a.match.score);
    return out.slice(0, MAX_RESULTS);
  }, [query, allLabels]);

  useEffect(() => {
    if (selectedIdx >= results.length) setSelectedIdx(0);
  }, [results.length, selectedIdx]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(`[data-cmd-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!open) return null;

  const choose = (idx: number) => {
    const r = results[idx];
    if (!r) return;
    onClose();
    // Close before running so the command (which may itself open another modal)
    // sees a clean state. Defer one tick so React commits the close first.
    setTimeout(() => {
      try {
        void r.command.run();
      } catch {
        /* swallow — commands shouldn't throw, but never break the palette */
      }
    }, 0);
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
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 1050,
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
          placeholder={t("cmdpalette.placeholder")}
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
          {results.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-soft)" }}>
              {t("cmdpalette.noMatch")}
            </div>
          )}
          {results.map((r, i) => {
            const isSel = i === selectedIdx;
            return (
              <div
                key={r.command.id}
                data-cmd-idx={i}
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
                <span
                  style={{
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "var(--text-soft)",
                    minWidth: 38,
                    textAlign: "center",
                    border: "1px solid var(--border)",
                    borderRadius: 3,
                    padding: "1px 4px",
                    flexShrink: 0,
                  }}
                >
                  {t(`cmdpalette.group.${r.command.group}`)}
                </span>
                <span style={{ flex: 1, fontSize: 13, minWidth: 0 }}>
                  {highlightString(r.display, r.match.matchedIdx)}
                </span>
                {r.command.shortcut && (
                  <span
                    style={{
                      fontFamily: "var(--font-mono, ui-monospace, monospace)",
                      fontSize: 11,
                      color: "var(--text-soft)",
                      background: "var(--bg-mute)",
                      padding: "1px 6px",
                      borderRadius: 3,
                      flexShrink: 0,
                    }}
                  >
                    {r.command.shortcut}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function highlightString(s: string, idx: number[]): React.ReactNode {
  if (idx.length === 0) return s;
  const out: React.ReactNode[] = [];
  let mark: string[] = [];
  let plain: string[] = [];
  const flushPlain = () => {
    if (plain.length) {
      out.push(plain.join(""));
      plain = [];
    }
  };
  const flushMark = () => {
    if (mark.length) {
      out.push(
        <mark
          key={`m-${out.length}`}
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
  }
  flushPlain();
  flushMark();
  return out;
}
