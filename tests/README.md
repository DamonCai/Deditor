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
| Rust 文件、历史、恢复、多窗口等 | `npm run test:native-core` |

| 用途 | 入口 |
| --- | --- |
| 阅读编辑综合样例 | [Markdown 页面](markdown-visual-review.html)：`?complex&parity`、`?scroll`、`?ime`、`?underscore`、`?ampersand` 等 |
| XMind 自建样例 | [XMind 页面](xmind-review.html)：`?probe=...`、`?dark` |
| README 截图复现 | [展示页面](readme-showcase.html)：`?scene=diagram`、`split`、`map` |
| 其余独立样例 | [统一页面](review.html)，加 `?case=markdown-table-audit-review` 等模块文件名（不含 `.tsx` 或 `.ts`） |
| 当前原生隔离配置 | [Markdown 配置](markdown-native-review.conf.json)、[XMind 配置](xmind-native-acceptance.conf.json) |
| 原生 XMind 样例 | [prepare/check](../scripts/xmind-native-acceptance.ts) |

统一页面只加载所选的 `*-review.tsx` 或 `*-review.ts` 模块；原模块及自建样例保留。旧的逐案例 `.html` 外壳已合并。需要保留原有查询参数时，写成 `review.html?case=模块名&原参数`。浏览器页面通过仓库 Vite 服务打开，不直接双击文件。

原生 Review/Diagnostic 包的覆盖配置必须关闭文件关联。所有验证只使用自建样例或用户主动提供的文件。`tests/artifacts/` 是被 Git 忽略的本地证据，清理前核对是否仍用于未完成验收。已删除的旧入口和历史核对记录可从 Git 历史恢复。
