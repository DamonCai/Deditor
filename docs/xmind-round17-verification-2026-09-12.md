# XMind 第十七轮验证（2026-09-12，进行中）

整体仍未完成。接续第十六轮，检查图片、多标签、标记、备注及链接同时出现的布局。原版受文件选择器/窗口控制异常影响的项目继续保留，不把浏览器结果替代原生互通。

## 组合标签遮挡

自建 contentCombinationSheets 覆盖全部 16 个结构，每个主分支带 130×70 嵌入 SVG、三条标签（含中文换行）、优先级/进度标记、备注和内部链接；明细带 90×60 图片与两条标签。生成器为 scripts/create-xmind-content-combinations.ts，各工作表及主题 ID 独立。

旧实现的可视边界探针发现向下组织图 8 对父子重叠，水平/反向/离轴时间轴各 2 对，双向鱼骨各 2 对。真实浏览器 org-chart.down 全图确认父主题下方标签被子主题图片遮挡，属于实际显示缺陷。

修正向下排布和时间轴明细栈以父主题包含标签的可视底边预留间距；鱼骨上方分支增加标签高度对应的起始间距和最小伸展距离。连线仍连接主题轮廓，标签不扩大主题形状。回归另外捕获鱼骨折叠时上方标签与中心主题重叠，最小伸展距离一并修正。

新增回归覆盖全部结构的展开、第一分支折叠、全部主分支折叠；校验任意两个可视节点不重叠、布局不改原文、编辑标题仅改变目标 title、附件资源保持字节一致。105 核心通过。固定快照完整 test:all 通过（105 核心 / 140 组件，以及其余 Markdown、导出、语法、图标测试）；之后仅隔离 fixture ID 并重跑 105 核心，不改变运行时代码。浏览器已实测向下组织图、水平时间轴、双向鱼骨，折叠/撤销恢复明细通过。

## 多工作表栏高度

16 个工作表使底部说明被 flex 压至 11px 宽，继承 .xm-help 的 pre-line 后变成约 198px 高，工作表栏实际高度 198.96875px。修正 .xm-sheets .xm-help 不收缩且不换行。浏览器宽 1280 时栏高恢复 37px、说明高 19.796875px；720×640 时栏高仍 37px，页面宽等于视口、可切换至末尾 fishbone.rightHeaded 工作表。测试后恢复默认视口。

## 快照与资源

新快照 /private/tmp/deditor-xmind-native-round17-review19，与 Review18 分离；Review18 全部源文件哈希重新核对与 source-review18.json 一致。新包构建通过，SHA256 为 77d659dcbfe1d391bf25506b273c602bf2a049f36447e587b297327eecb520d5，原生闭环见下文。只运行一个本任务原生应用，用完关闭文件并退出；先前 XMind 恢复的旧测试文件已逐份关闭大部分，剩余窗口控制不稳定时已退出，确认主进程不存在。

证据目录 tests/artifacts/xmind-round17，包含 core-content.log、core-final.log、all-review19.log、build-review19.log。原生保存/重开、原版新组合互通仍待继续，不声称本轮已全面结束。


## Review19 原生验收

单独启动 Review19，通过文件树只打开自建三份样例。向下组织图 65% 全图、水平时间轴 45% 全图确认图片和父子标签分离；分别 F2 改主分支标题、未离焦 Cmd+S、关闭文档、从磁盘重开，标题/明细及标签保留。鱼骨图 43% 全图以 Cmd+/ 折叠第一分支，标签仍与中心及子树分离；保存、关闭重开确认 folded 状态。每份核对后关闭文档，最后只剩默认 Untitled，再 Cmd+Q 退出；进程列表确认 Review18、Review19 与 XMind 均未运行。

归档递归对比：组织图仅第一主分支 title，时间轴仅第二主分支 title，鱼骨仅第一主分支 branch=folded，其余 JSON 字段与所有附件 ZIP 成员一致。证据 native-review19-verification.json 及三份 native-review19-*-save.xmind。原版读取仍待继续，不能将此原生保存检查计为互通通过。


## 原版重读补齐及新差异

通过 Finder 对 `/tmp/deditor-xmind-review19-cases/` 的三份已保存文件逐份打开，核对原版 source 路径：组织图 115%、水平时间轴 81%、左头鱼骨 63% 适应画布均无修复提示。`Native media org`、`Native media timeline` 新标题保留；鱼骨第一原因折叠计数 2 保留；图片、完整标签及备注仍在。三份归档哈希见 `native-review19-verification.json`。

另发现长标签表现与原版不符：原版为单行省略、13px 字号、白色半透明细边框；此前本地为 11px 灰底多行。此问题由第十八轮继续修复，不能用本轮间距通过代替标签视觉一致性。

清理恢复的旧自建窗口时，`tests/artifacts/xmind-round8/native-relationship-probe.xmind` 有待保存修改，已另存为独立证据 `tests/artifacts/xmind-round17/recovered-native-relationship-probe.xmind`，未覆盖旧样例或丢弃编辑。SHA-256：`4867797f0ec577a36da521e7472ae295acc73f628daa332f21a5175536134b4f`。本轮结束后退出 Review19 与原版；第十八轮启动原版仍恢复部分旧测试窗口，已再次逐份关闭全部后退出，避免后台堆积。
