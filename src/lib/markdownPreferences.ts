export interface MarkdownPreferences {
  documentTheme: "default" | "compact";
  focusParagraph: boolean;
  typewriter: boolean;
  imageDirectory: string;
  picgoEndpoint: string;
  preserveImageTargets: boolean;
  exportTemplate: "default" | "report" | "compact";
}
export const defaultMarkdownPreferences: MarkdownPreferences = { documentTheme: "default", focusParagraph: false, typewriter: false, imageDirectory: "assets", picgoEndpoint: "http://127.0.0.1:36677/upload", preserveImageTargets: true, exportTemplate: "default" };
export function imageDirectory(value: string) {
  const normalized = value.trim().replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = normalized.match(/^(?:[a-z]:\/|\/\/|\/)/i)?.[0] ?? "";
  const parts = normalized.slice(prefix.length).split("/");
  return parts.length && parts.every(p => !!p && p !== "." && p !== ".." && p !== "~" && !/[<>:"|?*\x00-\x1f]/.test(p)) ? prefix + parts.join("/") : "assets";
}
export function picgoEndpoint(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    const local = host === "localhost" || host === "[::1]" || /^127\.\d+\.\d+\.\d+$/.test(host);
    return local && ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash ? url.href : null;
  } catch { return null; }
}
export function normalizeMarkdownPreferences(input: Partial<MarkdownPreferences> | null | undefined): MarkdownPreferences {
  return { documentTheme: ["default", "compact"].includes(input?.documentTheme ?? "") ? input!.documentTheme! : "default",
    focusParagraph: input?.focusParagraph === true, typewriter: input?.typewriter === true,
    imageDirectory: imageDirectory(typeof input?.imageDirectory === "string" ? input.imageDirectory : "assets"),
    picgoEndpoint: picgoEndpoint(typeof input?.picgoEndpoint === "string" ? input.picgoEndpoint : "") ?? defaultMarkdownPreferences.picgoEndpoint,
    preserveImageTargets: input?.preserveImageTargets !== false,
    exportTemplate: ["default", "report", "compact"].includes(input?.exportTemplate ?? "") ? input!.exportTemplate! : "default" };
}
export const markdownLabels = {
 zh: { settings: "写作设置", theme: "文章主题", default: "默认", compact: "紧凑", focus: "段落聚焦", typewriter: "打字机模式", typewriterHelp: "开启后，正文光标随输入保持在页面中部。", images: "图片存放目录", preserve: "另存或移动时维护图片路径", template: "导出模板（HTML / PDF）", report: "报告", close: "完成", width: "图片宽度（像素）", auto: "自动" },
 en: { settings: "Writing settings", theme: "Document theme", default: "Default", compact: "Compact", focus: "Paragraph focus", typewriter: "Typewriter mode", typewriterHelp: "Keeps the text caret near the middle of the page while typing.", images: "Image folder", preserve: "Maintain image paths on Save As or move", template: "Export template (HTML / PDF)", report: "Report", close: "Done", width: "Image width (pixels)", auto: "Auto" },
};
