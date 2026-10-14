# 操作检查漏项复盘（2026-09-12）

用户要求对照“bug修改”任务和本任务此前记录，解释为什么基础交互仍由用户发现。本次只核对任务消息、既有测试和修复记录；没有读取或操作该任务中的用户原文，没有重复修改正在由该任务处理的产品代码。

## 已确认的检查缺口

| 用户实际问题 | 之前检查了什么 | 漏检原因及纠正 |
| --- | --- | --- |
| 空任务处不能向前删除；该任务已复现其内部含换行节点 | 空任务 Enter 退出；非空任务 Shift Enter 保留软换行 | 两个动作分别通过，没有测试“软换行→删掉可见文字→看似空任务→Backspace/Enter”的生成链。空外观不等于空节点，必须覆盖用户可产生的中间状态。 |
| 任务首项、连续 Tab 无法向右缩进 | 普通第二项嵌套/提升、首项 Tab 不插空格 | `test-markdown-navigation-audit.mjs` 的两个测试明确把首项 Tab 无变化作为预期。此前直接沿用上游限制，未先确定产品交互目标，测试反而固化了不可操作状态。用户现在已在“bug修改”明确要求整条任务向右缩进；旧 no-op 结论不能作此需求的通过证据。 |
| 点击代码块后布局、行号、字体或高亮改变，出现额外控件 | 静态阅读与 Preview 样式对照；代码内输入、Tab、方向键及撤销 | 缺少“未聚焦→点击→输入→失焦”全过程的外观不变检查。1374 项静态指标不能代替每个交互状态的验收。该项已由“bug修改”修复，见代码点击外观记录。 |

相关证据：`scripts/test-markdown-navigation-audit.mjs` 的 `first item Tab is a no-op` / `first task Tab retains status and source`；`scripts/test-markdown-basic-operations.mjs` 的独立任务软换行和空项 Enter 测试；[代码块点击外观记录](markdown-code-focus-fix-2026-09-12.md)。任务“bug修改”当前已复现空任务换行节点、首项与连续 Tab 被忽略，仍在处理；此复盘不替它宣布验收完成。

## 后续验收方式

1. 先记录用户意图与预期，再写断言。不能因为上游返回 false 或当前实现不改变内容，就把无操作当成功。
2. 用真实操作生成状态。重点链为创建任务→输入→软换行→删空→删除/退出；任务→连续 Tab→Shift Tab 退回→切换勾选→撤销→继续输入。保留首项、末项、多选和嵌套的区分。
3. 把模型测试与真实鼠标/键盘证据分开。直接构造选区适合验证算法，不能证明鼠标可定位、焦点正确或原生默认事件正常。
4. 每条连续链同时核对文字、光标、层级、视觉跳动、磁盘保存及撤销/重做；外观要比较点击前后和失焦后，不能只验静态截图。
5. 覆盖表记录具体链路和环境，不再以分类“列表已测”或用例总数代表体验完整。33 项修复数属于已处理的问题数，163 组测试属于已有覆盖范围，两者均不证明此类基础交互已无缺陷。

本次责任在检查设计与结论表达：已有测试和修复确实存在，但遗漏了真实生成路径，并在首项 Tab 上采用了不符合用户目标的预期。平台尚未验收不是这三项漏检的充分解释。

## English

The audit missed user-generated intermediate states and interactive visual transitions. More seriously, existing tests treated first-item Tab as a successful no-op rather than validating the intended task indentation. Future acceptance must define user outcomes first, generate states through real action sequences, and separately verify content, caret, hierarchy, visuals, save and history. Existing pass counts do not establish complete usability coverage.
