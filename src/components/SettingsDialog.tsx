import * as React from "react";
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { SHORTCUTS, type ShortcutMeta } from "../lib/shortcuts";
import { useT } from "../lib/i18n";
import { Button } from "./ui/Button";

interface Props {
  open: boolean;
  onClose: () => void;
}

const GROUP_ORDER: ShortcutMeta["group"][] = ["file", "nav", "editor"];

export default function SettingsDialog({ open, onClose }: Props) {
  const t = useT();
  const shortcuts = useEditorStore((s) => s.shortcuts);
  const setShortcutEnabled = useEditorStore((s) => s.setShortcutEnabled);
  const resetShortcuts = useEditorStore((s) => s.resetShortcuts);
  const softWrap = useEditorStore((s) => s.softWrap);
  const setSoftWrap = useEditorStore((s) => s.setSoftWrap);
  const showIndentGuides = useEditorStore((s) => s.showIndentGuides);
  const setShowIndentGuides = useEditorStore((s) => s.setShowIndentGuides);
  const showWhitespace = useEditorStore((s) => s.showWhitespace);
  const setShowWhitespace = useEditorStore((s) => s.setShowWhitespace);
  const showMinimap = useEditorStore((s) => s.showMinimap);
  const setShowMinimap = useEditorStore((s) => s.setShowMinimap);
  const autoCloseBrackets = useEditorStore((s) => s.autoCloseBrackets);
  const setAutoCloseBrackets = useEditorStore((s) => s.setAutoCloseBrackets);
  const fontSize = useEditorStore((s) => s.editorFontSize);
  const setFontSize = useEditorStore((s) => s.setEditorFontSize);
  const theme = useEditorStore((s) => s.theme);
  const setTheme = useEditorStore((s) => s.setTheme);
  const language = useEditorStore((s) => s.language);
  const setLanguage = useEditorStore((s) => s.setLanguage);
  const autoSave = useEditorStore((s) => s.autoSave);
  const setAutoSave = useEditorStore((s) => s.setAutoSave);
  const formatOnSave = useEditorStore((s) => s.formatOnSave);
  const setFormatOnSave = useEditorStore((s) => s.setFormatOnSave);
  const terminalShell = useEditorStore((s) => s.terminalShell);
  const setTerminalShell = useEditorStore((s) => s.setTerminalShell);
  const gutterMarkers = useEditorStore((s) => s.gutterMarkers);
  const setGutterMarkers = useEditorStore((s) => s.setGutterMarkers);
  const inlineBlame = useEditorStore((s) => s.inlineBlame);
  const setInlineBlame = useEditorStore((s) => s.setInlineBlame);
  const bgFetchEnabled = useEditorStore((s) => s.bgFetchEnabled);
  const setBgFetchEnabled = useEditorStore((s) => s.setBgFetchEnabled);
  const bgFetchIntervalMin = useEditorStore((s) => s.bgFetchIntervalMin);
  const setBgFetchIntervalMin = useEditorStore((s) => s.setBgFetchIntervalMin);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => closeBtnRef.current?.focus());
  }, [open]);

  if (!open) return null;

  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: SHORTCUTS.filter((s) => s.group === g),
  }));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 1100,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(640px, 92vw)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "var(--shadow-modal)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-soft)",
            fontSize: 14,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span>{t("settings.title")}</span>
          <Button
            ref={closeBtnRef}
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close"
            style={{ fontSize: 16 }}
          >
            ×
          </Button>
        </div>

        <div style={{ padding: "12px 16px", flex: 1, overflowY: "auto" }}>
          {/* General section: theme, language, font size, auto-save. */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={sectionH3}>{t("settings.general.heading")}</h3>
            <div style={sectionBox}>
              <RadioRow
                label={t("settings.general.theme")}
                value={theme}
                options={[
                  { value: "light", label: t("settings.general.themeLight") },
                  { value: "dark", label: t("settings.general.themeDark") },
                ]}
                onChange={(v) => setTheme(v as "light" | "dark")}
              />
              <RadioRow
                label={t("settings.general.language")}
                value={language}
                options={[
                  { value: "en", label: "English" },
                  { value: "zh", label: "中文" },
                ]}
                onChange={(v) => setLanguage(v as "zh" | "en")}
                topBorder
              />
              <SliderRow
                label={t("settings.general.fontSize")}
                value={fontSize}
                min={10}
                max={28}
                onChange={setFontSize}
                topBorder
              />
              <RadioRow
                label={t("settings.general.autoSave")}
                value={autoSave}
                options={[
                  { value: "off", label: t("settings.general.autoSaveOff") },
                  { value: "onBlur", label: t("settings.general.autoSaveBlur") },
                  { value: "afterDelay", label: t("settings.general.autoSaveDelay") },
                ]}
                onChange={(v) => setAutoSave(v as "off" | "onBlur" | "afterDelay")}
                topBorder
              />
              <CheckRow
                checked={formatOnSave}
                onChange={setFormatOnSave}
                label={t("settings.general.formatOnSave")}
                topBorder
              />
            </div>
          </section>

          {/* Editor section */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={sectionH3}>{t("settings.editor.heading")}</h3>
            <div style={sectionBox}>
              <CheckRow checked={softWrap} onChange={setSoftWrap} label={t("settings.editor.softWrap")} />
              <CheckRow
                checked={showIndentGuides}
                onChange={setShowIndentGuides}
                label={t("settings.editor.indentGuides")}
                topBorder
              />
              <CheckRow
                checked={showWhitespace}
                onChange={setShowWhitespace}
                label={t("settings.editor.whitespace")}
                topBorder
              />
              <CheckRow
                checked={showMinimap}
                onChange={setShowMinimap}
                label={t("settings.editor.minimap")}
                topBorder
              />
              <CheckRow
                checked={autoCloseBrackets}
                onChange={setAutoCloseBrackets}
                label={t("settings.editor.autoCloseBrackets")}
                topBorder
              />
            </div>
          </section>

          {/* Terminal section — currently just a shell-path override. We
              intentionally avoid font-size + color customization here to keep
              the integrated terminal visually consistent with the editor. */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={sectionH3}>{t("settings.terminal.heading")}</h3>
            <div style={sectionBox}>
              <TextRow
                label={t("settings.terminal.shell")}
                value={terminalShell}
                placeholder={t("settings.terminal.shellPlaceholder")}
                onChange={setTerminalShell}
                hint={t("settings.terminal.shellHint")}
              />
            </div>
          </section>

          {/* VCS identity — user.name / user.email per workspace. Reads on
              open, writes on blur via git_set_user. */}
          <VcsIdentitySection />

          {/* Git section — VCS gutter / blame / background fetch. */}
          <section style={{ marginBottom: 16 }}>
            <h3 style={sectionH3}>{t("settings.git.heading")}</h3>
            <div style={sectionBox}>
              <CheckRow
                checked={gutterMarkers}
                onChange={setGutterMarkers}
                label={t("settings.git.gutterMarkers")}
              />
              <CheckRow
                checked={inlineBlame}
                onChange={setInlineBlame}
                label={t("settings.git.inlineBlame")}
                topBorder
              />
              <CheckRow
                checked={bgFetchEnabled}
                onChange={setBgFetchEnabled}
                label={t("settings.git.bgFetch")}
                topBorder
              />
              <SliderRow
                label={t("settings.git.bgFetchInterval")}
                value={bgFetchIntervalMin}
                min={1}
                max={60}
                onChange={setBgFetchIntervalMin}
                topBorder
              />
            </div>
          </section>

          <div
            style={{
              fontSize: 13,
              color: "var(--text-soft)",
              marginBottom: 12,
            }}
          >
            {t("settings.shortcuts.intro")}
          </div>

          {grouped.map(({ group, items }) => (
            <section key={group} style={{ marginBottom: 16 }}>
              <h3 style={sectionH3}>
                {t(`settings.shortcuts.group.${group}`)}
              </h3>
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                {items.map((s, i) => {
                  const enabled = shortcuts[s.id] !== false;
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "8px 12px",
                        borderTop: i === 0 ? undefined : "1px solid var(--border)",
                        cursor: "pointer",
                        background: enabled ? undefined : "var(--bg-soft)",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setShortcutEnabled(s.id, e.target.checked)}
                        style={{ flexShrink: 0 }}
                      />
                      <span
                        style={{
                          fontFamily: "var(--font-mono, ui-monospace, monospace)",
                          fontSize: 12,
                          background: "var(--bg-mute)",
                          padding: "2px 6px",
                          borderRadius: 4,
                          color: enabled ? "var(--text)" : "var(--text-soft)",
                          flexShrink: 0,
                          minWidth: 130,
                          textAlign: "center",
                          textDecoration: enabled ? undefined : "line-through",
                        }}
                      >
                        {s.display}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: enabled ? "var(--text)" : "var(--text-soft)",
                          flex: 1,
                        }}
                      >
                        {t(s.labelKey)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}

          <div
            style={{
              fontSize: 12,
              color: "var(--text-soft)",
              marginTop: 8,
              padding: "8px 12px",
              background: "var(--bg-soft)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          >
            {t("settings.shortcuts.builtinNote")}
          </div>
        </div>

        <div
          style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "var(--bg-soft)",
          }}
        >
          <Button variant="secondary" onClick={resetShortcuts}>
            {t("settings.reset")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("settings.done")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TextRow({
  label,
  value,
  placeholder,
  onChange,
  hint,
  topBorder,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  hint?: string;
  topBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 12px",
        borderTop: topBorder ? "1px solid var(--border)" : undefined,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>
          {label}
        </span>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          style={{
            width: 280,
            padding: "4px 8px",
            fontSize: 12,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 3,
            color: "var(--text)",
            outline: "none",
            fontFamily:
              "var(--font-mono, ui-monospace, 'JetBrains Mono', monospace)",
          }}
        />
      </div>
      {hint && (
        <span style={{ fontSize: 11, color: "var(--text-soft)" }}>{hint}</span>
      )}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  topBorder,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  topBorder?: boolean;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        cursor: "pointer",
        borderTop: topBorder ? "1px solid var(--border)" : undefined,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ flexShrink: 0 }}
      />
      <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>{label}</span>
    </label>
  );
}

function RadioRow<T extends string>({
  label,
  value,
  options,
  onChange,
  topBorder,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  topBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderTop: topBorder ? "1px solid var(--border)" : undefined,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>{label}</span>
      <div
        role="radiogroup"
        style={{
          display: "inline-flex",
          flexShrink: 0,
          border: "1px solid var(--border)",
          borderRadius: 4,
          overflow: "hidden",
          background: "var(--bg)",
        }}
      >
        {options.map((opt, i) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className="deditor-btn"
              style={{
                padding: "3px 12px",
                fontSize: 12,
                border: "none",
                borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--text)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                transition:
                  "background 120ms ease, color 120ms ease",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  onChange,
  topBorder,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  topBorder?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 12px",
        borderTop: topBorder ? "1px solid var(--border)" : undefined,
      }}
    >
      <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 140 }}
      />
      <span
        style={{
          fontSize: 12,
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-soft)",
          minWidth: 30,
          textAlign: "right",
        }}
      >
        {value}px
      </span>
    </div>
  );
}

const sectionH3: React.CSSProperties = {
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: 0.6,
  color: "var(--text-soft)",
  margin: "0 0 6px",
  fontWeight: 600,
};

const sectionBox: React.CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 6,
  overflow: "hidden",
};

function VcsIdentitySection() {
  const t = useT();
  const workspaces = useEditorStore((s) => s.workspaces);
  const focused = useEditorStore((s) => s.focusedWorkspace);
  const [workspace, setWorkspace] = React.useState(focused ?? workspaces[0] ?? "");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");

  React.useEffect(() => {
    if (!workspace) return;
    void invoke<{ name: string; email: string }>("git_get_user", { workspace })
      .then((c) => {
        setName(c.name);
        setEmail(c.email);
      })
      .catch(() => {
        setName("");
        setEmail("");
      });
  }, [workspace]);

  const persist = (n: string, e: string) => {
    if (!workspace) return;
    void invoke("git_set_user", {
      workspace,
      name: n,
      email: e,
      global: false,
    }).catch(() => {});
  };

  if (workspaces.length === 0) return null;

  return (
    <section style={{ marginBottom: 16 }}>
      <h3 style={sectionH3}>{t("settings.vcs.heading")}</h3>
      <div style={sectionBox}>
        {workspaces.length > 1 && (
          <div
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text)", flex: 1 }}>
              {t("settings.vcs.workspaceLabel")}
            </span>
            <select
              value={workspace}
              onChange={(ev) => setWorkspace(ev.target.value)}
              style={{
                background: "var(--bg-soft)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "3px 6px",
                fontSize: 12,
              }}
            >
              {workspaces.map((w) => (
                <option key={w} value={w}>
                  {w.split(/[\\/]/).pop() ?? w}
                </option>
              ))}
            </select>
          </div>
        )}
        <TextRow
          label={t("settings.vcs.userName")}
          value={name}
          placeholder="Your Name"
          onChange={(v) => {
            setName(v);
            persist(v, email);
          }}
        />
        <TextRow
          label={t("settings.vcs.userEmail")}
          value={email}
          placeholder="you@example.com"
          onChange={(v) => {
            setEmail(v);
            persist(name, v);
          }}
        />
      </div>
    </section>
  );
}
