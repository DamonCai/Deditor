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
  "statusbar.settings": "设置（Cmd/Ctrl+,）",
  "statusbar.lnCol": "行 {line}, 列 {col}",
  "statusbar.cursor": "光标位置（行号, 列号）",
  "statusbar.eol": "行尾符（LF=Unix / CRLF=Windows）",
  "statusbar.encoding": "文件编码",

  // settings dialog
  "settings.title": "设置",
  "settings.done": "完成",
  "settings.reset": "恢复默认",
  "settings.general.heading": "通用",
  "settings.general.theme": "主题",
  "settings.general.themeLight": "亮色",
  "settings.general.themeDark": "暗色",
  "settings.general.language": "语言",
  "settings.general.fontSize": "编辑器字号",
  "settings.general.autoSave": "自动保存",
  "settings.general.autoSaveOff": "关闭",
  "settings.general.autoSaveBlur": "失焦时",
  "settings.general.autoSaveDelay": "停止编辑 1.5s 后",
  "settings.editor.heading": "编辑器",
  "settings.editor.softWrap": "自动换行（关闭后超长行会出现水平滚动条）",
  "settings.editor.indentGuides": "显示缩进引导线",
  "settings.editor.whitespace": "显示空白字符（· 表示空格，→ 表示制表符）",
  "settings.editor.minimap": "显示右侧迷你地图（minimap）",
  "settings.shortcuts.intro": "在这里关闭与你系统/输入法/其他应用冲突的快捷键。菜单项即使关闭快捷键也可以继续点击使用。",
  "settings.shortcuts.builtinNote": "标准编辑快捷键（Cmd/Ctrl+Z 撤销、Cmd/Ctrl+F 查找、Cmd/Ctrl+D 选下一个匹配等）由 CodeMirror 提供，无法在此关闭。",
  "settings.shortcuts.group.file": "文件",
  "settings.shortcuts.group.nav": "导航",
  "settings.shortcuts.group.editor": "编辑",
  "shortcut.file.new": "新建标签",
  "shortcut.file.open": "打开文件",
  "shortcut.file.openFolder": "打开文件夹（添加为工作区）",
  "shortcut.file.save": "保存",
  "shortcut.file.saveAs": "另存为",
  "shortcut.file.closeTab": "关闭当前标签",
  "shortcut.nav.gotoAnything": "跨工作区模糊搜索文件（Goto Anything）",
  "shortcut.nav.commandPalette": "命令面板（搜所有命令并执行）",
  "shortcut.nav.gotoSymbol": "跳转到符号（当前文件 outline）",
  "shortcut.nav.findInFiles": "全工作区文本搜索（Find in Files）",
  "shortcut.nav.toggleSidebar": "开关左侧文件树",
  "shortcut.nav.openSettings": "打开设置",
  "shortcut.nav.zenMode": "切换专注模式（隐藏所有界面 chrome）",
  "shortcut.nav.splitEditor": "切换分屏编辑（同一文件双视图）",
  "shortcut.editor.addCursorAbove": "在上一行加一个光标",
  "shortcut.editor.addCursorBelow": "在下一行加一个光标",
  "shortcut.editor.selectAllMatches": "选中所有相同词",

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

  // Command Palette (Cmd+Shift+P)
  "cmdpalette.placeholder": "输入命令名…（↑↓ 选择，Enter 执行，Esc 关闭）",
  "cmdpalette.noMatch": "没有匹配的命令。",
  "cmdpalette.group.file": "文件",
  "cmdpalette.group.view": "视图",
  "cmdpalette.group.nav": "导航",
  "cmdpalette.group.editor": "编辑",
  "cmd.file.new": "新建标签",
  "cmd.file.open": "打开文件…",
  "cmd.file.openFolder": "打开文件夹（添加为工作区）…",
  "cmd.file.save": "保存当前文件",
  "cmd.file.saveAs": "另存为…",
  "cmd.file.closeTab": "关闭当前标签",
  "cmd.view.toggleSidebar": "开关文件树侧栏",
  "cmd.view.togglePreview": "开关 Markdown 预览",
  "cmd.view.toggleTheme": "切换亮 / 暗主题",
  "cmd.view.toggleSoftWrap": "切换自动换行",
  "cmd.view.toggleLanguage": "切换中英文界面",
  "cmd.view.toggleZen": "切换专注模式（Zen Mode）",
  "cmd.view.toggleSplit": "切换分屏编辑",
  "cmd.nav.gotoAnything": "Goto Anything（按文件名跳转）",
  "cmd.nav.gotoSymbol": "Goto Symbol（当前文件标题/函数大纲）",
  "cmd.nav.openSettings": "打开设置",

  // Goto Symbol modal
  "symbol.placeholder": "输入符号名…（共 {n} 个，↑↓ 选择，Enter 跳转）",
  "symbol.placeholderEmpty": "当前文件没有可识别的符号",
  "symbol.unsupported": "不支持当前语言的符号提取（只支持 Markdown / JS / TS / Python / Rust / Go / Ruby / PHP / Shell）。",
  "symbol.noMatch": "没有匹配的符号。",

  // External file change watcher
  "watch.externalChanged": "此文件在 DEditor 之外被修改了。",
  "watch.reload": "从磁盘重载",
  "watch.keepMine": "保留我的修改",

  // Find in Files
  "find.placeholder": "在工作区里搜索…（Esc 关闭）",
  "find.placeholderNoWorkspace": "请先添加工作区",
  "find.noWorkspaceHint": "尚未添加工作区，无法搜索。",
  "find.idle": "输入关键词开始搜索（不支持正则，仅文本匹配）。",
  "find.searching": "搜索中…",
  "find.summary": "{hits} 处匹配，分布在 {files} 个文件（共扫描 {scanned} 个）",
  "find.truncated": "结果过多，已截断",
  "find.caseSensitive": "区分大小写",
  "cmd.nav.findInFiles": "Find in Files（全工作区搜索）",

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
  "statusbar.settings": "Settings (Cmd/Ctrl+,)",
  "statusbar.lnCol": "Ln {line}, Col {col}",
  "statusbar.cursor": "Cursor position (line, column)",
  "statusbar.eol": "Line ending (LF=Unix / CRLF=Windows)",
  "statusbar.encoding": "File encoding",

  // settings dialog
  "settings.title": "Settings",
  "settings.done": "Done",
  "settings.reset": "Reset",
  "settings.general.heading": "General",
  "settings.general.theme": "Theme",
  "settings.general.themeLight": "Light",
  "settings.general.themeDark": "Dark",
  "settings.general.language": "Language",
  "settings.general.fontSize": "Editor font size",
  "settings.general.autoSave": "Auto-save",
  "settings.general.autoSaveOff": "Off",
  "settings.general.autoSaveBlur": "On focus loss",
  "settings.general.autoSaveDelay": "1.5s after typing stops",
  "settings.editor.heading": "Editor",
  "settings.editor.softWrap": "Soft wrap (off shows a horizontal scrollbar for long lines)",
  "settings.editor.indentGuides": "Show indent guides",
  "settings.editor.whitespace": "Show whitespace markers (· for space, → for tab)",
  "settings.editor.minimap": "Show minimap on the right",
  "settings.shortcuts.intro": "Disable any shortcut that conflicts with your OS, IME, or another app. Menu items remain clickable even when the accelerator is turned off.",
  "settings.shortcuts.builtinNote": "Standard editor shortcuts (Cmd/Ctrl+Z undo, Cmd/Ctrl+F find, Cmd/Ctrl+D select next match, …) come from CodeMirror and can't be toggled here.",
  "settings.shortcuts.group.file": "File",
  "settings.shortcuts.group.nav": "Navigation",
  "settings.shortcuts.group.editor": "Editor",
  "shortcut.file.new": "New tab",
  "shortcut.file.open": "Open file",
  "shortcut.file.openFolder": "Open folder (add as workspace)",
  "shortcut.file.save": "Save",
  "shortcut.file.saveAs": "Save As",
  "shortcut.file.closeTab": "Close current tab",
  "shortcut.nav.gotoAnything": "Fuzzy file search across workspaces (Goto Anything)",
  "shortcut.nav.commandPalette": "Command Palette (search all commands and run)",
  "shortcut.nav.gotoSymbol": "Goto Symbol (current file outline)",
  "shortcut.nav.findInFiles": "Find in Files (search all workspaces)",
  "shortcut.nav.toggleSidebar": "Toggle the file tree sidebar",
  "shortcut.nav.openSettings": "Open Settings",
  "shortcut.nav.zenMode": "Toggle Zen mode (hide all UI chrome)",
  "shortcut.nav.splitEditor": "Toggle Split Editor (two views of the same file)",
  "shortcut.editor.addCursorAbove": "Add a cursor on the line above",
  "shortcut.editor.addCursorBelow": "Add a cursor on the line below",
  "shortcut.editor.selectAllMatches": "Select all occurrences of the current word",

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

  // Command Palette (Cmd+Shift+P)
  "cmdpalette.placeholder": "Type a command… (↑↓ to navigate, Enter to run, Esc to dismiss)",
  "cmdpalette.noMatch": "No matching command.",
  "cmdpalette.group.file": "File",
  "cmdpalette.group.view": "View",
  "cmdpalette.group.nav": "Nav",
  "cmdpalette.group.editor": "Editor",
  "cmd.file.new": "New Tab",
  "cmd.file.open": "Open File…",
  "cmd.file.openFolder": "Open Folder (Add Workspace)…",
  "cmd.file.save": "Save",
  "cmd.file.saveAs": "Save As…",
  "cmd.file.closeTab": "Close Current Tab",
  "cmd.view.toggleSidebar": "Toggle File Tree Sidebar",
  "cmd.view.togglePreview": "Toggle Markdown Preview",
  "cmd.view.toggleTheme": "Toggle Light / Dark Theme",
  "cmd.view.toggleSoftWrap": "Toggle Soft Wrap",
  "cmd.view.toggleLanguage": "Toggle UI Language (English / 中文)",
  "cmd.view.toggleZen": "Toggle Zen Mode",
  "cmd.view.toggleSplit": "Toggle Split Editor",
  "cmd.nav.gotoAnything": "Goto Anything (Jump to File)",
  "cmd.nav.gotoSymbol": "Goto Symbol (Outline of Current File)",
  "cmd.nav.openSettings": "Open Settings",

  // Goto Symbol modal
  "symbol.placeholder": "Type a symbol… ({n} found, ↑↓ to navigate, Enter to jump)",
  "symbol.placeholderEmpty": "No symbols recognized in this file",
  "symbol.unsupported": "Symbol extraction isn't supported for this language (Markdown / JS / TS / Python / Rust / Go / Ruby / PHP / Shell only).",
  "symbol.noMatch": "No matching symbol.",

  // External file change watcher
  "watch.externalChanged": "This file was changed outside DEditor.",
  "watch.reload": "Reload from disk",
  "watch.keepMine": "Keep my edits",

  // Find in Files
  "find.placeholder": "Search across workspaces… (Esc to dismiss)",
  "find.placeholderNoWorkspace": "Add a workspace first",
  "find.noWorkspaceHint": "No workspace added — nothing to search.",
  "find.idle": "Type to search (plain text, no regex).",
  "find.searching": "Searching…",
  "find.summary": "{hits} hits in {files} files (scanned {scanned})",
  "find.truncated": "results truncated",
  "find.caseSensitive": "Match case",
  "cmd.nav.findInFiles": "Find in Files (search all workspaces)",

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
