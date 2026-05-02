# CLAUDE.md

DEditor 项目的协作上下文。Claude Code 在这个目录工作时自动加载本文件。

---

## 项目概览

**DEditor** 是跨平台桌面 Markdown / 多语言代码编辑器。

- **应用名 / 二进制名 / identifier**：`DEditor` / `deditor` / `com.deditor.app`
- **目标平台**：macOS（.dmg）+ Windows（.msi/.exe）
- **Git 状态**：尚未 `git init`，首次上传时直接 `git add .`（`.gitignore` 已配置好）

## 技术栈

- **Tauri 2.10**（不是 Electron —— 选 Tauri 是为了包体小 + 内存低，代价是必须装 Rust 工具链）
- **Rust** 后端（`src-tauri/src/lib.rs`，所有命令集中在这个文件）
- **React 18 + TypeScript 5 + Vite 6** 前端
- **CodeMirror 6** 编辑器内核 + `@codemirror/legacy-modes` 兜底（shell/toml/ruby/swift/lua/dockerfile/powershell）
- **markdown-it 14** Markdown 解析
- **Shiki 1.x** 代码高亮（与 VSCode 同款 TextMate 语法）
- **Zustand 5** 状态管理
- **Tailwind 3** + CSS 变量 主题
- **react-icons (Simple Icons)** 语言品牌 logo

## 目录结构

| 目录 | 语言 | 角色 |
| --- | --- | --- |
| `src/` | TS/TSX/CSS | React 前端（UI、编辑器、预览） |
| `src-tauri/` | Rust | 原生进程（窗口、文件 IO、对话框、菜单） |
| `scripts/` | Bash/PowerShell | 启动 + 打包 + 清理脚本 |
| 根目录 | JSON/JS/HTML | 构建配置（Vite / TS / Tailwind / Tauri） |

通信：前端 `invoke("命令名", { 参数 })` ↔ Rust `#[tauri::command]`，单一通道。

## 架构详解

### 进程模型

```
┌────────────────────────────────────────────────────────────┐
│  WebView 进程（Chromium / WKWebView）                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  React 18 应用                                        │  │
│  │   ├── App.tsx        全局布局 + 键盘 + drop          │  │
│  │   ├── components/    UI 组件                         │  │
│  │   ├── store/editor.ts (Zustand) 单一 store           │  │
│  │   └── lib/           纯逻辑 + IPC 包装               │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ↕ invoke()                        │
└─────────────────────────│──────────────────────────────────┘
                          │ JSON IPC
┌─────────────────────────▼──────────────────────────────────┐
│  Rust 主进程                                               │
│   ├── #[tauri::command] 文件 IO / 目录遍历 / 路径解析      │
│   ├── 原生菜单（i18n 同步 + AppKit 注入清理）              │
│   ├── 窗口状态插件（位置/大小记忆）                        │
│   └── tauri-plugin-log（panic hook + 滚动日志）            │
└────────────────────────────────────────────────────────────┘
```

**关键约束**：
- 所有 IO 在 Rust 端，所有渲染在 TS 端，唯一通道是 `invoke()`
- 不开 Tauri shell 插件、不开 fs 插件——前端自由读写文件系统是个安全雷
- 不同步状态：每次 invoke 都是一次性请求/响应，前端缓存自管

### 前端分层

| 层 | 路径 | 职责 |
| --- | --- | --- |
| **Shell** | `App.tsx` | 全局布局拼装、`Cmd+X` 键盘、OS 拖拽、文件菜单事件桥 |
| **UI 组件** | `components/` | 纯展示 + 局部交互。对话框 / 浮层（GotoAnything、CommandPalette、GotoSymbol、FindInFiles、SettingsDialog、DiffView、HexView、ConfirmDialog、PromptDialog、ContextMenu）；专用预览器（XmindView + XmindCanvas）；按文件类型显示的工具条（MarkdownToolbar、JsonToolbar）；语言图标（LangIcon）；统一 Button（`ui/Button.tsx`，JetBrains 视觉）|
| **Store** | `store/editor.ts` | 单一 Zustand store。约 30 个字段，所有跨组件共享状态 |
| **Lib** | `lib/*.ts` | 纯逻辑 / IPC 包装。每个文件单一职责 |
| **入口** | `main.tsx` | React 挂载 + 全局 log handler + tab cache 清理订阅 |

**lib/ 模块清单**：

| 文件 | 职责 |
| --- | --- |
| `fileio.ts` | 所有文件操作：open/save/save-as/close、`openFileByPath` 按类型分流 |
| `lang.ts` | 50+ 扩展名 → CodeMirror lang loader + Shiki id + 图标。是 / 否判定（isMarkdown / isImageFile / isHexFile / 等） |
| `persistence.ts` | localStorage v3 序列化/反序列化 |
| `fileWatch.ts` | 3s 轮询 `file_mtimes`，clean tab 静默重载 / dirty tab 横幅提示 |
| `fuzzy.ts` | 子序列模糊匹配 + 打分（边界、连击、大小写、前缀、长度惩罚） |
| `diff.ts` | jsdiff 包 → 行对齐的 DiffRow（mod/add/del/eq）|
| `symbols.ts` | 当前文件 outline 提取（按扩展名走 regex） |
| `bookmarks.ts` | CodeMirror StateField + Decoration.line（位置随编辑漂移） |
| `commands.ts` | Command Palette 命令注册表 |
| `shortcuts.ts` | 可启用/禁用快捷键的元数据表 + `isEnabled()` 守卫 |
| `i18n.ts` | 中英扁平 key 表 + `t()` 模板替换 |
| `markdown.ts` | markdown-it 实例（anchor/task-lists 插件） |
| `highlight.ts` | Shiki 单例 + 按需懒加载语言 |
| `export.ts` | HTML / PDF 导出 |
| `editorBridge.ts` | 持有当前活跃 EditorView 引用，跨组件命令访问 |
| `treeRefresh.ts` | 文件树 invalidate 总线（重命名/删除后自动刷新） |
| `logger.ts` | 前端 → Rust 日志桥 + window.error 全局 hook |
| `plantumlHydrate.ts` | PlantUML 块异步渲染（用公共 server，需联网） |
| `mermaidHydrate.ts` | Mermaid 图表懒加载渲染（mermaid ~700KB，按需 import） |
| `localImgHydrate.ts` | Markdown 预览本地图片：`<img data-raw-src>` 重写为 `convertFileSrc()` 出来的 asset:// URL |
| `pathUtil.ts` | 轻量路径工具（`isLocalRef` / `stripFileScheme` / `dirname` / `resolveAgainst`），POSIX + Windows 兼容 |
| `format.ts` | Prettier 包装（standalone + plugin 懒加载），按扩展名走对应 parser，失败返回 null 让调用端兜底 |
| `markdownTable.ts` | Markdown 表格 keymap：Tab / Shift+Tab 跨格、Enter 加新行、对齐分隔行重排 |
| `jsonFormat.ts` | JSON / JSONC / JSON5 智能格式化：`smartFormat` / `compactJson` / `sortKeysFormat`，能解 Python `repr(dict)` 字面量 |
| `codeBlockComplete.ts` | Markdown ` ``` ` 输入后弹出语言名补全（mermaid / plantuml 优先，常用语言其次） |
| `colorPreview.ts` | CodeMirror ViewPlugin：在 hex / rgb / hsl 颜色字面量前画一个小色块 widget，仅可见行 |
| `inspectionMarkers.ts` | IntelliJ 风格右侧 strip：把 bookmarks 等位置在文件高度上等比例打点，点击跳行 |
| `islandLightTheme.ts` / `islandDarkTheme.ts` | 自带的 JetBrains-Island 风格 CodeMirror 主题（替代默认 oneDark） |
| `xmind/parse.ts` | 解析 .xmind 压缩包（fflate）→ workbook / sheets / topics 模型，兼容 v3 (content.json) 与 legacy (content.xml) |
| `xmind/edit.ts` | 把 mind-elixir 节点树写回 .xmind 压缩包，保留 XMind-only 字段（notes / labels / structureClass …）|
| `xmind/layout.ts` | XMind `structureClass` → mind-elixir Direction（right / left / side / down）映射 |

### Rust 后端

`src-tauri/src/lib.rs` 单文件包所有 `#[tauri::command]`。当前命令清单：

| 命令 | 用途 |
| --- | --- |
| `read_text_file` / `write_text_file` | 文本读写 |
| `read_binary_as_base64` / `write_binary_file` | 二进制读写（图片/PDF/音视频/hex/.xmind 用；写用于 XMind 保存等场景）|
| `list_dir` | 文件树懒加载（一层）|
| `list_workspace_files` | Goto Anything 用，递归 DFS（50k 上限）|
| `find_in_files` | Find in Files，含 NUL byte 二进制探测 + 1MB/file 上限 + 5k hits 上限 |
| `replace_in_files` | Find & Replace 全工作区批量替换（基于 `find_in_files` 命中点位） |
| `file_mtimes` | 批量 mtime 轮询（外部变更检测） |
| `path_kind` | "file" / "dir" / "missing"，drop 时分流 |
| `resolve_path` | `~` 展开 + canonicalize |
| `save_image` | 粘贴图片落盘到 `<workspace>/assets/` |
| `create_file` / `create_dir` / `rename_path` / `delete_path` | 文件树右键操作 |
| `print_window` | 触发系统打印对话框（PDF 导出） |
| `add_recent_document` | 把路径推到 OS "最近打开" 列表（macOS Dock / Windows Jump List） |
| `update_menu_state` | 重建原生菜单（语言变化或快捷键开关变化时调） |
| `frontend_log` | 前端日志桥转发到 Rust log |

**Rust 侧关键设计**：
- 所有路径过 `expand()`：先 `~` 展开、再 transparent 处理。命令签名都是 `String`，前端不传 `PathBuf`
- `IGNORED_WALK_DIRS` 硬编码 node_modules / target / dist 等，不读 `.gitignore`（要做的话引 `ignore` crate）
- 原生菜单 i18n：`MenuLabels` 25 字段，覆盖 App / File / Edit / Window 四个子菜单**所有项**包括预定义项（about / quit / cut / copy / paste 等），不靠 OS 系统语言
- `strip_macos_edit_menu_extras`：用 objc2 在 set_menu 后扫 NSMenu 把 AppKit 自动注入的 Start Dictation / Emoji & Symbols / AutoFill / Speech / Find / Substitutions / Transformations 全清掉

### 状态管理（Zustand store）

**单一 store**，约 30 个字段，按用途分组：

| 组 | 字段 | 备注 |
| --- | --- | --- |
| 标签 | `tabs / activeId / tabPositions` | tabs[]、当前 active id、cursor + scrollLine 缓存 |
| 工作区 | `workspaces / expandedDirs / compareMarkPath` | 工作区列表、文件树展开状态、对比标记 |
| 主题 / i18n | `theme / language` | |
| 视图开关 | `showPreview / previewMaximized / showSidebar / zenMode / splitEditor` | |
| 编辑器选项 | `editorFontSize / softWrap / showIndentGuides / showWhitespace / showMinimap / autoCloseBrackets` | |
| 自动保存 | `autoSave: "off" \| "onBlur" \| "afterDelay"` | |
| 快捷键 | `shortcuts: Record<id, boolean>` | 全局开关表 |
| 浮层 | `settingsOpen / gotoAnythingOpen / commandPaletteOpen / gotoSymbolOpen / findInFilesOpen` | 浮层都升到 store，让命令面板能触发（FindInFiles 同时承担 Find & Replace） |
| 状态栏 | `activeSelectionLength` | 选区字符数实时显示 |

**Tab 形状**：

```ts
interface Tab {
  id: string;            // crypto.randomUUID()
  filePath: string | null;
  content: string;       // 文本 / 二进制 data URL / 空串
  savedContent: string;  // 用于 dirty 判定
  diff?: DiffSpec;       // 双栏 diff tab
  externalChange?: string;  // 外部变更时暂存的磁盘内容
}
```

**TabPosition**（独立于 tab 数组，按 id 索引）：

```ts
interface TabPosition {
  cursor: number;        // 字符偏移
  scrollTopLine: number; // 1-based 首可见行
}
```

放在外面是因为光标频繁变动，不想触发 TabBar/TitleBar 重渲染。

**CodeMirror state 缓存**（不在 Zustand 里，模块级 Map）：

`Editor.tsx` 顶部有 `editorStateCache: Map<tabId, JSON>`。tab 切换时 Editor 卸载，把 `state.toJSON({history: historyField})` 写进 cache；下次挂载从 cache `EditorState.fromJSON` 恢复，撤销栈跨 tab 切换得以保留。`main.tsx` 订阅 store 在 tab 关闭时清缓存。

### 持久化（localStorage v3）

key：`deditor:state:v3`（旧 v1 / v2 自动迁移）

**会持久化**（`doSave` 写入）：
- 标签元数据：`filePath / content / savedContent / cursor / scrollTopLine`
- 工作区列表 + 文件树展开状态
- 主题 / 语言 / 字号
- 视图开关：showPreview / showSidebar / previewMaximized
- 编辑器选项：softWrap / showIndentGuides / showWhitespace / showMinimap
- autoSave 模式
- 快捷键启用表

**不持久化**：
- diff tab（`filter(t => !t.diff)`）
- 二进制 tab 的 `content`（data URL，可能几 MB；`filePath` 留下，启动时从磁盘 rehydrate）
- 浮层 open 状态、活跃选区长度、CodeMirror history
- zenMode、splitEditor（每次启动重置）

**fallback**：写入 quota exceeded 时，自动降级写"仅元数据"（drop 所有 content）。

### 关键数据流

**1. 打开文件**

```
FileTree click / Cmd+P / Cmd+O / drag
  → openFileByPath(path)
  → 按扩展名分流：
     ├─ 文本    → invoke("read_text_file") → openTab(path, content) [CodeMirror]
     ├─ 图片    → invoke("read_binary_as_base64") → data:image/...    [<img>]
     ├─ PDF     → 同上                              data:application/pdf [<iframe>]
     ├─ 音/视频 → 同上                              data:audio|video/... [<audio>/<video>]
     ├─ .xmind  → 同上                              data:application/vnd.xmind.workbook [XmindView → XmindCanvas]
     └─ hex     → 同上                              data:application/octet-stream [HexView]
```

**2. 编辑 → 保存**

```
CodeMirror updateListener
  → docChanged: store.setContent  → tab.content 变
  → selectionSet: setActiveSelectionLength + 缓存 cursor (200ms debounce)

Cmd+S
  → saveFile() → invoke("write_text_file") → markSaved (savedContent = content)

autoSave === "onBlur"  → window blur → saveAllDirty()
autoSave === "afterDelay" → store.subscribe → 1.5s debounce → saveAllDirty()
```

**3. 外部变更检测**

```
useFileWatch (App 全局)
  setInterval 3s
  → invoke("file_mtimes", { paths: 所有 named tab })
  → 比对 lastMtimes 缓存
  → 变化时 invoke("read_text_file")
     ├─ tab is clean → 静默写回 content + savedContent
     └─ tab is dirty → tab.externalChange = fresh → 横幅"重载 / 保留我的修改"
```

**4. Goto Anything**

```
Cmd+P → setGotoAnythingOpen(true)
  → modal mount → invoke("list_workspace_files", { roots: workspaces })
  → 输入 query → fuzzyMatch 每条 path → 排序 top-80 → 高亮匹配字符
  → Enter → openFileByPath(选中) → modal close
```

**5. 菜单 / 快捷键 ↔ Rust**

```
Settings 切语言 / 切某条快捷键开关
  → store.shortcuts 变 / store.language 变
  → useEffect([language, shortcuts]) → invoke("update_menu_state", {
       lang, disabledAccelerators: SHORTCUTS.filter(menu类型已禁用).map(id)
     })
  → Rust build_and_set_menu(lang, disabled)
  → strip_macos_edit_menu_extras (objc2)
```

### CodeMirror 集成

**单 view + Compartments**：每个可热切换的 extension 用独立 Compartment 包，运行时 `dispatch(compartment.reconfigure(newExt))`。当前 8 个：

| Compartment | 触发源 | 切换内容 |
| --- | --- | --- |
| `themeCompartment` | `theme` | `islandLight` / `islandDark`（自家 JetBrains 风主题，见 `lib/islandLightTheme.ts` / `islandDarkTheme.ts`） |
| `langCompartment` | `filePath` | 异步 `LanguageSupport` |
| `wrapCompartment` | `softWrap` | `EditorView.lineWrapping` / `[]` |
| `indentCompartment` | `showIndentGuides` | `indentationMarkers()` / `[]` |
| `whitespaceCompartment` | `showWhitespace` | `highlightWhitespace()` / `[]` |
| `minimapCompartment` | `showMinimap` | `showMinimap.of({...})` / `[]` |
| `autoCloseCompartment` | `autoCloseBrackets` | `closeBrackets()` / `[]` |
| `completionCompartment` | `filePath` | Markdown 文件挂 `codeBlockCompletion` + `autocompletion()`，其它文件挂默认 `autocompletion()` |

**始终挂载（不进 Compartment）**：`colorPreview()`（仅文本类文件）、`inspectionMarkers()`、Markdown 表格 keymap（仅 `.md`）。

**自定义 keymap**：在 `keymap.of(...)` 里加在默认前面。所有自定义条目（多光标 / 全选匹配 / Bookmarks）的 `run` 函数会读 store 的 shortcuts 表，禁用时返回 `false` 让按键透出。

**Bookmarks 设计**：用 `StateField<DecorationSet>` + `Decoration.line()`。每个书签是 `[pos, pos]` 0 长度 range。`set.map(tr.changes)` 自动让位置跟编辑漂移。

### 国际化（i18n）

**形式**：`Record<string, string>` 扁平表，两份（ZH / EN）。Key 用点号分组：`statusbar.lnCol`、`shortcut.nav.gotoAnything`、`cmd.file.open`。

**接口**：
- `useT()`：React hook，订阅 store.language
- `tStatic(key, vars?)`：非 React 上下文（fileio.ts、lang.ts 等）

**模板替换**：`"行 {line}, 列 {col}"` → `t(key, { line: "12", col: "5" })`

**新增 key**：必须中英两份都加，否则会落到 `tStatic` 的 fallback（直接显示 key 字符串）。grep `i18n.ts` 检查对称。

### 性能 / 资源边界

| 维度 | 限制 / 策略 |
| --- | --- |
| Goto Anything 索引 | 50k 文件硬上限；每次打开重新走 DFS（典型项目 < 50ms） |
| Find in Files | 5k hits / 1MB per file / NUL-byte 二进制探测 |
| Replace in Files | 复用 Find in Files 的命中点位（同一限制） |
| Hex View | 256 KB 上限；超过部分截断 |
| 文件 mtime 轮询 | 3 秒，每次最多查所有 named tab 的 mtime（一次 IPC 批量） |
| localStorage 配额 | 二进制 tab 不写 content；超额自动降级到元数据-only |
| Editor 重挂载 | `key={tab.id}` 每次切 tab 卸载 + mount。state.toJSON 缓存让感知上"无缝" |
| Vite chunk warning | `dist/index-*.js` 1.3MB（gzip 455KB）—— Shiki 把所有语法包打到一起，预期 |

## 已实现功能（截至 2026-05-02）

**编辑器内核**

- CodeMirror 6 + 50+ 扩展名识别（CodeMirror lang pack + Shiki 高亮同步）
- 多光标（Cmd+Alt+↑/↓ / Cmd+Shift+L / Cmd+D） + 列选（Alt+Drag） + Cmd+Click 加光标
- 折叠（foldGutter + Cmd+Alt+[/]）、缩进引导线、显示空白字符、minimap、自动换行（运行时切换）
- **切 Tab 保留撤销栈**（state.toJSON({history}) 缓存）
- Bookmarks（F2 / F8 / Shift+F8 / Cmd+Shift+F2）随编辑漂移
- 自动保存：关 / 失焦时 / 停止编辑 1.5s 后
- **JetBrains 风格 Island 主题**（自带 light / dark，替代默认 oneDark）
- **颜色字面量预览色块**（hex / rgb / hsl 行内 swatch widget）+ **右侧 Inspection Strip**（bookmark 等位置等比打点 + 点击跳行）
- **自动闭合括号 / 引号**（`autoCloseBrackets`，可在设置中关）
- **代码块 fenced 语言名补全**（Markdown ` ``` ` 后弹候选，mermaid / plantuml 优先）

**文件操作**

- 多 Tab + OS 级拖拽（拖文件打开 / **拖目录加为工作区**）
- 同名文件去重、未保存三按钮确认、Cmd+S/Shift+S 保存/另存
- 图片粘贴落盘 `<workspace>/assets/` + 光标插入 Markdown 链接
- 导出 HTML / PDF（.md 可见）
- **外部变更检测**（3s 轮询 mtime，clean 静默重载、dirty 弹横幅）
- 文件对比（Select for Compare → 另一个文件 Compare with → 双栏 diff）
- **OS 最近打开列表注入**（`add_recent_document`，macOS Dock / Windows Jump List 同步）
- **Prettier 一键格式化**（`lib/format.ts`，懒加载 parser；JS/TS/JSON/CSS/HTML/MD/YAML 等）

**预览能力**

- Markdown 分栏实时预览（仅 .md/.markdown/.mdx），编辑↔预览滚动联动
- markdown-it + Shiki + **PlantUML（需联网）+ Mermaid（懒加载）**
- **本地图片在预览里能直接显示**（`localImgHydrate`：相对路径 → asset:// URL）
- 图片 / PDF / 音视频内嵌预览
- **.xmind 思维导图**（`XmindView`，read-only 渲染 + edit 模式 mind-elixir 编辑回写，保留 XMind-only 字段如 notes / labels / structureClass）
- Office / 压缩包 / 可执行文件等二进制 → hex dump（256KB 上限）

**编辑辅助工具条**

- **MarkdownToolbar**（仅 .md）：B / I / 代码 / 链接 / 列表 / 引用 / 表格 / 分隔线 / 任务列表 / 字号 等
- **JsonToolbar**（仅 .json / .jsonc / .json5）：smart-format（容忍 JSON5 + Python `repr`） / compact / sort keys
- **Markdown 表格 keymap**：Tab / Shift+Tab 跨格、Enter 加新行、对齐分隔行重排

**导航 / 搜索**

- **Cmd+P Goto Anything**：跨工作区模糊文件搜索（fuzzy.ts，50k 文件上限）
- **Cmd+Shift+P 命令面板**：模糊搜索 + 执行（commands.ts 注册表）
- **Cmd+R Goto Symbol**：当前文件大纲（regex-based，支持 MD/JS/TS/Py/Rust/Go/Ruby/PHP/Shell）
- **Cmd+Shift+F Find in Files**：全工作区文本搜索（NUL byte 跳二进制，结果按文件分组）+ **Replace in Files**（全工作区批量替换）
- **Cmd+Alt+G Goto Line** / **Cmd+G 找下一个匹配** / Cmd+F 当前文件查找

**UI / 体验**

- 文件树侧栏：懒加载、`~` 展开、展开状态持久化、右键 (新建/重命名/删除/Reveal in Finder/对比)
- 亮/暗主题（持久化、跟随系统初始）+ 中英文 UI 切换（实时）
- **Cmd+, 设置对话框**：通用（主题/语言/字号/自动保存）+ 编辑器（开关组）+ 快捷键（每条都可禁用）
- **Cmd+K 专注模式**（Zen）+ **Cmd+\\ 分屏编辑**（同 tab 双视图独立光标/滚动）
- macOS / Windows 原生菜单栏（中英文 i18n，**objc2 清掉 AppKit 注入的 Start Dictation / AutoFill / Emoji 等**）
- StatusBar：行/列、选区字符数、EOL（LF/CRLF）、UTF-8、语言、行/字数
- 统一 Button 组件（`ui/Button.tsx`，4 variant × 4 size，pressed 状态用于切换按钮）

**架构 / 工程**

- localStorage v3 持久化（tabs / 工作区 / 主题 / 字号 / 编辑器开关组 / 快捷键表 / 自动保存模式 / ...）
- 语言品牌 logo（Simple Icons / Lucide / Font Awesome）+ 字母 badge 兜底（`LangIcon`）
- 完整日志（Rust panic hook + 前端 error/rejection 转发，10MB 滚动）

## 路线图（按优先级，从上往下做）

**A. Sublime DNA**

- [x] **A.2 Cmd+Shift+F Find in Files**：Rust `find_in_files` 命令（plain text，1MB/file 上限，5k hits 上限）+ `components/FindInFiles.tsx` 面板，结果按文件分组、点击跳到行列
- [x] **A.3 Goto Line**：用 CodeMirror 默认绑定 `Cmd/Ctrl+Alt+G`。`Cmd+G` 留给 "find next"（Sublime / VSCode 通用）
- [x] **A.3 Cmd+R Goto Symbol**：`lib/symbols.ts` 按扩展名做 regex 提取（MD / JS / TS / Py / Rust / Go / Ruby / PHP / Shell），`GotoSymbol` modal 复用 fuzzy.ts
- [x] **A.4 Cmd+Shift+P Command Palette**：`lib/commands.ts` 注册表 + `components/CommandPalette.tsx`

**B. 编辑硬伤**

- [x] **B.1 切 Tab 保留撤销栈**：模块级 `editorStateCache` 存 `state.toJSON({history})`，mount 时 fromJSON 恢复
- [x] **B.2 文件外部变更检测**：`file_mtimes` 批量轮询 + `lib/fileWatch.ts`，clean tab 静默重载、dirty tab 显示横幅让用户选
- [x] **B.3 拖目录到窗口 = 加工作区**：`path_kind` Rust 命令 + drop 处理分流
- [x] **B.4 字体 / 主题 / 语言 / 自动保存 进设置面板**：SettingsDialog 顶部加"通用"分组（含 RadioRow + SliderRow）

**C. 编辑器质感**

- [x] **C.1 Minimap**：`@replit/codemirror-minimap`，Compartment 切换，设置里"显示右侧迷你地图"
- [x] **C.2 Split Pane** (scoped v1)：`splitEditor` toggle，同一 active tab 双视图独立光标/滚动；Cmd+\ 切换。多 pane 多 active tab 留作后续重构
- [x] **C.3 Folding**：`foldGutter()` + `foldKeymap`
- [x] **C.4 Bookmarks**：`lib/bookmarks.ts` StateField + Decoration.line（位置随编辑漂移）；F2 切换 / F8 下一 / Shift+F8 上一 / Cmd+Shift+F2 清空
- [x] **C.5 Distraction-free 模式**：`zenMode` store + Cmd+K 切换，隐藏 TitleBar / TabBar / Sidebar / StatusBar
- [x] **C.6 Indent guides / 显示空白**：`@replit/codemirror-indentation-markers` + `highlightWhitespace()`

**D. StatusBar 增强**

- [x] **D.1 光标行/列 + EOL（CRLF/LF）+ UTF-8**：StatusBar 读 `tabPositions` + content 检测
- [x] **D.2 Soft wrap 开关**：Compartment 运行时切，Settings 勾选
- [x] **D.3 自动保存 / 失焦自动保存**：`saveAllDirty()` 工具 + App.tsx 监听 blur / 1.5s debounce，三档可选（关 / 失焦 / 停止编辑后）

**E. 0.6.0 — 格式化 + 工具条**

- [x] **E.1 Prettier 一键格式化**：`lib/format.ts` 包装 prettier/standalone，按 ext 选 parser，所有 plugin 懒加载（JS/TS/JSON/CSS/HTML/MD/YAML 等）
- [x] **E.2 Markdown 表格 keymap**：`lib/markdownTable.ts`，Tab/Shift+Tab 跨格、Enter 加新行、对齐分隔行重排
- [x] **E.3 JSON / Markdown 工具条**：`JsonToolbar` (smart-format 兼容 JSON5 + Python repr / compact / sort keys) + `MarkdownToolbar`（粗斜体/列表/链接/表格/字号等）
- [x] **E.4 Find & Replace in Files**：Rust `replace_in_files` + 前端面板复用 FindInFiles
- [x] **E.5 OS 最近打开列表**：`add_recent_document` 注入 macOS Dock / Windows Jump List

**F. 0.7.0 — JetBrains 化**

- [x] **F.1 Island Light/Dark 主题**：`lib/islandLightTheme.ts` / `islandDarkTheme.ts`（替代 oneDark）
- [x] **F.2 颜色字面量行内色块**：`lib/colorPreview.ts` ViewPlugin，仅可见行渲染 hex/rgb/hsl swatch
- [x] **F.3 Inspection Strip**：`lib/inspectionMarkers.ts` 把 bookmarks 在文件高度上等比打点 + 点击跳行
- [x] **F.4 统一 Button 组件**：`components/ui/Button.tsx`，4 variant × 4 size + pressed 状态
- [x] **F.5 LangIcon**：抽出语言图标渲染（Simple Icons + Lucide + 字母 badge 兜底）
- [x] **F.6 .xmind 预览 + 编辑**：`lib/xmind/{parse,edit,layout}.ts` + `XmindView` + `XmindCanvas`，read 模式锁交互、edit 模式 mind-elixir，回写时保留 XMind-only 字段
- [x] **F.7 自动闭合括号 + 代码块语言补全**：`closeBrackets()` + `lib/codeBlockComplete.ts`
- [x] **F.8 Markdown 预览本地图片**：`lib/localImgHydrate.ts` + `lib/pathUtil.ts`，相对路径 → asset:// URL
- [x] **F.9 Mermaid 渲染**：`lib/mermaidHydrate.ts` 懒加载（mermaid ~700KB）

**0.7.0 / 0.8.0 之后续做主要是细节打磨**（StatusBar 行为、Editor 主题色微调、JsonToolbar 文案、TitleBar 视觉等）。

**其它已搁置**（按需再开）：

- KaTeX 数学公式
- 大纲（TOC）侧栏（Goto Symbol 完成后再考虑常驻面板）
- 文件树搜索框
- WYSIWYG 模式

## 启动 / 打包 / 清理

```sh
./scripts/start.sh              # 开发（mac/linux）：默认先清 node_modules/.vite + ~/Library/WebKit/com.deditor.app，再 npm i + tauri dev
                                # （DEditor 必须先退，否则报错；如不想清缓存加 --no-reset）
./scripts/start.sh --no-reset   # 跳过清缓存（启动快，但可能撞到旧状态）
.\scripts\start.ps1             # Windows 等价（默认也清 %LOCALAPPDATA%\com.deditor.app\EBWebView）
.\scripts\start.ps1 -NoReset    # Windows: 跳过清缓存

./scripts/build-mac.sh       # 出 .dmg（自动复制到 scripts/）
./scripts/build-mac.sh --universal   # arm64 + x64 通用包
.\scripts\build-win.ps1      # 出 .msi + .exe

./scripts/clean.sh           # 清 build 产物（target/dist/scripts里的安装包）
./scripts/clean.sh --all     # 上面 + node_modules + package-lock.json
./scripts/clean.sh --dry-run # 预演，不真删
```

## 关键约定

### 1. 脚本写法必须 POSIX 兼容

`scripts/*.sh` 必须在 macOS bash、macOS sh（bash --posix 模式）、Linux dash 三个环境下都能跑。

**禁用**：进程替换 `< <(...)`、bash 数组、`<<<` herestring、`=~` 正则。
**优先**：`[ ]` 而非 `[[ ]]`、`for x in dir/*.ext` 而非 `find ... | while read`。

写完用 `bash -n script.sh && sh -n script.sh && echo ok` 双校验。

第一次 `build-mac.sh` 报 `syntax error near unexpected token <` 就是因为用了 `done < <(find ...)`，已改成 for-glob 模式。

### 2. 命名

- App 显示名：`DEditor`（首字母 D 大写）
- Cargo / npm 包名：`deditor`（小写，无连字符）
- Bundle identifier：`com.deditor.app`
- 不要意外引入回 `M Editor` / `m-editor` / `m-client`（旧名，已全替换）

### 3. 加新语言支持

1. `src/lib/lang.ts` 的 `ext` 表：加扩展名 → CodeMirror loader + Shiki 名 + 图标
2. （可选）`src/lib/fileio.ts` 的 `MD_FILTER`：加扩展名（打开对话框过滤）

文件树侧默认显示**所有**非隐藏文件（`list_dir` 不再按扩展名过滤）。隐藏目录（`.git` 等）继续屏蔽；隐藏文件白名单见 `src-tauri/src/lib.rs` 的 `ALLOWED_NAMES`（`.gitignore` / `.env` 等）。

## 日志系统

- Rust 端：`tauri-plugin-log` 写到 `~/Library/Logs/com.deditor.app/deditor.log`（macOS），10MB 滚动 / KeepAll。同时输出到 stdout 和 webview console
- 装了 panic hook（`install_panic_hook`），所有 Rust panic 都会落到日志（含文件:行:列 + 消息）
- 前端：`src/lib/logger.ts` 的 `logError/logWarn/logInfo` 通过 `invoke("frontend_log", ...)` 转发到 Rust
- 全局 hook（`installGlobalLogHandlers` 在 main.tsx 调用）捕获 `window.error` 和 `unhandledrejection`
- 加新错误处理时务必在 catch 里 `logError("X 操作失败", err)`，让日志能复现问题
- 不要把每次按键这种高频事件 log 进去，只 log 关键节点（操作开始/结束/失败）

## 已知坑

### macOS DMG Finder 图标必须三步走

`tauri icon` 生成的 `.icns` 是 data-fork 格式，`DeRez` 直接读会报 `eofErr (-39)`。

正确路径（已写入 `scripts/build-mac.sh`）：

```bash
SRC_PNG="src-tauri/icons/128x128@2x.png"
TMP_PNG="$(mktemp -t deditor-pngicon).png"
TMP_RSRC="$(mktemp -t deditor-rsrc).rsrc"

cp "$SRC_PNG" "$TMP_PNG"
sips -i "$TMP_PNG" >/dev/null              # 关键：把 PNG 自身烤出图标 resource
DeRez -only icns "$TMP_PNG" > "$TMP_RSRC"  # 从烤好的 PNG 提取 icns resource
Rez -append "$TMP_RSRC" -o "$DMG"          # 追加进 dmg 的资源叉
SetFile -a C "$DMG"                        # 标记 "Has Custom Icon"
```

不要直接 `DeRez -only icns icon.icns`。备选 `fileicon` cli 或 PyObjC 都需要额外依赖。

## 关键路径

| 用途 | 路径 |
| --- | --- |
| 源 logo PNG | `deditor.png`、`dddeditor.png` |
| 应用图标全套 | `src-tauri/icons/`（icon.icns / icon.ico / 各尺寸 PNG） |
| Rust 命令 | `src-tauri/src/lib.rs` |
| Tauri 配置 | `src-tauri/tauri.conf.json` |
| 前端入口 | `src/main.tsx` → `src/App.tsx` |
| Zustand store | `src/store/editor.ts`（导出 `DEFAULT_CONTENT` 欢迎文档常量） |
| 持久化 | `src/lib/persistence.ts`（localStorage key `deditor:state:v3`，旧 v1/v2 自动迁移） |
| .dmg 最终位置 | `scripts/DEditor_<ver>_<arch>.dmg`（build-mac.sh 自动 cp） |
| .dmg 原始位置 | `src-tauri/target/release/bundle/dmg/...` |
| Cargo target（4GB+） | `src-tauri/target/`（clean.sh 删这个） |
| WebView localStorage | `~/Library/WebKit/com.deditor.app/WebsiteData/LocalStorage/` |
| 日志文件（macOS） | `~/Library/Logs/com.deditor.app/deditor.log`（10MB 滚动，KeepAll） |
| 日志文件（Windows） | `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log` |
| 日志文件（Linux） | `~/.local/share/com.deditor.app/logs/deditor.log` |

## 想改 X 看哪里

| 任务 | 改这里 |
| --- | --- |
| 加新支持的语言 / 扩展名 | `src/lib/lang.ts` 的 `ext` 表（CodeMirror loader + Shiki id + 图标） |
| 加新文件类型分流（视频之类） | `src/lib/lang.ts` 加 `is*File()` + `src/lib/fileio.ts` 的 `openFileByPath` 分流 + `src/components/Editor.tsx` 加渲染分支 |
| 加新 Rust 命令 | `src-tauri/src/lib.rs` 加 `#[tauri::command] fn xxx(...)` + `invoke_handler![]` 注册 |
| 加新 React 组件 | 放进 `src/components/`，UI 状态如要全局共享则加进 `store/editor.ts` |
| 加新快捷键（可禁用的） | `src/lib/shortcuts.ts` 加 `ShortcutId` 枚举值 + `SHORTCUTS` 元数据 + `App.tsx` 的 keydown handler 加分支 |
| 加新命令面板命令 | `src/lib/commands.ts` 的 `COMMANDS` 数组追加，必要时加 `cmd.*` i18n key |
| 加 Markdown 插件 | `src/lib/markdown.ts` 里 `md.use(...)` |
| 加菜单项 / 改菜单标签 | `src-tauri/src/lib.rs` 的 `MenuLabels` + `build_and_set_menu`，前端 `App.tsx` 的 `menu-action` 监听 |
| 改主题色（UI） | `src/styles.css` 顶部 `:root` 和 `.dark` 的 CSS 变量 |
| 改 CodeMirror 主题 | `src/lib/islandLightTheme.ts` / `islandDarkTheme.ts` 顶部 `PALETTE` 常量 |
| 加 Markdown 工具条按钮 | `src/components/MarkdownToolbar.tsx`（用 `editorBridge` 的 `wrapSelection` / `prefixLines` / `insertText`） |
| 加 JSON 格式化算子 | `src/lib/jsonFormat.ts` 加导出函数 + `src/components/JsonToolbar.tsx` 加按钮 |
| 加 Prettier 支持的扩展名 | `src/lib/format.ts` 的 parser map |
| 加 .xmind 字段保留 | `src/lib/xmind/edit.ts` 的 `_xmind` 字段；read 模型在 `parse.ts` |
| 加颜色字面量识别 | `src/lib/colorPreview.ts` 的正则 |
| 加 Inspection Strip 标记类型 | `src/lib/inspectionMarkers.ts`（接入新的 StateField）|
| 改 Tab 形状 / store 字段 | `src/store/editor.ts` + `src/lib/persistence.ts`（v3 schema 加可选字段，read 时合并默认）|
| 改窗口大小 / 标题 / identifier | `src-tauri/tauri.conf.json` |
| 改启动 / 打包 | `scripts/` 下对应平台脚本 |
| 加前端依赖 | `npm install xxx` |
| 加 Rust 依赖 | `src-tauri/Cargo.toml`（macOS-only 用 `[target.'cfg(target_os = "macos")'.dependencies]`） |
| 调 CodeMirror 行为（运行时可切换） | `src/components/Editor.tsx` 加 `Compartment` + 对应 `useEffect` reconfigure |

## 协作偏好

### 回复风格

- **简洁直答**：问 X 答 X，不长篇铺垫；技术细节用表格/列表压缩
- **不写 emoji 到文件**（README、脚本、代码、CLAUDE.md 自身）；对话里也避免
- 大块改动后给 1-2 句"做了什么 / 下一步可以做什么"收尾，不写大段总结

### 决策模式

- **探索性问题给 2-3 方案 + 主要权衡，让他选**，不直接做。例如"目录是不是太乱了"应该先列方案 A/B/C 等点头，而不是动手重构
- 一旦点了方案就直接做完，中间不要再确认细节
- 选项要明确推荐哪个 + 为什么

### 范围控制

- **不擅自重构** —— 文件多/名字怪/路径深这类美学问题，**优先加文档说明**而不是改结构
- **接受工具/框架的标准约定**（Tauri 用 src-tauri、Vite 配置在根、Cargo target 路径等）—— 改这些代价高、收益低
- 加新功能不要顺手"清理"周边代码，按要求做完为止

### 环境

- macOS Darwin Apple Silicon (`aarch64`)
- Node 22 + npm 11，registry：`https://registry.anpm.alibaba-inc.com`（阿里内部镜像）
- Rust stable，`~/.cargo/config.toml` 走 rsproxy.cn 镜像
- 已装 Xcode CLI Tools（有 sips / Rez / DeRez / SetFile / xattr）
- 第一次接触 Tauri / Rust 桌面开发，前端（React/TS）熟
