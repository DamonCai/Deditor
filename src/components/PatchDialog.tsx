import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import { useT } from "../lib/i18n";
import { refreshGit } from "../lib/git";

/** "Create Patch" — read git diff (staged or working), show in a textarea
 *  for the user to copy. Save-to-file is omitted to avoid the file-picker
 *  permission gymnastics; clipboard handles the common case. */
export function CreatePatchDialog({
  workspace,
  open,
  onClose,
}: {
  workspace: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [staged, setStaged] = useState(false);
  const [patch, setPatch] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    void invoke<string>("git_create_patch", { workspace, staged })
      .then((p) => setPatch(p))
      .catch((e) => setErr(String(e)));
  }, [open, workspace, staged]);

  const copy = async () => {
    await navigator.clipboard.writeText(patch);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal
      open={open}
      title={t("patch.createTitle")}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <span style={{ flex: 1, fontSize: 11, color: "var(--text-soft)" }}>
            {copied ? t("patch.copyHint") : ""}
          </span>
          <button onClick={onClose} style={btnSecondary}>
            {t("conflict.close")}
          </button>
          <button onClick={() => void copy()} style={btnPrimary}>
            {t("patch.copy")}
          </button>
        </>
      }
    >
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="radio"
              checked={!staged}
              onChange={() => setStaged(false)}
            />
            {t("patch.createUnstaged")}
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="radio"
              checked={staged}
              onChange={() => setStaged(true)}
            />
            {t("patch.createStaged")}
          </label>
        </div>
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
        <textarea
          value={patch}
          readOnly
          rows={20}
          style={{
            width: "100%",
            minHeight: 320,
            padding: "8px 10px",
            background: "var(--bg-soft)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            fontSize: 11,
            fontFamily: "monospace",
            outline: "none",
            resize: "vertical",
          }}
        />
      </div>
    </Modal>
  );
}

/** "Apply Patch" — paste unified-diff text, optionally also update index. */
export function ApplyPatchDialog({
  workspace,
  open,
  onClose,
}: {
  workspace: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [patch, setPatch] = useState("");
  const [withIndex, setWithIndex] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPatch("");
      setErr(null);
      setBusy(false);
    }
  }, [open]);

  const apply = async () => {
    if (!patch.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await invoke("git_apply_patch", { workspace, patch, index: withIndex });
      refreshGit(workspace);
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
      title={t("patch.applyTitle")}
      size="xl"
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} disabled={busy} style={btnSecondary}>
            {t("conflict.close")}
          </button>
          <button
            onClick={() => void apply()}
            disabled={busy || !patch.trim()}
            style={btnPrimary}
          >
            {t("patch.apply")}
          </button>
        </>
      }
    >
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {t("patch.applyHint")}
        </span>
        <label
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}
        >
          <input
            type="checkbox"
            checked={withIndex}
            onChange={(e) => setWithIndex(e.target.checked)}
          />
          {t("patch.applyIndex")}
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
        <textarea
          value={patch}
          onChange={(e) => setPatch(e.target.value)}
          rows={20}
          autoFocus
          placeholder="diff --git a/foo b/foo
@@ -1 +1 @@
-old
+new"
          style={{
            width: "100%",
            minHeight: 320,
            padding: "8px 10px",
            background: "var(--bg-soft)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            fontSize: 11,
            fontFamily: "monospace",
            outline: "none",
            resize: "vertical",
          }}
        />
      </div>
    </Modal>
  );
}

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
