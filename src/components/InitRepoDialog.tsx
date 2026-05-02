import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import { useT } from "../lib/i18n";
import { useEditorStore } from "../store/editor";
import { setWorkspaceByPath } from "../lib/fileio";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** "git init" wizard — pick a directory, run init, optionally add it as a
 *  workspace. Mirrors JetBrains' Init project from VCS. */
export default function InitRepoDialog({ open, onClose }: Props) {
  const t = useT();
  const focused = useEditorStore((s) => s.focusedWorkspace);
  const workspaces = useEditorStore((s) => s.workspaces);
  const [dir, setDir] = useState(focused ?? workspaces[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (busy || !dir.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      await invoke("git_init", { dir });
      // Add as workspace if not already — saves the user a separate step.
      if (!workspaces.includes(dir)) {
        await setWorkspaceByPath(dir).catch(() => {});
      }
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("init.title")}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} style={btnSecondary}>
            {t("init.cancel")}
          </button>
          <button
            onClick={() => void go()}
            disabled={busy || !dir.trim()}
            style={btnPrimary}
          >
            {t("init.go")}
          </button>
        </>
      }
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {t("init.dirLabel")}
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder={t("init.dirPlaceholder")}
            style={inputStyle}
          />
        </label>
        {err && (
          <div
            style={{
              padding: "6px 8px",
              fontSize: 12,
              color: "#e55353",
              background: "rgba(229,83,83,0.08)",
              borderRadius: 3,
            }}
          >
            {err}
          </div>
        )}
      </div>
    </Modal>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "5px 8px",
  background: "var(--bg-soft)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  fontSize: 13,
  fontFamily: "monospace",
  outline: "none",
};
const btnPrimary: React.CSSProperties = {
  background: "var(--accent)",
  color: "#fff",
  border: "1px solid var(--accent)",
  padding: "5px 14px",
  borderRadius: 4,
  fontSize: 12,
  cursor: "pointer",
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
