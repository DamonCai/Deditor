# 查找与会话连续操作（2026-09-12）

对应[本轮清单](markdown-operation-sequences-2026-09-12.md) SH01–SH06。自建正文、代码、表格及双文档样例，没有读取或操作用户原文。专项模型初版 6 组全通过后，真实按键仍发现查找焦点问题；修正测试，不再在关闭前主动给输入框聚焦以掩盖故障。

## 本路两个独立修复

1. **最后一个匹配被替换后，Esc 和后续输入失效。** 实际点击 Replace current 清空 TARGET 后，按钮变为禁用，浏览器焦点退到页面；Esc 事件不再进入查找面板。修复为替换完成后把焦点移到仍可使用的查找输入框。真实修复前 `before TARGET after` 清空后按 Esc、逐键 NEW 均无效；修复后为 `before NEW after`，一次 Cmd Z 只撤销 NEW，保留替换结果。表格清空后直接键入 NEW 仍在原格；代码替换 renamed 后 Esc 返回代码选区，键入 X 替换 renamed，撤销恢复 renamed；全部替换后 Esc、撤销、重做、续写同样正常。
2. **点击模式切换后焦点停在按钮，不能直接继续编辑。** 产品 Edit/Visual 控件在切换后保留按钮焦点。现仅响应用户点击的切换请求，等待匹配文档的编辑区可用后交接焦点；用户已移焦或换文档时取消，不让延迟加载抢焦点。真实修复后：阅读 `before body after` 在 before 后输入 X→产品 Edit 按钮→直接 S，得到 `before XSbody after`；产品 Visual→Cmd Z→直接 Y，得到 `before XYbody after`。后文保持不变。

改动：`MarkdownVisualEditor.tsx` 的替换完成焦点、`PreviewModeSwitch.tsx` 的显式切换请求。HTML 的模式处理未改。

## 证据和边界

- `scripts/test-markdown-sequence-session.mjs`：6 组查找/历史连续链，查找关闭从当前焦点发 Esc，不再先 focus 修正状态。磁盘接口为记录调用的替身；save/重新挂载不称为原生保存重开。
- `scripts/test-markdown-mode-focus.mjs`：8 组模式焦点保护，覆盖已就绪、延迟就绪、错误文档、用户移焦、换标签、非用户状态恢复。
- 自建真实 UI：`tests/markdown-sequence-session-review.html`，同时挂载实际工具栏、源码编辑区和阅读编辑区。浏览器证据使用直接按键、AX 选词和产品模式按钮；其顶部 Reset/切标签/Capture source 仅为样例操作。
- 修复前快照 `/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-sequence-before-cbdy1bav` 仅撤去本路两个修复，两个对应测试均断言失败；使用 Node 23.11.1。首次临时目录默认 Node 版本不同导致 crypto 缺失，已纠正运行时，未计作产品故障。
- 本路未新增真实 IME、原生磁盘写入或 Windows 结论。最终固定快照和双文档 UI 结果见本轮整合记录。

## English

Two focus bugs were fixed: replacing the final match disabled the focused button and broke Escape/continued typing; explicit Markdown mode changes left focus on the mode button. Tests now preserve the actual focus path and verify deferred focus requests cannot steal focus after user navigation. Browser, model, and native evidence remain separate.

最终固定版本 6+8 组和完整 test:all/构建通过，见[第三轮整合结果](markdown-operation-round3-2026-09-12.md)。只读交叉复核补获同事件切标签/切模式的旧闭包竞态，已改用实时 store；不把本轮实施中纠正的回归增加为原有问题。最终 UI 查找 NEW→产品 Edit 输入 S→产品 Visual 撤销 S 后输入 Y，得到 `before NEWY after`；A/B 双文档撤销后续写保持隔离。
