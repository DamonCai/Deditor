# 整块选择、跨块选择与剪贴板检查（2026-09-12）

本批固定 10 条操作链，补查缺口清单第 2 类与第 5 类。新增 **2 类独立修复**，不重复计算此前文末代码块整块选择修复。全项目整合、原生包与其他 agent 的结果由主任务汇总。

## 范围与证据

| 操作链 | 本批结果 |
| --- | --- |
| 图片实际点击整块、Backspace、续写、两次撤销 | 浏览器通过，最终原文精确恢复 |
| 公式实际整块按钮、Backspace、续写、两次撤销 | 浏览器通过，最终原文精确恢复 |
| 保留块点击源码入口、Escape 整块选择、剪切、粘回 | 实际复现类型改变并修复，原保留块源码与呈现类型恢复；两次撤销逐字恢复 |
| 正文→代码→正文，正向真实拖选、Delete、续写 | 浏览器通过，清空后得到 `n\n`，两次撤销逐字恢复 |
| 正文→代码→正文，反向真实拖选、输入替换 | 固定副本浏览器通过，得到 `r\n`，一次撤销逐字恢复 |
| 代码内 Cmd+A 与 Escape 后全文 Cmd+A | 浏览器通过：代码局部变 `z` 时相邻正文保留；退出后全文替换得到 `q\n` |
| 正文、代码、公式、HTML 混合全文清空、续写、撤销 | 浏览器通过，清空后 `w\n`，两次撤销精确恢复 |
| 保留块跨文档复制粘贴 | 浏览器测试文档 A→B 保留 HTML/details 类型及完整源码；不是 macOS 系统应用往返 |
| 表格行拖到末行、反向、取消、撤销 | 真实快速拖动已复现并修复错落点，最终行顺序 `four / seven / one`，一次撤销逐字恢复；反向、100ms 慢操作、取消、外部目标与中断由组件覆盖 |
| 表格列拖到末列、反向、取消、撤销 | 真实快速拖动后 `B / C / A`，各行同步移动，一次撤销逐字恢复；其他边界由组件覆盖 |

本表中的“浏览器”是 CUA 实际鼠标/逐键动作。没有使用程序设置选区替代拖选。组件回归中的显式选区、合成拖动事件和模拟几何另行列出，不冒充真实输入。

## 修复 1：HTML / YAML 保留块复制后变代码块

真实步骤：`Raw` 样例 → `Edit block source` → Escape → Cmd+X → Cmd+V。修复前 `details` 被包进三反引号，显示为代码；不仅是空行变化。

原因是保留块剪贴板 HTML 使用 `pre[data-deditor-raw]`，其解析优先级与上游普通 `pre` 规则相同，普通代码规则抢先。`src/lib/markdownVisual/raw.ts` 将带专用标记的规则优先级提高到 100，普通无标记 `pre` 仍解析为代码。

验证维度：

- details、自定义 HTML（属性、实体、换行、连续空格）、YAML 的 DOM 往返保持 `deditor_raw` 与精确内容。
- 无标记 `pre` 保持 `code_block` 的反例。
- 删除后续写、两次撤销精确恢复；真实浏览器剪切粘回和跨文档复制。

剪切后在段落前粘回会保留删除留下的空白分隔，本次不承诺剪切+粘贴整体字节完全相同；保留块自身源码一致，撤销剪切/粘贴后整篇逐字恢复。

## 修复 2：快速表格拖动使用前一位置

固定版本修复前实测：第一数据行从手柄 `(32,237)` 拖到最后一行内 `(82,338)`，实际只到中间。观测到最终 dragover 后约 2ms 就 drop；上游 dragover 有 20ms 节流，drop 使用了前一个目标行。更快时没有移动。

`src/lib/markdownVisual/tableDrag.ts` 保留上游手柄和拖动预览，只在自身表格拖动完成时同步按实际落点计算目标，调用现有 `moveTableRow` / `moveTableColumn`。由 `tableLists.ts` 接入。

- 记录源文档和表格位置，拖动期间文档变化取消操作，避免旧索引指向其他行/表格。
- 表格视图因选区变化重建时重新查找当前 DOM，不继续依赖已脱离页面的元素。
- 落到原表格容器外取消；不消费其他组件的外部 drop。
- 清理预览与插入线，并防止已排队的渲染在取消之后重新出现；销毁时移除监听。
- 保留表头行移动。已验证上游会按原位置重建 header/cell 类型，表头移到末尾后结构有效；没有擅自禁用已有能力。

## 自动检查

入口：`node scripts/test-markdown-selection-audit.mjs`。

最终 7 组通过：3 类保留块往返/删除续写历史、1 个普通 pre 反例、行列两个拖动矩阵、1 个外部落点/表头有效性/中断保护矩阵。TypeScript 检查通过。

拖动组件矩阵包括直接 drop（无 dragover）、反向、100ms 间隔、同位置、dragend 取消、外部落点、拖动中前方正文变化、表头移动后的 `doc.check()` 和精确撤销。这些是逻辑回归，不替代真实慢速拖拽或 Escape 中途取消。

## 固定副本、限制与清理

自建页面：`tests/markdown-selection-audit-review.html` / `.tsx`，只包含测试文档与显式样例切换、原文输出，不接触用户文件。

浏览器实际检查先用 5187，遇并行工作区 HMR 造成焦点重建后，改到固定副本 `/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-selection-fixed-vek305x5` 的 5188。反向拖选和最终行列移动在固定副本验证；本 agent 的后续 tableDrag 修改单独复制进去复测。副本内临时事件记录器用于区分手柄拖动和文本拖动，不属于产品。

仍未完成：macOS 系统剪贴板跨应用来源、Windows、原生最新包、真实长距离拖拽自动滚动、按住拖动期间 Escape 取消、真实慢速拖拽全矩阵。工具尝试未成功触发行列手柄拖动的动作不计成功或产品失败。没有把这些缺口计为通过。

本 agent 创建的浏览器标签与 5187/5188 服务均已关闭。固定副本的 KaTeX 字体资源因服务允许目录未加载，未用该副本作公式字体/呈现一致性验收；选择与拖动的文字/源码结果不依赖该字体。

## English summary

Ten bounded operation chains were checked. Two distinct defects were repaired: preserved HTML/YAML blocks became code blocks after rich clipboard roundtrips, and fast table drags used a stale throttled target. Seven component groups and TypeScript checks passed. Actual browser mouse and keyboard checks covered whole-block deletion, forward/backward mixed selection, embedded versus document select-all, browser cross-document clipboard, and final-row/final-column drags with exact undo. Native OS clipboard, Windows, drag cancellation with Escape and long-range auto-scroll remain separate acceptance gaps.
