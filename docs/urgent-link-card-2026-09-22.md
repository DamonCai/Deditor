# 链接悬浮卡片收尾（2026-09-22）

起点 `735e731`。仅用自建 Markdown；本子任务没有操纵原生桌面、修改用户文件、提交或运行全量测试。主 agent 独占真实界面。

## 可重放入口

- 浏览器：`tests/urgent-link-card-review.html`，`?lang=en&theme=dark` 可切英文暗色。页面仅访问独立 localStorage 键 `deditor-urgent-link-card-review-only`；显示实时源码、保存快照与当前焦点，提供重置、保存、撤销/重做及重开。它没有人为触发悬浮的按钮。
- 原生自建文件：`tests/artifacts/urgent-link-card-2026-09-22/link-card.md` 和 `link-title.md`；artifacts 被忽略，换机器可按下面源码重建。
- 组件专项：`node scripts/test-urgent-link-card.mjs`。测试通过实际卡片的 `pointerdown` 处理器及输入框 Enter/Esc 执行动作；仅鼠标位置计算与文件 IO 被模拟，因此不能当作真实鼠标/原生磁盘证据。

```markdown
# Link card

Start [label](https://example.com/old) end.

Tail untouched.
```

标题样例将链接换成 `[label](https://example.com/old "Keep title")`。

## 真实悬浮进入方法

上游要求编辑器 `hasFocus()`，并在鼠标移动 50ms 后判断链接。直接点击链接会进入行内源码，无法据此验证悬浮卡；滚动到该坐标也不等价于 mousemove。

本机 CUA 无独立 hover/move，主 agent 找到可执行的真实鼠标方法：先确保编辑器焦点，在同段从 `end` 末端向 `label` 中部反向拖选。非空选区不打开行内源码，真实拖动的 mousemove 会显示悬浮卡。按截图中实际位置点击铅笔进入 URL 输入框。卡片进入前的**反向选区**应在确认/取消后恢复，不应期待固定行尾光标。

卡片元素为 `.milkdown-link-preview .link-edit-button`、`.link-remove-button`，确认元素为 `.milkdown-link-edit .confirm`。这些图标绑定的是 pointerdown，不是 click-only；真实鼠标操作包含正确事件。Enter 确认，Esc 取消。旧包中英文普通链接焦点与选区恢复无需新增产品补丁。

## 确证修复

1. 上游 URL 确认仅按 `{ href }` 重建 link mark，导致原 `title` 丢失。修复只在本次实际确认后保留原链接非 URL 属性，并保留选区恢复行为；一次撤销、重做、保存及重挂源码精确通过。
2. 上游通用网页编辑器将 `file:` 地址清为空字符串，卡片编辑会保存为 `[label]()`。DEditor 已支持本地文件链接，现只对明确确认的、可由 URL 解析且协议为 `file:` 的值保留原地址；相对地址与其他协议继续用原验证逻辑，不放开 javascript。
3. 交叉审查补齐取消竞争：卡片打开期间相同标签链接被外部事务更新 href/title，Esc 不得把旧 title 覆盖回去。属性修复有本次确认标记，取消只恢复选区。

同 URL 按 Enter 的上游路径直接退出，不重建 mark；专项仍明确检查标题与引用写法均不变。词典/配对/窗口代码未在本子任务修改。

## 组件与专项证据

`component-after.log`：9 组，通过内容包括：

- Enter/Esc 后原光标与真实编辑器 DOM 焦点、继续输入、保存、分次撤销/重做及重挂。
- 原反向选区确认/取消后精确保留，替换选区及撤销精确恢复。
- 移除仅去链接标记，保留文字、光标、续写及一次撤销。
- 相同标签外部链接更新后取消，不覆盖新 href/title。
- 同 URL 确认保留标题与 reference 原写法。
- `file:` 的 Enter、鼠标确认、取消、中文/空格/井号编码及 Windows 路径形式；unsafe 协议仍被拒绝。
- 标题修改前后保存与一次撤销/重做原文精确核对。

`existing-links.log`：通过原有 G01/G02 六组链接专项，含选择插入、普通点击、modifier 导航、本地路径、实际卡片导航处理器。以上 Windows 路径是组件字符串测试，不是 Windows 原生验收。

## 原生证据与时间边界

主 agent 在 **735e731 旧整合包** 使用真实鼠标与键盘完成无 title 样例：

1. 反向拖选 `bel end`，出现悬浮卡，点击铅笔；改 URL 为 `/new`、Enter、Cmd+S，磁盘仅 `/old` → `/new`。
2. Right 后键入 X，保存得到 `endX`；撤销只去掉 X。
3. 再悬浮编辑为 `/cancelled`，Esc 后仍为 `/new` 且反向选区恢复；Right 后 Y 可续写并保存，撤销只去 Y。
4. 再悬浮点击垃圾桶，保存得到 `Start label end.`；一次撤销并保存恢复 `/new` 链接。
5. 关闭标签后 Cmd+Shift+T 重开，URL 与正文精确一致。

这是实际鼠标悬浮入口、卡片操作、原生保存/撤销/重开的证据，区别于 DOM 事件模拟。**该旧包不包含本次 title/file 修复**。最终新包的 title/file 原生补验及中英亮暗窄窗由主 agent 继续核对，不能把旧包结果用于声称新增修复已原生通过。未新增 Windows 或真实 IME 结论。

## 最终普通原生包补验

主端以当前产品修改重新构建 Four Items Review（同一隔离标识），不是追踪注入包。英文亮色下从真实反向拖选悬浮卡改 title 样例的 `/old` 为 `/new`，保存精确为 `[label](https://example.com/new "Keep title")`；一次 Cmd+Z/S 精确恢复旧 URL 和 title，重做保留新 URL/title。

暗色下经实际卡片将 URL 改为自建 `window-two.md` 的 `file:///...` 地址，保存逐字节保留 file URL 和 `"Keep title"`。从卡片的实际 URL 入口点击后，在应用内打开目标文件且正文正确。切回源文件单次撤销恢复 `/new` 与 title，重做保存后关闭重开仍为 file URL/title。此前无 title 的取消/删除/续写全链与本次补丁精准回归共同覆盖本项；本次不新增中文/窄窗外观变化结论（未修改样式或文案）。

最终额外补充真实 reference 改 URL 的第 10 组：新地址转行内链接，保留标题和旧引用定义，独立解析 href、新编辑器重挂、保存、撤销/重做均精确通过。本次相关整合回归和生产/macOS构建通过，测试应用保存关闭自建文件后退出。原待办的链接卡片一行已移除。
