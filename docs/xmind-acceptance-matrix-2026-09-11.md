# XMind 验收范围

本页是当前接续摘要。2026-09 的逐轮 Review 记录已从工作树精简，仍可从 Git 历史恢复。剩余全项目动作见[当前待办](pending-tasks.md)，其中没有独立 XMind 待验收项。

DEditor 在 `src/lib/xmind/` 解析与写回 XMind 归档，画布入口为 `src/components/XmindView.tsx`。修改模型、样式或 ZIP 字段时，须核对保存、撤销重做、重开、未编辑字段保留以及原版 XMind 读取；浏览器样例使用 [XMind review](../tests/xmind-review.html)，原生样例入口见 [测试说明](../tests/README.md)。

已完成的有界证据包括：跨文件图片与联系复制、紧凑形状和圆形图片修复、macOS 自建样例保存/重开与原版读取，以及 Windows WIN-06 自建归档在原版 XMind 中显示标题、分支和图像。具体范围见[完成记录](completed-tasks.md)与[Windows 验收](windows-acceptance-2026-10-08.md)。这些证据不代表所有 XMind 模板、主题或像素级显示完全一致。
