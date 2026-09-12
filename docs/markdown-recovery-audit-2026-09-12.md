# 保存失败与焦点恢复检查（2026-09-12）

本次对应操作缺口第8类，并交叉验证第6类弹窗退出。仅使用自建样例；基于 bce1e9f 后工作区。未提交推送。

## 复现与修复

1. 手动保存失败缺少可见反馈。保存、另存为入口把异常交给不等待结果的菜单/命令调用者；关闭文档选择保存则吞掉失败原因。注入磁盘写失败、另存为目标占用、切标签期间延迟失败可复现。8组新恢复测试修复前2通过/6失败，其中命令入口记录到未处理拒绝。统一手动保存捕获异常、显示文件名和原因，返回false并保留文档；自动保存原有逐文件处理保持不变。
2. 弹窗关闭后内嵌代码失焦。真实浏览器输入q→保存失败→Esc→逐键r/s，原文仍停在q，焦点落到页面。内嵌代码失焦时收起，原输入节点仍在DOM但不可聚焦。公共弹窗焦点恢复在原节点不能接收焦点时，交回其外层可编辑区域，由外层恢复代码选区。正文和普通按钮仍按原逻辑恢复。

涉及 `src/lib/fileio.ts`、`src/lib/i18n.ts`、`src/lib/useModalFocus.ts`。中英文错误文案同步。历史失败测试更新为验证返回false、可见错误原因与未保存内容；不再把抛出未处理异常当作通过条件。

## 三轮证据

轮1 — 用例：RC01/02手动失败后续写重试、RC05取消另存为。
期望：失败可见且草稿保留，取消不报错，重试保存最新内容。
实测：新恢复套件8组全部通过；浏览器正文x→保存失败→Esc→逐键yz，文本成为xyz；关闭故障后保存，界面核对content/savedContent/模拟disk完全一致。
结果：通过；磁盘边界为故障注入，不是真实磁盘损坏。

轮2 — 用例：RC03另存为冲突、RC04关闭选择保存失败、内嵌代码与弹窗键盘退出。
期望：不覆盖其他文件，不丢失当前文档，关闭错误弹窗后在原代码位置续写。
实测：另存为/关闭逻辑通过；实际浏览器关闭确认选择Save后出现错误并保留文档。代码q→保存失败→Esc→逐键rs得到qrs；撤销rs后输入t得到qt；再次失败→Tab/Enter关闭→输入u得到qtu。
结果：通过；代码失焦旧实现失败、修正后通过。通用组件补充隐藏输入恢复外层与已移除目标不恢复的回归。

轮3 — 用例：RC06命令入口、RC07延迟失败切标签、RC08自动保存多文档，以及暗色英文代码续写。
期望：没有未处理拒绝，保存只作用原文档，另一个文档仍可保存；主题语言不影响恢复。
实测：8组恢复、8组已有保存竞争通过；暗色英文代码qtuv→保存失败→Esc→w得到qtuvw，正文和围栏保留。
结果：通过。主任务另做最终整合回归与构建，其结果以总记录为准。

## 证据入口与边界

- `scripts/test-markdown-recovery-audit.mjs`：8组恢复。
- `scripts/test-markdown-save-races.mjs`：8组已有保存竞争。
- `scripts/test-regression.mjs`：真实公共错误组件原因显示/关闭；折叠输入和移除目标焦点回归。
- `tests/markdown-recovery-audit-review.html`：真实阅读编辑、共享弹窗与保存函数；测试控件只注入内存磁盘失败、切换主题语言和显示保存核对，不调用真实文件IO。
- 浏览器逐键不是原生IME；没有新增Windows、图床、长期压力或真实磁盘失败验收。保存恢复UI通过不代表八类缺口全部组合完成。

## English summary

Two root causes were reproduced and fixed: manual save errors were not surfaced consistently, and closing a modal could leave a collapsed embedded code editor unfocused. Eight injected recovery groups and eight existing save-race groups pass. Real browser checks cover continued typing after errors, code selection restoration, undo and continued typing, close-and-save failure, and dark/English presentation. Disk IO is mocked; native platform acceptance remains separate.
