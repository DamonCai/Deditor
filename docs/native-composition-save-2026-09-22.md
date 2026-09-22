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
