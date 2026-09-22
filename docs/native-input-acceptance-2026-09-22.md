# 原生输入与中文候选验收准备（2026-09-22）

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
