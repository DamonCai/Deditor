import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FiCopy,
  FiGitBranch,
  FiGitCommit,
  FiRefreshCw,
  FiSearch,
  FiTag,
  FiX,
} from "react-icons/fi";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  fetchCommitFiles,
  fetchFileAt,
  fetchGitLog,
  refreshGit,
  type GitCommit,
  type GitCommitFile,
  type GitLogFilters,
} from "../lib/git";
import { useEditorStore } from "../store/editor";
import { useT, tStatic } from "../lib/i18n";
import { logError } from "../lib/logger";
import { promptInput } from "./PromptDialog";
import { chooseAction } from "./ConfirmDialog";
import ContextMenu, { type MenuItem } from "./ContextMenu";

interface Props {
  workspace: string;
  initialPath?: string;
}

/** Git Log tool window — JetBrains parity:
 *
 *    [filter toolbar]
 *    [commit list  | commit detail (metadata + changed files + per-file diff) ]
 *
 *  Right-click a commit row to get the full action menu (Cherry-Pick /
 *  Revert / Reset to Here / Create Branch / Create Tag / Reword / Squash /
 *  Drop / Copy Hash / Copy as Patch). Click a file row in the detail to
 *  open a dedicated diff tab comparing parent rev → this rev. */
export default function LogPanel({ workspace, initialPath }: Props) {
  const t = useT();
  const [filters, setFilters] = useState<GitLogFilters>({
    path: initialPath ?? undefined,
    limit: 1000,
  });
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedHash, setSelectedHash] = useState<string | null>(null);
  const [files, setFiles] = useState<GitCommitFile[] | null>(null);
  const [filesLoading, setFilesLoading] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const openDiffTab = useEditorStore((s) => s.openDiffTab);

  // Phase 6 — search + multi-select
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await fetchGitLog(workspace, filters);
      setCommits(list);
      // Auto-select first commit so the right pane isn't empty after refresh.
      if (list.length > 0 && !selectedHash) {
        setSelectedHash(list[0].hash);
      } else if (list.length === 0) {
        setSelectedHash(null);
        setFiles(null);
      }
    } catch (e) {
      logError("git_log fetch failed", e);
      setErr(String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, filters]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cmd/Ctrl+F opens the search bar inside the panel — captured at panel
  // level so the global shortcut for "Find in Files" doesn't fire here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.select());
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearch("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  // Filter the visible commits by the inline search box. Pure substring
  // match on subject + author so the user doesn't have to think about
  // regex escaping.
  const visibleCommits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commits;
    return commits.filter(
      (c) =>
        c.subject.toLowerCase().includes(q) ||
        c.author_name.toLowerCase().includes(q),
    );
  }, [commits, search]);

  // Load changed files when selection changes.
  useEffect(() => {
    if (!selectedHash) {
      setFiles(null);
      return;
    }
    let cancelled = false;
    setFilesLoading(true);
    void fetchCommitFiles(workspace, selectedHash)
      .then((list) => {
        if (cancelled) return;
        setFiles(list);
      })
      .catch((e) => {
        if (cancelled) return;
        logError("git_commit_files failed", e);
        setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setFilesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace, selectedHash]);

  const onFileClick = useCallback(
    async (commit: GitCommit, f: GitCommitFile) => {
      const right = await fetchFileAt(workspace, commit.hash, f.rel).catch(
        () => "",
      );
      // Parent might not exist (root commit); fall back to empty.
      const parentRev = commit.parents[0];
      const left = parentRev
        ? await fetchFileAt(workspace, parentRev, f.old_rel ?? f.rel).catch(
            () => "",
          )
        : "";
      openDiffTab({
        leftPath: `${parentRev ?? ""}:${f.old_rel ?? f.rel}`,
        rightPath: `${commit.hash}:${f.rel}`,
        leftContent: left,
        rightContent: right,
      });
    },
    [workspace, openDiffTab],
  );

  const onCommitContextMenu = (e: React.MouseEvent, commit: GitCommit) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedHash(commit.hash);
    // If the user has multi-selected exactly two commits, surface a
    // "Compare Selected Commits" entry at the top.
    const compareTwo =
      multiSelected.size === 2 ? Array.from(multiSelected) : null;
    setCtxMenu({
      x: e.clientX,
      y: e.clientY,
      items: buildCommitMenu(workspace, commit, refresh, openDiffTab, {
        compareTwo,
      }),
    });
  };

  const onCommitClick = (e: React.MouseEvent, commit: GitCommit) => {
    if (e.metaKey || e.ctrlKey) {
      // Toggle in multi-select set; doesn't move the "selected for detail"
      // pointer so the right pane stays stable.
      setMultiSelected((prev) => {
        const next = new Set(prev);
        if (next.has(commit.hash)) next.delete(commit.hash);
        else next.add(commit.hash);
        return next;
      });
      return;
    }
    if (e.shiftKey && selectedHash) {
      // Shift+click: select range from current selection to clicked commit.
      const a = visibleCommits.findIndex((c) => c.hash === selectedHash);
      const b = visibleCommits.findIndex((c) => c.hash === commit.hash);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        const range = new Set<string>();
        for (let i = lo; i <= hi; i++) range.add(visibleCommits[i].hash);
        setMultiSelected(range);
      }
      return;
    }
    setMultiSelected(new Set());
    setSelectedHash(commit.hash);
  };

  const selectedCommit = useMemo(
    () => commits.find((c) => c.hash === selectedHash) ?? null,
    [commits, selectedHash],
  );

  const clearFilters = () => {
    setFilters({ limit: 1000 });
  };

  const updateFilter = (patch: Partial<GitLogFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  return (
    <div
      className="flex flex-col h-full"
      style={{ background: "var(--bg)", color: "var(--text)" }}
    >
      {/* Filter toolbar */}
      <div
        className="flex items-center"
        style={{
          padding: "6px 8px",
          gap: 6,
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-soft)",
          fontSize: 12,
          flexWrap: "wrap",
        }}
      >
        <FiGitBranch size={13} style={{ color: "var(--text-soft)" }} />
        <span
          style={{ color: "var(--text-soft)", fontWeight: 600, marginRight: 4 }}
        >
          {t("log.title")}
        </span>
        <FilterInput
          value={filters.author ?? ""}
          onChange={(v) => updateFilter({ author: v })}
          placeholder={t("log.filter.placeholder.user")}
          label={t("log.filter.user")}
          width={140}
        />
        <FilterInput
          value={filters.grep ?? ""}
          onChange={(v) => updateFilter({ grep: v })}
          placeholder={t("log.filter.placeholder.message")}
          label={t("log.filter.message")}
          width={180}
        />
        <FilterInput
          value={filters.path ?? ""}
          onChange={(v) => updateFilter({ path: v })}
          placeholder={t("log.filter.placeholder.path")}
          label={t("log.filter.path")}
          width={160}
        />
        <FilterDate
          value={filters.since ?? ""}
          onChange={(v) => updateFilter({ since: v })}
          label={t("log.filter.dateFrom")}
        />
        <FilterDate
          value={filters.until ?? ""}
          onChange={(v) => updateFilter({ until: v })}
          label={t("log.filter.dateTo")}
        />
        <button
          onClick={clearFilters}
          title={t("log.filter.clear")}
          className="deditor-btn"
          data-variant="ghost"
          style={iconBtn}
        >
          <FiX size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            setSearchOpen((v) => !v);
            requestAnimationFrame(() => searchRef.current?.select());
          }}
          title={t("log.search.placeholder")}
          className="deditor-btn"
          data-variant="ghost"
          style={{
            ...iconBtn,
            background: searchOpen ? "var(--bg-mute)" : "transparent",
          }}
        >
          <FiSearch size={12} />
        </button>
        <button
          onClick={() => void refresh()}
          title={t("log.refresh")}
          className="deditor-btn"
          data-variant="ghost"
          style={iconBtn}
        >
          <FiRefreshCw size={12} />
        </button>
      </div>

      {searchOpen && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 8px",
            background: "var(--bg-soft)",
            borderBottom: "1px solid var(--border)",
            fontSize: 12,
          }}
        >
          <FiSearch size={11} style={{ color: "var(--text-soft)" }} />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("log.search.placeholder")}
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--text)",
              fontSize: 12,
            }}
          />
          {search && visibleCommits.length === 0 && (
            <span style={{ color: "var(--text-soft)", fontSize: 11 }}>
              {t("log.search.noMatch")}
            </span>
          )}
          <button
            onClick={() => {
              setSearch("");
              setSearchOpen(false);
            }}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--text-soft)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <FiX size={11} />
          </button>
        </div>
      )}

      {/* Body — commit list (left) | detail (right) */}
      <div className="flex" style={{ flex: 1, minHeight: 0 }}>
        {/* Commit list */}
        <div
          style={{
            width: "55%",
            minWidth: 380,
            borderRight: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}
        >
          <CommitListHeader />
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              fontSize: 12,
            }}
          >
            {loading && (
              <div style={{ padding: 12, color: "var(--text-soft)" }}>
                {t("log.loading")}
              </div>
            )}
            {err && (
              <div style={{ padding: 12, color: "#e55353" }}>{err}</div>
            )}
            {!loading && !err && commits.length === 0 && (
              <div style={{ padding: 12, color: "var(--text-soft)" }}>
                {t("log.empty")}
              </div>
            )}
            {visibleCommits.map((c) => (
              <CommitRow
                key={c.hash}
                commit={c}
                selected={c.hash === selectedHash}
                multiSelected={multiSelected.has(c.hash)}
                onClick={(e) => onCommitClick(e, c)}
                onContextMenu={(e) => onCommitContextMenu(e, c)}
              />
            ))}
          </div>
        </div>

        {/* Detail */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {selectedCommit ? (
            <CommitDetail
              commit={selectedCommit}
              files={files}
              filesLoading={filesLoading}
              onFileClick={(f) => void onFileClick(selectedCommit, f)}
            />
          ) : (
            <div style={{ padding: 16, color: "var(--text-soft)", fontSize: 12 }}>
              {t("log.detail.empty")}
            </div>
          )}
        </div>
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Commit list

function CommitListHeader() {
  const t = useT();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 140px 110px",
        padding: "4px 8px 4px 28px",
        fontSize: 11,
        color: "var(--text-soft)",
        background: "var(--bg-soft)",
        borderBottom: "1px solid var(--border)",
        gap: 6,
      }}
    >
      <span>{t("log.col.subject")}</span>
      <span>{t("log.col.author")}</span>
      <span>{t("log.col.date")}</span>
    </div>
  );
}

function CommitRow({
  commit,
  selected,
  multiSelected,
  onClick,
  onContextMenu,
}: {
  commit: GitCommit;
  selected: boolean;
  multiSelected?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  // Single-lane "graph" — just a vertical line + dot. Multi-lane requires a
  // proper layout pass over parent topology; deferred to a later pass.
  // Multi-selected rows get a subtle outline so the user can see which two
  // they're about to "Compare Selected" against.
  const bg = selected
    ? "var(--bg-mute)"
    : multiSelected
      ? "rgba(58,153,255,0.12)"
      : "transparent";
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={commit.subject}
      style={{
        display: "grid",
        gridTemplateColumns: "20px 1fr 140px 110px",
        alignItems: "center",
        padding: "3px 8px",
        gap: 6,
        cursor: "pointer",
        background: bg,
        borderLeft: selected
          ? "2px solid var(--accent)"
          : multiSelected
            ? "2px solid #3a99ff"
            : "2px solid transparent",
      }}
      onMouseEnter={(e) => {
        if (!selected && !multiSelected)
          e.currentTarget.style.background = "var(--hover-bg)";
      }}
      onMouseLeave={(e) => {
        if (!selected && !multiSelected)
          e.currentTarget.style.background = "transparent";
      }}
    >
      {/* Graph rail */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--accent)",
        }}
      >
        <FiGitCommit size={12} />
      </span>
      {/* Subject + refs */}
      <span
        style={{
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
          overflow: "hidden",
        }}
      >
        {commit.refs.map((r, i) => (
          <RefChip key={i} label={r} />
        ))}
        <span
          className="truncate"
          style={{ color: "var(--text)", flex: 1, minWidth: 0 }}
        >
          {commit.subject}
        </span>
      </span>
      <span
        className="truncate"
        style={{ color: "var(--text-soft)", fontSize: 11 }}
      >
        {commit.author_name}
      </span>
      <span
        style={{
          color: "var(--text-soft)",
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatDate(commit.author_date)}
      </span>
    </div>
  );
}

function RefChip({ label }: { label: string }) {
  // "HEAD -> main" splits into a head badge + branch chip; bare branch /
  // tag / remote each get their own pill color.
  const isHead = label.startsWith("HEAD ->");
  const isTag = label.startsWith("tag:");
  const text = isHead
    ? label.replace("HEAD ->", "").trim()
    : isTag
      ? label.replace("tag:", "").trim()
      : label;
  const isRemote = !isTag && !isHead && text.includes("/");
  const bg = isTag
    ? "rgba(255, 197, 95, 0.18)"
    : isHead
      ? "rgba(58, 153, 255, 0.18)"
      : isRemote
        ? "rgba(150, 150, 150, 0.16)"
        : "rgba(102, 187, 106, 0.18)";
  const fg = isTag
    ? "#caa54e"
    : isHead
      ? "#3a99ff"
      : isRemote
        ? "var(--text-soft)"
        : "#5fa570";
  return (
    <span
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        padding: "0 6px",
        height: 16,
        borderRadius: 8,
        background: bg,
        color: fg,
        fontSize: 10,
        fontWeight: 600,
        flexShrink: 0,
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {isTag && <FiTag size={9} />}
      {!isTag && <FiGitBranch size={9} />}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {text}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Detail pane

function CommitDetail({
  commit,
  files,
  filesLoading,
  onFileClick,
}: {
  commit: GitCommit;
  files: GitCommitFile[] | null;
  filesLoading: boolean;
  onFileClick: (f: GitCommitFile) => void;
}) {
  const t = useT();
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
      }}
    >
      {/* Metadata header */}
      <div
        style={{
          padding: "10px 12px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-soft)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: 4,
          }}
        >
          {commit.subject}
        </div>
        {commit.body && (
          <div
            style={{
              fontSize: 12,
              color: "var(--text-soft)",
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-mono)",
              marginBottom: 8,
              maxHeight: 100,
              overflowY: "auto",
            }}
          >
            {commit.body}
          </div>
        )}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr",
            fontSize: 11,
            color: "var(--text-soft)",
            gap: "2px 8px",
          }}
        >
          <span>{t("log.detail.hash")}</span>
          <span style={{ color: "var(--text)", fontFamily: "monospace" }}>
            {commit.hash}
            <button
              onClick={() => copy(commit.hash)}
              title={t("log.action.copyHash")}
              style={{
                marginLeft: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-soft)",
              }}
            >
              <FiCopy size={10} />
            </button>
          </span>
          <span>{t("log.detail.author")}</span>
          <span style={{ color: "var(--text)" }}>
            {commit.author_name}{" "}
            <span style={{ color: "var(--text-soft)" }}>
              &lt;{commit.author_email}&gt;
            </span>
          </span>
          <span>{t("log.detail.date")}</span>
          <span style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {formatDateLong(commit.author_date)}
          </span>
          {commit.parents.length > 0 && (
            <>
              <span>{t("log.detail.parents")}</span>
              <span style={{ color: "var(--text)", fontFamily: "monospace" }}>
                {commit.parents.map((p) => p.slice(0, 7)).join(", ")}
              </span>
            </>
          )}
          {commit.refs.length > 0 && (
            <>
              <span>{t("log.detail.refs")}</span>
              <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {commit.refs.map((r, i) => (
                  <RefChip key={i} label={r} />
                ))}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Changed files */}
      <div
        style={{
          padding: "6px 12px",
          fontSize: 11,
          color: "var(--text-soft)",
          fontWeight: 600,
          background: "var(--bg-soft)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        {t("log.detail.files", { n: String(files?.length ?? 0) })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {filesLoading && (
          <div style={{ padding: 8, color: "var(--text-soft)", fontSize: 12 }}>
            {t("log.loading")}
          </div>
        )}
        {files?.map((f) => (
          <FileRow key={f.rel} file={f} onClick={() => onFileClick(f)} />
        ))}
      </div>
    </div>
  );
}

function FileRow({
  file,
  onClick,
}: {
  file: GitCommitFile;
  onClick: () => void;
}) {
  const color =
    file.status === "A"
      ? "#5fa570"
      : file.status === "D"
        ? "#e55353"
        : file.status === "R" || file.status === "C"
          ? "#caa54e"
          : "var(--text-soft)";
  const baseName = file.rel.split("/").pop() ?? file.rel;
  const dir = file.rel.includes("/")
    ? file.rel.slice(0, file.rel.lastIndexOf("/"))
    : "";
  return (
    <div
      onClick={onClick}
      title={file.rel}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "3px 12px",
        gap: 8,
        cursor: "pointer",
        fontSize: 12,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}
    >
      <span
        style={{
          color,
          fontFamily: "monospace",
          fontSize: 11,
          width: 14,
          textAlign: "center",
        }}
      >
        {file.status}
      </span>
      <span style={{ color: "var(--text)" }}>{baseName}</span>
      {dir && (
        <span
          className="truncate"
          style={{
            color: "var(--text-soft)",
            fontSize: 11,
            flex: 1,
            minWidth: 0,
          }}
        >
          {dir}
        </span>
      )}
      <span
        style={{
          color: "var(--text-soft)",
          fontSize: 11,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {file.additions > 0 && (
          <span style={{ color: "#5fa570", marginRight: 6 }}>+{file.additions}</span>
        )}
        {file.deletions > 0 && (
          <span style={{ color: "#e55353" }}>-{file.deletions}</span>
        )}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right-click commit menu — JetBrains parity

function buildCommitMenu(
  workspace: string,
  commit: GitCommit,
  onAfter: () => Promise<void>,
  openDiffTab: (spec: {
    leftPath: string;
    rightPath: string;
    leftContent: string;
    rightContent: string;
  }) => string,
  opts: { compareTwo: string[] | null } = { compareTwo: null },
): MenuItem[] {
  const after = () => void onAfter().then(() => refreshGit(workspace));
  const runOrErr = async (fn: () => Promise<unknown>, errKey?: string) => {
    try {
      await fn();
      after();
    } catch (e) {
      if (errKey) {
        // Best-effort surface — the panel doesn't have a toast slot yet.
        // eslint-disable-next-line no-alert
        alert(tStatic(errKey, { err: String(e) }));
      } else {
        // eslint-disable-next-line no-alert
        alert(String(e));
      }
    }
  };

  return [
    {
      label: tStatic("log.action.cherryPick"),
      onClick: () =>
        runOrErr(
          () =>
            invoke("git_cherry_pick", { workspace, hash: commit.hash }) as Promise<void>,
          "log.confirm.cherryPickFail",
        ),
    },
    {
      label: tStatic("log.action.revert"),
      onClick: () =>
        runOrErr(
          () =>
            invoke("git_revert", {
              workspace,
              hash: commit.hash,
              noCommit: false,
            }) as Promise<void>,
          "log.confirm.revertFail",
        ),
    },
    { divider: true },
    {
      label: tStatic("log.action.resetTo"),
      onClick: async () => {
        const choice = await chooseAction({
          title: tStatic("log.confirm.resetTitle"),
          message: tStatic("log.confirm.resetMsg", { hash: commit.short_hash }),
          buttons: [
            { label: tStatic("common.cancel"), value: "cancel" },
            { label: "Soft", value: "soft" },
            { label: "Mixed", value: "mixed" },
            { label: "Hard", value: "hard", danger: true },
          ],
        });
        if (!choice || choice === "cancel") return;
        runOrErr(() =>
          invoke("git_reset_to", {
            workspace,
            hash: commit.hash,
            mode: choice,
          }) as Promise<void>,
        );
      },
    },
    {
      label: tStatic("log.action.checkoutCommit"),
      onClick: () =>
        runOrErr(
          () =>
            invoke("git_create_branch_at", {
              workspace,
              hash: commit.hash,
              name: `detached-${commit.short_hash}`,
              checkout: true,
            }) as Promise<void>,
        ),
    },
    { divider: true },
    {
      label: tStatic("log.action.createBranch"),
      onClick: async () => {
        const name = await promptInput({
          title: tStatic("log.prompt.createBranchTitle"),
          placeholder: tStatic("log.prompt.createBranchPlaceholder"),
        });
        if (!name) return;
        runOrErr(
          () =>
            invoke("git_create_branch_at", {
              workspace,
              hash: commit.hash,
              name,
              checkout: false,
            }) as Promise<void>,
        );
      },
    },
    {
      label: tStatic("log.action.createTag"),
      onClick: async () => {
        const name = await promptInput({
          title: tStatic("log.prompt.createTagTitle"),
          placeholder: tStatic("log.prompt.createTagPlaceholder"),
        });
        if (!name) return;
        const message = await promptInput({
          title: tStatic("log.prompt.createTagTitle"),
          label: tStatic("log.prompt.tagMessageLabel"),
        });
        runOrErr(
          () =>
            invoke("git_create_tag_at", {
              workspace,
              hash: commit.hash,
              name,
              message: message ?? "",
            }) as Promise<void>,
        );
      },
    },
    { divider: true },
    {
      label: tStatic("log.action.editMessage"),
      onClick: async () => {
        const next = await promptInput({
          title: tStatic("log.prompt.editMessageTitle"),
          label: tStatic("log.prompt.editMessageLabel"),
          initial: commit.subject,
        });
        if (!next) return;
        runOrErr(
          () =>
            invoke("git_reword_commit", {
              workspace,
              hash: commit.hash,
              message: next,
            }) as Promise<void>,
        );
      },
    },
    {
      label: tStatic("log.action.squashWithParent"),
      disabled: commit.parents.length === 0,
      onClick: async () => {
        const choice = await chooseAction({
          title: tStatic("log.confirm.squashTitle"),
          message: tStatic("log.confirm.squashMsg", { hash: commit.short_hash }),
          buttons: [
            { label: tStatic("common.cancel"), value: "cancel" },
            { label: "Squash", value: "squash", danger: true },
          ],
        });
        if (choice !== "squash") return;
        runOrErr(
          () =>
            invoke("git_squash_with_parent", {
              workspace,
              hash: commit.hash,
            }) as Promise<void>,
        );
      },
    },
    {
      label: tStatic("log.action.dropCommit"),
      onClick: async () => {
        const choice = await chooseAction({
          title: tStatic("log.confirm.dropTitle"),
          message: tStatic("log.confirm.dropMsg", { hash: commit.short_hash }),
          buttons: [
            { label: tStatic("common.cancel"), value: "cancel" },
            { label: tStatic("common.delete"), value: "drop", danger: true },
          ],
        });
        if (choice !== "drop") return;
        runOrErr(
          () =>
            invoke("git_drop_commit", {
              workspace,
              hash: commit.hash,
            }) as Promise<void>,
        );
      },
    },
    { divider: true },
    {
      label: tStatic("log.action.copyHash"),
      onClick: () => void navigator.clipboard.writeText(commit.hash),
    },
    {
      label: tStatic("log.action.copyShortHash"),
      onClick: () => void navigator.clipboard.writeText(commit.short_hash),
    },
    {
      label: tStatic("log.action.copyAsPatch"),
      onClick: async () => {
        try {
          const patch = await invoke<string>("git_format_patch", {
            workspace,
            hash: commit.hash,
          });
          await navigator.clipboard.writeText(patch);
        } catch (e) {
          // eslint-disable-next-line no-alert
          alert(String(e));
        }
      },
    },
    {
      label: tStatic("log.action.openInWeb"),
      onClick: async () => {
        try {
          const base = await invoke<string>("git_origin_web_url", { workspace });
          if (!base) return;
          // Three vendor URL shapes — GitHub/GitLab use /commit/, Bitbucket
          // uses /commits/. Try GitHub first since it's most common; for
          // Bitbucket the user can edit URL once it's open.
          await openUrl(`${base}/commit/${commit.hash}`);
        } catch {
          /* clipboard fallback isn't worth the complexity */
        }
      },
    },
    ...(opts.compareTwo
      ? [
          { divider: true } as const,
          {
            label: tStatic("log.action.compareSelected"),
            onClick: async () => {
              const [a, b] = opts.compareTwo!;
              try {
                const diff = await invoke<string>("git_format_patch", {
                  workspace,
                  hash: b,
                });
                openDiffTab({
                  leftPath: `commit:${a}`,
                  rightPath: `commit:${b}`,
                  leftContent: "",
                  rightContent: diff,
                });
              } catch (e) {
                // eslint-disable-next-line no-alert
                alert(String(e));
              }
            },
          },
        ]
      : []),
  ];
}

// ---------------------------------------------------------------------------
// helpers

function FilterInput({
  value,
  onChange,
  placeholder,
  label,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  width: number;
}) {
  // Debounce keystrokes so the log re-fetches once per pause, not per char.
  const tRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      title={label}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (tRef.current) clearTimeout(tRef.current);
        tRef.current = window.setTimeout(() => onChange(v), 250);
      }}
      style={{
        width,
        background: "var(--bg)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        borderRadius: 3,
        padding: "2px 6px",
        fontSize: 11,
        outline: "none",
      }}
    />
  );
}

function FilterDate({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="date"
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        color: "var(--text)",
        borderRadius: 3,
        padding: "1px 4px",
        fontSize: 11,
        outline: "none",
      }}
    />
  );
}

function formatDate(unix: number): string {
  const d = new Date(unix * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateLong(unix: number): string {
  const d = new Date(unix * 1000);
  return d.toLocaleString();
}

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "none",
  borderRadius: 3,
  color: "var(--text-soft)",
  cursor: "pointer",
};
