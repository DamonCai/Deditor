# Markdown 日常连续输入检查（2026-09-27）

本轮发现并修复了阅读编辑的格式快捷键不能关闭已有格式的问题。工作只使用自建正文；没有操作原生窗口、启动服务或提交。浏览器／原生观察由主端另行记录。

## 确定反例与修复

空段落按 Mod+B，逐字输入 `bold`，再按 Mod+B，输入 ` normal `，Mod+I 输入 `italic`，再次 Mod+I 后输入 ` tail`。修复前实际保存为 `**bold normal italic tail**`，所有后续文字继续粗体，斜体未生效。主端真实浏览器和本专项真实组件 DOM 输入路径均复现。

原因是输入格式文字后进入行内源码投影。这个临时节点不允许 marks，原快捷键直接交给 ProseMirror，无法像工具栏那样先恢复格式正文。`inlineSource.ts` 现在在捕获实际的 Mod+B、Mod+I、Mod+Alt+X 时先关闭投影，然后把同一按键交给现有 keymap。组合输入与只读不触发该转换；没有添加新的格式快捷键，也没有改变应用级 Mod+E 的近期文件优先级。

随后选区验收发现，直接使用原 `close()` 会把投影内所选文字折叠成光标。因此快捷键路径显式保留 source head/anchor 两端：在 `**alphabet**` 的源码正文选中 `pha`，Mod+B 后选区仍是 `pha`，正向和反向均保持；继续输入 `NEW` 得到两端粗体、中间普通文字的 `alNEWbet`。

修复后首条流程精确保存为 `**bold** normal *italic* tail`，DOM 中只有 `bold` 为 strong、`italic` 为 em，普通尾文可继续输入。未修改列表规则、全局关闭投影逻辑或 Markdown 格式定义。

## 新增验证

`scripts/test-markdown-daily-input.mjs` 的 11 组工作流覆盖：

- 连续输入一级至六级标题，每次 Enter 返回普通段落，再输入下一节，检查标题 DOM、级别及光标。
- 引用内建立列表，空项逐层退出，再建立任务，Shift+Enter 续行、空项退出后继续正文。
- 粗体、斜体、删除线、高亮、上下标连续输入，格式后普通文字不继承 marks；高亮与粗体组合及相邻上下标公式。
- 格式正文换行后建已完成任务，Enter 新任务默认未完成，再退格去掉标记、转标题并在正确位置续写。
- 撤销刚输入的列表项内容后输入替代文字，再撤销重做及继续输入，不恢复已放弃的内容。
- Mod+B／Mod+I 混合开关，粗体／斜体／删除线反复开关，已有格式文字内部及正反选区切换。
- 只读、真实 compositionstart/end 事件序列保护；格式关闭后的普通尾文撤销重做并继续输入。

每组检查最终 source、结构／DOM，并保存和卸载重挂载核对语义。光标专用断言比较 ProseMirror head 与 DOM selection 位置。重开比较忽略自动标题 ID、解析器会归一化的 list spread 属性；没有把段末空格的 Markdown 显示规则当作文字丢失。上下标的原有语法为纯文本体，没有擅自增加内部强调语法。

输入通过实际 React 组件的 keydown、beforeinput、input 和 ProseMirror MutationObserver 路径逐字符进行；JSDOM 缺少浏览器默认编辑行为时，只模拟 DOM 插入文字。没有直接调用格式／列表命令替代快捷键。初始位置和测试选区通过真实编辑器 selection 设置。该证据不是物理键盘、操作系统 IME 候选窗或原生 WebView 验收。

## 结果

- 新专项默认 Mod 映射：11 组通过。
- `test:markdown-inline-navigation`：4 组通过。
- Mac 映射的 D07–D11：5 组通过。`DEDITOR_DAILY_PLATFORM=mac` 在 JSDOM 设置 Mac 平台后验证 Meta keymap，不冒充原生测试。
- `test:markdown-format-pairs`：19 组通过。
- 主端真实浏览器复验报告：正确的粗体／普通／斜体／尾文，单次撤销尾文及重做，暗色 720px 重载后格式保持。具体浏览器证据以主端整合记录为准。

## 后续原生快速数字输入观察与对照（保持未定因）

主端随后在原生隔离包观察到一条异常：空段落 Cmd+B 后逐键输入 `12`，关闭粗体，再快速输入 `space → 3 → space`，Cmd+I 输入 `45` 并关闭斜体，快速输入 `space → 6`，保存内容为 `**12**3  *45*6 `。粗斜开关生效，但空格和随后数字次序异常。较慢步骤 `Cmd+B → 1 → Cmd+B → space → 观察停顿 → 2` 保存为正确的 `**1** 2`。尚未取得异常那次的完整原生事件序列，不能据此认定工具、输入法或产品根因，也不计作已修复。

新增独立脚本 `scripts/test-markdown-daily-space-order.mjs` 复用真实组件，按该数字序列比较每一步 source、DOM caret 与 ProseMirror head，并核对保存及 blur 后 source。它区分四种投递方式，各测 ASCII space 与人为设置的 DOM NBSP，共 8 组：

- 每字独立 keydown／beforeinput／input，间隔 40ms。
- `space3space` 和 `space6` 在同一 JavaScript 调用中无等待投递，仍含逐字 keydown。ProseMirror 本身可能在下一次 keydown 强制刷新，不能将其全称为一次 observer 批次。
- 同批次只有 beforeinput／input，不含 keydown，观察多个 DOM 变动在批次结束后处理。
- 同批次 keydown 设置 229，但不制造 composition 状态，再投递 beforeinput／input，作为跳过普通 keydown 强制刷新的另一对照；不是原生 IME 验收。

ASCII space 的各路径输出均为 `**12** 3 *45* 6`。NBSP 路径精确保留注入的 U+00A0，输出按转义展示为 `**12**\u00a03\u00a0*45*\u00a06`，未出现空格后移或数字插到空格前。逐步末尾 head 与 DOM caret 相同，最终均为 10；格式 DOM 仍只对 `12`、`45` 生效。最初探针把 NBSP 与 ASCII space 严格比较出现断言失败，差异仅是空格码点，不是乱序；正式脚本分开断言两者，未静默改写正文。

证据写入忽略目录 `tests/artifacts/daily-space-order-2026-09-27.json`，保留各步骤 source 和光标。对照未复现不抵消上述原生观察，本轮没有为它新增产品改动。
