# 拼写设置与原生核查（2026-09-27）

## 实际阅读组件核查

本轮检查了一个明确假设：`MarkdownVisualEditor` 初始化时通过 ProseMirror 的 attributes 写入 `spellcheck=false`，随后设置 effect 写 `view.dom.spellcheck`，是否在下一次选区/输入事务时被 ProseMirror 覆盖为 false。

使用真实 React `MarkdownVisualEditor`、Milkdown/ProseMirror 状态和实际 store 设置更改复核，**没有复现该假设**。5 组回归均通过，因此没有根据该假设更改产品代码，也不将原生未见红线归因为已确定的 attributes 覆盖问题。

新增 `scripts/test-markdown-spellcheck-setting.mjs`：

1. 开启拼写后，真实选区事务与文字插入事务保持启用。
2. 在已挂载编辑器内按关闭→开启→关闭→开启切换，每次继续输入，DOM 设置仍准确。
3. 浅色/暗色切换保留原编辑器实例；只读切换时保持拼写设置并验证 `view.editable=false`；退出只读恢复编辑且关闭设置保持。
4. 在开启及关闭两种状态下卸载、重新挂载，继续选区事务后都读取当前设置。
5. 开启正文拼写后，实际应用词典装饰作用于正文 `body`；行内代码不产生词典接受装饰；展开实际代码块后，CodeMirror 内容仍显式 `spellcheck=false`；设置、选区、展开操作不改变 Markdown 正文。

每个状态同时断言 `view.dom.getAttribute('spellcheck')` 与 `.spellcheck`，没有只检查 JavaScript 对象属性。JSDOM 本身缺少 HTMLElement 的标准 spellcheck 反射属性，因此仅添加标准 DOM 属性↔attribute 反射 shim；没有模拟拼写引擎、红线、建议、原生菜单或系统词典。真实浏览器/原生红线仍必须另行取证。

测试脚手架首轮第 5 组曾因代码块尚未展开、CodeMirror 未挂载而断言失败。调整为先通过代码块现有展开按钮挂载，再检查排除属性，最终 5 组通过。该失败不是产品反例，不能作为“修前失败/修后通过”的产品修复证据。日志 `tests/artifacts/external-services-2026-09-27/spelling-before.log` 和 `spelling-component.log` 保留全过程。

执行：

```sh
node scripts/test-markdown-spellcheck-setting.mjs
```

本组件核查没有操作原生 UI，没有更改用户/系统词典，没有产品代码修改。原生验收由主 agent 在下方补充；单独本节不能关闭 SPELL-01/02/03/04。

## 原生诊断 A/B 与局部显示修复

主 agent 随后在真实 WK 诊断包完成了以下观察，推翻的是“`span spellcheck=false` 已足以稳定隐藏原生词典红线”，不是上节的根元素属性结论：

1. 在纯 textarea 系统菜单打开 **Check Spelling While Typing** 后，产品正文 `quikc` 和自建词 `deditorqzxword` 都显示真实红线。
2. 将自建词加入应用词典后，DOM 被动观测确认接受词 span 存在，`spellcheck` attribute 与 property 都为 false；继续段末空格、退格后，两词仍然标红。词典装饰存在不能替代红线豁免证据。
3. 在诊断页面启用只作用于接受词的 `::spelling-error { text-decoration: none; }`，再作同样输入，`deditorqzxword` 红线消失，而未接受的 `quikc` 红线仍在。
4. 删除该应用词典条目，观测 `accepted=[]`；段末空格、退格后，自建词和 `quikc` 都恢复红线。诊断文档已保存关闭，测试应用退出。

对应截图在忽略目录 `tests/artifacts/closeout-2026-09-27/`：`spelling-native-span-before.png`、`spelling-native-style-after.png`、`spelling-native-remove-restored.png`。

正式修复落在 `src/components/markdown-visual.css`，规则只选择 `.md-document` 内 `data-deditor-spelling-accepted="true"` 的元素及其后代。它补充接受词范围的原生错误标记**显示机制**，不修改系统词典，不关闭整段拼写，不改变 contenteditable、输入、选区或文件内容。移除应用词典装饰即移除样式作用范围。原生系统检查器仍可能在自己的建议菜单里提供该词的候选，不能把显示抑制称为修改了系统拼写词库。

依据：WebKit 官方说明 [`::spelling-error` 从 Safari 17.4 起支持](https://webkit.org/blog/17640/webkit-features-for-safari-26-2/)；当前 [WebKit Editor.cpp](https://raw.githubusercontent.com/WebKit/WebKit/main/Source/WebCore/editing/Editor.cpp) 的异步拼写路径会扩大到整段，并由返回结果添加标记，这与本机观察相符，但这里不声称精确定位本机系统二进制中的调用路径。没有采用 WK 私有 `_spellCheckerDocumentTag` 或永久学习系统词汇的替代方案。

新增第 6 组回归使用 PostCSS 解析真实产品规则，将选择器作用到实际阅读组件 DOM：仅接受的正文词匹配，普通正文/代码不匹配；删除词典条目后无元素再匹配，同时根拼写开关仍启用。增加规则前测试在缺少接受词原生标记规则处失败，修后总计 **6 组通过**。另补段末空格/退格后装饰保持断言。此测试验证选择范围和生命周期，不模拟或证明原生红线绘制；绘制依据是上述真实 A/B。

本节诊断 A/B 不冒充正式构建的原生验收，最终产品包验证由主 agent 在下方补充。

## 最终产品样式原生复验

最终 `npm run tauri -- build --debug --bundles app`（隔离覆盖配置）包含所有产品改动，前端生产构建与 macOS 应用构建成功。随后将该生产 `dist` 原样复制到独立 `DEditor Spelling Diagnostic`，只附加可折叠的 textarea 对照及只读 DOM 观察面板；已移除前一轮的样式注入按钮和测试 CSS。产品的红线样式来自正式 `markdown-visual.css`，观察脚本不修改编辑器或词典。两个包均无文件关联，未替换日常应用。

最终实际动作：自建 `spelling.md` 打开阅读编辑；词典空时同段编辑触发 `quikc` 与 `deditorqzxword` 红线；通过产品词典加入后，在段末输入空格并退格，目标红线消失且 `quikc` 仍红；切暗色再输入/退格结果保持；产品词典删除后，同段再输入/退格，两个错词红线恢复。保存后文件精确等于 115 字节原文。自建词已从隔离应用词典移除，文档关闭，测试应用退出。

最终截图在 `tests/artifacts/closeout-2026-09-27/`：`spelling-final-before.png`、`spelling-final-added.png`、`spelling-final-dark.png`、`spelling-final-removed.png`。基线文件并未包含词典元数据，未操作系统词典的 Learn/Ignore。

SPELL-03/04 按上述原生可见效果收口。SPELL-01/02 仍保留：本轮在未修改 textarea 对照中实际观察到原生 quick 建议及 Spelling and Grammar 菜单，并开启该隔离实例的 Check Spelling While Typing 后看到正文红线；这不能代替产品编辑器 Option+右键入口与更正/撤销。当前工具的 Alt+Shift+F10 未弹出产品原生菜单，不能将对照菜单当作产品入口验收。
