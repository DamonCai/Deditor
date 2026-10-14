# XMind 第十五轮验证（2026-09-12，进行中）

整体仍未完成，继续原生交互、复杂结构与跨平台验收。

## 已复现并修正

- 联系选中后 F2 / 空格没有进入画布文字编辑，现补画布范围内的入口，排除输入框、修饰键和 composition/229 事件。浏览器 F2、Shift+Enter 换行、Escape 取消、空格重开、Enter 提交及一次撤销通过。
- 原生检查中，辅助树没有报告联系编辑框；最初以为 F2 未生效，后经 Review16 截图和保存归档确认已进入编辑，不能把辅助树缺失当作按键失败。辅助点击聚焦画布已显式补齐并回归；另发现编辑器在 button 角色下被原生辅助树隐藏，正改为编辑态 group 角色。
- 同一反向离轴归档，原版把边界 (0,1) 的两个阶段排在上侧，之后阶段 3 下侧、4 上侧；本地原先按节点单独交替，导致同一边界跨主轴。现按边界连续组交替，重叠范围合并为一个组，保留源字段。
- 原版离轴时间轴即使阶段带 org-chart.down 字段，也采用该时间轴的紧凑明细栈；本地原先渲染组织图子树。现仅在离轴布局中采用原版排列，原文件的覆盖字段仍保留。
- 实际截图还发现嵌套边界标题遮住所属阶段。现把边界标题高度计入明细间距，并避免手动布局重复添加整体边界；整体边界随明细移动后重新计算范围。

浏览器同一 reverse-grouped 保存文件已确认阶段 1/2 上、3 下、4 上，嵌套标题与阶段分离。窄窗口重新适应到 51% 后整图可见。修改边界结束为阶段 3，阶段 1/2/3 自动同侧、4 换侧；一次撤销恢复原来方向。

## 原版互通补齐

- Review14 反向保存文件已在原版 100% 整图读取，准确路径和 isDirty=false 已核对，两个边界、折叠的 2 个明细、双行联系保留。布局差异按本轮发现修正，没有宣称此前坐标全对。
- 最终紫色文件 `/tmp/deditor-xmind-review13-cases/purple-format.xmind` 原版读取成功。SHA256 `8024a415167949b68b5d0ac79943ad3e884912703872446695ece95dfdfd9b3f`，浅色工作表 100% 截图确认紫色加粗边界双行文字和较大联系字，isDirty=false、无修复提示。补齐此前最终紫色原版重读待验项，证据 original-purple-verification.json。

## 测试与测试包分界

Review15 固定快照完整 test:all 最终通过：100 核心 / 140 组件，构建及冷启动通过。二进制 SHA256 `ac7e8228af72cf96c22b0567cbb52af2e8c8081a76583e45353000de7d03a5ef`。对应 all-review15-final.log / build-review15.log。

失败记录保留：初始临时目录调用了旧 Node 16；改为明确 Node 23 后，新增用例把旧 read 偏好误当只读，DOM 断言格式化耗尽资源被终止。已修正用例为实际无 tabId 的只读入口，并使用简洁布尔断言，未放宽产品预期。最终完整回归成功，不把前两次失败标为通过。

后续焦点、分组与标题修改已进入 Review16 固定快照 `/private/tmp/deditor-xmind-native-round15-review16`。Review16 完整 test:all 通过：102 核心 / 140 组件，构建和冷启动通过。二进制 SHA256 `c7610d044bfd5a6ea55b7f59f6d217d59f5592f237863a0c8e5611361fad48bb`；all-review16.log、build-review16.log、source-review16.json 为对应证据。性能入口也通过，具体耗时见 perf-review16.log。不能沿用 Review15 原生操作结论。自动化新增了正反方向、重叠分组、折叠、结构字段保存、长边界标题与整体边界唯一性；真实候选浮窗、整段拖动及 Windows 仍未计通过。

Review16 原生 F2 编辑实际通过：截图可见选中文本的画布草稿。Ctrl+Space 后逐键 nihao 仍是英文直输，无真实候选窗口，不计新增 IME 通过。随后实际改为 Native keyboard / 空行 / Last line，未离焦 Cmd+S、关闭无提示、从自建临时目录重开均通过，归档确认为两处换行。

Review16 原生边界范围修改至 (0,2)，保存后只有 /0/rootTopic/boundaries/0/range 改变，其他 JSON/归档成员相同。关闭无提示、重开 86% 全图确认阶段 1/2/3 同侧、4 下侧，嵌套边界标题与阶段分开。原版重读正在进行。

Review17 最终辅助角色修复已完整回归（102 核心 / 140 组件）并构建，SHA256 `5bb664b4c2a9092d2bad8c0cb471b2720455922cd3e5894743e62fcf1bc84a30`，原生冷启动通过。对应 all-review17.log / build-review17.log / source-review17.json，后续操作继续验证。

Review17 原生辅助树已显示 Edit relationship text 且能读取多行内容，角色修复通过。原生直角整段拖动仍返回 noWindowsAvailable；只作为工具阻塞记录，不计通过。系统设置确认 Ctrl+Space / Ctrl+Alt+Space 已启用，已配置 ABC、简体拼音及另一个输入法，但当前逐键仍英文直输，TextInputMenuAgent 获取超时，未取得新的候选窗口证据。

原版最终读取 Review16 keyboard-multiline.xmind 的准确路径，isDirty=false；83% 全图显示全部 11 种双端箭头及 Native keyboard / 空行 / Last line，完成该保存样例互通。另一次对话框选中文件发生变化，最终打开的是此键盘样例，不能记成 reverse-grouped 三阶段原版通过；该项仍继续。

三阶段范围最终在原版准确路径 /private/tmp/deditor-xmind-range-three/range-three.xmind 完成读取（与原生保存字节/哈希一致），isDirty=false、100% 全图：1/2/3 同侧、4 下侧，嵌套边界和第一阶段折叠保留，无修复提示。至此该范围修改保存、重开及原版互通闭环。
