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

详见 `README.md` 的"项目结构"章节。简版速记：

| 目录 | 语言 | 角色 |
| --- | --- | --- |
| `src/` | TS/TSX/CSS | React 前端（UI、编辑器、预览） |
| `src-tauri/` | Rust | 原生进程（窗口、文件 IO、对话框） |
| `scripts/` | Bash/PowerShell | 启动 + 打包 + 清理脚本 |
| 根目录 | JSON/JS/HTML | 构建配置 |

通信：前端 `invoke("命令名", { 参数 })` ↔ Rust `#[tauri::command]`，单一通道。

## 已实现功能（截至 2026-04-27）

- 多 Tab 编辑、文件拖拽（OS 级 drop，支持文件 + 目录）
- Markdown 实时分栏预览（**仅 .md 显示分栏**；源码文件全宽编辑）
- 50+ 文件扩展名识别（编辑器侧 CodeMirror lang pack + 预览侧 Shiki 同步）
- 二进制文件 hex 预览（Office/压缩包/可执行文件）+ 图片/PDF/音视频内嵌预览
- 文件树侧栏（懒加载，路径输入框支持 `~` 展开，可一键收起，**展开状态持久化**）
- 文件树右键菜单（新建文件 / 文件夹、重命名、删除、Reveal in Finder、对比文件）
- 多 Tab + 多文件拖拽 + 同名文件去重（聚焦已存在 tab）
- 未保存切换/关闭三按钮确认（保存 / 不保存 / 取消）
- 图片粘贴自动落盘到 `<workspace>/assets/`，光标插入 Markdown 链接
- 导出 HTML / PDF（仅 .md 文件可见这俩按钮）
- 亮 / 暗主题（顶栏 sun/moon 图标 + StatusBar 文字按钮，**已持久化**）
- 状态持久化（localStorage：tabs / 工作区 / 主题 / 分栏宽度 / 侧栏开关 / 文件树展开 / 快捷键开关）
- 语言品牌 logo（Python 蛇 / Rust 齿轮 / Go 地鼠等；无 logo 的扩展用首 3 字母彩色 badge 兜底）
- macOS / Windows 原生菜单栏（中英文同步 i18n，**Edit 子菜单清理 macOS 自动注入项**）
- 文件对比（右键 Select for Compare → 另一个文件右键 Compare with → 双栏 diff）
- **Cmd+P Goto Anything**（跨工作区模糊文件搜索，jsdiff/Myers）
- **设置对话框**（Cmd+,，per-shortcut 启用/禁用，菜单 accelerator 实时联动）

## 路线图（按优先级，从上往下做）

**A. Sublime DNA**

- [ ] **A.2 Cmd+Shift+F Find in Files**：后端 `walkdir` + regex 或 `grep` crate；前端搜索面板 + 结果按文件分组、点跳过去
- [ ] **A.3 Cmd+G Goto Line**：CodeMirror 默认绑在 `Cmd/Ctrl+Alt+G`，已能用；如要 Cmd+G 加一行 keymap
- [ ] **A.3 Cmd+R Goto Symbol**：当前文件 outline；MD 抓 `#` 标题 + JS/TS/Py/Go 几门主流走 regex 提取
- [ ] **A.4 Cmd+Shift+P Command Palette**：复用 GotoAnything 的 UI 框架，命令注册表，模糊搜执行

**B. 编辑硬伤**

- [ ] **B.1 切 Tab 保留光标 + 撤销栈**：CodeMirror `state.toJSON({history})` 序列化到 store，切回 `EditorState.fromJSON` 恢复，去掉 `key={tab.id}`
- [ ] **B.2 文件外部变更检测**：Rust 端 `notify` crate 监听工作区，emit 到前端，弹"已修改，是否重载？"对话框
- [ ] **B.3 拖目录到窗口 = 加工作区**：drop 处理里区分 dir vs file，dir 走 `addWorkspace`
- [ ] **B.4 字体 / 主题 / 语言 进设置面板**：SettingsDialog 加 General 标签页

**C. 编辑器质感**

- [ ] **C.1 Minimap**：用 `@replit/codemirror-minimap`（要新依赖）
- [ ] **C.2 Split Pane**：App.tsx 布局重构 + store 改造（每个 pane 一个 active tab）
- [ ] **C.3 Folding**：`@codemirror/language` 自带 `foldGutter()` + `foldKeymap`
- [ ] **C.4 Bookmarks**：行级标记 + 跳转命令 + StatusBar 显示
- [ ] **C.5 Distraction-free 模式**：隐藏 TitleBar / TabBar / Sidebar / StatusBar
- [ ] **C.6 Indent guides / 显示空白 / 显示行尾符**：`highlightWhitespace()` + indent guide

**D. StatusBar 增强**

- [ ] **D.1 光标行/列 + EOL（CRLF/LF）**：从 CM state 读行列；EOL 在文件读时探测；编码统一 UTF-8
- [ ] **D.2 Soft wrap 开关**：当前固定开 `EditorView.lineWrapping`，改成 store 状态 + Settings 一勾
- [ ] **D.3 自动保存 / 失焦自动保存**：window blur + 间隔 timer

**执行顺序**（高价值/低改造优先）：
C.3 → B.3 → D.1 → D.2 → B.1 → A.4 → C.6 → B.2 → A.2 → A.3 → C.5 → B.4 → C.1 → C.2 → C.4 / D.3

**其它已搁置**（按需再开）：

- KaTeX 数学公式 / Mermaid 图表
- 大纲（TOC）侧栏（A.3 Goto Symbol 完成后再考虑常驻面板）
- 文件树搜索框
- WYSIWYG 模式

## 启动 / 打包 / 清理

```sh
./scripts/start.sh           # 开发（mac/linux），自动检 toolchain + npm i + tauri dev
.\scripts\start.ps1          # Windows 等价

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
| 持久化 | `src/lib/persistence.ts`（localStorage key `deditor:state:v1`） |
| .dmg 最终位置 | `scripts/DEditor_<ver>_<arch>.dmg`（build-mac.sh 自动 cp） |
| .dmg 原始位置 | `src-tauri/target/release/bundle/dmg/...` |
| Cargo target（4GB+） | `src-tauri/target/`（clean.sh 删这个） |
| WebView localStorage | `~/Library/WebKit/com.deditor.app/WebsiteData/LocalStorage/` |
| 日志文件（macOS） | `~/Library/Logs/com.deditor.app/deditor.log`（10MB 滚动，KeepAll） |
| 日志文件（Windows） | `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log` |
| 日志文件（Linux） | `~/.local/share/com.deditor.app/logs/deditor.log` |

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
