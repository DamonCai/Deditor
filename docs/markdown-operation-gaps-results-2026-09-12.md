# 阅读编辑操作缺口并行检查结果（2026-09-12）

用户在盘点之后授权多个 agent 一起检查。本批由三个 agent 与主 agent 分工执行：边界/空内容、整块/跨块及剪贴板/表格拖动、真实鼠标/目录/布局、保存错误恢复与整合验证。待查项目不等于已有 bug；本批确认并修复 **7 类独立根因**，不重复计算此前文末代码块修复，也不把初步修复被测试拦截的问题另计数量。

## 修复清单

| 编号 | 实际问题 | 修复后的操作结果 |
| --- | --- | --- |
| G01 | 整块/选区删除后输入与删除合并撤销 | 第一次撤销续写，第二次恢复删除的块和选择范围 |
| G02 | 普通列表/引用的硬换行空占位不能退出 | Enter/Backspace可退出纯硬换行占位；文字、空格、图片与真正空项维持各自行为 |
| G03 | HTML/details/YAML保留块剪切粘回变成代码块 | 带保留标记的剪贴板HTML优先恢复为保留块，普通pre仍是代码 |
| G04 | 快速拖表格行/列，立即松手落在之前经过的位置 | 按最终drop坐标同步确定位置；真实行/列到末尾和一次撤销通过 |
| G05 | 点击目录轨道误触展开后的首标题，或固定目录丢选区 | 展开点击不误导航，固定/取消固定保留编辑目标，明确点击和键盘导航有效 |
| G06 | 手动保存/另存为/关闭时保存失败没有清楚反馈 | 显示失败文件与原因、保留未保存文档，继续编辑后能重试 |
| G07 | 关闭弹窗后内嵌代码已收起，原输入无法聚焦 | 焦点交回外层编辑器，由其恢复内嵌代码选区，关闭后直接续写有效 |

G01/G02见[边界检查](markdown-boundary-audit-2026-09-12.md)，G03/G04见[选择与拖放检查](markdown-selection-audit-2026-09-12.md)，G05见[鼠标检查](markdown-mouse-audit-2026-09-12.md)，G06/G07见[错误恢复检查](markdown-recovery-audit-2026-09-12.md)。

## 检查范围与不能合并的证据

- 边界/结构：12组专项，涵盖唯一块、文首文末、清空续写、嵌套退出与非空反例。具体哪些有真实浏览器，哪些仅组件证据，见逐项表。
- 选择/剪贴板/表格：7组专项；真实图片/公式删除续写、保留块剪切粘回及跨文档、跨块拖选、行列快速拖动等另列。
- 鼠标：8个检查点，6组目录事件回归。双击/三击、正反拖选、Shift点击、折行、宽度变化、目录入口有真实证据；一次边缘拖动不代表持续跨多屏通过。
- 错误恢复：8组专项，另回归已有8组保存竞争；真实浏览器正文/代码中关闭错误后续写、撤销、重试及关闭保存失败。磁盘错误由隔离替身注入。
- 新增统一入口 `npm run test:markdown-operation-gaps` 共33组专项，已接入 `test:markdown-operations` 和 `test:all`。公共焦点恢复另外新增1组通用回归。以上是测试组数，不是33个修复。

## 合并前拦截

1. 初步空占位修复改变了普通零内容空列表的撤销规则。旧混合列表18组合拦截后，收窄扩展范围，原断言重新通过。
2. 交叉审查发现仅看textContent会把含图片的任务误判为空；实际Schema核对后补非文本反例与Enter限定。图片任务未被误退出。
3. 表格修复增加外部/异表落点、拖动期间正文变化、索引范围及取消清理保护。核对上游发现表头移动原本有效，保留该能力并验证Schema及撤销，未按推测禁用。
4. 原生包构建和测试在目录外最初用了系统Node16，导致Vite缺少crypto接口；显式使用项目Node23.11.1后继续。不是产品bug。
5. 首次目录复制时夹入了并行图表模式的部分代码，特殊块专项拦截了入口与实现不匹配。最终副本明确从bce1e9f恢复代码显示、CSS和对应专项，再完整重跑；没有撤回原工作区的并行改动。
6. 验证副本将测试编译缓存独立，避免并行任务改写同名缓存。开发服务热更新引起的中途重挂载不算产品失败，也不算通过。

## 固定版本与整合验收

最终副本：`/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-operation-gaps-verified-5ysjg4gu`，有逐文件SHA-256清单 `verification-manifest.json`。

基线为 `bce1e9f` 加本批修复。副本沿用冻结时的代码块显示、共享CSS及特殊块测试；后来另一任务新增图表模式的 `codeView.ts`、CSS、文案和测试入口未混入此副本。原工作区这些并行改动完整保留。因此本记录不能代表当前并行开发的所有代码整体通过。

整合回归、生产构建与原生结果在收尾时追加；未完成前不标通过。

## 仍需独立验收

- 真实链接纯悬浮入口。
- 按住鼠标在边缘持续跨多屏拖选、表格拖动中途真实Esc取消和慢速操作的完整组合。
- 不同系统应用来源的剪贴板、真实原生跨应用往返。
- 系统缩放与图片/公式/图表异步高度变化时的全部编辑组合。
- 更多复杂非文本嵌套转换、长期连续编辑、真实IME、Windows及图床账号。

这些保留为待验证，不把有限专项通过写成八类全组合验收完成。本次无提交推送。

## English summary

Three agents and the parent checked operation gaps and fixed seven distinct causes: selection-deletion history grouping, hard-break-only list/quote exits, preserved-block clipboard parsing, stale table drag destinations, outline click/focus interference, invisible manual-save errors, and focus recovery for collapsed embedded code editors. The targeted entry contains 33 groups; browser, component, injected IO and native evidence are tracked separately. Initial regressions were caught without weakening the existing mixed-list assertions. A fixed snapshot excludes concurrent diagram-mode development. Remaining native/platform, sustained-drag, hover and long-running combinations must not be marked passed by inference.
