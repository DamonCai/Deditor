# 插入弹窗目标生命周期审计（2026-09-12）

固定范围：链接、图片、表格、代码插入弹窗打开后的模式/标签切换、正文变化、关闭、确认、取消和历史。没有扩展自动保存、特殊块视图或退出流程。

## 确认并修复 1 类缺陷

外部正文已更新到 store，但 React 尚未把最新内容同步到编辑器时，插入弹窗的旧目标仍通过 `view.doc` 对象校验。确认链接会将 `Latest disk content\n` 覆盖成旧文档全文并插入链接，最新正文丢失。源码和阅读编辑共用此目标捕获入口。

同一原因还有“打开时已存在待同步正文”入口：弹窗会捕获旧 view 中的选区。不能只在确认时把当前 store 内容当作捕获基线，否则会把这个旧选区误认为有效。

修复在 `captureEditorTarget()` 中执行：

- 捕获和确认直接核对 store 当前标签、模式、原文；切换模式（包括源码→实时预览）后取消旧目标。
- 源码编辑器捕获时核对其实际文档与标签原文；阅读桥增加当前投影对应的源码字段，捕获时进行同样核对。
- 原有 view 身份与文档对象校验继续生效。待同步内容不会被旧选区确认覆盖；同步完成后可重新打开并正常插入。

产品变更仅 `editorBridge.ts`、`markdownVisualBridge.ts` 与 `MarkdownVisualEditor.tsx` 中 publish 的一行源码赋值；没有修改阅读事务、历史或正文同步过程。

## 专项验证

`scripts/test-markdown-insert-lifecycle-audit.mjs`：7 组通过，使用真实 Toolbar、EditorHost、MarkdownVisualSlot 和自建双文档。

1. 源码/实时预览/阅读中的链接、图片、表格、代码：取消保真，确认作用于捕获选区，一步撤销/重做，另一文档与尾段保留。
2. 弹窗打开后源码↔阅读切换，再确认：旧目标拒绝，全文不变。
3. 正文替换后确认：拒绝插入，不增加错误撤销步骤。
4. 外部正文更新与确认在同一事件中发生：保留最新正文，覆盖源码/阅读、链接/图片/表格。
5. 外部正文更新与打开弹窗在同一事件中发生：拒绝旧目标；同步完成后重新插入正常，撤销回到最新正文。
6. 换标签、关闭、切模式与确认在同一事件内：在 UI effect 执行前也拒绝旧目标，不误写另一文档。
7. 正常切/关原文档：插入弹窗关闭，旧表单事件不影响新文档。

日志：`tests/artifacts/deditor-insert-lifecycle-after.log`；修复前确认覆盖对照：`deditor-insert-lifecycle-race-before.log`；修复前打开旧目标对照：`deditor-insert-lifecycle-open-before.log`。

原通用回归夹具 `withToolbarEditor` 以前仅设置 view 的 tabId，却保留 store 的固定 `draft` 内容，并且不回写编辑变化。新校验因此正确拒绝该不一致夹具。仅补齐初始化与 docChanged 对应的 store 同步，未移除断言；round 3 的 50 项与 round 8 的 3 项通过，包含既有颜色/链接及全部 22 个图表模板插入与撤销。TypeScript 检查通过。

## 可复查页面与边界

自建页面：`tests/markdown-insert-lifecycle-review.html`。选中 `selected` 打开 Link/Image/Table，可使用顶部测试控件切模式、换标签、改正文、关标签；“Replace body and confirm in same event”专门复现待同步窗口，页面底部直接显示两份原文。

本轮 CUA 返回浏览器清单为空，建立独立 IAB 标签返回 `Browser is not available: iab`，因此未计入真实浏览器或原生验证。没有启动额外服务、没有留下浏览器标签。模拟同事件更新明确验证竞态条件，不代表实际系统文件监视器的触发频率。未测试 IME、Windows 或用户文件。

## 主任务固定浏览器补验

最终整合副本已实际执行：阅读链接弹窗内填 URL→同事件更新正文并确认，显示已有“文档已变化”提示且最新正文保留；正常插入链接及键盘一次撤销精确恢复；图片弹窗填路径后切第二标签，弹窗关闭且两份原文未改；源码表格弹窗同事件更新再确认同样拒绝旧目标。证据 `tests/artifacts/operation-round2-browser-summary.json`。此为浏览器自建夹具，无原生磁盘或真实 IME 主张。测试标签已关闭。
