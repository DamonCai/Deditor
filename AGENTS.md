# DEditor 协作说明

本文件只放当前约束和接续入口。历史逐轮记录可从 Git 历史查看；不要把旧记录中的待办数量、未提交状态或平台结论当作当前状态。

## 当前接续

- 项目是 Tauri 2 + React/TypeScript 的 macOS、Windows 本地编辑器；应用名 `DEditor`，包名 `deditor`，identifier `com.deditor.app`。
- 最新待办以 [pending-tasks](docs/pending-tasks.md) 为准。2026-10-14 时剩 WIN-04（Windows 文件管理器真实拖放到目标窗口）和 CLIP-03（跨显示器持续拖选）两项。已完成范围见 [completed-tasks](docs/completed-tasks.md)。待验收不等于未实现。
- 2026-10-14 阅读编辑移动图块保留落点视口；长图重建期间保留旧高度；表格增加顶部整表拖动手柄，复用落点、边缘滚动、取消、同父排序和 Alt+↑/↓。当轮 35 组图表/表格、108 阅读集成、149 通用及生产构建通过；浏览器长图滚动和整表拖动已验，未新增原生验收。细节见 [图块与整表拖动记录](docs/markdown-block-drag-2026-10-14.md)。
- Windows 1.0.2 安装曾被打包进程重定向到 Codex 的 LocalCache。后续重装必须从同一用户的非打包进程核对真实 EXE、快捷方式目标与图标，不能只看安装进程中的 `Test-Path`。见 [Windows 验收记录](docs/windows-acceptance-2026-10-08.md)。
- 在 `main` 的 2026-10-14 快照中，`package.json` 的许多 `test:*` 命令引用了未入库的 `scripts/test-*` 文件；先核对实际文件是否存在，不得把未运行的 `test:all` 记为通过。维护测试入口见 [tests/README](tests/README.md)。

## 工作边界

- 每次先检查 `git status`，保护已有未提交改动。实际提交、推送与打包状态以本轮证据为准；历史记录里的授权或限制只描述当时任务。
- 验证只使用本轮自建样例或用户主动提供的文件。不得为排查主动读取用户已有文档、应用历史、持久化状态及其引用文件。
- 本地编辑器应完整呈现文件和保留正常交互。不要因为泛化安全担忧禁用正常脚本、表单、内嵌页面、本地资源或媒体控件；隔离只针对已复现的具体问题，不能静默改写源码。
- 改性能时必须保持相同输入、输出、顺序、副作用时机与错误路径。可能改变用户可见行为的优化先与用户确认。性能报告给出同机同工具的修改前、修改后及差值/代价；运行适用的 `perf:*` 与相邻回归。
- 不要按日期、未接 npm 或文件名删除测试。先查调用、导入、文档、当前待办和手工复跑用途；独特样例须保留或迁入现行入口。`tests/artifacts/` 是被忽略的本地证据，清理它前先确认是否还用于未完成验收。
- 产品改动用 3–5 轮不同用例覆盖主路径、边界、组合及必要的异常与相邻回归；分别报告预期、实测和结果。文档或可重建缓存清理用引用、构建及状态检查验证，不冒充产品原生验收。
- 浏览器/组件结果不能代替 macOS、Windows 安装包、物理输入法或系统拖放结论；无法完成的原生动作保留在待办。

## 架构与入口

| 范围 | 入口 |
| --- | --- |
| 构建、快捷键、架构、测试 | [开发与维护](docs/development.md) |
| 测试页面和原生样例 | [测试入口](tests/README.md) |
| Markdown 阅读编辑上下文 | [Markdown 架构](docs/markdown-visual-editing-context-2026-09-11.md) |
| XMind 兼容范围 | [XMind 验收矩阵](docs/xmind-acceptance-matrix-2026-09-11.md) |
| 前端布局、菜单、系统拖放 | `src/App.tsx`、`src/components/` |
| 文档状态、持久化 | `src/store/editor.ts`、`src/lib/persistence.ts`、`src/lib/fileio.ts` |
| 阅读编辑与历史 | `src/components/MarkdownVisualEditor.tsx`、`src/lib/markdownVisual/`、`src/lib/markdownHistory.ts` |
| 原生文件、菜单、恢复 | `src-tauri/src/lib.rs`、`src-tauri/src/markdown_history.rs` |
| XMind 模型与画布 | `src/lib/xmind/`、`src/components/XmindView.tsx` |

前端通过 Tauri `invoke` 调用 Rust 文件与系统接口。标签状态与文件内容的来源以当前代码为准；旧架构文档可能描述过时结构。新增中英文文案时同步更新 `src/lib/i18n.ts`。

## 原生包与本地数据

- 正式包保留 `src-tauri/tauri.conf.json` 文件关联。Review/Diagnostic 隔离包必须在覆盖配置里写 `bundle.fileAssociations: []`；`src-tauri/build.rs` 会拒绝改名但继承关联的包。旧测试包若曾污染 macOS“打开方式”，还须核对 Launch Services 与 Finder 菜单，见 [测试入口](tests/README.md)。
- 不把隔离包安装成日常应用，不修改用户真实文件；需要打包和原生操作时先按当前任务授权判断。
- `src-tauri/target/`、`dist/` 是可重建产物。普通清理见 `scripts/clean.sh --dry-run`；`--all` 还删除依赖，不作日常清理。`tests/artifacts/` 独立管理。
- macOS 日志在 `~/Library/Logs/com.deditor.app/deditor.log`；不要把文档路径或内容写入高频日志。状态数据在应用数据目录，不能为了验证读取用户现有状态。

## 界面与代码约定

- 复用 `src/components/ui/Button.tsx`、`SegmentedControl.tsx` 和 `src/styles.css` 的颜色变量。普通按钮、图标按钮、输入框、错误提示、选中与焦点状态不要再做一套近似实现；错误提示走 `src/lib/feedback.ts`，不要新增 `window.alert()`。
- 同一排控件用 flex 垂直居中，核对中英、亮暗、720px 窄窗、键盘焦点和禁用状态。修布局原因，不用 `top`、负 margin 或字面空格补视觉偏差。控件样式不要通过全局 `button`/`input`/`svg` 规则污染 Markdown 正文、HTML 预览或 XMind 画布。
- 共用控件/主题变更须覆盖 XMind 相邻范围。HTML 正文保留自身排版；CodeMirror、阅读正文和应用控件可以采用不同字体。
- shell 脚本保持 macOS bash/sh 与 Linux dash 兼容；修改后运行 `bash -n` 和 `sh -n`。应用命名保持 `DEditor` / `deditor` / `com.deditor.app`。
- 回答简洁直答；不要向代码或说明文件写 emoji。探索性方案先给 2–3 个有权衡的选项；用户已明确要求执行时直接完成。不要为了文件名、目录深度等外观问题顺手重构产品代码。
