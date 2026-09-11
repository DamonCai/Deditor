# DEditor

DEditor 是基于 Tauri 2、React 和 TypeScript 的桌面 Markdown / 多语言代码编辑器，面向 macOS 和 Windows。使用系统 WebView，不随应用捆绑 Chromium。

当前开发版本为 **0.9.0**。Markdown 已接入阅读编辑内核；源码编辑、HTML 预览和 XMind 编辑各自保留独立处理路径。安装包大小、启动时间和内存占用取决于平台、构建方式及打开的文件，本项目不将历史测量值作为固定承诺。

## Markdown 写作

打开 `.md` 或 `.markdown` 文件后，在工具条选择视图：

| 模式 | 用途 |
| --- | --- |
| 编辑 | 使用 CodeMirror 编辑完整 Markdown 源码 |
| 实时预览 | 源码与渲染结果分栏显示，支持滚动联动 |
| 阅读编辑 | 在排版后的文章中直接输入、选择、删除和修改内容 |
| 只读 | 使用同一文章呈现组件，关闭编辑操作 |

阅读编辑与实时预览共用正文排版：标题、段落、列表、引用、表格、代码、公式及图片在相同栏宽和字号下保持一致，字号调整同时生效。阅读编辑在页边显示当前编辑块的轻量提示：标题 H1–H6、正文 `¶`、引用 `>`、列表 `-` / `1.`、任务 `[ ]`、表格 `| |`、代码 `</>`、公式 `$$`、图表 UML、图片 IMG、分隔线 `---`，以及 HTML / YAML / 保留原文 MD。提示跟随编辑光标或整块选中位置，选择一段文字、失焦或切到只读时隐藏；不占正文空间、不写入 Markdown，也不会出现在实时预览或导出中。

阅读编辑基于 Milkdown / ProseMirror，支持标题、粗斜体、删除线、颜色与高亮、列表、引用、任务框、表格、链接、图片及公式。表格可直接编辑单元格，Tab / Shift+Tab 导航，末单元格 Tab 增加一行；兼容已有的表格内列表扩展。

代码块内嵌 CodeMirror，支持高亮与语言设置。公式、Mermaid 和 PlantUML 显示渲染结果，并提供块源码编辑入口。Mermaid 与 KaTeX 在本地渲染，PlantUML 使用联网服务。

普通代码块与实时预览使用相同的 Shiki 高亮；点击代码或聚焦后按 Enter 进入 CodeMirror 编辑，Esc 或离开代码块后恢复呈现。公式和图表沿用同一渲染链路，源码控件在悬停或聚焦时出现。进入块源码编辑时保留原呈现高度，避免高图表突然收缩带动正文；输入时直接更新原文，退出后再更新图表，未修改的预览直接复用。

源码、阅读编辑和工具条共用每标签撤销历史；切换模式、切换标签后可以继续撤销。保存仍以 Markdown 原文为依据：普通文字编辑优先修改对应源范围，未编辑的块保留原样；结构调整可能规范化被修改的块。显式格式化及“保存时格式化”仍按设置执行。

引用式链接及常见行内 HTML（颜色、键帽文字、换行等）保持正文可编辑，不锁住所在列表或表格。未识别 HTML、引用定义、frontmatter 等内容采用保留源码块，点击内容或“编辑此块源码”可就地修改，确认后返回呈现结果。`.mdx` 保留整篇源码，不执行 JSX，不提供完整 JSX 可视化编辑。图片保留 alt 说明与路径，暂不提供无法用标准 Markdown 持久化的拖动缩放。

工具条还提供链接、图片、表格、折叠块、公式和图表插入，以及 **HTML、PDF、DOCX、PPTX、TXT、SVG、PNG** 导出。SVG 用于导出文档中的图表；PDF 使用系统打印流程。导出不等于具备对应 Office 文件的导入编辑能力。

## 代码与文件工具

- CodeMirror 6：多光标、列选、代码折叠、缩进引导线、空白字符、迷你地图、自动换行、自动闭合括号、书签和颜色预览。
- 多语言高亮：JavaScript / TypeScript、Python、Rust、Go、Java、C/C++、HTML/CSS、Vue、Svelte、SQL、JSON、YAML、TOML、Shell 等，也识别 Dockerfile、Makefile 等特殊文件名。
- JSON / JSONC / JSON5：格式化、压缩、键排序；支持部分 Python 字典字面量输入。
- SQL 格式化与方言选择；通用 Prettier 格式化按文件类型加载。
- 多工作区文件树、模糊文件导航、当前文件符号跳转、跨文件搜索与替换。
- 文件与目录拖入、重命名、新建、删除、系统定位、最近文档、重新打开关闭的标签。
- 双栏文件差异比较、同文件分屏编辑、专注模式。
- 自动保存可选关闭、失焦保存或停止编辑后保存；外部文件变化时，未修改标签自动重载，存在修改时提示处理。
- 明暗主题、中英文界面、编辑器设置及快捷键开关；统一工具条、对话框和状态栏。

## 支持查看的文件

| 类型 | 行为 |
| --- | --- |
| Markdown | 源码、分栏预览、阅读编辑、只读 |
| HTML / HTM | 源码与独立沙箱 iframe 预览，保留文件自身排版 |
| XMind | 本地 SVG 画布，主题编辑、层级调整、拖拽、布局、样式、备注、标签、联系、边界、概要、工作表及撤销/保存 |
| 图片 | 内嵌查看 PNG、JPEG、GIF、SVG、WebP 等 |
| PDF | 内嵌查看，具体交互受平台 WebView 支持影响 |
| 音频 / 视频 | 使用平台媒体能力播放，格式兼容性取决于系统编解码器 |
| Office、压缩包、数据库、可执行文件等二进制 | 十六进制查看，最多显示前 256 KB；不是 Word / Excel / PowerPoint 可视化编辑器 |

XMind 使用专用文档模型并尽量保留原归档中的未知字段和附件，兼容性核对仍在推进；不能将已覆盖样例等同于所有 XMind 版本和模板均兼容。

## 常用快捷键

macOS 使用 Cmd，Windows 使用 Ctrl。快捷键会随当前编辑区有所区别，可在设置中查看和调整。

| 快捷键 | 功能 |
| --- | --- |
| `Cmd/Ctrl+N`、`O`、`S` | 新建、打开、保存 |
| `Cmd/Ctrl+Shift+S` | 另存为 |
| `Cmd/Ctrl+W`、`Cmd/Ctrl+Shift+T` | 关闭标签、重新打开最近关闭标签 |
| `Cmd/Ctrl+Z`、`Cmd/Ctrl+Shift+Z` | 撤销、重做 |
| `Cmd/Ctrl+P` | 跨工作区模糊查找文件 |
| `Cmd/Ctrl+Shift+P` | 命令面板 |
| `Cmd/Ctrl+R` | 当前文档符号 / 标题跳转 |
| `Cmd/Ctrl+F` | 当前编辑区查找 |
| `Cmd/Ctrl+Shift+F` | 跨文件搜索与替换 |
| `Cmd/Ctrl+Alt+G` | 源码编辑器跳行 |
| `Cmd/Ctrl+B` | 源码模式切换侧栏；阅读编辑正文中用于加粗 |
| `Cmd/Ctrl+K` | 专注模式 |
| `Cmd/Ctrl+\` | 同文件分屏编辑 |
| `Cmd/Ctrl+,` | 设置 |
| `F2`、`F8`、`Shift+F8` | 源码书签操作；XMind 使用自己的主题编辑快捷键 |

## 安装依赖与启动

使用 Node.js 22 或 24 系列、npm、Rust stable。Cargo 声明的最低 Rust 版本为 1.77.2，但实际构建还受锁定依赖的工具链要求影响。macOS 需要 Xcode Command Line Tools；Windows 需要 Microsoft C++ Build Tools 和 WebView2。Linux 可用于开发，需要 WebKitGTK 等系统依赖，当前主要交付目标仍为 macOS / Windows。

```sh
npm ci
```

macOS：

```sh
./scripts/start.sh
# 保留 Vite 缓存
./scripts/start.sh --no-reset
```

Windows：

```powershell
.\scripts\start.ps1
# 保留 Vite 缓存
.\scripts\start.ps1 -NoReset
```

启动脚本检查工具链、补装缺失依赖并启动 Tauri 开发环境。默认只清理 Vite 缓存，不重置文档状态；不要将 `--reset-state` / `-ResetState` 当作日常启动选项。

只启动前端可用 `npm run dev`。普通浏览器不提供 Tauri 的文件和系统接口，不能据此前端页面代替完整桌面应用。

## 打包

macOS：

```sh
./scripts/build-mac.sh
./scripts/build-mac.sh --universal
```

DMG 复制到 `scripts/`，原始构建位于 `src-tauri/target/release/bundle/`。

Windows：

```powershell
.\scripts\build-win.ps1
```

MSI / NSIS 安装包位于 `src-tauri/target/release/bundle/msi/` 和 `nsis/`。使用对应平台的构建环境；发布所需的代码签名、公证和证书需单独配置。本地构建成功不代表安装、升级或平台交互已经验收。

隔离的 Markdown 验证应用使用独立名称和 identifier，不覆盖正式应用：

```sh
npx tauri build --config tests/markdown-native-review.conf.json --bundles app
```

## 测试与验证

```sh
npm run build
npm run test:all
cargo test --release --manifest-path src-tauri/Cargo.toml -- --test-threads=1
npm run perf:all
```

`test:all` 汇总 Markdown 文档层、阅读编辑集成、通用组件、XMind、导出、语言高亮及文件图标测试。各项也可单独执行：

| 命令 | 范围 |
| --- | --- |
| `npm run test:markdown-visual` | 原文保真、源位置映射、共用历史、语法边界 |
| `npm run test:markdown-visual:integration` | 阅读组件、保存/另存、失败恢复、表格和只读交互 |
| `npm run test:regression` | 编辑器、HTML、工具条、文件操作及 XMind 组件回归 |
| `npm run test:xmind` | XMind 模型、布局、归档写回与字段保留 |
| `npm run test:export` | 各种导出格式、资源与错误路径 |
| `npm run test:syntax` | 语言识别与高亮 |
| `npm run test:file-icons` | 图标映射、授权文件和构建资源 |
| `npm run perf:all` | store、组件、长时操作、文档、XMind 和 Rust 基准 |

浏览器隔离验证入口为 `tests/markdown-visual-review.html`；`?parity&presentation` 并排运行真实 Preview 与阅读编辑，使用同一自建样例核对布局。`?interaction` 检查长文输入、搜索和光标稳定性；`?scroll` 检查高图表、长代码及文末输入时的位置变化。`?ime` 使用中文长文，提供组词事件和额外滚动的模拟按钮，用于检查输入法滚动保护；模拟测试不等同于原生候选字验收。测试只使用自建样例，不读取用户已有文档或正式应用历史。`tests/artifacts/`、截图和安装包被 Git 忽略；需要迁移时单独保存。

自动化测试不能代替真实输入法、原生保存对话框、重启恢复及双平台交互。中文组词期间已加入可视区保护，修复后的真实 IME、部分原生交互和复杂语法兼容性仍有待验收项，见 [Markdown 实施记录](docs/markdown-visual-editing-verification-2026-09-11.md)及[本次提交验证记录](docs/markdown-release-verification-2026-09-11.md)。XMind 状态见[独立验收矩阵](docs/xmind-acceptance-matrix-2026-09-11.md)。

## 架构与持久化

| 层次 | 主要位置与职责 |
| --- | --- |
| 应用外壳 | `src/App.tsx`、`src/components/`：布局、模式、标签、工具条和浮层 |
| 状态 | `src/store/editor.ts`：文档内容、共享设置及标签状态 |
| 源码编辑 | CodeMirror 6，语言与主题按需加载，保留标签编辑会话 |
| 阅读编辑 | `src/components/MarkdownVisualEditor.tsx` 与 `src/lib/markdownVisual/` |
| Markdown 文档与历史 | `markdownVisual/document.ts`、`markdownSession.ts`、`markdownHistory.ts` |
| 文件与持久化 | `src/lib/fileio.ts`、`persistence.ts`、`fileWatch.ts`；通过 Rust IPC 执行文件操作 |
| XMind | `src/lib/xmind/` 及专用画布，独立模型与历史 |
| 原生后端 | `src-tauri/src/lib.rs`：文件 IO、搜索、路径处理、原生菜单、日志等 |

标签草稿、工作区和设置写入应用数据目录的 `state.json`，旧 localStorage 数据可迁移。编辑器实例、完整撤销栈和临时浮层不写入该文件。

| 平台 | 状态文件 |
| --- | --- |
| macOS | `~/Library/Application Support/com.deditor.app/state.json` |
| Windows | `%APPDATA%\com.deditor.app\state.json` |
| Linux | `~/.local/share/com.deditor.app/state.json` |

核心编辑与本地文件处理不要求联网。PlantUML、文档中的远程图片或其他外部资源可能访问网络。

## 日志、维护与协作

macOS 日志位于 `~/Library/Logs/com.deditor.app/deditor.log`，Windows 位于 `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log`；实际目录由平台日志插件决定。Rust panic、前端异常和文件操作错误会记录到滚动日志。提供问题日志前请检查是否包含文档路径或内容。

构建清理使用 `scripts/clean.sh` / `scripts/clean.ps1`，先用 `--dry-run` / 相应脚本帮助查看范围。`--all` 会额外删除依赖与 npm 锁文件，应谨慎使用。

协作规则与项目上下文见 [AGENTS.md](AGENTS.md)，Markdown 设计见[架构上下文](docs/markdown-visual-editing-context-2026-09-11.md)。新增能力应保护其他文件类型，补齐中英文文案，使用自建样例完成不同维度测试，并记录未验证范围。

仓库目前没有独立的项目 `LICENSE` 文件，不应将其视为已明确采用 MIT 授权；第三方资源的授权说明按其目录中的文件保留。
