# DEditor

> 一个**轻量、快、能直接看 Word 也能看视频**的跨平台代码 / Markdown 编辑器。
> macOS（.dmg / .app）+ Windows（.msi / .exe），单文件包 ~10MB。

基于 **Tauri 2 + React 18 + CodeMirror 6** 构建。原生 WebView，无 Chromium 捆绑。

---

## 为什么选 DEditor

| | DEditor | VSCode | Sublime Text | Typora |
| --- | --- | --- | --- | --- |
| 安装包 | **~10MB** | ~100MB | ~20MB | ~100MB |
| 启动内存 | **~80MB** | ~300MB | ~70MB | ~250MB |
| Markdown 实时分栏预览 | ✅ | 需插件 | ❌ | ✅（WYSIWYG） |
| 50+ 语言代码高亮 | ✅ | ✅ | ✅ | ❌ |
| Word / Excel / 压缩包 hex 预览 | ✅ | ❌ | ❌ | ❌ |
| PDF / 图片 / 音视频内嵌 | ✅ | 需插件 | ❌ | ❌ |
| 文件对比（双栏 diff） | ✅ | ✅ | 收费 | ❌ |
| Goto Anything (Cmd+P) | ✅ | ✅ | ✅ | ❌ |
| Find in Files (Cmd+Shift+F) | ✅ | ✅ | ✅ | ❌ |
| 命令面板 (Cmd+Shift+P) | ✅ | ✅ | ✅ | ❌ |
| 快捷键全部可在 UI 里禁用 | ✅ | 需改 JSON | 需改 JSON | ❌ |
| 跨 Tab 撤销栈保留 | ✅ | ✅ | ✅ | ✅ |
| 中英文界面实时切换 | ✅ | 需重启 | 不支持 | 不支持 |
| 开源 | ✅ | ✅ | ❌ | ❌ |

**特别擅长的场景**：
- 临时打开一个项目就想找文件、读代码 → Cmd+P 模糊搜文件 + Cmd+R 跳函数
- 同时看 Word 文档 / 图片 / PDF / 音视频 + 改代码 → 不用再切换三个应用
- 边改边看（Markdown 写作 + 预览） → 实时分栏滚动联动
- 多个项目并存 → 多工作区，文件树展开状态持久记忆
- 系统快捷键冲突 → Cmd+, 进设置一键关掉冲突项

## 功能一览

**编辑核心**

- CodeMirror 6 内核：多光标、列选、折叠、缩进引导线、显示空白、minimap、自动换行（运行时切换）
- **撤销栈跨 Tab 保留** —— 切走再切回来还能 Cmd+Z
- 50+ 文件类型识别：`.md` / `.py` / `.js` / `.ts` / `.tsx` / `.rs` / `.go` / `.java` / `.kt` / `.cpp` / `.cs` / `.html` / `.css` / `.vue` / `.svelte` / `.json` / `.yaml` / `.toml` / `.xml` / `.sql` / `.php` / `.rb` / `.swift` / `.lua` / `.sh` 等，及 `Dockerfile` / `Makefile` / `.gitignore` 等特殊文件名
- Bookmarks（F2 / F8 跳转） + 自动保存（关 / 失焦 / 停止编辑后）

**全局导航**

| 快捷键 | 功能 |
| --- | --- |
| `Cmd/Ctrl+P` | Goto Anything — 跨工作区模糊搜索文件名 |
| `Cmd/Ctrl+Shift+P` | 命令面板 — 模糊搜任意命令并执行 |
| `Cmd/Ctrl+R` | Goto Symbol — 当前文件函数 / 标题大纲 |
| `Cmd/Ctrl+Shift+F` | Find in Files — 全工作区文本搜索 |
| `Cmd/Ctrl+Alt+G` | Goto Line — 跳到行号 |
| `Cmd/Ctrl+,` | 打开设置 |
| `Cmd/Ctrl+B` | 开关侧栏 |
| `Cmd/Ctrl+K` | 专注模式（隐藏所有 chrome） |
| `Cmd/Ctrl+\` | 分屏编辑（同一文件双视图） |

**文件管理**

- 文件树侧栏：懒加载、`~` 路径展开、**展开状态持久化**
- 右键菜单：新建文件 / 文件夹、重命名、删除、Reveal in Finder、**Select for Compare**
- OS 级拖拽：拖文件直接打开、**拖目录加为工作区**
- **外部变更检测**：3 秒检测一次，无脏改的 tab 自动重载，有脏改的弹横幅让你选

**打开就能看**

- 图片（PNG / JPG / GIF / SVG / WebP / ico）→ 内嵌 `<img>`
- PDF → 原生 WebView 浏览器
- 音视频（MP3 / WAV / FLAC / MP4 / WebM / MOV）→ HTML5 `<audio>` / `<video>`
- Word / Excel / PowerPoint / 压缩包 / 数据库文件 / 可执行文件 → **hex dump**（256KB 上限，至少看个魔术字节）
- Markdown → 实时分栏预览（编辑↔预览滚动联动），导出 HTML / PDF

**对比 / 差异**

- 文件树右键 "Select for Compare" → 在另一个文件上右键 "Compare with …" → 双栏 diff（jsdiff Myers 算法）
- 修改 / 新增 / 删除分别用红 / 绿 / 灰底标注

**写作辅助**

- 图片粘贴自动落盘到 `<工作区>/assets/` + 光标处插入 Markdown 链接
- markdown-it 14 + 各种插件（anchor、task-lists、PlantUML 在线渲染）
- Shiki 代码块高亮（与 VSCode 同款 TextMate 语法）

**设置面板（Cmd+,）**

- **通用**：主题（亮 / 暗）、语言（中文 / English）、字号、自动保存模式
- **编辑器**：自动换行 / 缩进引导线 / 显示空白 / Minimap
- **快捷键**：每条都可独立启用 / 禁用，菜单条目仍可点击
  - 解决"我系统快捷键就是 Cmd+P，跟你这个冲突"的痛点
- **恢复默认** 一键还原

## 架构（30 秒版）

```
┌──────────────────────────────────────────────────────────┐
│  WebView (~10MB, 系统自带)                               │
│   ├── React 18 + Zustand              单一 store          │
│   ├── CodeMirror 6                    编辑器内核 + 扩展   │
│   ├── markdown-it + Shiki             Markdown 预览       │
│   └── lib/ — 模糊匹配 / diff / 符号 / 文件监听 / ...     │
│                       ↕ invoke()                         │
└──────────────────────│───────────────────────────────────┘
                       │ JSON IPC（唯一通道）
┌──────────────────────▼───────────────────────────────────┐
│  Rust 主进程                                             │
│   ├── 文件 IO（read/write/list/walk/grep/mtime）         │
│   ├── 原生菜单（i18n + macOS AppKit 清理注入项）         │
│   ├── 路径解析、剪贴板图片落盘                           │
│   └── tauri-plugin-log（panic hook + 滚动日志）          │
└──────────────────────────────────────────────────────────┘
```

**关键设计选择**：

- **所有 IO 在 Rust 端，所有渲染在 TS 端**。前端不开 fs 插件，没有"前端直接读写文件系统"的口子
- **单 Zustand store**：跨组件共享状态都在一处，约 30 个字段，按"标签 / 工作区 / 视图 / 编辑器选项 / 快捷键 / 浮层"分组
- **Compartment-based hot swap**：主题、语言、自动换行、缩进线、空白、minimap 6 个开关运行时无缝切，不重建编辑器
- **每个 tab 一份 CodeMirror state JSON 缓存**（`Map<tabId, JSON>`，模块级），切 tab 撤销栈不丢
- **本地优先**：localStorage v3 持久化所有用户选择（tabs / 工作区 / 主题 / 全部设置）
- **零云依赖**：除了 PlantUML 块需要联网渲染，其它一切离线可用

详细架构文档（进程模型、模块分层、数据流、状态字段、性能边界）见 `CLAUDE.md`。

## 项目结构

```
deditor/
├── src/                  # React 前端
│   ├── App.tsx           # 顶层布局 + 全局键盘 + drop
│   ├── components/       # 16 个 UI 组件（Editor / Preview / Tabs / 各类浮层）
│   ├── lib/              # 18 个纯逻辑模块（fileio / fuzzy / diff / symbols / ...）
│   ├── store/editor.ts   # Zustand 单一 store
│   └── styles.css        # Tailwind + CSS 变量主题
├── src-tauri/            # Rust 后端
│   ├── src/lib.rs        # 所有 #[tauri::command]
│   ├── tauri.conf.json   # 窗口 / 打包配置
│   ├── Info.plist        # macOS 抑制 AppKit 自动注入
│   └── icons/            # 应用图标
├── scripts/              # 跨平台启动 / 打包 / 清理脚本
├── package.json
├── vite.config.ts
└── README.md / CLAUDE.md
```

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

> 首次启动 Rust 编译需要 5-10 分钟（拉 ~400 个 crate），后续增量重编 3-10 秒。

## 打包

### macOS

```sh
./scripts/build-mac.sh             # 当前架构
./scripts/build-mac.sh --universal # arm64 + x64 通用包
```

产物：`scripts/DEditor_<ver>_<arch>.dmg`

### Windows

```powershell
.\scripts\build-win.ps1
```

产物：
- `src-tauri\target\release\bundle\msi\DEditor_<ver>_x64_en-US.msi`
- `src-tauri\target\release\bundle\nsis\DEditor_<ver>_x64-setup.exe`

> macOS 包必须在 macOS 上构建，Windows 包必须在 Windows 上构建（Tauri 不支持交叉编译）。

### 代码签名（推荐）

- macOS：`tauri.conf.json` 的 `bundle.macOS.signingIdentity` + `xcrun notarytool` 公证
- Windows：`bundle.windows.certificateThumbprint` 配 Authenticode 证书

未签名的本地构建仅供测试用。

## 环境要求

- **Node.js** ≥ 18（推荐 20+）
- **Rust** ≥ 1.77（[rustup](https://rustup.rs/)；国内推荐 [rsproxy](https://rsproxy.cn/) 镜像）
- **macOS**：Xcode Command Line Tools (`xcode-select --install`)
- **Windows**：[Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) + [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)（Win10/11 内置）
- **Linux**：`webkit2gtk-4.1` + `libssl-dev` + `libayatana-appindicator3-dev`

## 日志

DEditor 启动后自动写日志，便于排查闪退、未捕获异常、文件 IO 失败等。

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Logs/com.deditor.app/deditor.log` |
| Windows | `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log` |
| Linux | `~/.local/share/com.deditor.app/logs/deditor.log` |

10MB 滚动 / KeepAll。Rust panic 会带文件 + 行列号落盘。报 bug 时建议附上最新一份日志。

```sh
# 实时跟踪（macOS）
tail -f ~/Library/Logs/com.deditor.app/deditor.log

# 看最近的 error / panic
grep -E "ERROR|PANIC" ~/Library/Logs/com.deditor.app/deditor.log | tail -20
```

## 贡献 / 二次开发

详细的架构文档、模块划分、关键数据流、扩展点说明见 `CLAUDE.md`。
该文件也是 Claude Code 在本仓工作时自动加载的协作上下文。

---

License: MIT（如需更改，更新 `Cargo.toml` / `package.json` 的 `license` 字段）
