# 阅读编辑特殊块操作专项（2026-09-12）

范围锁定 I03–I06：每类 1–2 条进入/修改/退出/撤销链路。仅自建样例，未提交推送。未使用原生应用，未连接外部收费服务或用户资源。

## 新修复

HTML、YAML 等保留块的内嵌源码编辑器没有绑定 Tab 缩进，Tab 会交给宿主切走焦点。`rawView.ts` 加入与代码块同样的 `indentWithTab`；Shift Tab 反缩进。旧实现独立键盘处理用例返回 false，修复后返回 true，并验证文档插入两个空格、反缩进精确恢复。

## 逐项结果

| 编号 | 本次操作链路 | 结果与边界 |
| --- | --- | --- |
| I03 | 块级公式打开源码，修改 `x^2`→`x^2+y`，Esc 恢复公式，撤销；行内公式点击打开浮层，`x+1`→`x+2`，Enter 提交，撤销 | 块级自动化及两条浏览器链路通过。空公式、错误公式、所有化学/编号边界不计为本次全面通过 |
| I04 | 自建 Mermaid 图打开源码、修改节点、Esc 关闭、渲染后查看新增节点；撤销和精确保存回放 | 自动化及浏览器通过。PlantUML 外部服务器和旧式图表网络边界未执行 |
| I05 | TIP 提示块正文直接输入，保持标记和粗体邻文，保存/撤销/重做/重挂载；details 保留块打开源码、Tab/Shift Tab、Esc | 自动化通过。折叠控件鼠标所有组合与水平线删除未增加新证据 |
| I06 | YAML 和 HTML 源码打开；Tab 不失焦、Shift Tab 返回原文；HTML输入→Esc→撤销；独立编辑变更保存、撤销、重做和重挂载 | 自动化和真实浏览器通过。代码身份见下 |

独立脚本 `node scripts/test-markdown-special-blocks-audit.mjs`：4 组通过。日志 `tests/artifacts/deditor-special-before.log`（修复前失败）、`tests/artifacts/deditor-special-after.log`（修复后完整通过）。

真实浏览器最终使用 5197 的固定快照 `/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-format-audit-naee08j4`，手动同步本次 rawView 补丁后重载。测试用页面 `tests/markdown-format-links-review.html` 有“特殊块样例”。浏览器 Tab 操作后 AX 焦点仍在 YAML/HTML 编辑区，源码缩进和字符变化正确；Esc 后显示恢复。公式/图表修改后的全篇源码除目标位置一致。页面已关闭，本子任务 5197/5198 服务随后退出。

原生 macOS、真实输入法、Windows 和联网服务不是本次证据。最终整合回归与原生包由主任务执行。

`src/lib/markdownVisual/rawView.ts` SHA-256 `4f8210df9e16831023da73b48980df7c0873e5d2c38a73cf8dacd8ce5ff5b444`。
