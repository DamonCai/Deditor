import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import { useT } from "../lib/i18n";
import { useEditorStore } from "../store/editor";
import { setWorkspaceByPath } from "../lib/fileio";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** "git clone" wizard. URL + target dir, defaults dir name from URL. After
 *  success, adds the new dir as a workspace + focuses it. */
export default function CloneRepoDialog({ open, onClose }: Props) {
  const t = useT();
  const focused = useEditorStore((s) => s.focusedWorkspace);
  const workspaces = useEditorStore((s) => s.workspaces);
  const setFocused = useEditorStore((s) => s.setFocusedWorkspace);
  const [url, setUrl] = useState("");
  const [parent, setParent] = useState(focused ?? workspaces[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Derive the target leaf dir from the URL — last path segment minus .git.
  const repoName = useMemo(() => {
    const m = url.match(/[/:]([^/]+?)(?:\.git)?\/?$/);
    return m ? m[1] : "";
  }, [url]);

  const dir = useMemo(() => {
    if (!parent || !repoName) return "";
    const sep = parent.endsWith("/") ? "" : "/";
    return `${parent}${sep}${repoName}`;
  }, [parent, repoName]);

  // Reset transient output when reopening.
  useEffect(() => {
    if (open) {
      setBusy(false);
      setErr(null);
      setOutput(null);
    }
  }, [open]);

  const go = async () => {
    if (busy || !url.trim() || !dir.trim()) return;
    setBusy(true);
    setErr(null);
    setOutput(t("clone.cloning"));
    try {
      const result = await invoke<string>("git_clone", { url, dir });
      setOutput(result || "");
      if (!workspaces.includes(dir)) {
        await setWorkspaceByPath(dir).catch(() => {});
      }
      setFocused(dir);
      onClose();
    } catch (e) {
      setErr(String(e));
      setOutput(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("clone.title")}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} style={btnSecondary}>
            {t("clone.cancel")}
          </button>
          <button
            onClick={() => void go()}
            disabled={busy || !url.trim() || !dir.trim()}
            style={btnPrimary}
          >
            {busy ? t("clone.cloning") : t("clone.go")}
          </button>
        </>
      }
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {t("clone.urlLabel")}
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={t("clone.urlPlaceholder")}
            style={inputStyle}
            autoFocus
          />
        </label>
        <label style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {t("clone.dirLabel")}
          <input
            value={dir}
            onChange={(e) => {
              // Manual override: split into parent dir + leaf so the
              // auto-derived behavior pauses while user is typing.
              const v = e.target.value;
              const slash = v.lastIndexOf("/");
              if (slash > 0) setParent(v.slice(0, slash));
            }}
            placeholder={t("clone.dirPlaceholder")}
            style={inputStyle}
          />
        </label>
        {output && (
          <pre
            style={{
              padding: "8px 10px",
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              fontSize: 11,
              fontFamily: "monospace",
              maxHeight: 160,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              color: "var(--text)",
              margin: 0,
            }}
          >
            {output}
          </pre>
        )}
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
