# 原生内嵌代码快捷键收尾（2026-09-22）

## 结论

本机已再次复现此前 `Cmd+S` / `Cmd+Z` 变成字母的问题，并用不含 CodeMirror、不绑定任何应用快捷键的原生 HTML `textarea` 对照，确定**本次复现的字母来自拼音组词输入事件，在应用收到组合键 keydown 之前已进入 composition**。不能继续把它列为已确认的 DEditor 内嵌源码快捷键缺陷，也不应通过拦截中文组词来猜测性修复。

相同工具、相同包和相同文档切到 ABC 输入源后，普通内嵌源码、Mermaid 源码及主源码的连续逐键输入、立即保存、立即撤销及保存均通过。已完成保存关闭重开、原文逐字节核对。快捷键部分未改产品代码，未提交推送。系统拼写入口的独立修复见末节。

这不是宣称输入法本身有 bug：目前证据只定位到本机自动化发送按键与 macOS 拼音输入链之间，不能代替物理键盘验证。真实中文候选窗口定位仍未验收。

## 固定环境与自建样例

- 原生包：`src-tauri/target/debug/bundle/macos/DEditor Window Review.app`，标识 `com.deditor.window-review-20260921`，可执行文件时间 2026-09-21 23:05:08。复用已隔离包，没有重新构建，更不能将结果归于 9 月 22 日并行修改后的包。
- 工具：`cua_repl` 原生 App 的 `pressKey`，修饰键使用工具文档的 `super+s` / `super+z`，字母使用单次 `a` / `b` / `c`，没有把粘贴计作逐键输入。
- 初始输入源由 `defaults read com.apple.HIToolbox AppleSelectedInputSources` 确认是 `com.apple.inputmethod.SCIM.ITABC`。通过原生 Ctrl+Space 切为 ABC，再读取确认；结束前恢复原始拼音输入源。
- 样例与日志均在被忽略的 `tests/artifacts/closeout-shortcuts-2026-09-22/`。仅操作这些自建文档，未改用户文件或日常应用。

## 故障复现与独立对照

1. 阅读编辑打开普通代码 `BaselineCode`，逐键 `abc`，紧接 `super+s`：界面为 `BaselineCodeabcs`，仍未保存。
2. 再 `super+z`：界面为 `BaselineCodeabcs z`；截图显示组词下划线。
3. `Return` 结束组词后，完全相同的 `super+s` 正常保存；随后 `super+z` / `super+s` 恢复基线，磁盘字节相同。
4. 自建 HTML 在同一 WKWebView 的 HTML 阅读预览中只放一个普通 textarea，并监听 keydown/keyup/composition/beforeinput/input。不含 CodeMirror、快捷键、preventDefault 或正文改写代码。逐键 abc 再 Cmd+S/Z 同样得到 `ab c s z`。

对照框捕获到的关键可信事件顺序如下（省略前面的 a/b/c 和 keyup）：

```json
{"type":"compositionupdate","data":"b c s","trusted":true}
{"type":"beforeinput","composing":true,"data":"b c s","inputType":"insertCompositionText","trusted":true}
{"type":"input","composing":true,"data":"b c s","inputType":"insertCompositionText","trusted":true}
{"type":"keydown","key":"s","meta":true,"ctrl":false,"composing":true,"trusted":true}
{"type":"compositionupdate","data":"b c s z","trusted":true}
{"type":"beforeinput","composing":true,"data":"b c s z","inputType":"insertCompositionText","trusted":true}
{"type":"input","composing":true,"data":"b c s z","inputType":"insertCompositionText","trusted":true}
{"type":"keydown","key":"z","meta":true,"ctrl":false,"composing":true,"trusted":true}
```

`meta: true` 表明修饰键并非简单丢失；字符进入组词早于该 keydown。Return 随后产生 `insertFromComposition` 和 `compositionend`。这组证据解释了为什么此前只看到字面 s/z，却不能据此认定编辑器把快捷键变成普通键。

对照探针可用以下自建 HTML 重建，不依赖被忽略的附件：

```html
<textarea aria-label="Unmodified textarea"></textarea><pre></pre>
<script>
for (const type of ['keydown','keyup','compositionstart','compositionupdate','compositionend','beforeinput','input']) {
  document.querySelector('textarea').addEventListener(type, e => {
    const line = document.createElement('div');
    line.textContent = JSON.stringify({type:e.type,key:e.key,meta:e.metaKey,
      ctrl:e.ctrlKey,composing:e.isComposing,data:e.data,inputType:e.inputType,trusted:e.isTrusted});
    document.querySelector('pre').append(line);
  });
}
</script>
```

## ABC 输入源原生闭环

| 编辑目标 | 动作与实际结果 |
| --- | --- |
| 阅读普通内嵌代码 | 单键 a/b/c → Cmd+S；磁盘为 `BaselineCodeabc`，无 s/z；Cmd+Z/S 精确恢复原文 |
| Mermaid 块内源码 | 在 Finish 后单键 a/b/c → Cmd+S；磁盘为 `B[Finishabc]`；Cmd+Z/S 恢复 `B[Finish]` |
| 主源码 | 在 BaselineCode 后单键 a/b/c → Cmd+S；正文为 `BaselineCodeabc`，Cmd+Z/S 恢复 |
| 保存重开 | 关闭文件，再用重新打开已关闭标签入口读取；内容与磁盘基线一致、无未保存标识 |

最终 native.md 与 original.md 的 SHA-256 都是：

`f1454588be91337a8a2bf46b9ad03501ff0da8bd2e5d418d63efb69a0c1fa4e4`

## 回归与原生边界

- 当前工作区 `npm run test:markdown-code-focus` 的 12 项代码显示检查通过；`node scripts/test-markdown-mode-focus.mjs` 的 8 组模式焦点检查通过。它们是相关回归，不能替代上述原生快捷键证据。
- 恢复拼音后另外尝试 nihao + Space，只得到英文 `nihao `，没有观察到中文候选窗口或中文选词。因此仍不声称真实中文候选定位通过，组词事件被激活也不等于候选窗口验收。
- 未覆盖 Windows、物理键盘、真实中文组词时 Cmd+S/Z 的系统预期行为、所有输入源或长时间组合操作。
- 两个自建文档均关闭，测试应用退出；`pgrep` 已确认该隔离包的进程不存在。日常 DEditor 未被操作。

## 补充：系统拼写菜单入口修复

在开启系统拼写检查时，正文 `contextMenu.ts` 和表格 `tableMenu.ts` 仍总是阻止原生 contextmenu，确实挡住了系统更正与忽略词入口。现保留普通右键的中文/英文应用菜单，增加显式入口：开启拼写后，对可编辑正文或表格单元格按 Alt/Option+右键，应用不拦截系统菜单；Alt+Shift+F10 同样放行系统默认动作。关闭拼写、只读及内嵌代码/图表/HTML 源码继续走原路径。主 agent 同步增加双语设置提示。

验证：

- 25 组图表专项、34 组表格专项通过；新增断言覆盖默认菜单、关闭拼写后的行为、鼠标/键盘放行、已有菜单清理、不移动选区、不改正文、内嵌源码例外。
- 最新工作区的真实浏览器页面：中文亮色、英文暗色正文普通右键显示对应语言应用菜单；Alt 右键后无应用菜单。中文表格普通右键显示行列操作，Alt 右键无应用菜单。代码源码 Alt 右键仍显示应用菜单，避免更改源码操作入口。
- 英文开启拼写后可见 `Alt / Option + right-click text or a table cell for the system spelling menu (or Alt+Shift+F10).` 提示。
- 浏览器截图核对暗色正文和表格布局无变化，测试页面仍显示“已保存”；临时浏览器标签已关闭。
- **以上浏览器证据仅证明应用放行与回归，不证明系统拼写建议菜单已在 macOS 新包中出现。** 原生需要在包含本次菜单修改的新包中补验；先前本节之前的隔离包未含此项。没有新增独立词典后端，也没有读取或修改用户词典。

## 交叉审查后修复：关闭确认后的异步编辑

只读交叉审查实际复现了一个额外缺口：先在阅读源码菜单发起延迟粘贴，窗口写完恢复快照并进入 `inert` 后，再让剪贴板读取完成，代码依然写入正文；持久化已暂停，所以新增内容未进入最终快照。多窗口退出时，先完成快照的窗口可能仍在等待其他窗口，这条时序不能依靠窗口立即销毁来规避。

现将原有窗口关闭交互状态提取到无组件依赖的 `windowCloseGuard.ts`，原关闭生命周期逻辑不变，`editorWindows.ts` 保留原查询导出。下列异步操作在正文写回前检查关闭确认状态：阅读菜单富文本/文本粘贴与剪切、工具栏纯文本粘贴、图片剪贴板、Crepe 图片文件上传、主源码剪贴板与图片粘贴、图片整理最终链接改写。已关闭确认时取消本次写回，取消关闭后可再次执行；正常运行的错误反馈保留。没有通过全局 store 拒绝更新。

Crepe 上传组件上游将空 URL 视为取消，但拒绝的 Promise 会写 console.error。因此关闭中的上传使用空 URL 安静结束，图片剪贴板同时拒绝空 URL。实际文件可能已经复制成功，保留该资产，不删除文件。

新增 `scripts/test-close-async-edits.mjs` 用真实编辑组件和可控制的 IO Promise 验证 7 组：

- 延迟内嵌代码粘贴/剪切在关闭确认后不修改正文，取消关闭后重试成功。
- 延迟富文本 HTML/工具栏纯文本粘贴无过期修改。
- 延迟位图粘贴不插入图片，取消后新图片可插入。
- 实际 Crepe 文件输入 change 触发上传；关闭中存储完成及存储拒绝均不修改正文、无 showError 或 console.error，取消后再次上传成功。
- 图片整理在关闭确认后不改最终恢复快照中的链接。
- 主源码延迟剪切/粘贴/图片写回被阻止，取消后可再粘贴。
- 非关闭状态的真实剪贴板拒绝仍报告错误，未全局吞掉异常。

错误反馈使用收集 spy 断言，不用“空 showError 替身下没有对话框”冒充证据。7 组通过；提取状态模块后另外重跑 10 组窗口生命周期全部通过。这部分是组件/受控时序证据，未将前面旧包的原生结果归于它。

配对偏好交叉审查：旧快照缺少新增字段时三项均默认开启，显式 false 保留；原全局开关仍优先于阅读细分项，新增设置文案有中英两套。没有发现可证明的兼容回归。
