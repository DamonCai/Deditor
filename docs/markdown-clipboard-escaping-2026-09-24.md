# 阅读编辑复制转义横查（2026-09-24）

## 问题与修复

用户反馈复制 `disabled_sg_channels_7d_sls_20260914.csv` 周边内容后出现额外反斜杠和反引号。

上游 Milkdown 普通复制的 `clipboardTextSerializer` 只在选区归约为单个文本节点时直接取文本。混合格式、多个文本节点或跨段选区会走 Markdown 序列化，使普通剪贴板 `text/plain` 带入格式语法、转义符和末尾换行。例如部分选中粗体 `a_b` 与代码 `c_d`，修复前得到 `**a\_b** and ` + `` `c_d` ``，而非可见文字 `a_b and c_d`。右键及工具栏富文本复制原本使用另一套可见文字提取，因此入口表现不一致。未将用户描述中的每一层反斜杠都归为独立、已复现的故障。

- 普通复制和剪切统一调用 `clipboardText`，直接提取所选内容，HTML 剪贴板继续保留格式。真实反斜杠不做正则删除或反转义。
- “复制 Markdown”仍显式输出合法 Markdown；保存序列化所需的转义不变。
- 横查发现富文本/TSV 的原有 `textBetween(..., "\n")` 会把所有叶节点视为换行。现分别保留 emoji 字符、图片 alt、公式原始表达式和脚注标识；真正硬换行仍输出换行。
- 表格范围、富文本 HTML、Markdown 粘贴、源码编辑区的文字语义不改。展开的行内源码按所选源码字面值复制。

## 验证

`scripts/test-markdown-input-clipboard-audit.mjs` 新增 ESC01–ESC06，已在原 `test:markdown-input-clipboard` / `test:all` 链路内：

1. 14 组内容：用户文件名、转义下划线、行内代码、可见反引号、粗体/斜体/删除线、链接、星号/方括号/井号/引用符/管道/感叹号、HTML 实体、真实反斜杠、跨段、标题/引用/列表、硬换行、代码块、中英文及组合 Unicode。
2. 部分混合选区复制、剪切、原文精确撤销重做及重挂载；富文本仍含 strong/code。
3. 三轮富文本复制粘贴、保存调用、撤销重做及重挂载；显示文字不增加转义符、节点语义相同。
4. emoji、图片 alt、公式和脚注复制内容。
5. 展开的行内源码选区字面复制。
6. 表格矩形选区、TSV 与普通复制中的下划线、emoji 和公式。

执行结果：输入/剪贴板完整 30 组通过，后补 ESC05/06 两组通过（合计 32 组）；阅读组件集成 108 项、表格 34 项、图片剪贴板 8 组、`test:regression`（含分隔线 12 组）与 `npm run build` 通过。构建仍有原有大 chunk 提示。本轮没有重复执行整个 `test:all` / `perf:all`。

内置 Chromium 使用独立自建页面 `tests/markdown-clipboard-escape-review.html`：

- 实际 Command+A/C/V 将文件名与混合粗体复制到 textarea，得到可见文字，无额外 Markdown 标记。
- 同一剪贴板粘回阅读编辑，行内代码和粗体保留；源码的合法转义不会作为显示文字泄漏。
- 暗色样例中的可见反引号、字面星号/方括号/管道、HTML 实体和 `C:\temp\a_b.csv` 正确复制。
- 应用右键菜单 Copy 与快捷键一致；显式 Copy Markdown 保留语法。
- 实际 Command+X 剪切及一次 Command+Z 恢复原始源码逐字一致。

浏览器页与临时服务已关闭。本轮未修改用户文档，未替换日常应用，未重打 macOS/Windows 原生包；不将浏览器结果视为系统剪贴板跨应用或原生 WebView 验收。保留工作区已有性能、恢复传输和 PlantUML 等未提交改动，未提交推送。

## Command+Shift+C/V 接续检查

用户随后要求核查无样式复制/粘贴快捷键。

- **C 原本没有绑定。** 内置浏览器中选中内容后发送 Command+Shift+C，剪贴板哨兵内容完全不变。现显式绑定 Command/Ctrl+Shift+C，只写 `text/plain`，不附带 HTML；空选区不改剪贴板，只读内容仍允许复制。
- **V 原本有依赖事件顺序的实现。** keydown 设置 pending、keyup 清除，再等待 paste；现改为在 Command/Ctrl+Shift+V 按键事件中直接读取纯文本并执行字面插入，阻止默认粘贴。正文/表格跳过 HTML、Markdown 和 TSV 解析，内嵌源码保持字面值。代码块通过 CodeMirror 的 Text 长度计算光标，兼容 CRLF。
- 读取剪贴板期间如内容/选区变化、失焦、编辑器卸载、转只读、进入组合输入或窗口已完成关闭快照，不把旧内容写回。读取失败走现有错误提示。

验证结果：完整输入/剪贴板 **37 组**（新增 PLAIN01–05）、阅读集成 **108 项**及生产构建通过。专项覆盖 Cmd/Ctrl、只读复制、空选区、正文/表格多行字面粘贴、慢读取后内容/选区/焦点/只读/卸载变化、组合输入、行内源码、内嵌代码 CRLF 和保存/单次撤销/重做/重挂载。

浏览器证据严格区分：

- C 修复后实际快捷键写出的剪贴板只有 `text/plain`，内容为可见文字。
- 自动化的 `pressKey('super+shift+v')` 及对应浏览器 locator press **仅送出 `paste` 事件，未送出 V 的 keydown**。事件记录确认后，不能用它解析了 Markdown 的结果声称物理快捷键在原生应用失效。
- 独立样例按钮在浏览器里发送明确的 Meta+Shift+V KeyboardEvent，调用产品真实处理器及真实 `navigator.clipboard.readText`；剪贴板同时有 HTML 和 `**literal** a_b`，实际显示仍为带字面星号的文本，无 strong 节点。此为浏览器合成按键处理验证，不冒充物理键盘/原生 WebView 验收。

页面保留事件日志和标注为 Simulate 的测试按钮，便于复核上述边界。测试页与服务已关闭；仍未重打/替换原生应用、未提交推送。
