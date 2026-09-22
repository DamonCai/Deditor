# 原生输入与中文候选验收（2026-09-22）

当前结论：Markdown 和 XMind 已完成真实逐键拼音 + Space 提交“你好”、取消未提交拼音、保存、单次撤销/重做及关闭重开。IN-02 已从待办移出；IN-06 仅保留 XMind 候选窗口相对标题的视觉定位。IN-03/04（组合期间移动光标/滚动）未执行；IN-05（组合期间 Cmd+S）的字母进入组合文字现象也已在普通 WK textarea 重现，需真实键盘或可信事件顺序复核，不能归因产品专属。未把输入成功扩大为候选位置通过，未将未定因快捷键现象扩大为整个中文输入未完成。以下保留逐阶段证据，早期未激活的结果不代表当前结论。

基线 `17dbfb2`，本轮开始工作区干净。主任务独占原生桌面，本 agent 只读历史日志、检查入口与生成自建样例；没有将模拟 composition、直接写入中文或 archive 校验当作真实候选验收。本机 macOS `26.6.2`；开始时只读系统输入源为 `com.apple.inputmethod.SCIM.ITABC`，未修改输入法设置。

## 最短实际步骤

1. 目标正文/标题先获得焦点，再从系统输入菜单明确选择“拼音－简体”。确认菜单实际状态，勿以单次 Ctrl+Space 或 `defaults` 中的来源名称替代屏幕确认。若处于英文输入状态或 Caps Lock 已开启，按实际菜单恢复中文，记录原状态以便结束恢复。
2. 使用分别发送的实际 `n`、`i` 按键，停下截图。成功标准是看见含中文候选的系统窗口及其与当前插入光标的位置。没有窗口时不要继续 Space 把英文写入后声称成功。再输入 `h`、`a`、`o`，按照实际候选序号选“你好”，或在高亮目标正确时按 Space。
3. 在另一空位置输入 `n`、`i`，截图后 Escape，核对未提交拼音取消、已提交正文不变、应用没有误执行退出/删除动作。先选词结束组合，再做保存和撤销；组合期间快捷键需要单独记录，不能混为同一结论。
4. 若候选仍不出现，用同目录独立 `input-events.html` 的原生 textarea 做同样实际按键对照，记录 `composition*`、`beforeinput/input` 和截图。同样不出候选只能说明当前发送链尚未激活候选，不能证明编辑器有错或工具有错。不修改词典、不清空输入法历史，不注入合成 composition 代替系统操作。

以上候选出现、按数字/Space 选词依据 Apple 的[拼音输入说明](https://support.apple.com/guide/chinese-input-method/cimpys11836/mac)及[候选窗口说明](https://support.apple.com/guide/chinese-input-method/cim12992/mac)。候选词排序应以实际屏幕为准。

## 最小样例

样例目录（Git 忽略，不包含用户文件）：`tests/artifacts/native-input-acceptance-2026-09-22/`。

- `markdown.md`：独立 `Pair testing paragraph.`、`Chinese input:`、`Cancel input:` 段落，以及一个表格单元格和普通代码块。`markdown.baseline.md` 保留初始字节。
- `xmind.xmind`：仅一个根主题 `IME root` 与子主题 `IME child`、`Cancel unchanged`；`xmind.baseline.xmind` 保留初始归档。已用实际 `openDocument` 解析确认一个 sheet、根及两个子主题名称正确。
- `input-events.html`：复用此前无编辑器插件的 textarea 事件探针。
- `prepare.mjs`：可重建上述样例，已有文件会拒绝覆盖。首次准备使用 `node tests/artifacts/native-input-acceptance-2026-09-22/prepare.mjs`。跨机器需一起迁移忽略目录；此准备不是原生验收。

Markdown 先在 `Chinese input:` 后真实选词“你好”，在 `Cancel input:` 后检查取消；再补表格/代码源码的实际候选位置。保存后检查只有预期中文变化；撤销、重做、关闭重开精确核对。格式符单独使用 `Pair testing paragraph.` 尾部：批量 ` **native**`，以及分两次 ` **native` / `** outside`；原文应分别精确为 `Pair testing paragraph. **native**`、`Pair testing paragraph. **native** outside`。

XMind 在 100% 下双击根标题并全选，实际拼音选词得到“你好世界”；候选窗口必须跟随标题编辑光标。再次编辑并输入待选拼音后 Escape，检查未提交候选取消，已提交标题不丢失、不意外新增主题。再在缩放和平移后的子主题重复候选定位，优先覆盖 10% / 400% 的既有待验范围。最终保存归档核对根标题、主题数量和其他字段，再撤销/重做及关闭重开。仅将 ZIP 中文写对不代表候选定位通过。

## 已有证据与本轮边界

旧诊断包日志 `/Users/damon/Library/Logs/com.deditor.pairtrace20260922/deditor.log`，摘要 `/tmp/deditor-native-pair-trace/trace-analysis.json`。共 1,457 条事件、99 次 `handleTextInput`，均为单字符、非 composition；四个段落最终只有正确的一对粗体标记。第四段 AX 一度显示星号，但末次事务原文为 `Fourth paragraph. **native**`，配对已清空、显示文本为 `Fourth paragraph. native`。这些记录没有捕获首次多星异常，不能根据日志缺少中文输入就推断 IME 原因。

上一轮已确定并修复真实组件 DOM observer 合并两个闭合符时的缺口（见[紧急配对记录](urgent-format-pairs-2026-09-22.md)）。当前 `beforeinput` 合并优化在 composition 开始/结束时清理，排除组合输入，只在完整事件、原文档及选区匹配时重放；256 个事件超限整批回退，不截断正文。本轮只读未得到新的可证明反例，不做推测性输入法修改。

XMind 标题与画布快捷键已检查 `isComposing` / `keyCode === 229` 保护；这只是代码证据，不等于 macOS 候选窗口和快捷键验收。真实候选、位置、选词、取消及保存结果由主任务原生操作后补充。此准备阶段没有新产品修改、全量测试、构建、提交或推送。

## 本轮真实 Markdown 尝试

主任务在原生应用打开上述 `markdown.md`，通过 AX 在 `Chinese input:` 后定位光标，分别发送实际 `n`、`i` 按键。正文显示 `ni`，截图未见中文候选窗口；随后 Cmd+Z 恢复。再通过 Ctrl+Space 切到 ABC，并用 `defaults` 读取确认 ABC；再次 Ctrl+Space 返回拼音后重试 `n`、`i`，仍显示 `ni`、截图没有候选。最后 Cmd+Z / Cmd+S 恢复并保存，文件为 158 字符。

保存后独立核对：工作样例与 `markdown.baseline.md` 的 SHA-256 均为 `a1020f78c19a80414e377136c86fa4963598414f3f745acf04348da3ef744ada`，字节精确恢复，`wc -m` 确认 158 字符。

因此，本轮确实进行了原生按键尝试，但没有形成真实中文候选、选词或候选定位验收。本轮未实际执行 XMind 输入或独立 textarea 对照，不将准备、代码检查或未执行步骤计为通过；也不将无候选现象归因于输入法或自动化工具。首次偶发多星的异常当次链路仍未捕获，真实中文候选及其取消、位置、保存闭环仍待完成。

## 同 WKWebView 对照准备（基线 `3a4e2db`）

新增可跟随 Git 迁移的自建页面 `tests/fixtures/native-input-probe.html`。在原生 DEditor 中打开此 HTML 并切阅读，现有 `HtmlPreview` 将它放入同一 WKWebView 的脚本可运行 iframe；无需改产品或重打包。两个输入区为没有编辑器插件的原生 textarea，分别标记 `Plain native textarea` / `Second native textarea`。AX 可读取 `Input event summary` 和只读 `Input event log (last 96)`。

页面只观察 focus/blur、keydown/keyup、beforeinput/input/textInput、compositionstart/update/end，不阻止默认事件、不改目标 value、不触发聚焦或注入输入。每条记录包含 key/code/keyCode、修饰键及 CapsLock、inputType/data/isComposing/isTrusted、当前 value 和原生选区。内部只留最近 96 条，单个字符串展示上限 180 字符；目标内容没有长度限制。日志更新可能改变时间特征，不能用成功探针排除原来的偶发情况。

对照步骤：先在第一个框分别发送 `pressKey n`、`pressKey i`，立即读取 AX 日志并截图；第二个框用 `typeText('ni')`，再次读取。两者是不同自动化入口，不能预设 `typeText` 一定产生完整物理按键，也不能仅以 `isTrusted=true` 证明是物理键盘；需要以本次日志核对是否产生 KeyN/KeyI、composition、insertText/insertCompositionText，以及事件顺序。如果普通 textarea 也无候选，再以屏幕可见的系统输入菜单、输入模式和同一实际入口继续定位，暂不修改 Markdown 或 XMind。只有普通 textarea 有候选而对应编辑器没有时，才有新增编辑器层差异证据。

只读系统 API 快照：`TISCopyCurrentKeyboardInputSource` 的 sourceID / modeID 均为 `com.apple.inputmethod.SCIM.ITABC`，名称 `Pinyin – Simplified`，`kTISPropertyInputSourceIsASCIICapable=false`；`CGEventSourceFlagsState(HIDSystemState)` 为 `0x0`、CapsLock=false。该操作没有切换来源或发送 OS 事件；结果只说明读取瞬间的系统来源及按键锁定状态，不足以证明目标应用实际正在进行中文组合输入，仍需原生菜单和事件对照。

探针轻量自检：发送 110 条模拟 beforeinput 后只保留 96 条；事件默认未取消，目标 value 和 selection 未变；composition 记录可被 AX 展示节点读取。这个自检仅验证探针本身，不算真实 IME 证据。本阶段没有发现新的确定性编辑器组合输入缺陷，没有产品修改、全量测试或构建。真实对照结果待主任务操作后补记。

## 同 WK textarea 真实 composition 证据

主任务已在原生对照页通过 AX 点击 `Plain native textarea`，分别发送 `pressKey n`、`pressKey i`，字段最终 value 为 `ni`。此次 AX 读取的有界日志出现以下顺序（这是观察到的顺序，不推断发送机制）：

1. 先出现 `keyup n / keyCode 78`、`keyup i / keyCode 73`。
2. 随后 `compositionstart`，`isTrusted=true`。
3. `compositionupdate data="n"`，随后 `beforeinput/input inputType="insertCompositionText" isComposing=true`；`keydown n code="KeyN" keyCode=229 isComposing=true`。
4. `compositionupdate data="ni"` 和对应组合输入事件，随后 `keydown i keyCode=229 isComposing=true`。已记录键盘事件的 CapsLock 均为 false。
5. 约 6.5 秒后出现 `textInput`、`compositionend data=""` 与 `blur`，字段仍为 `ni`。

这次真实 WKWebView 原生 textarea **已进入组合输入**，因此不能继续把“本轮未出现 composition”作为现状；此前旧 Trace 的零 composition 统计只属于此前那次独立记录。但本次截图仍未看到中文候选窗口，未完成候选选词、位置或取消验收，也未证明输入法、自动化入口或编辑器的责任。

随后发送 Space 的调用因应用切换提示而未执行，不能声称 Space 已送入目标；后续 AX 点击没有产生 focus，Cmd+A 选中了整个页面，坐标点击又报告 `noWindowsAvailable`。这些操作不计为 textarea 的有效后续输入。第二个框的 `typeText('ni')` 对照及重新聚焦后的候选操作仍待执行。

## 真实拼音提交、Markdown 保存与取消已通过

主任务改用对 textarea 当前 `ni` 的 AX `selectText(..., text)` 准确取得焦点，连续 Backspace、`n`、`i`、Space 后，普通 textarea 实际 value 为“你”。日志新增第二次 focus、第二次 compositionstart，compositionupdate 总数为 4；末尾出现 `compositionend isTrusted=true data="你"`，`keydown Space keyCode=229 isComposing=false` 时字段已为“你”。这证明此实际输入链可以完成系统拼音提交；没有中文候选窗口的视觉定位截图，因此不宣称候选窗口位置通过。

在普通原生包 Markdown 阅读编辑中，同样用 AX `selectText` 在 `Chinese input:` 后定位，逐键 `n`、`i`、`h`、`a`、`o`、Space，实际提交“你好”。组合结束后 Cmd+S 落盘，与初始 baseline 精确比较只有新增“你好”。在 `Cancel input:` 后逐键 `n`、`i`、Escape，再 Cmd+S，与上述已保存中文副本精确一致。这两项分别完成了真实拼音组词/提交后保存、未提交拼音取消的原生验收，不能再把本轮概括为“中文输入未做”或“只出现 composition”。

独立读盘复核：保存行精确为 `Chinese input:你好 `（保留初始末空格），删除唯一新增的“你好”后全部字节与 baseline 相同；当前保存 SHA-256 为 `379ff0abfedfa2a67c7e469c5be1d74329e662a3d35a9562021706af6bc10e30`。`Cancel input:` 行及表格、代码块均与 baseline 保持一致。

另一次在 `Cancel input:` 后输入 `n`、`i`，未结束组合即 Cmd+S，编辑器变为 dirty，正文出现 `Cancel input:ni s`。这没有计作保存通过，也尚不能归因于编辑器快捷键或输入法。组合期间 Cmd+S 仍待普通 textarea 同链日志对照，不否定已完成的提交后保存与取消。

## Markdown 撤销重做、重开与 XMind 闭环

Markdown 在 Escape 取消额外组词后，单次 Undo 并保存恢复完整初始 baseline（158 字节）；Redo 并保存，再关闭文档、Cmd+Shift+T 重开，文件与已保存中文副本完全一致。独立最终读盘仍为上节 SHA-256，只有“你好”这一处新增。该闭环与真实组词、提交后保存和取消一起归入 IN-02，不把每个核对动作重复计数。

XMind 根主题通过 F2 进入标题编辑，AX `selectText` 选中 `IME root`，逐键 `n`、`i`、`h`、`a`、`o`、Space 提交“你好”，Return 结束标题编辑并保存。`content.json` 根标题为“你好”，两个子主题保持原样。单次 Undo 并保存后，整个 `content.json` 与 baseline 一致；Redo 并保存、关闭、Cmd+Shift+T 重开后，根标题仍为“你好”。

在 `Cancel unchanged` 子主题标题末尾逐键 `n`、`i`、Escape，仍保留标题编辑器且原标题不变；Return 并保存，`content.json` 与中文保存副本完全一致。独立最终读盘确认内容与 baseline 的唯一区别是根标题从 `IME root` 变为“你好”；当前 `content.json` SHA-256 为 `40e6debdb4b8be183a285326ebdbcc54fe3dc48eb6f25c150f2e1b1018862f48`。

XMind 已完成的真实标题组词、提交、取消、保存和历史闭环不再重复列为待做；IN-06 收窄为候选窗口相对标题的视觉定位。上述结果没有包含候选窗口位置截图，也没有包含 Markdown 组合期间移动光标或滚动。尚未解决的 IN-05 继续独立记录，不影响已完成项归档。

## IN-05：普通 WK textarea 同链对照

主任务在同一 WKWebView 的空白普通 textarea 获得焦点，依次 `n`、`i`、Cmd+S，最终 value 为 `nis`。该次 18 条事件记录中的关键顺序为：

1. `n` 先通过普通 `insertText` 进入文本。
2. `i` 启动 composition。
3. `keyup key="s" metaKey=true` 先到。
4. 在 `keydown s` 之前，已有 `compositionupdate data="is"` 和对应 `beforeinput/input inputType="insertCompositionText"`，`s` 已进入组合文字。
5. 最后 `keydown key="s" code="KeyS" keyCode=229 isComposing=true metaKey=true`，此时 value 已是 `nis`。

页面没有产品编辑器插件，所有已记录事件 `defaultPrevented=false`。这证明“保存组合键的字母进入组合文字”并非只在 Markdown 编辑器出现；不能将此现象直接归为产品专属缺陷，也不能为使测试通过而过滤合法 `s`。这尚不等于找到了 OS、工具或输入法中的责任方。IN-05 保留，但下一步收窄为通过真实键盘或可信事件顺序复核该原生输入序列，再验证组合期间保存的最终文本与落盘结果；本次不改产品。
