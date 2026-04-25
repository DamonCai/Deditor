# DEditor

基于 **Tauri 2 + React + CodeMirror 6** 的跨平台 Markdown / 多语言代码编辑器。
原生窗口，安装包 ~10MB，内存占用比 Electron 小一个量级。

支持 macOS（.dmg / .app）和 Windows（.msi / .exe）。

## 功能现状

### 已实现

**编辑核心**

- CodeMirror 6 编辑器：行号、自动换行、查找替换 (`Cmd/Ctrl+F`)、撤销/重做、`Tab` 缩进
- 多 Tab 编辑：`Cmd+N` 新建、`Cmd+W` 关闭；同一文件不重复打开；脏数据关闭弹保存确认
- 文件拖拽：从 Finder / 资源管理器拖任意文本/代码文件到窗口直接打开
- Markdown 实时预览，编辑↔预览滚动联动（按 source line 锚定）；**仅 .md/.markdown/.mdx 显示分栏预览**，源码文件全宽编辑
- 亮 / 暗主题切换（StatusBar 右下），跟随系统初始值
- 可拖动的分隔条；侧栏 / 预览可独立隐藏

**多语言代码支持**

- 50+ 文件扩展名识别：`.md/.py/.js/.ts/.tsx/.rs/.go/.java/.kt/.cpp/.cs/.html/.css/.vue/.svelte/.json/.yaml/.toml/.xml/.sql/.php/.rb/.swift/.lua/.sh/.bash/.zsh` 及特殊文件名 `Dockerfile/Makefile/.gitignore/.env`
- 编辑器侧：CodeMirror 官方语言包 + `legacy-modes`（shell/toml/ruby/swift/lua/dockerfile/powershell）
- 预览侧：Shiki（与 VSCode 同款 TextMate 语法）按需懒加载语言
- 编辑 .md 时代码块也走同一套 Shiki 高亮

**文件管理**

- 文件树侧栏：懒加载子目录，仅显示文本/代码文件，隐藏点开头条目
- 路径输入框：支持 `~/...` 展开 + 任意绝对路径回车直接打开
- 原生文件夹选择对话框
- 文件外部变更暂未监听（计划中）

**视觉**

- 文件树 + StatusBar 显示语言 logo（Simple Icons：Python 蛇、Rust 齿轮、Go 地鼠、Java 杯子、Docker 鲸鱼……）
- 未识别扩展自动用扩展名前 3 字母彩色 badge 兜底（颜色取自 GitHub Linguist）
- StatusBar 显示文件路径、行/字数、当前语言

**写作辅助**

- 未保存切文件三按钮确认对话框（保存 / 不保存 / 取消）
- 图片粘贴自动落盘到 `<工作区>/assets/paste-<ts>.<ext>`，光标位置插入 Markdown 链接
- 顶栏一键导出 **HTML**（独立文件 + 内嵌 CSS）和 **PDF**（系统打印对话框另存为）
- 美化的搜索面板（跟随主题色）

**快捷键**

| 键 | 动作 |
| --- | --- |
| `Cmd/Ctrl+N` | 新建 Tab |
| `Cmd/Ctrl+O` | 打开文件（可多选） |
| `Cmd/Ctrl+Shift+O` | 打开文件夹（设为工作区） |
| `Cmd/Ctrl+S` | 保存 |
| `Cmd/Ctrl+Shift+S` | 另存为 |
| `Cmd/Ctrl+W` | 关闭当前 Tab |
| `Cmd/Ctrl+B` | 开关侧栏 |
| `Cmd/Ctrl+F` | 查找 |

### 路线图

- 文件外部变更监听 + reload 提示
- 切 Tab 保留各自光标位置 / 撤销历史
- KaTeX 数学公式 / Mermaid 图表
- 大纲（TOC）侧栏
- 文件树搜索框 + 右键菜单（新建 / 重命名 / 删除）
- 拖目录到窗口直接设为工作区
- WYSIWYG / 所见即所得模式（Typora 风格）
- macOS / Windows 原生菜单栏（File / Edit / View）
- 设置面板（字体、主题、自动保存）

## 技术栈

| 层 | 选型 | 备注 |
| --- | --- | --- |
| 桌面框架 | **Tauri 2.10** | 系统 WebView，包体小、内存低 |
| 后端语言 | **Rust** (edition 2021) | 文件 IO、目录列举、图片落盘 |
| 前端框架 | **React 18** + **TypeScript 5** | |
| 构建 | **Vite 6** | HMR + 生产打包 |
| 编辑器内核 | **CodeMirror 6** | 模块化，按需加载语言 |
| Markdown 解析 | **markdown-it 14** | 加 anchor、task-lists 插件 |
| 代码高亮 | **Shiki 1.x** | TextMate 语法，与 VSCode 同款 |
| 状态管理 | **Zustand 5** | |
| 样式 | **Tailwind CSS 3** + CSS Variables | 主题切换 |
| 图标 | **react-icons (Simple Icons)** | 品牌 logo |

## 架构

```
+---------------------------------------------------------+
|  Tauri Window (WebView, ~10MB)                          |
|  +-----------+----------------+----------------------+  |
|  | FileTree  |  Editor        |  Preview             |  |
|  | (lazy)    |  (CodeMirror   |  (markdown-it +      |  |
|  |           |   + lang pack) |   Shiki)             |  |
|  +-----------+----------------+----------------------+  |
|  | StatusBar (file path, language, theme toggle)     |  |
|  +-------------------------------------------------- +  |
|         ^ React state (Zustand)         ^ HMR (Vite)    |
+---------|---------------------------------|-------------+
          v invoke() / @tauri-apps/api      v
+---------------------------------------------------------+
|  Rust Backend (src-tauri)                               |
|  - read_text_file / write_text_file                     |
|  - list_dir (filtered to text/code extensions)          |
|  - resolve_path (~ expansion + canonicalize)            |
|  - save_image (base64 -> assets/<name>)                 |
|  Plugins: dialog (native pickers), opener, log          |
+---------------------------------------------------------+
```

数据流：

1. **打开文件**：FileTree 点击 → `openFileByPath` → invoke `read_text_file` → 写入 Zustand store → Editor / Preview 由 store 驱动重渲染
2. **编辑**：CodeMirror updateListener → store.setContent → Preview 节流 80ms 重渲染
3. **保存**：`Cmd+S` → `saveFile` → invoke `write_text_file` → markSaved 清 dirty 状态
4. **图片粘贴**：CodeMirror `paste` 事件 → blob → base64 → invoke `save_image` → 在光标处插入 `![](assets/...)`

## 项目结构

> **多语言布局说明**：项目同时包含 **TypeScript 前端** 和 **Rust 后端**，是 Tauri 官方推荐的双根目录约定。看着像两个项目挤在一起，但其实分工清晰、互不干扰，CLI 工具链也按这个约定工作。
>
> | 目录 | 语言 | 角色 | 入口 |
> | --- | --- | --- | --- |
> | `src/` | TypeScript / TSX / CSS | WebView 里跑的 React 应用（UI、编辑器、预览） | `src/main.tsx` |
> | `src-tauri/` | Rust | 原生进程（窗口管理、文件 IO、系统对话框） | `src-tauri/src/main.rs` |
> | `scripts/` | Bash / PowerShell | 跨平台启动 + 打包脚本 | — |
> | 根目录 | JSON / JS / HTML | 构建配置（Vite、TS、Tailwind、Tauri）和包描述 | `package.json` |
>
> 通信只走一个口子：前端 `invoke("命令名", { 参数 })` → Rust `#[tauri::command]` 函数。所有 IO 在 Rust 侧，所有渲染在 TS 侧。

```
m_client/
├── src/                          # ── TypeScript / React 前端 ──
│   ├── App.tsx                   # 顶层组件 + 布局 + 拖拽监听 + 快捷键
│   ├── main.tsx                  # React 入口
│   ├── styles.css                # Tailwind + 主题变量 + 组件样式
│   ├── vite-env.d.ts
│   ├── components/
│   │   ├── Editor.tsx            # CodeMirror 封装 + 图片粘贴
│   │   ├── Preview.tsx           # Markdown / 代码渲染（仅 .md 显示）
│   │   ├── FileTree.tsx          # 懒加载目录树 + 路径输入框
│   │   ├── TabBar.tsx            # 多 Tab 切换 + 关闭
│   │   ├── TitleBar.tsx          # 顶栏工具按钮
│   │   ├── StatusBar.tsx         # 底栏状态（文件/行/语言/主题）
│   │   ├── ConfirmDialog.tsx     # 未保存三按钮模态
│   │   └── LangIcon.tsx          # 语言品牌 logo / 字母 badge
│   ├── lib/
│   │   ├── markdown.ts           # markdown-it + Shiki 渲染
│   │   ├── highlight.ts          # Shiki 单例 + 懒加载语言
│   │   ├── lang.ts               # 扩展名 → 语言映射 (CodeMirror + Shiki + 图标)
│   │   ├── fileio.ts             # 文件读写、Tab 操作、未保存守卫
│   │   └── export.ts             # HTML / PDF 导出
│   ├── store/
│   │   └── editor.ts             # Zustand store（tabs / workspace / 主题）
│   └── types/
│       └── shims.d.ts            # 第三方包类型补丁
│
├── src-tauri/                    # ── Rust 后端 ──
│   ├── src/
│   │   ├── main.rs               # 进程入口（调 lib::run）
│   │   └── lib.rs                # 所有 #[tauri::command]：read/write/list/save_image/...
│   ├── capabilities/default.json # Tauri 2 权限声明（dialog / opener）
│   ├── icons/                    # 应用图标 (.png/.icns/.ico)
│   ├── Cargo.toml                # Rust 依赖
│   ├── build.rs                  # Tauri build 钩子
│   └── tauri.conf.json           # 窗口配置 / identifier / 打包配置
│
├── scripts/                      # ── 跨平台脚本 ──
│   ├── start.sh                  # macOS / Linux 启动 (检 toolchain + npm i + tauri dev)
│   ├── start.ps1                 # Windows 启动
│   ├── build-mac.sh              # 打包 .dmg / .app（支持 --universal）
│   └── build-win.ps1             # 打包 .msi / .exe
│
├── index.html                    # Vite 入口 HTML
├── vite.config.ts                # Vite 配置（HMR / 端口 / Tauri 联动）
├── tsconfig.json                 # 主 TS 配置（src/）
├── tsconfig.node.json            # 工具链 TS 配置（vite.config.ts）
├── tailwind.config.js            # Tailwind 主题
├── postcss.config.js             # PostCSS 流水线
├── package.json                  # npm 依赖 + 脚本别名
└── README.md
```

### 想改 X 看哪里

| 想做的事 | 改这个文件 |
| --- | --- |
| 加新支持的语言/扩展名 | `src/lib/lang.ts`（前端映射） + `src-tauri/src/lib.rs` 的 `ALLOWED_EXTS`（让文件树显示） |
| 改窗口大小 / 标题 / identifier | `src-tauri/tauri.conf.json` |
| 改主题色 / 字体 | `src/styles.css` 顶部的 `:root` 和 `.dark` 变量 |
| 加 Markdown 插件（脚注、emoji 等） | `src/lib/markdown.ts` 里 `md.use(...)` |
| 加新的 Rust 命令 | `src-tauri/src/lib.rs` 加 `#[tauri::command] fn xxx()`，并在 `invoke_handler!` 里注册 |
| 加新的前端按钮 | `src/components/TitleBar.tsx` |
| 加键盘快捷键 | `src/App.tsx` 的 `onKey` 处理函数 |
| 加 React 组件 | 放进 `src/components/`，按需在 `App.tsx` 引入 |
| 改 Tab / 文件管理逻辑 | `src/store/editor.ts` + `src/lib/fileio.ts` |
| 改启动 / 打包流程 | `scripts/` 下对应平台脚本 |
| 加新前端依赖 | `npm install xxx`（写到 `package.json`） |
| 加新 Rust 依赖 | `src-tauri/Cargo.toml`（首次会触发增量重编） |
| 改前端权限（如启用 fs 插件） | `src-tauri/capabilities/default.json` |

## 日志

DEditor 启动后会自动写日志，便于排查闪退、未捕获异常、文件 IO 失败、内存问题等。

**日志路径**（按 OS 平台）：

| 平台 | 路径 |
| --- | --- |
| **macOS** | `~/Library/Logs/com.deditor.app/deditor.log`（旧文件 `deditor.log.1`、`deditor.log.2` 滚动保留） |
| **Windows** | `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log` |
| **Linux** | `~/.local/share/com.deditor.app/logs/deditor.log`（或 `$XDG_DATA_HOME/...`） |

**滚动策略**：单文件 10MB，写满自动转下一份，旧文件全部保留（`KeepAll`）。

**日志内容**：

- 应用启动 / 退出
- Rust 命令调用（文件读写、目录列举、图片落盘等）和失败原因
- 前端未捕获的 Error 和 Promise rejection（带堆栈）
- 持久化恢复 / 保存事件
- **Rust panic**（带文件名 + 行列号 + 消息）—— 最常见的"闪退"根因都会落在这里

**日志级别**（`info` 及以上写入；`debug`/`trace` 仅在 dev 模式打印到 stdout）：

- `error` —— 操作失败、panic、未捕获异常
- `warn` —— 可恢复的问题（如文件被外部删除、persistence 配额满）
- `info` —— 重要事件（启动、打开文件、保存、导出）

**快速查看**（macOS）：

```sh
# 实时跟踪
tail -f ~/Library/Logs/com.deditor.app/deditor.log

# 看最近的 error / panic
grep -E "ERROR|PANIC" ~/Library/Logs/com.deditor.app/deditor.log | tail -20

# 在 Finder 里打开日志目录
open ~/Library/Logs/com.deditor.app/
```

**报 bug 时建议附上最新一份日志**，能极大缩短诊断时间。

## 环境要求

- **Node.js** ≥ 18（推荐 20+）
- **Rust** ≥ 1.77（用 [rustup](https://rustup.rs/) 安装；国内推荐 [rsproxy](https://rsproxy.cn/) 镜像）
- **macOS**：Xcode Command Line Tools (`xcode-select --install`)
- **Windows**：[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win10/11 内置）
- **Linux**：`webkit2gtk-4.1`、`libssl-dev`、`libayatana-appindicator3-dev`

## 快速开始

### macOS / Linux

```sh
./scripts/start.sh
# 或
npm run start:mac
```

### Windows

```powershell
.\scripts\start.ps1
# 或
npm run start:win
```

脚本会自动检查 Node / Rust，必要时跑 `npm install`，然后启动 `tauri dev`。

首次启动 Rust 编译需要 5-10 分钟（拉 ~400 个 crate），后续增量重编 3-10 秒。

## 打包

### macOS → .dmg / .app

```sh
./scripts/build-mac.sh           # 当前架构 (arm64 或 x64)
./scripts/build-mac.sh --universal  # Apple Silicon + Intel 通用包
# 或
npm run build:mac
```

产物：

```
src-tauri/target/release/bundle/dmg/DEditor_<ver>_<arch>.dmg
src-tauri/target/release/bundle/macos/DEditor.app
```

### Windows → .msi / .exe

```powershell
.\scripts\build-win.ps1
# 或
npm run build:win
```

产物：

```
src-tauri\target\release\bundle\msi\DEditor_<ver>_x64_en-US.msi
src-tauri\target\release\bundle\nsis\DEditor_<ver>_x64-setup.exe
```

> 注意：macOS 包必须在 macOS 上构建，Windows 包必须在 Windows 上构建（Tauri 不支持 macOS↔Windows 交叉编译）。需要双平台同时出包请用 GitHub Actions matrix（`macos-latest` + `windows-latest`），或两台机器各跑一次。

### 代码签名（可选但推荐）

- **macOS**：在 `tauri.conf.json` 的 `bundle.macOS` 设置 `signingIdentity`，本地需安装 Apple Developer ID 证书。打包后用 `xcrun notarytool` 公证。
- **Windows**：在 `tauri.conf.json` 的 `bundle.windows.certificateThumbprint` 配置 Authenticode 证书指纹。无证书会触发 SmartScreen 警告。

未签名的本地构建包仅供测试用，分发请配置签名。

## 配置说明

### 修改窗口大小 / 标题

`src-tauri/tauri.conf.json` 的 `app.windows[0]`。

### 修改应用 identifier（重要！发布前必改）

`src-tauri/tauri.conf.json` 的 `identifier`，建议反向域名格式（如 `com.yourname.meditor`）。

### 添加新语言支持

1. `src/lib/lang.ts` 的 `ext` 表加扩展名条目（指定 CodeMirror loader 和 Shiki id）
2. `src-tauri/src/lib.rs` 的 `ALLOWED_EXTS` 加扩展名（让文件树显示）
3. （可选）`src/lib/fileio.ts` 的 `MD_FILTER` 加扩展名（让打开对话框过滤）
