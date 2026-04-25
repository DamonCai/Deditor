import { create } from "zustand";

export type ConfirmChoice = "save" | "discard" | "cancel";

export interface ButtonSpec {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

interface State {
  open: boolean;
  title: string;
  message: string;
  buttons: ButtonSpec[];
  resolve: ((c: string) => void) | null;
}

const useConfirm = create<State>(() => ({
  open: false,
  title: "",
  message: "",
  buttons: [],
  resolve: null,
}));

function show(opts: {
  title: string;
  message: string;
  buttons: ButtonSpec[];
}): Promise<string> {
  return new Promise((resolve) => {
    useConfirm.setState({
      open: true,
      title: opts.title,
      message: opts.message,
      buttons: opts.buttons,
      resolve,
    });
  });
}

export function confirmUnsaved(
  message = "当前文件有未保存修改，是否保存？",
  title = "未保存修改",
): Promise<ConfirmChoice> {
  return show({
    title,
    message,
    buttons: [
      { label: "取消", value: "cancel" },
      { label: "不保存", value: "discard" },
      { label: "保存", value: "save", primary: true },
    ],
  }) as Promise<ConfirmChoice>;
}

export function confirmDelete(
  name: string,
  isDir: boolean,
): Promise<boolean> {
  return show({
    title: isDir ? "删除文件夹" : "删除文件",
    message: isDir
      ? `确定要删除文件夹 "${name}" 及其全部内容吗？此操作不可恢复。`
      : `确定要删除文件 "${name}" 吗？此操作不可恢复。`,
    buttons: [
      { label: "取消", value: "cancel" },
      { label: "删除", value: "delete", danger: true },
    ],
  }).then((v) => v === "delete");
}

export default function ConfirmDialog() {
  const { open, title, message, buttons, resolve } = useConfirm();
  if (!open) return null;

  const close = (value: string) => {
    resolve?.(value);
    useConfirm.setState({ open: false, resolve: null });
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
        if (e.target === e.currentTarget) close("cancel");
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") close("cancel");
        if (e.key === "Enter") {
          const primary = buttons.find((b) => b.primary || b.danger);
          if (primary) close(primary.value);
        }
      }}
      tabIndex={-1}
      ref={(el) => el?.focus()}
    >
      <div
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
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--text-soft)", marginBottom: 18 }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {buttons.map((b) => (
            <Btn key={b.value} primary={b.primary} danger={b.danger} onClick={() => close(b.value)}>
              {b.label}
            </Btn>
          ))}
        </div>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  primary,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
}) {
  let bg = "var(--bg-soft)";
  let color = "var(--text)";
  let border = "1px solid var(--border)";
  if (danger) {
    bg = "#dc2626";
    color = "#fff";
    border = "1px solid #dc2626";
  } else if (primary) {
    bg = "var(--accent)";
    color = "#fff";
    border = "1px solid var(--accent)";
  }
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 16px",
        fontSize: 13,
        borderRadius: 5,
        border,
        background: bg,
        color,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
