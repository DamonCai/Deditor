import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiArrowUp, FiPlus, FiTag, FiTrash2 } from "react-icons/fi";
import Modal from "./Modal";
import { useT, tStatic } from "../lib/i18n";
import { promptInput } from "./PromptDialog";
import { chooseAction } from "./ConfirmDialog";

interface Props {
  workspace: string;
  open: boolean;
  onClose: () => void;
}

interface GitTag {
  name: string;
  target: string;
  message: string;
}

/** JetBrains-style tag manager. List + per-row Delete / Push, top-bar
 *  New Tag / Push All Tags. Uses backend git_* commands. */
export default function TagsDialog({ workspace, open, onClose }: Props) {
  const t = useT();
  const [tags, setTags] = useState<GitTag[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await invoke<GitTag[]>("git_list_tags", { workspace });
      setTags(list);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    }
  }, [workspace]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onNew = async () => {
    const name = await promptInput({
      title: tStatic("tags.new"),
      placeholder: "v1.0.0",
    });
    if (!name) return;
    const message = await promptInput({
      title: tStatic("tags.new"),
      label: tStatic("gitMenu.refPlaceholder"),
    });
    try {
      await invoke("git_create_tag_at", {
        workspace,
        hash: "HEAD",
        name,
        message: message ?? "",
      });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const onDelete = async (name: string) => {
    const ok = await chooseAction({
      title: tStatic("tags.confirmDeleteTitle"),
      message: tStatic("tags.confirmDeleteMsg", { name }),
      buttons: [
        { label: tStatic("common.cancel"), value: "cancel" },
        { label: tStatic("tags.delete"), value: "ok", danger: true },
      ],
    });
    if (ok !== "ok") return;
    try {
      await invoke("git_delete_tag", { workspace, name });
      await refresh();
    } catch (e) {
      setErr(String(e));
    }
  };

  const onPush = async (name: string) => {
    try {
      await invoke("git_push_tag", { workspace, name });
    } catch (e) {
      setErr(String(e));
    }
  };

  const onPushAll = async () => {
    try {
      await invoke("git_push_all_tags", { workspace });
    } catch (e) {
      setErr(String(e));
    }
  };

  return (
    <Modal
      open={open}
      title={t("tags.title")}
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
            gap: 6,
            justifyContent: "flex-end",
            marginBottom: 10,
          }}
        >
          <button
            onClick={() => void onPushAll()}
            style={{
              background: "transparent",
              color: "var(--text)",
              border: "1px solid var(--border)",
              padding: "4px 12px",
              borderRadius: 4,
              fontSize: 12,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <FiArrowUp size={11} /> {t("tags.pushAll")}
          </button>
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
            <FiPlus size={11} /> {t("tags.new")}
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
        {tags.length === 0 ? (
          <div style={{ padding: 12, color: "var(--text-soft)", fontSize: 12 }}>
            {t("tags.empty")}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr
                style={{
                  textAlign: "left",
                  color: "var(--text-soft)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <th style={{ padding: "5px 8px", width: 180 }}>{t("tags.col.name")}</th>
                <th style={{ padding: "5px 8px", width: 100 }}>{t("tags.col.target")}</th>
                <th style={{ padding: "5px 8px" }}>{t("tags.col.message")}</th>
                <th style={{ padding: "5px 8px", width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr
                  key={tag.name}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text)",
                      fontWeight: 600,
                    }}
                  >
                    <FiTag size={11} style={{ marginRight: 4, color: "#caa54e" }} />
                    {tag.name}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text-soft)",
                      fontFamily: "monospace",
                    }}
                  >
                    {tag.target}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "var(--text-soft)",
                      maxWidth: 360,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={tag.message}
                  >
                    {tag.message || <em style={{ opacity: 0.5 }}>(lightweight)</em>}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "right" }}>
                    <button
                      onClick={() => void onPush(tag.name)}
                      title={t("tags.push")}
                      style={iconBtn}
                    >
                      <FiArrowUp size={11} />
                    </button>
                    <button
                      onClick={() => void onDelete(tag.name)}
                      title={t("tags.delete")}
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
