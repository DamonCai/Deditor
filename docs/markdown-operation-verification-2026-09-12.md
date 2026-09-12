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

输入/剪贴板、图片、表格、格式/链接、特殊块已汇入下方记录。仍在补搜索连续操作与历史草稿边界；真实 IME、Windows、真实图床账户和长期压力测试不得记为通过。整份 64 组清单尚未完成。

## English

The operation audit is in progress. Reproduced and fixed unintended ancestor task changes, missing task-list cancellation, code Tab leaving the editor, and replace-all rewriting untouched Markdown. Targeted tests and fixed-snapshot browser checks are recorded above. Parallel audits and final integrated/native validation remain pending; no commit or push was performed.

## 整合快照与专项汇总（第一次整合）

固定快照 `/tmp/deditor-operations-integrated-ytco9fpc`，摘要 `tests/artifacts/operation-integrated-manifest.json`。独立依赖缓存避免并行测试互相覆盖。完整 `test:all` 通过：61 核心、106 阅读集成、13 基本操作、8 Enter 历史、11 输入/剪贴板、11 表格、10 格式/链接、7 图片、4 特殊块、144 通用组件、119 XMind、13 导出以及语法/代码行数/图标检查；原生生产构建通过。日志为 `operation-integrated-final-all.log`、`operation-integrated-final-build.log`。

首次整合的一条失焦失败确认是测试准备：初始光标处于引用定义源码时，先 focus 再仅派发模型选区，DOM 焦点仍留在内嵌 CodeMirror；模型选区切换后补真实聚焦，完整回归通过。强制前置状态的正反对照已完成，没有因此修改产品或增加等待。

复杂文档与真实预览 540 项样式/尺寸/位置检查无差异，见 `operation-final-presentation.json`。文档层性能检查通过，见 `operation-final-perf.log`；它不等于原生交互延迟或长期压力验收。

- [输入/剪贴板](markdown-input-clipboard-audit-2026-09-12.md)：Unicode、配对、表情候选、跨块粘贴和精确历史。
- [表格](markdown-table-operation-audit-2026-09-12.md)：换行、TSV 空白、列表源码位置、菜单裁切、增行列后键盘撤销。
- [格式/链接](markdown-format-links-audit-2026-09-12.md)：工具栏状态和行内代码关闭后继续输入、链接与脚注。
- [图片](markdown-image-operation-audit-2026-09-12.md)：替代文字与标题分离、转义路径位置、宽度输入反馈及替换历史。
- [特殊块](markdown-special-blocks-audit-2026-09-12.md)：源码 Tab/Shift Tab、公式、YAML、HTML、Mermaid 编辑与撤销。

检查期间外部操作提交了工作区（此时 HEAD `89826af`）；本任务没有执行提交推送。后续搜索/草稿补丁晚于这份快照，不能用本次通过代替其最终整合验证。

## macOS 实际保存与连续操作（第一次整合包）

独立应用 `DEditor Operations Review.app`，identifier `com.deditor.operationsreview20260912`，仅打开自建 `/tmp/deditor-operations-native-20260912.md`。基线保存在 `tests/artifacts/operation-native-baseline.md`。

- 子项 child 转任务，父任务保持完成、sibling 不带任务框；改动块必要的列表标记重新序列化，其他块保持原文；一次 Cmd Z 后保存与基线逐字节一致。
- 代码行尾 Enter→Tab→输入 next→Shift Tab→Esc→保存，磁盘恰为原文代码多出一行 next，公式语言不变；连续撤销并保存恢复完整基线。
- 表格 first 行尾 Shift Return→输入 line→保存，磁盘含 `first<br>line`；两次撤销恢复基线。首次从代码输入框直接点击表格的无等待组合没有换行，仅形成 firstline；随后分步和选区定位两种原生复测通过，浏览器无等待 AX/坐标链也通过。工具期间出现窗口/截图异常与手动状态变更提示，根因未稳定复现，保留观察项，不能声称此首次异常已修复。
- 原生查找 target 共 4 处，全部替换 changed 后磁盘严格等于基线 replaceAll；表格、列表标记、引用和尾部三空格均保留。一次撤销并保存等于基线；重做、保存、关闭、恢复关闭标签后呈现正确且磁盘等于预期替换文本。
- 干净文档外部写入自动更新正文；未保存时外部写入出现冲突横幅，本地文字仍保留。点击保留我的修改再保存，磁盘逐字节等于本地版本。第二次冲突点击从磁盘重载后关闭，无未保存提示；最后磁盘为基线。首次冲突观察期间工具报告手动状态变更且模式变化，已重新独立复测，不把该观察归为产品丢稿。

证据：`operation-native-child.md`、`operation-native-code.md`、`operation-native-replaced.md`、`operation-native-kept-local.md`、`operation-native-app.log`。已关闭测试文档并退出本次独立应用。这里不新增 Windows/真实 IME 结论，也不覆盖真实行列拖拽。

## 操作目录覆盖状态（当前接续）

这里的“已覆盖”是该组已有实际操作与相应回归，不表示组内所有系统/输入法/拖拽组合全部通过。

| 范围 | 当前证据 | 仍需区分的边界 |
| --- | --- | --- |
| A 光标/选区 | 鼠标双三击、拖选、扩选、格式边界已有实测，追加导航专项中 | Windows 快捷键、全部跨块组合 |
| B 输入/删除 | 11 组输入专项、13 组基础操作、8 组 Enter 历史以及原生保存 | 真实 IME 候选/组词 |
| C 剪贴板 | 实际剪切粘贴、Unicode、富文本与空白、多行源码 | 跨应用真实来源、系统图片剪贴板、原生文本拖动 |
| D 格式 | 10 组格式/链接回归与真实切换，行内代码退出继续输入修复 | 真实 IME 交错 |
| E 列表/引用 | 嵌套任务、取消及父状态有原生证据；追加导航/缩进专项中 | 首项 Tab 已复现，修复处理中 |
| F 表格 | 11 组专项、真实控件及原生换行保存撤销 | 原生真实行列拖拽/取消/边缘滚动；一次未稳定复现首键观察 |
| G 链接/脚注 | 格式链接专项、脚注真实 Tab/Esc、既有原生补测 | 外部应用启动和整篇布局对跑不由局部样式推出 |
| H 图片 | 7 组专项、路径/替代文字/标题/宽度真实修改 | 真实图床账号、最终包全套目录/资源组合 |
| I 特殊块 | 4 组专项、实际公式/图表/raw、代码 Tab 原生保存 | 联网失败完整链路及真实 IME |
| J 搜索/大纲 | 大纲真实操作；全部替换原生精确保真；单次替换新增 5 组与真实三次替换/撤销 | 新搜索补丁最终整合与原生待补 |
| K 保存/会话 | 原生保存重开、外部干净重载/脏冲突保留；追加草稿和长文历史检查中 | 新发现草稿失败残留已修复；长文撤销异常定位中 |
| L 显示/稳定 | 540 项复杂呈现无差异，设置不改内容与文档层性能通过 | 长期压力、原生大文档、Windows 仍不能算完成 |

详细搜索新增见[搜索专项](markdown-search-operations-audit-2026-09-12.md)。后续检查和修复仍在执行，不能把本表作为全量通过声明。

## 交叉检查新增源码映射回归

ProseMirror 允许同一个不可变段落节点出现在多处。带脚注文档里复制同一个段落节点后，原先映射表按节点对象作键，第二份覆盖第一份的位置；随后修改界面第一份，却把源码写到第二份。现在映射按文档中的出现索引保存。LF/CRLF 正反用例确认旧版失败、修复后两份能独立编辑且位置一致；62 核心通过。证据 `operation-shared-node-before.log`、`operation-shared-node-after.log`。这属于合法模型操作的确定性回归，不据此宣称普通系统剪贴板也复现同一故障。

本轮追加搜索/草稿/加载按钮/列表 Tab/图片属性撤销后，正在最终整合。并行其他任务还在修改列表样式：第一次整合快照的 540 项呈现通过仍只属于当时版本；新的增强呈现检查捕获了未收口样式差异，不能沿用旧通过数覆盖新样式。

## 最终编辑操作整合（v3，原生短链待接续）

`operation-integrated-v3-all.log` 完整通过：62 核心、106 阅读集成、82 组基本/Enter历史/输入/表格/格式/图片/特殊块/搜索/会话/导航专项，以及144通用组件、119 XMind、13导出、语法、代码行数和图标。`operation-integrated-v3-perf.log` 文档层性能通过。当前摘要为 `operation-integrated-v3-manifest.json`。构建首次因新回调未使用参数未通过类型检查，已改为明确未使用名称并重新构建；不能把第一次失败写成构建成功。

新增[搜索专项](markdown-search-operations-audit-2026-09-12.md)与[会话专项](markdown-session-operation-audit-2026-09-12.md)。图片属性撤销的实际浏览器补测已附在图片专项。导航首项Tab修复包含在当前整合，未抢占表格单元格内Tab。

注意另一个用户任务在同一工作区独立推进列表共享样式：v3增强呈现检查的1374项仍发现6条高度/位置/软换行文本差异，源自正在变化的列表显示范围；字体和图片加载已确认正常。该样式结果单独保留，不能因编辑操作全量回归通过而标整体呈现通过，也不能把最早540项旧样式通过结论套给v3。
