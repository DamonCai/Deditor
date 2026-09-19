# 开发与维护

[返回项目介绍](../README.md)

本文收录快捷键、构建、测试与架构参考。能力介绍和效果展示见项目首页；验收记录保留各自的快照与平台边界。

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
| `Cmd/Ctrl+\` | 切换左右分屏（关闭时合并标签） |
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
| `npm run test:markdown-visual:integration` | 阅读组件、保存/另存、失败恢复、表格、模式切换及旧设置迁移 |
| `npm run test:regression` | 编辑器、HTML、工具条、文件操作及 XMind 组件回归 |
| `npm run test:xmind` | XMind 模型、布局、归档写回与字段保留 |
| `npm run test:export` | 各种导出格式、资源与错误路径 |
| `npm run test:syntax` | 语言识别与高亮 |
| `npm run test:file-icons` | 图标映射、授权文件和构建资源 |
| `npm run perf:all` | store、组件、长时操作、文档、XMind 和 Rust 基准 |
| `npm run perf:markdown-controls` | 100 / 500 / 2000 项任务文档的局部控件更新基准；不包含浏览器排版或真实输入法 |

浏览器隔离验证入口为 `tests/markdown-visual-review.html`；`?typora&parity` 增加化学公式、编号引用和旧式图表等完整样例；`?long&sections=500` 测量复杂长文输入与模式切换。`?parity&presentation` 并排运行真实 Preview 与阅读编辑，使用同一自建样例核对布局。`?complex&parity` 使用 300 余行完整自建 Markdown 核对 H1–H6、多级嵌套、表格、代码、公式、图表、定宽图片、脚注、目录、提示块和文末编辑。`?interaction` 检查长文输入、搜索和光标稳定性；`?scroll` 检查高图表、长代码及文末输入时的位置变化。`?ime` 使用中文长文，提供组词事件和额外滚动的模拟按钮，用于检查输入法滚动保护；模拟测试不等同于原生候选字验收。测试只使用自建样例，不读取用户已有文档或正式应用历史。`tests/artifacts/`、截图和安装包被 Git 忽略；需要迁移时单独保存。

自动化测试不能代替真实输入法、原生保存对话框、重启恢复及双平台交互。中文组词期间已加入可视区保护，修复后的真实 IME、部分原生交互和复杂语法兼容性仍有待验收项，见 [Markdown 实施记录](markdown-visual-editing-verification-2026-09-11.md)及[本次提交验证记录](markdown-release-verification-2026-09-11.md)。P0–P3 的当前范围和验收状态见[执行清单](markdown-typora-roadmap-2026-09-11.md)及[本次扩展验证](markdown-p1p3-verification-2026-09-12.md)。字体调整后的非导出差距、图片路径修复和行内收起性能测量见[非导出检查记录](markdown-non-export-audit-2026-09-12.md)。直接编辑、简写、按文档图片目录、原生图片整理和后续长文优化见[非导出扩展实施记录](markdown-extended-editing-2026-09-12.md)。固定 Typora 核对清单及本次功能补齐、历史恢复、复杂文档和压力测试的结论见[补齐与验收记录](markdown-typora-implementation-2026-09-12.md)。最新组词历史修复与未完成的原生验收见 [P0 输入验证](markdown-p0-input-verification-2026-09-11.md)。XMind 状态见[独立验收矩阵](xmind-acceptance-matrix-2026-09-11.md)。

## 架构与持久化

长文输入和原生光标的最新结果见[验证记录](markdown-native-caret-long-document-2026-09-12.md)。测试页 `?long&sections=500` 可生成 6303 行复杂样例；普通连续输入、跨模式撤销和共享样式已有操作证据，真实中文候选、Windows 以及长时间大文档压力测试仍未完成。

| 层次 | 主要位置与职责 |
| --- | --- |
| 应用外壳 | `src/App.tsx`、`src/components/`：布局、模式、标签、工具条和浮层 |
| 状态 | `src/store/editor.ts`：文档内容、共享设置及标签状态 |
| 源码编辑 | CodeMirror 6，语言与主题按需加载，保留标签编辑会话 |
| 阅读编辑 | `src/components/MarkdownVisualEditor.tsx` 与 `src/lib/markdownVisual/` |
| Markdown 共享展示 | `MarkdownDocumentSurface.tsx` 统一字号与文章主题，`preview.css` 统一排版，`markdownDisplay.ts` 统一静态块处理及图片/图表渲染生命周期；阅读编辑仅保留必要的控件与 DOM 包裹适配 |
| Markdown 文档与历史 | `markdownVisual/document.ts`、`markdownSession.ts`、`markdownHistory.ts` |
| 文件与持久化 | `src/lib/fileio.ts`、`persistence.ts`、`fileWatch.ts`；通过 Rust IPC 执行文件操作 |
| XMind | `src/lib/xmind/` 及专用画布，独立模型与历史 |
| 原生后端 | `src-tauri/src/lib.rs`：文件 IO、搜索、路径处理、原生菜单、日志等；`markdown_images.rs`：Markdown 图片下载与 PicGo 通信；`markdown_history.rs`：历史版本、草稿和容量轮换 |

维护 Markdown 呈现时，优先修改共享展示层，避免分别调整预览与阅读编辑的正文样式。自建复杂样例页面 `tests/markdown-visual-review.html?complex&parity` 提供“检查呈现一致性”，对照真实 Preview 的字体、颜色、行高、尺寸与块位置；窄窗、大字号和紧凑排版也须复测。ProseMirror 继续独立持有可编辑正文，显示设置变化不会替换正在编辑的 DOM。

标签草稿、工作区、Markdown 写作设置和其他编辑器设置写入应用数据目录的 `state.json`，旧 localStorage 数据可迁移。编辑器实例、完整撤销栈和临时浮层不写入该文件。

| 平台 | 状态文件 |
| --- | --- |
| macOS | `~/Library/Application Support/com.deditor.app/state.json` |
| Windows | `%APPDATA%\com.deditor.app\state.json` |
| Linux | `~/.local/share/com.deditor.app/state.json` |

核心编辑与本地文件处理不要求联网。PlantUML、文档中的远程图片或其他外部资源可能访问网络；主动下载图片和 PicGo 图床上传需要相应服务可用。

## 日志、维护与协作

macOS 日志位于 `~/Library/Logs/com.deditor.app/deditor.log`，Windows 位于 `%LOCALAPPDATA%\com.deditor.app\logs\deditor.log`；实际目录由平台日志插件决定。Rust panic、前端异常和文件操作错误会记录到滚动日志。提供问题日志前请检查是否包含文档路径或内容。

构建清理使用 `scripts/clean.sh` / `scripts/clean.ps1`，先用 `--dry-run` / 相应脚本帮助查看范围。`--all` 会额外删除依赖与 npm 锁文件，应谨慎使用。

协作规则与项目上下文见 [AGENTS.md](../AGENTS.md)，Markdown 设计见[架构上下文](markdown-visual-editing-context-2026-09-11.md)。新增能力应保护其他文件类型，补齐中英文文案，使用自建样例完成不同维度测试，并记录未验证范围。

仓库目前没有独立的项目 `LICENSE` 文件，不应将其视为已明确采用 MIT 授权；第三方资源的授权说明按其目录中的文件保留。
