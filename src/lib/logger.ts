import { invoke } from "@tauri-apps/api/core";

type Level = "error" | "warn" | "info" | "debug" | "trace";

function send(level: Level, message: string): void {
  // Fire-and-forget; don't let logging failures cascade into the app.
  invoke("frontend_log", { level, message }).catch(() => {
    /* no-op */
  });
}

export function logError(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : err != null ? String(err) : "";
  send("error", detail ? `${msg}: ${detail}` : msg);
}

export function logWarn(msg: string, err?: unknown): void {
  const detail = err instanceof Error ? `${err.message}` : err != null ? String(err) : "";
  send("warn", detail ? `${msg}: ${detail}` : msg);
}

export function logInfo(msg: string): void {
  send("info", msg);
}

export function logDebug(msg: string): void {
  send("debug", msg);
}

export function installGlobalLogHandlers(): void {
  window.addEventListener("error", (event) => {
    const stack =
      event.error instanceof Error ? `\n${event.error.stack ?? ""}` : "";
    logError(
      `uncaught error: ${event.message} at ${event.filename}:${event.lineno}:${event.colno}${stack}`,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const detail =
      reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ""}`
        : String(reason);
    logError(`unhandled promise rejection: ${detail}`);
  });

  logInfo(`webview ready (UA: ${navigator.userAgent})`);
}
