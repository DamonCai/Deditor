# 组合输入期间保存核查（2026-09-22）

基线 `5b21331`。本次针对 IN-05 检查真实原生菜单到保存快照的路径，另以实际 Visual 组件与 `saveFile` 入口构造保存竞态。主任务独占原生 UI；本 agent 不操作桌面、不发送 OS 事件、不改产品、不提交。此记录不代替[已完成的真实中文输入及历史闭环](native-input-acceptance-2026-09-22.md)。

## 实际路径与数据边界

Rust `src-tauri/src/lib.rs` 为 `file_save` 注册 `CmdOrCtrl+S`，菜单动作向目标窗口发送 `menu-action`；`App.tsx` 的 `file_save` 分支调用 `saveFile()`。文件菜单点击与原生菜单快捷键到达此分支后共用同一保存实现。

`fileio.ts` 按标签串行排队保存，`saveTab` 先 `flushDocument(id)` 再取快照。Markdown 阅读的 flusher 将当前 ProseMirror 模型提交到源模型和 store；它不主动结束系统组合输入，也不删除任何候选字符。格式化或 IPC 写入期间继续发生的修改由 `finishSave` 保留，`savedContent` 只记录实际写入内容；若当前文字与写入快照不同，则返回 false 并保持 dirty，而不是把稍早的快照覆盖回当前正文。

`installMarkdownComposition` 将组合期间的临时替换归为一个历史动作，结束后留 30ms 让平台最后的 input / DOM mutation 被编辑器消费。保存操作不会主动切断这个组合历史。原生菜单可能使系统先结束组合，也可能在仍有临时文本时送达；应以实际日志和落盘结果分辨，不能假定点击菜单与自动化 Cmd+S 的前置事件完全一致。

## 新增四组针对性回归

入口：`node scripts/test-markdown-composition-save.mjs`。

这些测试挂载真实 MarkdownVisualEditor，修改实际 DOM 并交由其 MutationObserver 处理，再调用产品 `saveFile`；文件 IPC 记录精确字节，第二组使用可控挂起写入。composition 事件由测试模拟，**不能当作原生中文输入法验收**。

1. 活动组合内容为 `Bodyni` 时保存，实际写入 `Bodyni\n`；继续选词成 `Body你好` 并结束组合，新正文保留且与旧保存快照不同。再次保存、单次撤销精确恢复 `Body\n`、重做及重挂载保持中文。
2. 保存 `Bodyni` 的 IPC 挂起时继续选词成 `Body你好`。旧写入完成后不覆盖中文，保存返回 false、`savedContent` 为实际旧快照、当前正文保持 dirty；后续保存和完整单次历史通过。
3. 先保存临时 `Bodyni`，再取消组合回 `Body`，随后保存并重挂载恢复精确原文，没有隐藏提交的候选残留。
4. 最终中文 DOM mutation、compositionend 与 `saveFile` 在同一任务内执行，写入已包含 `Body你好\n`；单次撤销/重做及重挂载精确通过。

四组通过。没有复现待保存文字丢失、晚到 IPC 覆盖新候选或组合历史被保存拆坏；本次因此不修改保存或输入法逻辑。测试日志位于忽略目录 `tests/artifacts/native-composition-save-2026-09-22/`。没有重复全量、构建或性能基准。

## 最后一条可直接验的原生链

在自建 Markdown 的已确认插入点真实逐键输入 `n`、`i`，保持活动组合，然后**实际点击文件菜单“保存”**。只读诊断记录菜单动作送达时间、composition/input 顺序、当前源文/dirty，以及保存后的精确磁盘内容；不要用在 iframe 中伪造 `menu-action` 替代真实菜单。若菜单先使系统提交或取消组合，按实际最终文字核对；若保存时仍是临时拼音，则验证这次快照正确，之后选词/取消仍可继续，后续正文与旧快照不一致时保持 dirty，再保存并撤销重做。

这个入口避开已观察到的自动化组合键字母化前置序列，同时覆盖应用的实际原生保存菜单和同一 `saveFile` 实现。它不能单独证明工具 Cmd+S 的事件顺序正确；后者在普通 WK textarea 中也已出现 `s` 先进入 composition 再到 meta-keydown 的证据。不能为通过测试过滤合法 `s`，也不能凭该现象将缺陷归于产品专属。

若需要诊断，只在隔离测试入口旁听 `menu-action` 与现有 DOM capture 日志，记录窗口/标签和源文；不用产品快捷键拦截或强制 `compositionend` 来改变输入行为。真实菜单结果由主任务实际操作后补记。


## 普通原生包实际菜单链已通过

主端在隔离普通包的自建 `tests/artifacts/chinese-input-closeout-2026-09-22/native.md`，于 `Save target: BEFORE|AFTER` 中间真实逐键 n/i 后直接打开 File → Save，没有切换到其他应用。第一次保存准确包含 `BEFOREni|AFTER`；随后 Space 选词变为 `BEFORE你|AFTER`，界面重新显示 dirty。候选结束后 Cmd+S 保存，单次 Cmd+Z / Cmd+S 恢复 `BEFORE|AFTER`；Redo / Save、关闭后 Cmd+Shift+T 重开仍准确为 `BEFORE你|AFTER`。最终磁盘与基线的差异逐字节断言通过。

同文档 `Candidate target: LEFTni|RIGHT` 是先前尝试连接系统候选进程时保留的自建对照文字；上述保存/撤销始终保持它不变，没有把其存在当成保存用例新增中文。中文快照另存 `menu-chinese.saved.md`。测试文档已关闭，普通测试包已退出，日常应用未替换。

因此，原生菜单入口、活动候选保存快照、继续选词的dirty维护、历史与重开已闭环。IN-05只剩**物理 Command+S 到原生菜单动作之前的输入序列**需要实测；未用菜单点击冒充物理快捷键通过。新增 `npm run test:markdown-composition-save` 已接入 `test:all`，本轮不重复完整全量或构建，因为没有产品代码改动。

## Command+S 前置路由再次复核（`b613403`）

按新的输入类别收尾要求，再次只读检查 Rust 菜单构建/窗口路由、App 捕获监听器和快捷键偏好，没有重复上述四组回归：

- `file_save` 默认原生 accelerator 为 `CmdOrCtrl+S`，只有该偏好被明确设为 false 才移除绑定；菜单项仍可点击。这是用户设置语义，不是组合输入判断。
- App 的 DOM keydown 监听器确实在 `isComposing` 时返回，但它没有处理 `s`，保存由独立 `menu-action` 监听器执行。该 DOM 守卫不会把已经到达的原生 `file_save` 丢掉。
- 原生菜单先找 focused WebView，再回退最近活动编辑窗口；`update_menu_state` 不允许后台窗口覆盖当前窗口的菜单偏好。此路由没有因组合状态而切换保存目标的分支。
- `menu-action:file_save` 只在窗口关闭已经 commit 时拒绝，其他情况继续既有 `saveFile`。没有证据表明当前候选保存缺少一层 JS 快捷键；额外添加该层可能重复触发保存，而且无法撤回此前已写入组合文字的合法 `s`。

本次没有得到新的可复现产品漏洞，不做猜测性改动。当前 CUA 原生 API 仅 `App.pressKey(key: string)`，使用 xdotool-style chord 字符串；没有独立 keyDown/keyUp/hold。因此不通过脚本、系统事件注入或未提供的接口制造“物理按键”证据。

上述新入口对照已执行：CUA 接受显式左右 Command 写法 `Super_L+s` / `Super_R+s`，非组合对照的 keydown 均为 `meta=true`；活动 `ni` 下，两者均先把 `s` 写入组合文字，再送达 meta-keydown，没有形成可信的物理 Command+S 保存验收。不再重复尝试其他修饰键别名。真实菜单闭环保持已完成，剩余证据仍准确限制在 Command+S 的前置输入序列。

## 显式左右 Command 与截图入口的最终结果

归档 `tests/artifacts/native-ime-final-2026-09-22/modifier-events.json` 有 246 条记录，容量 600，`stopped=false`，本次没有因日志上限漏掉结尾。独立复核关键 capture 序号：

- 非组合左右写法对照分别在 #63、#130 记录 `keydown key=s code=KeyS meta=true composing=false`。
- 第一种写法活动组合：#99 `compositionupdate data="ni s"`，#101/#103 `beforeinput/input insertCompositionText`，到 #108 才是 `keydown key=s code=KeyS meta=true composing=true`。
- 第二种写法活动组合：#165 `compositionupdate data="ni s"`，#167/#169 对应组合 beforeinput/input，到 #174 才是 meta=true、composing=true 的 `keydown s`。
- 上述关键 capture 均为 `defaultPrevented=false`。这再次说明目标观察到字母时晚到的 JS keydown 拦截已经无法把它变回未发生的正常组合键；不通过过滤合法 `s` 改产品。

候选窗口的新截图入口也实际尝试过：连接系统 Screenshot 应用超时；CUA `super+shift+3` 在活动组合中先形成 `ni#`（#33 compositionupdate，#35/#37 insertCompositionText），随后 #40 才到 `keydown key=# code=Digit3 meta=true composing=true`，未取得预期系统截图。Raise 窗口后仍只有应用画面，不能将候选窗口位置计为已看到或通过。没有通过 OS 事件注入等旁路继续尝试。

主任务已取消临时组合、恢复本次自建 `native.md` 并保存关闭文档、退出诊断包。对照文件为同目录 `baseline.md`，最终字节一致；不要与前一轮保留中文的 `chinese-input-closeout-2026-09-22/native.md` 混淆。至此停止重复这些已验证无效的入口，保留真实菜单保存已通过与物理键盘/候选视觉证据仍未取得的准确边界。
