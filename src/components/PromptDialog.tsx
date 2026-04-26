import { useEffect, useRef } from "react";
import { create } from "zustand";
import { tStatic } from "../lib/i18n";

interface State {
  open: boolean;
  title: string;
  label: string;
  initial: string;
  placeholder: string;
  resolve: ((v: string | null) => void) | null;
}

const useDlg = create<State>(() => ({
  open: false,
  title: "",
  label: "",
  initial: "",
  placeholder: "",
  resolve: null,
}));

export function promptInput(opts: {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    useDlg.setState({
      open: true,
      title: opts.title,
      label: opts.label ?? "",
      initial: opts.initial ?? "",
      placeholder: opts.placeholder ?? "",
      resolve,
    });
  });
}

export default function PromptDialog() {
  const { open, title, label, initial, placeholder, resolve } = useDlg();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // focus + select after mount
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  if (!open) return null;

  const close = (v: string | null) => {
    resolve?.(v);
    useDlg.setState({ open: false, resolve: null });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close(null);
      }}
    >
      <div
        onKeyDown={(e) => {
          if (e.key === "Escape") close(null);
        }}
        style={{
          minWidth: 380,
          maxWidth: 520,
          background: "var(--bg)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
          padding: 20,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{title}</div>
        {label && (
          <div style={{ fontSize: 12, color: "var(--text-soft)", marginBottom: 6 }}>
            {label}
          </div>
        )}
        <input
          ref={inputRef}
          defaultValue={initial}
          placeholder={placeholder}
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = (e.target as HTMLInputElement).value.trim();
              if (v) close(v);
            }
          }}
          style={{
            width: "100%",
            background: "var(--bg-soft)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 5,
            padding: "6px 10px",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
            marginBottom: 14,
          }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Btn onClick={() => close(null)}>{tStatic("common.cancel")}</Btn>
          <Btn
            primary
            onClick={() => {
              const v = inputRef.current?.value.trim() ?? "";
              if (v) close(v);
            }}
          >
            {tStatic("common.confirm")}
          </Btn>
        </div>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px",
        fontSize: 13,
        borderRadius: 5,
        border: primary ? "1px solid var(--accent)" : "1px solid var(--border)",
        background: primary ? "var(--accent)" : "var(--bg-soft)",
        color: primary ? "#fff" : "var(--text)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
