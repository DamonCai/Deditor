# 阅读编辑逐项验收（2026-09-12，进行中）

用户要求依据[64 组操作清单](markdown-visual-operation-inventory-2026-09-12.md)逐项验证，并明确授权多个 agent 并行。分工为输入/剪贴板及图片、表格、格式/链接，主任务负责光标/列表/代码/搜索和最终整合。仅使用自建样例，不提交推送。

## 本次主任务已经复现并修复

### E01：任务转换误改父项，任务按钮缺少取消

初始 `- [x] parent` 下包含普通子项 child、sibling。点击 child，再点任务列表，旧版将 parent 的完成状态也改为 false。原因是遍历选区时连同其祖先 list_item 一起改写。

现在只修改实际选中文本块所属的列表项；已有完成状态在混合选区转换时保留。再次点击同类任务按钮按其他列表按钮的规则退出当前列表层级，同时移除所选项的任务状态。顶层恢复正文，嵌套项提升一级且父任务保持完成；不是把任意深度的嵌套内容强行拉到文档根部。命令在行内源码收起后重新读取当前位置。

浏览器已实际完成旧版/修复版子项转换与单次撤销对照。自动化覆盖两层/三层、有序子列表、混合选区、任务取消、相邻项、精确保存/撤销/重做与重新挂载。

证据：`tests/artifacts/operation-nested-task-before.log`、`operation-nested-task-after.log`、`operation-task-toggle-before.log`、`operation-task-toggle-after.log`。

### I02：代码 Tab 离开编辑区，后续输入改到下一块语言

真实浏览器连续操作“代码行尾→Enter→Tab→输入”复现：Tab 把焦点转到下一块 LaTeX 语言输入框。单独 Enter 正常，因此仅测试代码能输入无法发现。

内嵌代码编辑器加入 CodeMirror 缩进键映射。Tab/Shift+Tab 使用已有 2/4/8 空格偏好；Esc 仍可退出代码编辑。自动化覆盖多行缩进/反缩进、焦点、保存、撤销与重做。

固定快照浏览器已验证 Enter→Tab→输入→Shift+Tab→Esc，源码恰为预期；保存快照、切源码再回阅读、换标签返回均保留内容，随后两次撤销恢复完整初始原文。共享开发服务在并行修改时发生的热更新重置不作为产品故障，最终证据取固定快照。

证据：`tests/artifacts/operation-code-tab-before.log`、`operation-code-tab-after.log`。

### J02：全部替换重排未命中的内容

真实浏览器替换三处“保留”，旧版同时把中间没有命中的表格重新排版、列表 `+` 改成 `*`，并去掉文末三个空格。文档层把首个到最后一个变化块之间全部序列化，是这次故障的原因。

现在等数量多块修改复用分块更新路径，独立处理实际改变的块，保留其他块和块间空白；校验解析时同时带上引用与脚注定义。

LF/CRLF 自动化已核对精确替换、三个换行间隔、列表标记、未修改表格、引用定义、尾部空格、保存/单次撤销/重做。固定快照真实浏览器结果等于原文仅替换目标词；单次撤销与保存重做也逐字符一致。

证据：`tests/artifacts/operation-replace-preservation-before.log`、`operation-replace-preservation-after.log`。

## 已执行的鼠标与连续操作

- A01/A02/A04、B01、K01：真实坐标双击选词、三击选段、跨段拖选、替换，撤销/重做恢复文字；Shift+Right 扩选和 Shift+Left 收缩后替换正确。
- 直接点正文行首再按键的结果通过。控制工具的 selectText(cursor_before) 一次落在前段边界，已用坐标点击排除，未把工具定位差异报告为产品 bug。
- I01/I02、K01/K02/K03：上述代码编辑及跨模式/标签连续链路通过，范围为此自建短文。浏览器“保存快照”不是原生磁盘写入。
- J01/J02：真实 UI 搜索并全部替换、关闭、单次撤销、重做和快照核对通过；其余搜索选项有当前集成基线，仍按清单补专项。
- J04：目录折叠隐藏子标题、筛选仍能找到匹配子标题、点击跳转后输入 X、目录同步更新、撤销标题通过。
- L02/L03：紧凑主题、段落聚焦、行号开关及缩进设置变化不改正文；切换为四空格后代码 Tab 立即插入四空格。完成后撤销文字并恢复全部测试设置，源码一致。

## 自动化和版本边界

开始时当前工作区完整阅读集成 106 项通过（`operation-inventory-integration.log`）。本次后续又修改了产品代码，因此该结果是基线，不是最终整合通过结论。

主任务阶段性 61 核心、12 基本操作组通过（`operation-core-all.log`、`operation-basic-all.log`）；其后新增任务取消用例，针对性三组列表用例通过。最终数量及所有 agent 整合结果需要下方接续更新，不能混用不同快照的数量。

固定浏览器快照位置记在 `tests/artifacts/operation-review-path.txt`，其代码按主任务复测需要更新过；后续最终快照必须重新记录文件摘要。证据目录被 Git 忽略，换机需另行迁移。

## 未完成边界

表格、格式/链接、输入/剪贴板和图片专项由并行 agent 继续，待汇入各自结果。当前新修复还没有原生新包验收；真实 IME、Windows、真实图床账户和长期压力测试不得记为通过。整份64组清单尚未完成，不以本报告落盘结束执行。

## English

The operation audit is in progress. Reproduced and fixed unintended ancestor task changes, missing task-list cancellation, code Tab leaving the editor, and replace-all rewriting untouched Markdown. Targeted tests and fixed-snapshot browser checks are recorded above. Parallel audits and final integrated/native validation remain pending; no commit or push was performed.
