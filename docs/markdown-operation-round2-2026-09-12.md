# 阅读编辑第二轮并行检查（2026-09-12）

用户要求继续加速并行检查，遇到问题直接修复。三个 agent 分别负责跨块删除/替换、插入弹窗生命周期、特殊块边界；主任务负责保存竞态、整合与原生复测。仅使用自建样例，不提交推送。

用户后续在“bug修改”仍发现基础任务交互缺陷，已补[漏检复盘与验收纠正](markdown-operation-audit-gaps-2026-09-12.md)。以下通过项不代表首项/连续任务缩进或含软换行空任务已通过。

## 本轮确认修复 7 项

| 编号 | 问题 | 修复与证据 |
| --- | --- | --- |
| R2-01 | 异步格式化等待期间出现冲突、重载、关闭或自动保存内容过期，旧保存仍写入 | 写入前重新校验目标和版本；[保存专项](markdown-save-race-audit-2026-09-12.md)，8 组及固定浏览器 4 条链 |
| R2-02 | 插入弹窗捕获或确认时 store 已更新、编辑区未同步，旧目标覆盖新全文 | 捕获与应用时校验标签、模式、内容和视图；[弹窗专项](markdown-insert-lifecycle-audit-2026-09-12.md)，7 组含 54 条参数化链路，主任务补真实浏览器 |
| R2-03 | 跨入表格删除后，撤销重做持续多出空行 | 表头至少保留一个合法单元格，避免通用修表反复补行；[跨块专项](markdown-cross-block-audit-2026-09-12.md) |
| R2-04 | 非键盘 insertText 跨列表/引用替换，把引用显示色写入 Markdown | 跨文本块的 beforeinput 复用事务输入链，排除 composition/源码块；普通 keypress 原本正常，不宣称语音或 IME 已验；同上专项 |
| R2-05 | 代码/公式源码首部上方向键无法退出到块前 | 补向前出口；[特殊块专项](markdown-block-boundary-audit-2026-09-12.md) |
| R2-06 | HTML/YAML/details 源码首尾方向键无法退出 | 补双向出口；同上专项 |
| R2-07 | 代码尾部下方向键遇相邻图片，把文本光标放到非法位置 | 按合法相邻文本块定位，必要时插入可编辑段落；同上专项 |

本轮按独立问题去重为 7 项。加上[上一轮 26 项](markdown-operation-verification-2026-09-12.md)，两轮合计 33 项；不计其他任务的性能/样式修复、正常通过项、测试夹具错误或同一问题的多个变体。

## 验证层次与快照

- 原始失败：各专项保留修复前失败输出；跨块和特殊块有真实浏览器前后对照。
- 边界：39 组跨块、15 组特殊块、7 组弹窗、8 组保存，共 69 组新增专项。含正反选区、空表头、头行格式/对齐、相邻节点、失效目标及退出后继续输入。
- 连续操作：真实拖选删除/替换、撤销重做再输入；弹窗正文更新/切标签；保存等待时冲突/重载/关闭。
- 异常与回归：保存失败后继续、过期结果拒绝、composition 与源码排除；完整产品回归和生产构建结果见后续最终结果。

固定副本和逐文件摘要在 `tests/artifacts/operation-round2-manifest.json`，基线为 `34b8e35`。同目录另一个任务正改预览滚动、Markdown 高亮缓存及 Mermaid 队列；验收副本对这些文件使用基线版本并排除新增模块，原工作区保持原样。最初构建含部分并行代码，随后重新冻结并重跑，最终以 `operation-round2-build-complete.log` 为准；早期构建不作为最终包证据。

现有回归夹具 `withToolbarEditor` 只更新 view、没有同步对应 store 文档，新保护因此拒绝该不一致状态。已让夹具按真实编辑器契约同步初始化与后续内容，没有删除断言或放松产品保护。

最终固定浏览器：亮暗主题各 1,374 项复杂呈现对照无差异。弹窗正常链接插入/一次撤销、图片弹窗切标签、阅读链接及源码表格的同事件更新确认保护通过，见 `operation-round2-browser-summary.json`。

统一复查仍用 `npm run test:markdown-operations`，四套新增专项也已接入 `npm run test:all`。

## 明确边界

本轮没有全面验收真实中文组词/候选、Windows、真实表格拖拽、系统多图片来源、真实图床账号及长期压力。beforeinput 测试不替代真实输入法。保存取消仅保证应用已知状态变化且尚未发出 I/O 的阶段，不承诺取消已发出的写入或尚未检测的外部修改。当前专项也不等于特殊块所有列表/表格嵌套组合都通过。

## English

Seven distinct issues were fixed across stale saves, insertion-dialog targets, cross-block editing and special-block exits. Sixty-nine new operation groups supplement the previous audit. Real browser checks include editing/history chains and 1,374 presentation comparisons in each theme. The fixed snapshot excludes another active task's in-progress performance changes; native and final suite results are recorded below. Real IME, Windows, native dragging, upload accounts and long-term stress remain outside the completed evidence.

## 最终结果与原生边界

固定副本完成 62 核心、106 阅读集成、163 组操作专项（上一轮 94 + 本轮 69）、144 通用组件、119 XMind、13 导出及语法/代码行数检查。`test:all` 最后图标项因副本遗漏 public 静态资源失败（generated.1: missing document）；补齐完整 public 后，图标独立检查通过，其他已通过项没有因资源复制重跑。前后证据分别为 `operation-round2-all.log` 与 `operation-round2-icons-after.log`，不把前一进程退出码 1 写成 0。最终包含完整静态资源的生产原生构建退出码 0：`operation-round2-build-complete.log`。

原生自建代码样例实测：点入代码→Cmd Left→上方向键→输入 before→保存，磁盘严格等于 `before` 正文加原代码块；一次 Cmd Z、保存后逐字节恢复初始文件，代码测试文档已关闭。见 `operation-round2-native-code-written.md` 与 `operation-round2-native-result.json`。这是相同产品代码、补齐静态图标资源前的包，不将图标缺失视为已验正常。

随后原生窗口出现非测试文档，工具明确多次返回“用户已改变应用”，并出现一次截图服务失败。为保护正在使用的文档，停止原生输入和强制退出；自建 HTML 测试标签已打开但没有编辑，无法稳定定位关闭，不能声称它已关闭或应用已退出。HTML/相邻图片出口、真实自动保存的本轮新包补验未完成；这些边界不影响上方确定性与浏览器证据，但不能据此宣布原生全通过。

其他任务在冻结后继续修改代码块显示。工作区当前 codeView.ts 保留本轮出口修复并叠加对方显示实现，最终固定副本不含该后续显示修改；tableLists.ts 仅有注释措辞差异。已对叠加显示改动后的当前工作区另跑 15 组特殊块出口专项，通过（`operation-round2-current-boundary.log`）；这仅补交叉范围，仍不能把固定副本结果概括为并行工作区最新整体通过。

Final evidence: all component and operation groups passed; the final icon step initially failed because the isolated copy omitted public assets, then passed after those assets were copied. The final production build exited successfully. Native code-block exit, exact save and single undo passed. Remaining native checks were stopped when the window was being changed by the user; no forced quit or operations on non-test documents were performed.

清理：本任务及三个 agent 的浏览器测试标签、开发服务均已关闭；原生应用因上述用户正在操作的实际情况没有强制退出。
