export interface MarkdownPreferences {
  documentTheme: "default" | "serif" | "compact";
  focusParagraph: boolean;
  typewriter: boolean;
  imageDirectory: string;
  preserveImageTargets: boolean;
  exportTemplate: "default" | "report" | "compact";
}
export const defaultMarkdownPreferences: MarkdownPreferences = { documentTheme: "default", focusParagraph: false, typewriter: false, imageDirectory: "assets", preserveImageTargets: true, exportTemplate: "default" };
export function imageDirectory(value: string) {
  const parts = value.trim().replace(/\\/g, "/").split("/");
  return parts.length && parts.every(p => !!p && p !== "." && p !== ".." && !/[<>:"|?*\x00-\x1f]/.test(p)) ? parts.join("/") : "assets";
}
export function normalizeMarkdownPreferences(input: Partial<MarkdownPreferences> | null | undefined): MarkdownPreferences {
  return { documentTheme: ["default", "serif", "compact"].includes(input?.documentTheme ?? "") ? input!.documentTheme! : "default",
    focusParagraph: input?.focusParagraph === true, typewriter: input?.typewriter === true,
    imageDirectory: imageDirectory(typeof input?.imageDirectory === "string" ? input.imageDirectory : "assets"),
    preserveImageTargets: input?.preserveImageTargets !== false,
    exportTemplate: ["default", "report", "compact"].includes(input?.exportTemplate ?? "") ? input!.exportTemplate! : "default" };
}
export const markdownLabels = {
 zh: { settings: "写作设置", theme: "文章主题", default: "默认", serif: "衬线", compact: "紧凑", focus: "段落聚焦", typewriter: "打字机模式", typewriterHelp: "开启后，正文光标随输入保持在页面中部。", images: "图片存放目录", preserve: "另存或移动时维护图片路径", template: "导出模板（HTML / PDF）", report: "报告", close: "完成", width: "图片宽度（像素）", auto: "自动" },
 en: { settings: "Writing settings", theme: "Document theme", default: "Default", serif: "Serif", compact: "Compact", focus: "Paragraph focus", typewriter: "Typewriter mode", typewriterHelp: "Keeps the text caret near the middle of the page while typing.", images: "Image folder", preserve: "Maintain image paths on Save As or move", template: "Export template (HTML / PDF)", report: "Report", close: "Done", width: "Image width (pixels)", auto: "Auto" },
};
