# 图表阅读居中（2026-09-13）

用户要求 Mermaid、PlantUML 在块内“阅读”状态下居中显示。仅在 `markdown-visual.css` 对该模式成功图表容器设置 `justify-content: center`，沿用已有图形缩放和外框。错误源码继续左对齐，编辑与实时预览模式保持原布局。

验证使用自建 `tests/markdown-diagram-modes-review.html`：

1. 亮色大屏：外框内容区宽 1159px，Mermaid 图形宽 250px、PlantUML 图形宽 122px，二者水平中心偏差均为 0px，截图检查通过。
2. 暗色 720px 窄窗：两种图形水平中心偏差均为 0px，无横向溢出。
3. 模式往返：Mermaid 阅读→实时预览→阅读、PlantUML 阅读→编辑→阅读，回到阅读后中心偏差仍为 0px，自建原文精确一致。
4. 14 组图表专项、145 项通用回归及 8 组分隔线专项通过，生产 TypeScript/Vite 构建通过。本次纯 CSS 调整未新增原生安装包验证。

本任务没有执行提交推送；期间外部提交 `ec079a6` 已包含居中样式，接续需重新检查 Git。保留并行修改，不代表其他 Markdown/XMind 待验收范围已完成。
