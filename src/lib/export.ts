import { exportAppearance, exportTemplateCss, type ExportAppearance } from "./markdownExport/templates";
import previewCss from "../preview.css?raw";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "../store/editor";
import { logInfo } from "./logger";
import { tStatic } from "./i18n";
import {
  blobData,
  documentBlocks,
  plainText,
  prepareDocument,
  rasterImage,
  svgData,
  svgSource,
  type ExportSnapshot,
} from "./markdownExport/document";

export type ExportFormat =
  | "html"
  | "pdf"
  | "docx"
  | "pptx"
  | "txt"
  | "svg"
  | "png";
export const EXPORT_FORMATS: ExportFormat[] = [
  "html",
  "pdf",
  "docx",
  "pptx",
  "txt",
  "svg",
  "png",
];

const PRINT_AREA_ID = "deditor-print-area";

const PRINT_CSS = `
  #${PRINT_AREA_ID} {
    --preview-text:#343b46;--preview-heading:#202631;--preview-muted:#606b7a;--preview-link:#2864cf;--preview-code:#7350a2;--preview-code-bg:#f5f6f8;--preview-rule:#e5e8ed;
    height:auto;overflow:visible;color-scheme:light;
    font-family: var(--md-font-family);
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
  #${PRINT_AREA_ID} img, #${PRINT_AREA_ID} svg { max-width: 100%; height: auto; }
  #${PRINT_AREA_ID} pre { white-space: pre-wrap; overflow-wrap: anywhere; }
  #${PRINT_AREA_ID} table { width: 100%; table-layout: fixed; overflow-wrap: anywhere; }
  #${PRINT_AREA_ID} thead { display: table-header-group; }
  #${PRINT_AREA_ID} .katex { font-size: 1.1em; }
  #${PRINT_AREA_ID} pre, #${PRINT_AREA_ID} table, #${PRINT_AREA_ID} blockquote, #${PRINT_AREA_ID} img {
    break-inside: auto;
  }
  #${PRINT_AREA_ID} h1, #${PRINT_AREA_ID} h2, #${PRINT_AREA_ID} h3 {
    page-break-after: avoid;
  }
`;

export function defaultName(filePath: string | null, ext: string): string {
  const base = filePath?.split(/[\\/]/).pop() || "untitled";
  return base.replace(/\.[^.]+$/, "") + "." + ext;
}

export async function standalonePage(
  body: string,
  title: string,
  theme: "light" | "dark" = "light",
  appearance: Partial<ExportAppearance> = {},
): Promise<string> {
  const options = exportAppearance(appearance);
  let mathCss = "";
  if (body.includes('class="katex')) {
    const { katexExportCss } = await import("./markdownExport/mathCss");
    mathCss = katexExportCss();
  }
  const escaped = title.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
  const dark = theme === "dark";
  const colors = dark
    ? "--bg:#1e1f22;--border:#34363a;--text-soft:#868a91;--bg-mute:#393b40;--error-text:#ff8e96;--error-bg:rgba(255,142,150,.1)"
    : "--bg:#fff;--border:#e2e4e8;--text-soft:#6c707e;--bg-mute:#ebecf0;--error-text:#c22932;--error-bg:rgba(217,45,54,.08)";
  return `<!doctype html>\n<html${dark ? ' class="dark"' : ""} lang="${useEditorStore.getState().language === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaped}</title><style>
:root{${colors};color-scheme:${theme}}*{box-sizing:border-box}body{margin:0;background:var(--bg)}
${previewCss}
.preview{height:auto;overflow:visible;max-width:924px;margin:0 auto}
@media(max-width:600px){.preview{padding:24px 20px 48px}}
@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.preview{height:auto;overflow:visible}}
${exportTemplateCss}
${mathCss}</style></head><body><main class="preview" data-md-theme="${options.documentTheme}" data-export-template="${options.exportTemplate}">${body}</main></body></html>`;
}

let exporting = false;
/** The caller owns the immutable snapshot. Dialog cancellation causes no write. */
export async function exportMarkdown(
  snapshot: ExportSnapshot,
  format: ExportFormat,
  diagramIndex = 0,
): Promise<boolean> {
  if (exporting) throw new Error(tStatic("export.busy"));
  const theme =
    format === "html"
      ? (snapshot.theme ?? useEditorStore.getState().theme)
      : "light";
  exporting = true;
  let prepared: Awaited<ReturnType<typeof prepareDocument>> | undefined;
  try {
    const diagram = format === "svg" || format === "png";
    const name = defaultName(snapshot.filePath, format);
    const target =
      format === "pdf"
        ? null
        : await save({
            defaultPath: diagram
              ? name.replace(
                  `.${format}`,
                  `-diagram-${diagramIndex + 1}.${format}`,
                )
              : name,
            filters: [{ name: format.toUpperCase(), extensions: [format] }],
          });
    if (format !== "pdf" && !target) return false;
    prepared = await prepareDocument(snapshot, {
      diagramsOnly: diagram,
      diagramIndex: diagram ? diagramIndex : undefined,
      plain: format === "txt",
      theme,
    });
    const { root } = prepared;
    if (format === "pdf") {
      await printDocument(root, snapshot);
    } else if (format === "html") {
      await invoke("write_text_file", {
        path: target,
        content: await standalonePage(
          root.innerHTML,
          name.replace(/\.html$/, ""),
          theme,
          snapshot,
        ),
      });
    } else if (diagram) {
      const svg = root.querySelector("svg");
      if (!svg) throw new Error(tStatic("export.noDiagrams"));
      const source = svgSource(svg);
      if (format === "svg")
        await invoke("write_text_file", { path: target, content: source });
      else
        await invoke("write_binary_file", {
          path: target,
          data: (await rasterImage(svgData(source), 2)).data.split(",")[1],
        });
    } else {
      const blocks = await documentBlocks(root, format !== "txt");
      if (format === "txt")
        await invoke("write_text_file", {
          path: target,
          content: plainText(blocks),
        });
      else {
        const { wordDocument, slideDocument } =
          await import("./markdownExport/office");
        const blob = await (format === "docx" ? wordDocument : slideDocument)(
          blocks,
          name.replace(/\.[^.]+$/, ""),
        );
        await invoke("write_binary_file", {
          path: target,
          data: (await blobData(blob)).split(",")[1],
        });
      }
    }
    logInfo(`exported ${format.toUpperCase()}: ${target || "print dialog"}`);
    return true;
  } finally {
    prepared?.dispose();
    exporting = false;
  }
}

async function printDocument(root: HTMLElement, appearance: Partial<ExportAppearance> = {}) {
  const options = exportAppearance(appearance);
  let style = document.getElementById("deditor-print-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "deditor-print-style";
    document.head.appendChild(style);
  }
  style.textContent = previewCss + PRINT_CSS + exportTemplateCss.replaceAll(".preview", `#${PRINT_AREA_ID}.preview`) + `
#${PRINT_AREA_ID}[data-md-theme="compact"] { line-height:1.6; }
#${PRINT_AREA_ID}[data-md-theme="compact"] p { margin:.65em 0; }`;
  let area = document.getElementById(PRINT_AREA_ID);
  if (!area) {
    area = document.createElement("div");
    area.id = PRINT_AREA_ID;
    document.body.appendChild(area);
  }
  area.className = "preview";
  area.dataset.mdTheme = options.documentTheme; area.dataset.exportTemplate = options.exportTemplate;
  area.innerHTML = root.innerHTML;
  await Promise.all(
    Array.from(area.querySelectorAll("img"), (img) => img.decode()),
  );
  await document.fonts?.ready;
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  // Keep the last snapshot until replaced. Native print_window can return before
  // the dialog closes; no timer may erase a pending print preview.
  await invoke("print_window");
}
