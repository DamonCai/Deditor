import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FiArrowUp, FiGitCommit } from "react-icons/fi";
import Modal from "./Modal";
import { useT } from "../lib/i18n";
import { refreshGit, type GitCommit } from "../lib/git";

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

/** JetBrains-style Push dialog. Shows the commits about to be pushed,
 *  plus toggles for force / force-with-lease / push tags / set upstream
 *  and a remote/branch override. The commit list is read-only — JetBrains
 *  doesn't actually let you "push only some" of a contiguous range
 *  either; the checkbox visualization is informational. */
export default function PushDialog({ workspace, open, onClose }: Props) {
  const t = useT();
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [remotes, setRemotes] = useState<GitRemote[]>([]);
  const [remote, setRemote] = useState<string>("");
  const [branch, setBranch] = useState<string>("");
  const [force, setForce] = useState(false);
  const [forceWithLease, setForceWithLease] = useState(false);
  const [pushTags, setPushTags] = useState(false);
  const [setUpstream, setSetUpstream] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [output, setOutput] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    try {
      const [unpushed, remoteList] = await Promise.all([
        invoke<GitCommit[]>("git_unpushed_commits", { workspace }),
        invoke<GitRemote[]>("git_remote_list", { workspace }),
      ]);
      setCommits(unpushed);
      setRemotes(remoteList);
      // Default to the first remote (origin if it exists). Branch defaults
      // empty → backend pushes the current branch.
      if (remoteList.length > 0 && !remote) setRemote(remoteList[0].name);
    } catch (e) {
      setErr(String(e));
    }
  }, [workspace, remote]);

  useEffect(() => {
    if (open) {
      void refresh();
      setOutput(null);
      setErr(null);
    }
  }, [open, refresh]);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    setOutput(null);
    try {
      const result = await invoke<string>("git_push_advanced", {
        args: {
          workspace,
          remote: remote || null,
          branch: branch || null,
          force,
          forceWithLease,
          pushTags,
          setUpstream,
        },
      });
      setOutput(result || t("push.success"));
      refreshGit(workspace);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("push.title")}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            style={btnSecondary}
          >
            {t("push.cancel")}
          </button>
          <button
            onClick={() => void go()}
            disabled={busy}
            style={force || forceWithLease ? btnDanger : btnPrimary}
          >
            {busy ? "…" : t("push.go")}
          </button>
        </>
      }
    >
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Remote / branch */}
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ flex: 1, fontSize: 12, color: "var(--text-soft)" }}>
            {t("push.remote")}
            <select
              value={remote}
              onChange={(e) => setRemote(e.target.value)}
              style={selectStyle}
            >
              {remotes.map((r) => (
                <option key={r.name} value={r.name}>
                  {r.name} — {r.push_url || r.fetch_url}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1, fontSize: 12, color: "var(--text-soft)" }}>
            {t("push.branch")}
            <input
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="(current)"
              style={{
                ...selectStyle,
                fontFamily: "monospace",
              }}
            />
          </label>
        </div>

        {/* Options */}
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-soft)",
              marginBottom: 4,
            }}
          >
            {t("push.options")}
          </div>
          <Toggle
            checked={forceWithLease}
            onChange={(v) => {
              setForceWithLease(v);
              if (v) setForce(false);
            }}
            label={t("push.forceWithLease")}
            warn
          />
          <Toggle
            checked={force}
            onChange={(v) => {
              setForce(v);
              if (v) setForceWithLease(false);
            }}
            label={t("push.force")}
            danger
          />
          <Toggle
            checked={pushTags}
            onChange={setPushTags}
            label={t("push.tags")}
          />
          <Toggle
            checked={setUpstream}
            onChange={setSetUpstream}
            label={t("push.setUpstream")}
          />
        </div>

        {/* Commit preview */}
        <div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-soft)",
              marginBottom: 6,
            }}
          >
            {t("push.commitsToPush", { n: String(commits.length) })}
          </div>
          {commits.length === 0 ? (
            <div
              style={{
                padding: "8px 10px",
                background: "var(--bg-soft)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                fontSize: 12,
                color: "var(--text-soft)",
              }}
            >
              {t("push.noCommits")}
            </div>
          ) : (
            <div
              style={{
                maxHeight: 220,
                overflowY: "auto",
                border: "1px solid var(--border)",
                borderRadius: 3,
              }}
            >
              {commits.map((c) => (
                <div
                  key={c.hash}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    fontSize: 12,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <FiGitCommit
                    size={11}
                    style={{ color: "var(--accent)", flexShrink: 0 }}
                  />
                  <span
                    style={{
                      fontFamily: "monospace",
                      color: "var(--text-soft)",
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {c.short_hash}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={c.subject}
                  >
                    {c.subject}
                  </span>
                  <span
                    style={{
                      color: "var(--text-soft)",
                      fontSize: 11,
                      flexShrink: 0,
                    }}
                  >
                    {c.author_name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {output && (
          <pre
            style={{
              padding: "8px 10px",
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 3,
              fontSize: 11,
              fontFamily: "monospace",
              maxHeight: 140,
              overflow: "auto",
              whiteSpace: "pre-wrap",
              color: "var(--text)",
              margin: 0,
            }}
          >
            <FiArrowUp
              size={11}
              style={{ color: "var(--accent)", marginRight: 4 }}
            />
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

function Toggle({
  checked,
  onChange,
  label,
  warn,
  danger,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  warn?: boolean;
  danger?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 0",
        fontSize: 12,
        color: danger
          ? checked
            ? "#e55353"
            : "var(--text)"
          : warn
            ? checked
              ? "#caa54e"
              : "var(--text)"
            : "var(--text)",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "5px 8px",
  background: "var(--bg-soft)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 3,
  fontSize: 12,
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

const btnDanger: React.CSSProperties = {
  ...btnPrimary,
  background: "#e55353",
  border: "1px solid #e55353",
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
