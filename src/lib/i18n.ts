import { useEditorStore } from "../store/editor";

export type Lang = "zh" | "en";

const ZH: Record<string, string> = {
  // common
  "common.cancel": "取消",
  "common.confirm": "确定",
  "common.close": "关闭",
  "common.save": "保存",
  "common.discard": "不保存",
  "common.delete": "删除",
  "common.untitled": "未命名",
  "common.loading": "加载中…",

  // titlebar
  "titlebar.sidebar": "目录",
  "titlebar.openFolder": "打开文件夹",
  "titlebar.new": "新建",
  "titlebar.open": "打开",
  "titlebar.save": "保存",
  "titlebar.saveAs": "另存",
  "titlebar.preview": "预览",
  "titlebar.exportHtml": "导出 HTML",
  "titlebar.exportPdf": "导出 PDF",
  "titlebar.toLight": "切到亮色主题",
  "titlebar.toDark": "切到暗色主题",
  "titlebar.toEnglish": "Switch to English",
  "titlebar.toChinese": "切换为中文",

  // statusbar
  "statusbar.untitled": "未命名",
  "statusbar.lines": "行",
  "statusbar.chars": "字符",
  "statusbar.light": "亮色",
  "statusbar.dark": "暗色",

  // file tree
  "filetree.pathPlaceholder": "输入路径添加工作区 (~ 支持)",
  "filetree.selectFolder": "选择文件夹（可多选）",
  "filetree.collapse": "收起侧栏 (Cmd/Ctrl+B)",
  "filetree.expand": "展开侧栏 (Cmd/Ctrl+B)",
  "filetree.emptyHint": "上方粘路径回车，或点 📂 选择文件夹（可一次选多个）",
  "filetree.newFileInWs": "在此工作区新建文件",
  "filetree.newDirInWs": "在此工作区新建文件夹",
  "filetree.revealInFinder": "在 Finder 中显示",
  "filetree.removeFromWs": '从工作区移除 "{name}"',
  "filetree.newFile": "新建文件",
  "filetree.newDir": "新建文件夹",
  "filetree.deleteDir": "删除文件夹",
  "filetree.deleteFile": "删除文件",
  "filetree.renameFile": "重命名文件",
  "filetree.renameDir": "重命名文件夹",
  "filetree.renameTitle": "重命名",
  "filetree.renameLabel": '重命名 "{name}"',
  "filetree.renameFailed": "重命名失败: {err}",
  "filetree.locatedAt": "位于: {parent}",
  "filetree.fileNamePlaceholder": "name.md",
  "filetree.dirNamePlaceholder": "folder-name",
  "filetree.empty": "(空)",
  "filetree.createFailed": "创建失败: {err}",
  "filetree.deleteFailed": "删除失败: {err}",
  "filetree.selectForCompare": "选为对比文件",
  "filetree.unmarkForCompare": "取消对比标记",
  "filetree.compareWithSelected": '与 "{name}" 对比',
  "filetree.compareBinaryRefused": "二进制文件不支持文本对比。",

  // diff
  "diff.identical": "两个文件内容完全相同。",

  // Goto Anything (Cmd+P)
  "goto.placeholder": "输入文件名…（↑↓ 选择，Enter 打开，Esc 关闭）",
  "goto.placeholderNoWorkspace": "请先添加工作区，然后用 Cmd/Ctrl+P 搜索文件",
  "goto.indexing": "正在索引工作区…",
  "goto.empty": "工作区为空。",
  "goto.noWorkspaceHint": "尚未添加工作区，无法搜索文件。",
  "goto.noMatch": "没有匹配的文件。",
  "goto.truncated": "文件数量过多，已截断到前 50,000 个。",

  // tabbar
  "tabbar.newTab": "新建标签 (Cmd/Ctrl+N)",
  "tabbar.allTabs": "所有标签 ({n})",
  "tabbar.close": "关闭",
  "tabbar.closeOthers": "关闭其他",
  "tabbar.closeShortcut": "关闭 (Cmd/Ctrl+W)",
  "tabbar.searchPlaceholder": "搜索 {n} 个标签...",
  "tabbar.noMatches": "没有匹配",

  // json toolbar
  "json.format": "格式化",
  "json.formatTip":
    "智能格式化：标准 JSON / 单引号宽松 JSON / 反转义后的 JSON 字符串都能识别",
  "json.compact": "压缩",
  "json.compactTip": "压成单行（接受宽松 JSON 输入）",
  "json.sortKeys": "按键排序",
  "json.sortKeysTip": "递归排序所有对象的键，再格式化",
  "json.formatFailed": "格式化失败: {err}",

  // markdown toolbar
  "md.bold": "加粗 (**…**)",
  "md.italic": "斜体 (*…*)",
  "md.strikethrough": "删除线 (~~…~~)",
  "md.inlineCode": "行内代码 (`…`)",
  "md.color": "文字颜色",
  "md.highlight": "高亮（背景色）",
  "md.h1": "一级标题 (#)",
  "md.h2": "二级标题 (##)",
  "md.h3": "三级标题 (###)",
  "md.ulist": "无序列表 (- )",
  "md.olist": "有序列表 (1. )",
  "md.tasklist": "任务列表 (- [ ])",
  "md.quote": "引用块 (> )",
  "md.hr": "水平分割线 (---)",
  "md.codeblock": "代码块 (```)",
  "md.table": "表格",
  "md.tableTpl": "\n| 列 1 | 列 2 |\n| ---- | ---- |\n| 数据 | 数据 |\n",
  "md.link": "链接",
  "md.linkPromptTitle": "插入链接",
  "md.image": "图片",
  "md.imagePromptTitle": "插入图片",
  "md.imageAltLabel": "图片描述（alt）",
  "md.imageUrlLabel": "图片地址（URL）",
  "md.imageDefaultAlt": "图片",
  "md.fontSize": "字号",
  "md.smaller": "字号小一点",
  "md.bigger": "字号大一点",
  "md.linkDefaultText": "链接",

  // preview
  "preview.maximize": "放大预览（隐藏编辑器）",
  "preview.restore": "还原（恢复编辑器）",

  // confirm dialog
  "confirm.unsavedTitle": "未保存修改",
  "confirm.unsavedMsg": "当前文件有未保存修改，是否保存？",
  "confirm.deleteFileTitle": "删除文件",
  "confirm.deleteDirTitle": "删除文件夹",
  "confirm.deleteFileMsg": '确定要删除文件 "{name}" 吗？此操作不可恢复。',
  "confirm.deleteDirMsg": '确定要删除文件夹 "{name}" 及其全部内容吗？此操作不可恢复。',

  // editor
  "editor.pasteImageNoTarget": "请先保存文件或打开文件夹后再粘贴图片",
  "editor.saveImageFailed": "保存图片失败: {err}",
  "editor.cut": "剪切",
  "editor.copy": "复制",
  "editor.paste": "粘贴",
  "editor.selectAll": "全选",
  "editor.find": "查找…",

  // fileio
  "fileio.unsavedClose": '"{name}" 有未保存修改，是否保存后再关闭？',
  "fileio.cantOpenLocation": "无法打开位置: {err}",

  // export
  "export.pdfFailed":
    '导出 PDF 失败: {err}\n你也可以先"导出 HTML"再用浏览器打印另存为 PDF。',

  // markdown
  "markdown.plantumlError": "PlantUML 渲染失败: {error}",
  "markdown.plantumlLoading": "正在加载 PlantUML 图表…",
  "markdown.plantumlOffline":
    "PlantUML 服务无法访问（离线或超时）— 显示原始源码作为替代",
};

const EN: Record<string, string> = {
  // common
  "common.cancel": "Cancel",
  "common.confirm": "OK",
  "common.close": "Close",
  "common.save": "Save",
  "common.discard": "Don't Save",
  "common.delete": "Delete",
  "common.untitled": "Untitled",
  "common.loading": "Loading…",

  // titlebar
  "titlebar.sidebar": "Sidebar",
  "titlebar.openFolder": "Open Folder",
  "titlebar.new": "New",
  "titlebar.open": "Open",
  "titlebar.save": "Save",
  "titlebar.saveAs": "Save As",
  "titlebar.preview": "Preview",
  "titlebar.exportHtml": "Export HTML",
  "titlebar.exportPdf": "Export PDF",
  "titlebar.toLight": "Switch to light theme",
  "titlebar.toDark": "Switch to dark theme",
  "titlebar.toEnglish": "Switch to English",
  "titlebar.toChinese": "切换为中文",

  // statusbar
  "statusbar.untitled": "Untitled",
  "statusbar.lines": "lines",
  "statusbar.chars": "chars",
  "statusbar.light": "Light",
  "statusbar.dark": "Dark",

  // file tree
  "filetree.pathPlaceholder": "Type a path to add a workspace (~ supported)",
  "filetree.selectFolder": "Select folder (multi-select)",
  "filetree.collapse": "Collapse sidebar (Cmd/Ctrl+B)",
  "filetree.expand": "Expand sidebar (Cmd/Ctrl+B)",
  "filetree.emptyHint": "Paste a path above and press Enter, or click 📂 to pick folders",
  "filetree.newFileInWs": "New File in this Workspace",
  "filetree.newDirInWs": "New Folder in this Workspace",
  "filetree.revealInFinder": "Reveal in Finder",
  "filetree.removeFromWs": 'Remove "{name}" from Workspace',
  "filetree.newFile": "New File",
  "filetree.newDir": "New Folder",
  "filetree.deleteDir": "Delete Folder",
  "filetree.deleteFile": "Delete File",
  "filetree.renameFile": "Rename File",
  "filetree.renameDir": "Rename Folder",
  "filetree.renameTitle": "Rename",
  "filetree.renameLabel": 'Rename "{name}"',
  "filetree.renameFailed": "Rename failed: {err}",
  "filetree.locatedAt": "Located in: {parent}",
  "filetree.fileNamePlaceholder": "name.md",
  "filetree.dirNamePlaceholder": "folder-name",
  "filetree.empty": "(empty)",
  "filetree.createFailed": "Create failed: {err}",
  "filetree.deleteFailed": "Delete failed: {err}",
  "filetree.selectForCompare": "Select for Compare",
  "filetree.unmarkForCompare": "Clear Compare Selection",
  "filetree.compareWithSelected": 'Compare with "{name}"',
  "filetree.compareBinaryRefused": "Binary files can't be compared as text.",

  // diff
  "diff.identical": "The two files are identical.",

  // Goto Anything (Cmd+P)
  "goto.placeholder": "Type a file name… (↑↓ to navigate, Enter to open, Esc to dismiss)",
  "goto.placeholderNoWorkspace": "Add a workspace first, then press Cmd/Ctrl+P to search files",
  "goto.indexing": "Indexing workspace…",
  "goto.empty": "Workspace is empty.",
  "goto.noWorkspaceHint": "No workspace added — nothing to search.",
  "goto.noMatch": "No matching files.",
  "goto.truncated": "Too many files; truncated to the first 50,000.",

  // tabbar
  "tabbar.newTab": "New tab (Cmd/Ctrl+N)",
  "tabbar.allTabs": "All tabs ({n})",
  "tabbar.close": "Close",
  "tabbar.closeOthers": "Close Others",
  "tabbar.closeShortcut": "Close (Cmd/Ctrl+W)",
  "tabbar.searchPlaceholder": "Search {n} tabs…",
  "tabbar.noMatches": "No matches",

  // json toolbar
  "json.format": "Format",
  "json.formatTip":
    "Smart format — auto-detects strict JSON, loose JSON (single-quoted / unquoted keys), or escaped JSON string",
  "json.compact": "Compact",
  "json.compactTip": "Minify to a single line (loose input accepted)",
  "json.sortKeys": "Sort Keys",
  "json.sortKeysTip": "Recursively sort object keys, then pretty-print",
  "json.formatFailed": "Format failed: {err}",

  // markdown toolbar
  "md.bold": "Bold (**…**)",
  "md.italic": "Italic (*…*)",
  "md.strikethrough": "Strikethrough (~~…~~)",
  "md.inlineCode": "Inline code (`…`)",
  "md.color": "Text color",
  "md.highlight": "Highlight (background color)",
  "md.h1": "Heading 1 (#)",
  "md.h2": "Heading 2 (##)",
  "md.h3": "Heading 3 (###)",
  "md.ulist": "Unordered list (- )",
  "md.olist": "Ordered list (1. )",
  "md.tasklist": "Task list (- [ ])",
  "md.quote": "Quote block (> )",
  "md.hr": "Horizontal rule (---)",
  "md.codeblock": "Code block (```)",
  "md.table": "Table",
  "md.tableTpl": "\n| Col 1 | Col 2 |\n| ----- | ----- |\n| data  | data  |\n",
  "md.link": "Link",
  "md.linkPromptTitle": "Insert Link",
  "md.image": "Image",
  "md.imagePromptTitle": "Insert Image",
  "md.imageAltLabel": "Alt text",
  "md.imageUrlLabel": "Image URL",
  "md.imageDefaultAlt": "image",
  "md.fontSize": "Size",
  "md.smaller": "Smaller font",
  "md.bigger": "Larger font",
  "md.linkDefaultText": "link",

  // preview
  "preview.maximize": "Maximize preview (hide editor)",
  "preview.restore": "Restore (show editor)",

  // confirm dialog
  "confirm.unsavedTitle": "Unsaved Changes",
  "confirm.unsavedMsg": "This file has unsaved changes. Save?",
  "confirm.deleteFileTitle": "Delete File",
  "confirm.deleteDirTitle": "Delete Folder",
  "confirm.deleteFileMsg": 'Delete file "{name}"? This cannot be undone.',
  "confirm.deleteDirMsg":
    'Delete folder "{name}" and all its contents? This cannot be undone.',

  // editor
  "editor.pasteImageNoTarget": "Save the file or open a folder before pasting an image.",
  "editor.saveImageFailed": "Failed to save image: {err}",
  "editor.cut": "Cut",
  "editor.copy": "Copy",
  "editor.paste": "Paste",
  "editor.selectAll": "Select All",
  "editor.find": "Find…",

  // fileio
  "fileio.unsavedClose": '"{name}" has unsaved changes. Save before closing?',
  "fileio.cantOpenLocation": "Cannot open location: {err}",

  // export
  "export.pdfFailed":
    'Export PDF failed: {err}\nYou can also "Export HTML" first and print to PDF in the browser.',

  // markdown
  "markdown.plantumlError": "PlantUML render failed: {error}",
  "markdown.plantumlLoading": "Loading PlantUML diagram…",
  "markdown.plantumlOffline":
    "PlantUML service unreachable (offline or timed out) — showing source instead",
};

const DICTS: Record<Lang, Record<string, string>> = { zh: ZH, en: EN };

/** Pick a default language for the very first launch. English by default;
 *  persisted user choice overrides this on subsequent launches. */
export function detectInitialLang(): Lang {
  return "en";
}

/** Lookup a key in the active language with optional `{name}`-style params.
 *  Falls back to zh if the key is missing in the requested locale. */
export function t(
  key: string,
  lang: Lang,
  params?: Record<string, string | number>,
): string {
  const raw = DICTS[lang]?.[key] ?? DICTS.zh[key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) =>
    params[k] != null ? String(params[k]) : `{${k}}`,
  );
}

/** Imperative variant for non-component code (lib/*.ts etc.). Reads the
 *  current language from the store at call time. */
export function tStatic(
  key: string,
  params?: Record<string, string | number>,
): string {
  const lang = useEditorStore.getState().language;
  return t(key, lang, params);
}

/** React hook: returns a `t(key, params?)` bound to the current language. */
export function useT(): (
  key: string,
  params?: Record<string, string | number>,
) => string {
  const lang = useEditorStore((s) => s.language);
  return (key, params) => t(key, lang, params);
}
