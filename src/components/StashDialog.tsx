import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  FiArrowDown,
  FiArrowUpRight,
  FiEye,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import Modal from "./Modal";
import { useT, tStatic } from "../lib/i18n";
import { useEditorStore } from "../store/editor";
import { promptInput } from "./PromptDialog";
import { chooseAction } from "./ConfirmDialog";
import { refreshGit } from "../lib/git";

interface Props {
  workspace: string;
  open: boolean;
  onClose: () => void;
}

interface GitStash {
  stash_ref: string;
  branch: string;
  message: string;
  time: number;
}

/** JetBrains-style "Stash list" dialog. Lists every stash with branch /
 *  message / date, plus per-row Apply / Pop / Drop / Show Diff actions and
 *  a top-bar "New Stash…" with options (include untracked, keep index,
 *  custom message). */
export default function StashDialog({ workspace, open, onClose }: Props) {
  const t = useT();
  const openDiffTab = useEditorStore((s) => s.openDiffTab);
  const [stashes, setStashes] = useState<GitStash[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<GitStash[]>("git_stash_list", { workspace });
      setStashes(list);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, [workspace]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onNew = async () => {
    const message = await promptInput({
      title: tStatic("stash.newTitle"),
      label: tStatic("stash.newMessage"),
    });
    if (message == null) return; // user cancelled (vs. empty string = stash anyway)
    // Both options default off — JetBrains pops a small dialog with
    // checkboxes; we keep it lean and put both behind a confirm.
    const choice = await chooseAction({
      title: tStatic("stash.newTitle"),
      message: tStatic("stash.newIncludeUntracked"),
      buttons: [
        { label: tStatic("common.cancel"), value: "cancel" },
        { label: "No", value: "no" },
        { label: "Yes", value: "yes", primary: true },
      ],
    });
    if (choice === "cancel" || !choice) return;
    try {
      await invoke("git_stash_push", {
        workspace,
        message: message || null,
        includeUntracked: choice === "yes",
        keepIndex: false,
      });
      await refresh();
      refreshGit(workspace);
    } catch (e) {
      setErr(String(e));
    }
  };

  const op = async (stashRef: string, kind: "apply" | "pop" | "drop") => {
    if (kind === "drop") {
      const choice = await chooseAction({
        title: tStatic("stash.confirmDropTitle"),
        message: tStatic("stash.confirmDropMsg", { ref: stashRef }),
        buttons: [
          { label: tStatic("common.cancel"), value: "cancel" },
          { label: tStatic("stash.drop"), value: "ok", danger: true },
        ],
      });
      if (choice !== "ok") return;
    }
    try {
      await invoke(`git_stash_${kind}`, { workspace, stashRef });
      await refresh();
      refreshGit(workspace);
    } catch (e) {
      setErr(String(e));
    }
  };

  const showDiff = async (stashRef: string) => {
    try {
      const diff = await invoke<string>("git_stash_show", {
        workspace,
        stashRef,
      });
      // Open as a virtual diff tab — left side is empty (no baseline content;
      // the diff IS the change), right side shows the unified diff text. The
      // user gets a read-only view of the patch, which is what JetBrains'
      // popup shows for stashes.
      openDiffTab({
        leftPath: `stash:${stashRef}`,
        rightPath: tStatic("stash.diffTabTitle", { ref: stashRef }),
        leftContent: "",
        rightContent: diff,
      });
      onClose();
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <Modal
      open={open}
      title={t("stash.title")}
      size="lg"
      onClose={onClose}
      footer={
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            color: "var(--text)",
            border: "1px solid var(--border)",
            padding: "5px 14px",
            borderRadius: 4,
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {t("conflict.close")}
        </button>
      }
    >
      <div style={{ padding: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => void onNew()}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "1px solid var(--accent)",
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <FiPlus size={11} /> {t("stash.new")}
          </button>
        </div>
        {err && (
          <div
            style={{
              padding: "6px 8px",
              fontSize: 12,
              color: "#e55353",
              background: "rgba(229,83,83,0.08)",
              borderRadius: 3,
              marginBottom: 8,
            }}
          >
            {err}
          </div>
        )}
        {stashes.length === 0 ? (
          <div style={{ padding: 12, color: "var(--text-soft)", fontSize: 12 }}>
            {t("stash.empty")}
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12,
            }}
          >
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "var(--text-soft)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={{ padding: "5px 8px", width: 100 }}>{t("stash.col.ref")}</th>
                <th style={{ padding: "5px 8px", width: 120 }}>{t("stash.col.branch")}</th>
                <th style={{ padding: "5px 8px" }}>{t("stash.col.message")}</th>
                <th style={{ padding: "5px 8px", width: 130 }}>{t("stash.col.date")}</th>
                <th style={{ padding: "5px 8px", width: 130 }} />
              </tr>
            </thead>
            <tbody>
              {stashes.map((s) => (
                <tr
                  key={s.stash_ref}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td
                    style={{
                      padding: "6px 8px",
                      fontFamily: "monospace",
                      color: "var(--text)",
                    }}
                  >
                    {s.stash_ref}
                  </td>
                  <td style={{ padding: "6px 8px", color: "var(--text)" }}>
                    {s.branch}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text)",
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.message}
                  >
                    {s.message}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text-soft)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatDate(s.time)}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <button
                      onClick={() => void showDiff(s.stash_ref)}
                      title={t("stash.showDiff")}
                      style={iconBtn}
                    >
                      <FiEye size={11} />
                    </button>
                    <button
                      onClick={() => void op(s.stash_ref, "apply")}
                      title={t("stash.apply")}
                      style={iconBtn}
                    >
                      <FiArrowDown size={11} />
                    </button>
                    <button
                      onClick={() => void op(s.stash_ref, "pop")}
                      title={t("stash.pop")}
                      style={iconBtn}
                    >
                      <FiArrowUpRight size={11} />
                    </button>
                    <button
                      onClick={() => void op(s.stash_ref, "drop")}
                      title={t("stash.drop")}
                      style={{ ...iconBtn, color: "#e55353" }}
                    >
                      <FiTrash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}

function formatDate(unix: number): string {
  if (!unix) return "";
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
