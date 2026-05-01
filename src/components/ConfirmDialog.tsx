import { create } from "zustand";
import { tStatic } from "../lib/i18n";
import { Button } from "./ui/Button";

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
  message?: string,
  title?: string,
): Promise<ConfirmChoice> {
  return show({
    title: title ?? tStatic("confirm.unsavedTitle"),
    message: message ?? tStatic("confirm.unsavedMsg"),
    buttons: [
      { label: tStatic("common.cancel"), value: "cancel" },
      { label: tStatic("common.discard"), value: "discard" },
      { label: tStatic("common.save"), value: "save", primary: true },
    ],
  }) as Promise<ConfirmChoice>;
}

export function confirmDelete(
  name: string,
  isDir: boolean,
): Promise<boolean> {
  return show({
    title: tStatic(isDir ? "confirm.deleteDirTitle" : "confirm.deleteFileTitle"),
    message: tStatic(isDir ? "confirm.deleteDirMsg" : "confirm.deleteFileMsg", {
      name,
    }),
    buttons: [
      { label: tStatic("common.cancel"), value: "cancel" },
      { label: tStatic("common.delete"), value: "delete", danger: true },
    ],
  }).then((v) => v === "delete");
}

/** Generic three+-choice modal. Returns the value of the chosen button, or
 *  "cancel" if dismissed via Esc / outside-click. */
export function chooseAction(opts: {
  title: string;
  message: string;
  buttons: ButtonSpec[];
}): Promise<string> {
  return show(opts);
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
          boxShadow: "var(--shadow-modal)",
          padding: 20,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--text-soft)", marginBottom: 18 }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {buttons.map((b) => (
            <Button
              key={b.value}
              variant={b.danger ? "danger" : b.primary ? "primary" : "secondary"}
              onClick={() => close(b.value)}
              style={{ padding: "6px 16px", fontSize: 13 }}
            >
              {b.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
