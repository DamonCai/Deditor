import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiEdit2, FiPlus, FiTrash2 } from "react-icons/fi";
import Modal from "./Modal";
import { useT, tStatic } from "../lib/i18n";
import { promptInput } from "./PromptDialog";
import { chooseAction } from "./ConfirmDialog";

interface Props {
  workspace: string;
  open: boolean;
  onClose: () => void;
}

interface GitRemote {
  name: string;
  fetch_url: string;
  push_url: string;
}

/** JetBrains parity for "Manage Remotes": table of remotes with their
 *  fetch / push URLs, inline-editable, with Add / Remove / Rename / Edit
 *  URL actions. Each action goes through git_remote_* and refreshes. */
export default function ManageRemotesDialog({
  workspace,
  open,
  onClose,
}: Props) {
  const t = useT();
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<GitRemote[]>("git_remote_list", { workspace });
      setRemotes(list);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, [workspace]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onAdd = async () => {
    const name = await promptInput({
      title: tStatic("remotes.addTitle"),
      label: tStatic("remotes.namePrompt"),
      placeholder: "origin",
    });
    if (!name) return;
    const url = await promptInput({
      title: tStatic("remotes.addTitle"),
      label: tStatic("remotes.urlPrompt"),
      placeholder: "https://github.com/user/repo.git",
    });
    if (!url) return;
    try {
      await invoke("git_remote_add", { workspace, name, url });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const onRemove = async (name: string) => {
    const choice = await chooseAction({
      title: tStatic("remotes.confirmRemoveTitle"),
      message: tStatic("remotes.confirmRemoveMsg", { name }),
      buttons: [
        { label: tStatic("common.cancel"), value: "cancel" },
        { label: tStatic("remotes.remove"), value: "ok", danger: true },
      ],
    });
    if (choice !== "ok") return;
    try {
      await invoke("git_remote_remove", { workspace, name });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const onRename = async (name: string) => {
    const next = await promptInput({
      title: tStatic("remotes.rename"),
      label: tStatic("remotes.renamePrompt"),
      initial: name,
    });
    if (!next || next === name) return;
    try {
      await invoke("git_remote_rename", {
        workspace,
        oldName: name,
        newName: next,
      });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const onEditUrl = async (name: string, push: boolean, current: string) => {
    const next = await promptInput({
      title: push ? tStatic("remotes.editPush") : tStatic("remotes.editFetch"),
      label: tStatic("remotes.urlPrompt"),
      initial: current,
    });
    if (!next || next === current) return;
    try {
      await invoke("git_remote_set_url", {
        workspace,
        name,
        url: next,
        push,
      });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <Modal
      open={open}
      title={t("remotes.title")}
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
            onClick={() => void onAdd()}
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
            <FiPlus size={11} /> {t("remotes.add")}
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
        {remotes.length === 0 ? (
          <div style={{ padding: 12, color: "var(--text-soft)", fontSize: 12 }}>
            {t("remotes.empty")}
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
                <th style={{ padding: "5px 8px", width: 100 }}>
                  {t("remotes.col.name")}
                </th>
                <th style={{ padding: "5px 8px" }}>{t("remotes.col.fetchUrl")}</th>
                <th style={{ padding: "5px 8px" }}>{t("remotes.col.pushUrl")}</th>
                <th style={{ padding: "5px 8px", width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {remotes.map((r) => (
                <tr
                  key={r.name}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>
                    {r.name}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text-soft)",
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                    onClick={() => void onEditUrl(r.name, false, r.fetch_url)}
                    title={t("remotes.editFetch")}
                  >
                    {r.fetch_url || "—"}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text-soft)",
                      fontFamily: "monospace",
                      cursor: "pointer",
                    }}
                    onClick={() => void onEditUrl(r.name, true, r.push_url)}
                    title={t("remotes.editPush")}
                  >
                    {r.push_url || r.fetch_url || "—"}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <button
                      onClick={() => void onRename(r.name)}
                      title={t("remotes.rename")}
                      style={iconBtn}
                    >
                      <FiEdit2 size={11} />
                    </button>
                    <button
                      onClick={() => void onRemove(r.name)}
                      title={t("remotes.remove")}
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
