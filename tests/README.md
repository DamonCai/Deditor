# 测试与手工验收入口

`npm run test:all` 自 2026-10-25 起运行当前可执行基线：16 个文本转义用例、4 种块类型、4,675 组语法树对照、7 组阅读组件回归、真实上游表格生命周期、5 轮系统拖放分派回归及 Rust 库测试、类型检查/生产构建。本轮 Windows Rust 库测试为 39 项（存在平台条件，不能照搬 macOS 项数）。组件写盘使用隔离 IPC，不读取现有应用状态；不等于原生保存、系统拖放、物理输入法或跨屏验收。

旧总入口和当时缺失脚本的快照保存在 [历史入口清单](unavailable-test-entries.json)；其中表格生命周期脚本已在本轮 Windows 排查恢复。其他历史 `test:*` 别名尚有缺失文件，使用前须核对。本轮基线范围小于历史全套测试，不能据此声称历史 108 组集成、149 组通用或 XMind 全套重新通过。

| 可执行自动化 | 命令 |
| --- | --- |
| 文本序列化及相邻语义对照 | `npm run test:markdown-text-escapes` |
| 列表转换、保存替身、历史、重新挂载、整表移动及只读/失败路径 | `npm run test:markdown-current` |
| 后台停帧、表格销毁、相邻回调及构造异常 | `npm run test:markdown-table-lifecycle` |
| 启动恢复与系统拖放分派、关闭取消、目标窗口和 Windows 快捷键 | `npm run test:native-file-drop` |
| Windows Ctrl/CRLF 阅读组件、PowerShell 5.1/7 打包脚本及系统拖放分派 | `npm run test:windows-current`（打包脚本部分须 Windows） |
| 更新检查、同版本元数据、下载校验及更新弹窗四轮用例 | `npm run test:updates` |
| Rust 文件、历史、恢复、多窗口等 | `npm run test:native-core` |

| 用途 | 入口 |
| --- | --- |
| 阅读编辑综合样例 | [Markdown 页面](markdown-visual-review.html)：`?complex&parity`、`?scroll`、`?ime`、`?underscore`、`?ampersand` 等 |
| XMind 自建样例 | [XMind 页面](xmind-review.html)：`?probe=...`、`?dark` |
| README 截图复现 | [展示页面](readme-showcase.html)：`?scene=diagram`、`split`、`map` |
| 其余独立样例 | [统一页面](review.html)，加 `?case=markdown-table-audit-review` 等模块文件名（不含 `.tsx` 或 `.ts`） |
| 更新弹窗隔离样例 | [统一页面](review.html?case=update-review)：`&en`、`&dark`、`&same`、`&error`，原生 IPC 使用替身 |
| 当前原生隔离配置 | [Markdown 配置](markdown-native-review.conf.json)、[XMind 配置](xmind-native-acceptance.conf.json) |
| 原生 XMind 样例 | [prepare/check](../scripts/xmind-native-acceptance.ts) |

统一页面只加载所选的 `*-review.tsx` 或 `*-review.ts` 模块；原模块及自建样例保留。旧的逐案例 `.html` 外壳已合并。需要保留原有查询参数时，写成 `review.html?case=模块名&原参数`。浏览器页面通过仓库 Vite 服务打开，不直接双击文件。

原生 Review/Diagnostic 包的覆盖配置必须关闭文件关联。所有验证只使用自建样例或用户主动提供的文件。`tests/artifacts/` 是被 Git 忽略的本地证据，清理前核对是否仍用于未完成验收。已删除的旧入口和历史核对记录可从 Git 历史恢复。

## 2026-10-26 更新动作验证

所有输入、安装包字节及路径均为本轮生成；弹窗使用原生 IPC 替身，Rust 下载测试使用本地 HTTP 服务。以下是 `test:updates` 的四轮覆盖，均符合预期：

| 轮次 | 预期 | 实测与结果 |
| --- | --- | --- |
| 主路径 | 中英文文案、发布信息、焦点与发布页入口正确 | 弹窗挂载、Tab 循环和发布页目标正确；说明按文本呈现；通过 |
| 边界 | 同版本信息不足、缺少架构/校验值和网络失败均可理解并恢复 | 同版本明确待核对；不误选另一架构；无校验值禁止应用内下载；失败后重试成功；通过 |
| 组合 | 取消保存不下载；下载期间显示进度并保护关闭；成功可定位安装包 | 取消零下载调用，50% 进度、禁用状态、Esc 保护和成功后定位均正确；通过 |
| 异常与发布配套 | 校验/写盘/发布变更失败可重试，JSON 与最终安装包匹配 | 错误提示及恢复正确；时间、大小和 SHA-256 匹配；旧版本命名及空构建时间被拒绝；通过 |

Rust 另有 5 项更新测试，覆盖语义版本排序、平台选择、同版本元数据绑定、GitHub 错误及下载字节/大小校验。损坏或不完整下载不会覆盖既有目标，临时文件会清理。

浏览器核对中文亮色、英文暗色和 720px 窄窗，以及下载期间禁用状态和完成提示。`test:all` 通过（16 个文本用例、4 种块、4,675 语义对照、7 组阅读组件、Rust 库测试和生产构建）；更新实现阶段的 Rust 库全量为 46 项通过，合入远端 Windows 修复后的发布前结果见下述发布记录。上述结果不代表 macOS/Windows 安装升级、原生保存对话框或真实发布侧 JSON 上传已验收；更新实现阶段未打包、安装或发布；后续重新发布见 [1.0.3 发布记录](../docs/release-1.0.3-2026-10-26.md)。
