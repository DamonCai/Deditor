import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { renderMarkdown, renderCode } from "./markdown";
import { isMarkdown } from "./lang";
import { useEditorStore } from "../store/editor";
import { logError, logInfo } from "./logger";

const PRINT_AREA_ID = "deditor-print-area";

const PRINT_CSS = `
  #${PRINT_AREA_ID} {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #1f2328;
    background: #ffffff;
    max-width: 820px;
    margin: 0 auto;
    padding: 0;
    line-height: 1.7;
    font-size: 15px;
  }
  #${PRINT_AREA_ID} h1, #${PRINT_AREA_ID} h2, #${PRINT_AREA_ID} h3, #${PRINT_AREA_ID} h4 { font-weight: 600; line-height: 1.3; margin: 1.4em 0 0.6em; }
  #${PRINT_AREA_ID} h1 { font-size: 2em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  #${PRINT_AREA_ID} h2 { font-size: 1.5em; border-bottom: 1px solid #d0d7de; padding-bottom: 0.3em; }
  #${PRINT_AREA_ID} h3 { font-size: 1.25em; }
  #${PRINT_AREA_ID} p { margin: 0.8em 0; }
  #${PRINT_AREA_ID} a { color: #0969da; text-decoration: none; }
  #${PRINT_AREA_ID} code { background: #eaeef2; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; font-family: "SF Mono", Menlo, Consolas, monospace; }
  #${PRINT_AREA_ID} pre { margin: 1em 0; padding: 0; border-radius: 8px; overflow: auto; background: #f6f8fa; border: 1px solid #d0d7de; }
  #${PRINT_AREA_ID} pre code { background: transparent; padding: 16px; display: block; font-size: 13px; line-height: 1.55; }
  #${PRINT_AREA_ID} pre.shiki { padding: 16px; }
  #${PRINT_AREA_ID} pre.shiki code { padding: 0; }
  #${PRINT_AREA_ID} blockquote { margin: 1em 0; padding: 0.4em 1em; color: #57606a; border-left: 4px solid #d0d7de; background: #f6f8fa; }
  #${PRINT_AREA_ID} ul, #${PRINT_AREA_ID} ol { padding-left: 1.6em; margin: 0.6em 0; }
  #${PRINT_AREA_ID} table { border-collapse: collapse; margin: 1em 0; }
  #${PRINT_AREA_ID} th, #${PRINT_AREA_ID} td { border: 1px solid #d0d7de; padding: 6px 12px; }
  #${PRINT_AREA_ID} th { background: #f6f8fa; }
  #${PRINT_AREA_ID} hr { border: none; border-top: 1px solid #d0d7de; margin: 1.6em 0; }
  #${PRINT_AREA_ID} img { max-width: 100%; }
  #${PRINT_AREA_ID} pre, #${PRINT_AREA_ID} table, #${PRINT_AREA_ID} blockquote, #${PRINT_AREA_ID} img {
    page-break-inside: avoid;
  }
  #${PRINT_AREA_ID} h1, #${PRINT_AREA_ID} h2, #${PRINT_AREA_ID} h3 {
    page-break-after: avoid;
  }
`;

let printStyleEl: HTMLStyleElement | null = null;

function ensurePrintCss() {
  if (printStyleEl) return;
  printStyleEl = document.createElement("style");
  printStyleEl.id = "deditor-print-style";
  printStyleEl.textContent = PRINT_CSS;
  document.head.appendChild(printStyleEl);
}

function ensurePrintArea(): HTMLDivElement {
  let area = document.getElementById(PRINT_AREA_ID) as HTMLDivElement | null;
  if (!area) {
    area = document.createElement("div");
    area.id = PRINT_AREA_ID;
    document.body.appendChild(area);
  }
  return area;
}

async function buildBodyHtml(source: string, filePath: string | null): Promise<string> {
  if (isMarkdown(filePath)) {
    return await renderMarkdown(source, { theme: "light" });
  }
  return await renderCode(source, filePath, { theme: "light" });
}

function buildStandalonePage(body: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${PRINT_CSS.replace(new RegExp(`#${PRINT_AREA_ID}`, "g"), "body")}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activeTab() {
  const { tabs, activeId } = useEditorStore.getState();
  return tabs.find((t) => t.id === activeId) ?? null;
}

export async function exportHtml() {
  const t = activeTab();
  if (!t) return;
  const target = await save({
    defaultPath: defaultName(t.filePath, "html"),
    filters: [{ name: "HTML", extensions: ["html"] }],
  });
  if (!target) return;
  const body = await buildBodyHtml(t.content, t.filePath);
  const html = buildStandalonePage(body, t.filePath?.split(/[\\/]/).pop() ?? "Document");
  await invoke("write_text_file", { path: target, content: html });
  logInfo(`exported HTML: ${target}`);
}

export async function exportPdf() {
  const t = activeTab();
  if (!t) return;
  ensurePrintCss();
  const area = ensurePrintArea();
  try {
    const body = await buildBodyHtml(t.content, t.filePath);
    area.innerHTML = body;
    // give the layout/style engine one frame so the print snapshot includes it
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await invoke("print_window");
    logInfo("export PDF: print dialog opened");
  } catch (err) {
    logError("export PDF failed", err);
    alert(
      `导出 PDF 失败: ${err instanceof Error ? err.message : err}\n你也可以先"导出 HTML"再用浏览器打印另存为 PDF。`,
    );
  } finally {
    // Print dialog is async; clear after a delay so the print snapshot is preserved.
    setTimeout(() => {
      area.innerHTML = "";
    }, 4000);
  }
}

function defaultName(filePath: string | null, ext: string): string {
  if (!filePath) return `untitled.${ext}`;
  const base = filePath.split(/[\\/]/).pop() ?? `untitled.${ext}`;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base) + "." + ext;
}
