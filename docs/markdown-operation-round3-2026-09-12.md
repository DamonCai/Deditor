# 第三轮：连续操作检查与修复（2026-09-12）

用户要求针对“bug修改”和本任务漏检的问题，梳理检查点并多 agent 并行处理。本轮以[36 条连续操作清单](markdown-operation-sequences-2026-09-12.md)为范围，由三个 agent 分别处理行内格式/链接、表格、图片/特殊块，主 agent 处理查找/会话及整合。真实逐键输入又补充了行内入口变体；不能把单次插入整个单词当作逐键验收。

## 修复统计

**本轮新增修复 14 类问题，与前两轮 33 类合计 47 类。** 同类的左右方向、粗体/代码变体不重复统计；格式命令、插入命令、图片字段和选区的历史分组问题合并为一类。未把“bug修改”独立任务的任务列表和代码外观修复重复加入此累计。

| # | 问题 | 修复后的行为 |
| --- | --- | --- |
| 1 | 启用粗体或行内代码后，逐字输入仅首字有格式 | 每个字都留在刚启用的格式中 |
| 2 | 删光格式内部文字留下可见星号/反引号空壳 | 删除正文时同步清空原格式壳，撤销恢复完整词 |
| 3 | 明确退出格式后仍继承格式，或仅首个新字在外侧 | 左右退出后持续逐字输入均保持外侧格式 |
| 4 | 相邻粗体/代码处删除、撤销后，下一字进入前一个格式 | 恢复当前边界的输入格式，后续文字留在代码中 |
| 5 | 链接编辑取消或确认后把原单光标变成整词选区 | 恢复原链接内位置，续写不会覆盖整个标签 |
| 6 | 离散命令/选词删除/图片字段等误合历史，输入投影又拆开首字 | 操作边界独立，连续输入完整分组；不拆组词过程 |
| 7 | HTML/详情保留块失焦后仍停在源码外观 | 邻段取得焦点后收起源码，保留编辑结果与高度 |
| 8 | 图片标题延迟写回，与撤销或删图竞争 | 输入即时记录，撤销/失焦后旧标题不再复活 |
| 9 | 撤销重做丢失整块选区类型，继续按键落点错误 | 保存/恢复选区类型，兼容旧会话的位置回退 |
| 10 | 表格末格 Tab 增行，重做后文字写回旧格 | 增行和移动光标一起记录，重做后留在新行 |
| 11 | 清空含软换行的整格段落后跳到邻格 | 保留原格的空段落与输入位置 |
| 12 | 表后正文左移跳过整张表，往返后误写表头 | 按方向进入相邻表格的最近文本格 |
| 13 | 替换最后一个匹配后按钮禁用，Esc 和续写失效 | 焦点保留在查找面板，Esc 返回正文 |
| 14 | 点击 Markdown 模式后焦点停在按钮，无法直接续写 | 目标编辑区就绪后交接焦点，过期请求取消 |

交叉复核还发现本轮模式焦点实现的同事件竞争：换标签/模式后 React 尚未重绘，旧闭包仍可抢焦点。已改为读取实时 store，并补两组失败对照；属于本轮实现过程中拦截的回归，不另充作原有问题增加修复数。

## 最终验证

- 最终固定副本：`/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-sequences-final-vrowvy5h`。基于 HEAD `34b8e35` 加当时完整工作区，文件 SHA-256 清单 `tests/artifacts/round3-final-manifest.json`。同时保留性能、任务和 XMind 等并行改动，未回滚工作区。
- 最终 `npm run test:all` **退出码 0**：62 核心、106 阅读集成、144 通用回归、119 XMind、导出/语法/图标/代码呈现及全部已接入操作专项通过。日志 `tests/artifacts/round3-final-all.log`。通用旧测试有 React 测试容器警告，非全程无警告声明。
- 本轮 **40 组新增专项**：行内 9、表格 8、特殊块 9、会话 6、模式焦点 8。表格/特殊块另有真实长页或默认鼠标按键证据，不把组件模拟当作浏览器默认行为。
- 最终生产构建退出码 0：`tests/artifacts/round3-final-build.log`。保留现有包体大小提示；本轮没有新建原生验证包。
- 最终浏览器实际逐键：粗体/代码创建、删空、整词撤销、左右退出、相邻格式删字/撤销、选中替换/撤销、链接取消/确认后的原位输入；查找清空后直接续写；产品模式切换后源码/阅读继续输入；A/B 文档编辑与撤销隔离。详情见各专项和 `tests/artifacts/round3-root-browser.json`。
- 复杂文档阅读/真实预览亮暗各 1374 项稳定呈现对照无差异。主题刚切换时图表异步渲染有临时高度差，待 SVG 完成后才作稳定对照；不把此指标当作所有交互通过。

### 本轮纠正过的验收方法

第一次整合虽然全部自动化通过，真实逐键 IN03 得到 `N**EXTword**`，初步修复仍只修好首字。已把整个行内专项改为逐字执行，并继续发现选词删除后 Undo 只恢复 w 的分组问题；补齐后在新固定副本重新跑完整回归、构建和实际按键。旧快照与旧整词模型通过不作为最终验收依据。

链接浮层的鼠标悬浮入口仍未覆盖：浏览器中由明确标记的测试按钮调用实际编辑 API 打开真实浮层，随后使用真实 Escape/Return/输入/撤销，确认 label 内位置与 URL 的分步恢复。该证据验证弹窗及后续编辑，不证明悬浮按钮本身可达。

## 相关任务与边界

“bug修改”已完成[任务列表删除与缩进专项](markdown-task-interaction-fix-2026-09-12.md)，24 组专项及其独立 macOS 保存/撤销/重开有记录；代码点击外观见其[专门记录](markdown-code-focus-fix-2026-09-12.md)。本轮固定回归包含其任务代码，但那个原生包不含本轮后续的全部 14 类修复，不能据此把最新工作区算作原生验收通过。

本轮没有真实中文候选输入法、Windows、系统剪贴板各来源、真实拖拽/图床账户及长期压力新增结论。仅使用自建测试页，未操作用户当前原生文档。自建浏览器标签与开发服务在验收后清理；不提交、不推送。36 条清单是本轮覆盖目录，不是所有基本操作所有组合已经无缺陷的证明。

## 专项记录

- [行内格式与链接](markdown-sequence-inline-2026-09-12.md)
- [表格](markdown-sequence-table-2026-09-12.md)
- [特殊块与图片](markdown-sequence-block-2026-09-12.md)
- [查找与会话](markdown-sequence-session-2026-09-12.md)

## English

Three agents and the parent audited user-generated action sequences. Fourteen distinct issue categories were fixed (47 across this task's three rounds, excluding the separate task-list work). The final fixed snapshot passed the full regression suite and production build, including 40 new targeted groups. Real sequential keypresses caught an incomplete initial fix, leading to another correction and full rerun. Browser popup tests use an explicit fixture activation button; hover activation, the final native package, real IME and Windows remain unverified.
