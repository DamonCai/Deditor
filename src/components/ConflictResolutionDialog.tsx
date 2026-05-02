import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheckCircle,
  FiXOctagon,
} from "react-icons/fi";
import Modal from "./Modal";
import { useT, tStatic } from "../lib/i18n";
import { refreshGit } from "../lib/git";
import { logError } from "../lib/logger";

interface Props {
  workspace: string;
  open: boolean;
  /** State name from `git_repo_state` — drives the Continue/Abort buttons. */
  state: string;
  onClose: () => void;
}

interface GitConflict {
  rel: string;
  path: string;
  kind: string;
}

/** 3-way merge tool. Picks one conflicted file at a time and shows
 *  Local / Base / Remote contents. The user either accepts one side
 *  wholesale (writes that content to disk + git add), edits the file
 *  in the editor and then "Mark Resolved", or cancels.
 *
 *  Hunk-level interleaving (the JetBrains green/red bars between left
 *  and right) is deferred — the wholesale Accept is enough to unblock
 *  the user; in-editor manual resolve handles the rest. */
export default function ConflictResolutionDialog({
  workspace,
  open,
  state,
  onClose,
}: Props) {
  const t = useT();
  const [conflicts, setConflicts] = useState<GitConflict[]>([]);
  const [selectedRel, setSelectedRel] = useState<string | null>(null);
  const [yours, setYours] = useState("");
  const [base, setBase] = useState("");
  const [theirs, setTheirs] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const list = await invoke<GitConflict[]>("git_conflicts", { workspace });
      setConflicts(list);
      if (list.length > 0 && !selectedRel) setSelectedRel(list[0].rel);
      if (list.length === 0) setSelectedRel(null);
    } catch (e) {
      logError("git_conflicts failed", e);
      setErr(String(e));
    }
  }, [workspace, selectedRel]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // Load all three sides whenever the selection changes.
  useEffect(() => {
    if (!selectedRel) {
      setYours("");
      setBase("");
      setTheirs("");
      return;
    }
    let cancelled = false;
    void Promise.all([
      invoke<string>("git_conflict_side", {
        workspace,
        rel: selectedRel,
        stage: 2,
      }).catch(() => ""),
      invoke<string>("git_conflict_side", {
        workspace,
        rel: selectedRel,
        stage: 1,
      }).catch(() => ""),
      invoke<string>("git_conflict_side", {
        workspace,
        rel: selectedRel,
        stage: 3,
      }).catch(() => ""),
    ]).then(([y, b, th]) => {
      if (cancelled) return;
      setYours(y);
      setBase(b);
      setTheirs(th);
    });
    return () => {
      cancelled = true;
    };
  }, [workspace, selectedRel]);

  const writeAndMark = async (content: string) => {
    if (!selectedRel) return;
    setBusy(true);
    setErr(null);
    try {
      const conf = conflicts.find((c) => c.rel === selectedRel)!;
      await invoke("write_text_file", { path: conf.path, content });
      await invoke("git_mark_resolved", { workspace, rel: selectedRel });
      await refresh();
      refreshGit(workspace);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onMarkResolved = async () => {
    if (!selectedRel) return;
    setBusy(true);
    setErr(null);
    try {
      await invoke("git_mark_resolved", { workspace, rel: selectedRel });
      await refresh();
      refreshGit(workspace);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const continueOp = async () => {
    setBusy(true);
    setErr(null);
    try {
      await invoke("git_continue_op", { workspace, state });
      refreshGit(workspace);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const abortOp = async () => {
    setBusy(true);
    setErr(null);
    try {
      await invoke("git_abort_op", { workspace, state });
      refreshGit(workspace);
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  const selectedConflict = conflicts.find((c) => c.rel === selectedRel);
  const canContinue = conflicts.length === 0 && state !== "clean";

  return (
    <Modal
      open={open}
      title={t("conflict.title")}
      size="full"
      onClose={onClose}
      footer={
        <>
          <button onClick={() => void abortOp()} disabled={busy} style={btnDanger}>
            {t("conflict.abort", { state })}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} disabled={busy} style={btnSecondary}>
            {t("conflict.close")}
          </button>
          <button
            onClick={() => void continueOp()}
            disabled={busy || !canContinue}
            style={btnPrimary}
          >
            {t("conflict.continue", { state })}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
        {/* Conflicts list */}
        <div
          style={{
            width: 260,
            borderRight: "1px solid var(--border)",
            background: "var(--bg-soft)",
            overflowY: "auto",
            flexShrink: 0,
          }}
        >
          {conflicts.length === 0 && (
            <div
              style={{
                padding: 16,
                color: "var(--text-soft)",
                fontSize: 12,
              }}
            >
              {t("conflict.empty")}
            </div>
          )}
          {conflicts.map((c) => (
            <div
              key={c.rel}
              onClick={() => setSelectedRel(c.rel)}
              title={c.rel}
              style={{
                padding: "6px 10px",
                cursor: "pointer",
                background:
                  selectedRel === c.rel ? "var(--bg-mute)" : "transparent",
                borderLeft:
                  selectedRel === c.rel
                    ? "2px solid var(--accent)"
                    : "2px solid transparent",
                fontSize: 12,
              }}
              onMouseEnter={(e) => {
                if (selectedRel !== c.rel)
                  e.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(e) => {
                if (selectedRel !== c.rel)
                  e.currentTarget.style.background = "transparent";
              }}
            >
              <div
                style={{
                  color: "var(--text)",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {basename(c.rel)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-soft)",
                  marginTop: 1,
                }}
              >
                {kindLabel(c.kind)}
              </div>
            </div>
          ))}
        </div>

        {/* Three-pane viewer */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {selectedConflict ? (
            <>
              {/* Per-file actions */}
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  padding: "8px 12px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--bg-soft)",
                  alignItems: "center",
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontWeight: 600,
                    color: "var(--text)",
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {selectedConflict.rel}
                </span>
                <button
                  onClick={() => void writeAndMark(yours)}
                  disabled={busy}
                  style={btnGhost}
                  title={t("conflict.acceptYours")}
                >
                  <FiArrowLeft size={11} /> {t("conflict.acceptYours")}
                </button>
                <button
                  onClick={() => void writeAndMark(theirs)}
                  disabled={busy}
                  style={btnGhost}
                  title={t("conflict.acceptTheirs")}
                >
                  {t("conflict.acceptTheirs")} <FiArrowRight size={11} />
                </button>
                <button
                  onClick={() => void onMarkResolved()}
                  disabled={busy}
                  style={btnPrimary}
                  title={t("conflict.markResolved")}
                >
                  <FiCheckCircle size={11} /> {t("conflict.markResolved")}
                </button>
              </div>

              {/* 3 columns: Yours | Base | Theirs */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  flex: 1,
                  minHeight: 0,
                }}
              >
                <Pane title={t("conflict.local")} content={yours} accent="#3a99ff" />
                <Pane title={t("conflict.base")} content={base} accent="var(--text-soft)" />
                <Pane title={t("conflict.remote")} content={theirs} accent="#caa54e" />
              </div>
            </>
          ) : (
            <div style={{ padding: 16, color: "var(--text-soft)", fontSize: 12 }}>
              {t("conflict.empty")}
            </div>
          )}
          {err && (
            <div
              style={{
                padding: "6px 12px",
                fontSize: 12,
                color: "#e55353",
                background: "rgba(229,83,83,0.08)",
                borderTop: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FiXOctagon size={12} />
              {err}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Pane({
  title,
  content,
  accent,
}: {
  title: string;
  content: string;
  accent: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        borderRight: "1px solid var(--border)",
      }}
    >
      <div
        style={{
          padding: "4px 8px",
          fontSize: 11,
          color: accent,
          background: "var(--bg-soft)",
          borderBottom: "1px solid var(--border)",
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {title}
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: "6px 8px",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text)",
          background: "var(--bg)",
          overflow: "auto",
          whiteSpace: "pre",
          minHeight: 0,
        }}
      >
        {content || "(empty)"}
      </pre>
    </div>
  );
}

function basename(p: string): string {
  return p.split("/").pop() ?? p;
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "both modified":
      return tStatic("conflict.kind.bothModified");
    case "both added":
      return tStatic("conflict.kind.bothAdded");
    case "both deleted":
      return tStatic("conflict.kind.bothDeleted");
    case "deleted by them":
      return tStatic("conflict.kind.deletedByThem");
    case "deleted by us":
      return tStatic("conflict.kind.deletedByUs");
    case "added by them":
      return tStatic("conflict.kind.addedByThem");
    case "added by us":
      return tStatic("conflict.kind.addedByUs");
    default:
      return tStatic("conflict.kind.other");
  }
}

const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "1px solid var(--accent)",
  padding: "4px 10px",
  borderRadius: 3,
  fontSize: 11,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const btnDanger: React.CSSProperties = {
  background: "#e55353",
  color: "#fff",
  border: "1px solid #e55353",
  padding: "5px 14px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  padding: "4px 10px",
  borderRadius: 3,
  fontSize: 11,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  color: "var(--text)",
  border: "1px solid var(--border)",
  padding: "5px 14px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
};
