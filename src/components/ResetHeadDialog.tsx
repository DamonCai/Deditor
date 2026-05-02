import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import { useT } from "../lib/i18n";
import { refreshGit } from "../lib/git";

interface Props {
  workspace: string;
  open: boolean;
  /** Pre-filled target ref (e.g. coming from "Reset Current Branch to Here"
   *  in the Log panel — passes the chosen commit hash). */
  initialRef?: string;
  onClose: () => void;
}

type Mode = "soft" | "mixed" | "hard";

/** JetBrains-style Reset HEAD dialog: target ref input + 3 mode cards
 *  with a small "what gets touched" diagram so the user understands
 *  before clicking. */
export default function ResetHeadDialog({
  workspace,
  open,
  initialRef,
  onClose,
}: Props) {
  const t = useT();
  const [ref, setRef] = useState(initialRef ?? "HEAD~1");
  const [mode, setMode] = useState<Mode>("mixed");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const go = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await invoke("git_reset_to", {
        workspace,
        hash: ref,
        mode,
      });
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
      title={t("reset.title")}
      size="md"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={busy}
            style={btnSecondary}
          >
            {t("reset.cancel")}
          </button>
          <button
            onClick={() => void go()}
            disabled={busy || !ref.trim()}
            style={mode === "hard" ? btnDanger : btnPrimary}
          >
            {t("reset.go")}
          </button>
        </>
      }
    >
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 12, color: "var(--text-soft)" }}>
          {t("reset.refLabel")}
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={t("reset.refPlaceholder")}
            style={{
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
            }}
          />
        </label>
        <div>
          <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
            {t("reset.modeLabel")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <ModeCard
              active={mode === "soft"}
              onClick={() => setMode("soft")}
              label={t("reset.mode.soft")}
              desc={t("reset.mode.softDesc")}
              touches={["HEAD"]}
            />
            <ModeCard
              active={mode === "mixed"}
              onClick={() => setMode("mixed")}
              label={t("reset.mode.mixed")}
              desc={t("reset.mode.mixedDesc")}
              touches={["HEAD", "Index"]}
            />
            <ModeCard
              active={mode === "hard"}
              onClick={() => setMode("hard")}
              label={t("reset.mode.hard")}
              desc={t("reset.mode.hardDesc")}
              touches={["HEAD", "Index", "Working Tree"]}
              danger
            />
          </div>
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
      </div>
    </Modal>
  );
}

function ModeCard({
  active,
  onClick,
  label,
  desc,
  touches,
  danger,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
  touches: string[];
  danger?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "8px 10px",
        border: `1px solid ${active ? (danger ? "#e55353" : "var(--accent)") : "var(--border)"}`,
        background: active
          ? danger
            ? "rgba(229,83,83,0.06)"
            : "var(--bg-soft)"
          : "transparent",
        borderRadius: 4,
        cursor: "pointer",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <input
        type="radio"
        checked={active}
        onChange={onClick}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: danger && active ? "#e55353" : "var(--text)",
            marginBottom: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>{label}</span>
          {touches.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: 10,
                fontWeight: 500,
                padding: "1px 5px",
                borderRadius: 2,
                background: "var(--bg-mute)",
                color: "var(--text-soft)",
              }}
            >
              {tag}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--text-soft)" }}>{desc}</div>
      </div>
    </div>
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
