# 第十二轮：原生格式互通、边框和辅助选择

整体仍未完成。本轮接续用户“继续，做完为止”，没有请求重复授权；完成了可以继续的原生格式、取色器、原版读取、源码修正和全量验证。最终直角整段拖动仍由 CUA 返回 `noWindowsAvailable`；原版重新打开改色文件时，正确选中文件且筛选为 Xmind 工作簿，但打开按钮持续禁用。不能把这些步骤记为通过，也不能据此宣称所有桌面操作均不可用或 Mac 已锁屏。

## 新完成的原生闭环

- Review10 冷启动成功。主题字号逐键输入 2/8，Esc 恢复 20；再次输入 28 后未离焦 Cmd+S，关闭重开显示 28。归档只有对应主题 `20pt→28pt`，其余 JSON 和 ZIP 条目一致。原版成功打开，浅深两表已显示，无修复提示，`isDirty=false`。固定结果 `tests/artifacts/xmind-round12/native-review10-topic-font-save.xmind`，SHA-256 `4dd67abf177479c8bf27821704c0a88317621820ba3ce85a9247cecd300ea971`。
- Review11 冷启动成功；边界辅助点击可以选中，字号 14→28、Enter、加粗、两步撤销恢复14/普通字重、两步重做通过。联系辅助点击可选中；逐键28/Esc恢复12，再次逐键28未离焦Cmd+S通过。关闭重开后边界28/加粗、联系28保留。
- 原版读取 Review11 上述格式结果，适应画布141%，显示加粗两行边界标题、大号联系文字、全部7主题，无修复提示且 `isDirty=false`。打开新文件后最初返回旧同名窗口，通过窗口菜单选中第二个 smart-fonts 并核实 URL 的 review11 路径后才计通过。
- 原生系统取色器实际选择紫色，边界标题与面板同时改变；一次撤销恢复主题色，再重做、保存、关闭重开均保留紫色。最终固定样例 `native-review11-format-color-save.xmind`，SHA-256 `8024a415167949b68b5d0ac79943ad3e884912703872446695ece95dfdfd9b3f`。精确归档断言只有边界字号28、bold、`#942192`，以及联系字号28pt；其它工作表、主题、继承字段和 ZIP 条目均保持原样。
- 最后这个含紫色的版本，原版重新读取尚未通过；上述原版格式通过发生在改色前，不混淆两个结果。第十一轮浏览器 fill 未提交的记录仍保留，本轮使用的是原生系统色板实际点击。

## 新修正

原版浅深智能主题样例确认，部分中心/自由主题样式省略边框时使用黑色1单位实线，不能用色板代替。现修正已确认的中心/自由主题缺省值；显式 inherited 边框色、宽、线型跟随连线；显式 none 不画边框。保持其它层级既有布局及颜色规则，未把所有主题的缺省样式声明为完全校准。原版静态主题计算规则作辅助依据，事实摘要写入 `tests/fixtures/xmind-native-color-fields.json`，没有拷贝原版实现。

原生辅助点击边界此前无效，因为只有 pointerdown；补充 click 选择。联系增加可聚焦按钮语义、Enter/Space 选择和辅助点击，输入框事件隔离。浏览器真实键盘选择与原生辅助点击均通过；组件断言选择不会写入文档或创建主题。

## 最终源码与验证

- 99 核心、137 组件及完整 `npm run test:all` 通过，TypeScript/Vite/Tauri 构建通过。
- 日志：`tests/artifacts/xmind-round12/all-snapshot.log`、`native-build.log`；源码清单 `source-review11.json`、`build-review11.json`。
- 测试包：`/tmp/deditor-xmind-review11-app/DEditor XMind Review11.app`；二进制 SHA-256 `531972d635651315621a70bba0ca8451e14e579dd8b01d08698e687fa697e15c`。
- 快照 `/private/tmp/deditor-xmind-native-round12-review11` 使用上一完整通过的931文件基线加5个XMind专用实现/测试更新，未覆盖工作区并行Markdown改动。构建后快照未变化，当前XMind运行时代码与包一致；事实说明和验证文档后续更新不影响二进制。
- 浏览器隔离页在5174，`?probe=smart-colors`，已查看黑色边框、边界Enter选择、联系Space选择及正确面板，未产生文档修改。
- 两次最初失败日志保留：早期边框修正扩大到子主题导致已有分支测试失败，最终收窄到原版确认的中心/自由主题；辅助选择新测试最初漏建边界/联系样例，补齐真实创建后通过。没有删除旧失败证据。

## 剩余与现场

- 原生直角整段拖动仍失败：Review11 `segments.xmind` 51%，zigzag已通过辅助点击选中，水平段手柄在约(715,610)，拖至(715,640)返回 `noWindowsAvailable`。源码回归/浏览器旧证据不能替代本步骤；文件与原始基线字节一致，没有误保存。
- Review11 Ctrl+Space 后逐键 nihao 仍英文直输，Esc取消草稿。系统输入源菜单连接超时；未捕获候选浮窗，极端缩放候选定位未通过。
- 原版含紫色最终文件读取待补。原版文件对话框正确路径、类型、选中状态已经检查；重置连接、Raise和重新定位后打开仍禁用。最后取消了该对话框。
- 更广智能主题、复杂结构组合、精细箭头/曲线及 Windows 原生仍未全量验收。当前没有可用Windows环境。
- Review11 工作目录 `/tmp/deditor-xmind-review11-cases`：smart-fonts含已保存格式和颜色，segments未修改。Review10结果另存为证据。原版当前另一个smart-fonts窗口仍为Review10文件；Review11改色前窗口已关闭，不能误当作最新。
- 正式 `/Applications/DEditor.app` 未替换，本任务未提交/推送。不要动Review8里用户尚未保存的Untitled Markdown。
