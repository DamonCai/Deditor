# 测试与手工验收入口

当前 `main` 的 `package.json` 仍引用不少未入库的 `scripts/test-*` 文件，`npm run test:all` 暂不能作为完整回归。运行命令前先核对入口文件；旧记录中的测试结果只属于当时快照。

| 用途 | 入口 |
| --- | --- |
| 阅读编辑综合样例 | [Markdown 页面](markdown-visual-review.html)：`?complex&parity`、`?scroll`、`?ime` 等 |
| XMind 自建样例 | [XMind 页面](xmind-review.html)：`?probe=...`、`?dark` |
| README 截图复现 | [展示页面](readme-showcase.html)：`?scene=diagram`、`split`、`map` |
| 其余独立样例 | [统一页面](review.html)，加 `?case=markdown-table-audit-review` 等模块文件名（不含 `.tsx` 或 `.ts`） |
| 当前原生隔离配置 | [Markdown 配置](markdown-native-review.conf.json)、[XMind 配置](xmind-native-acceptance.conf.json) |
| 原生 XMind 样例 | [prepare/check](../scripts/xmind-native-acceptance.ts) |

统一页面只加载所选的 `*-review.tsx` 或 `*-review.ts` 模块；原模块及自建样例保留。旧的逐案例 `.html` 外壳已合并。需要保留原有查询参数时，写成 `review.html?case=模块名&原参数`。浏览器页面通过仓库 Vite 服务打开，不直接双击文件。

原生 Review/Diagnostic 包的覆盖配置必须关闭文件关联。所有验证只使用自建样例或用户主动提供的文件。`tests/artifacts/` 是被 Git 忽略的本地证据，清理前核对是否仍用于未完成验收。已删除的旧入口和历史核对记录可从 Git 历史恢复。
