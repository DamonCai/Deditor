# 混合文档与多窗口组合核对（2026-09-22）

起点 `735e731`。以下原生结果来自该基线 Four Items Review 包。本项只使用本轮生成的小样例；原生界面由主端独占操作。本 agent 未构建、未提交、未修改产品代码。

## 多窗口近期文件和焦点

主端在 Four Items Review 原生包完成以下闭环：第二个窗口打开 `window-two.md`，切回第一个窗口，Cmd+E 的默认选中项出现该文件。Enter 冷打开并等待编辑器就绪后，不点击正文直接输入 `R`，保存结果精确为 `# RWindow two\n\nIndependent history.\n`；Undo 保存恢复基线。

接着 Cmd+E 选择已经打开的 `link-card.md`，直接输入 `X` 保留此前光标位置，保存后对应正文精确为 `Tail untoucheXd.`；Undo 保存恢复。默认选中项在辅助功能树的 Selected 区域，不应把未列在 list 子树误判为近期记录丢失。

一次在 Enter 后尚未等待初始化就直接输入 `R` 未进入文档，不能记为就绪后焦点失败；阅读编辑初始化期间只读，未承诺排队接收预先输入。此边界保留，不计作实际输入通过。

只读核对：`installRecentFiles` 先建立广播监听，再读取初始记录，并通过事件版本阻止迟到读取覆盖跨窗口更新。`focusRecentFile` 等待对应可编辑 bridge，切换文件/模式/弹窗/外部焦点会取消旧请求。

`node scripts/test-recent-files.mjs` 本轮 5 组通过：记录去重及顺序、迟到读取与跨窗更新、快捷键/键盘操作、缺失文件恢复，以及新旧文件焦点、慢 bridge、选区恢复和取消。

## Markdown / XMind 历史隔离样例

路径 `tests/artifacts/urgent-closeout-2026-09-22/`：

- `mixed-history.md`：`# Mixed Markdown\n\nMarkdown stays independent.\n`，同时保存 `.baseline.md`。
- `mixed-history.xmind`：单 sheet，根 `Mixed Root`，两个子主题 `Alpha` / `Beta`，保留独立 `resources/keep.txt`；同时保存 `.baseline.xmind`。
- `check-mixed-history.py`：逐字节核对 Markdown，核对 XMind content.json 全结构及其余每个 ZIP entry 原始字节。仅 ZIP 压缩封装可能因保存重建不同，不将 ZIP 文件散列不同直接视为内容丢失。

原始样例校验通过，产品解析 smoke 通过（1 sheet / 3 topics）。同窗最短操作：Markdown 标题末尾追加 `M` 并保存；XMind 将 `Alpha` 改成 `Alpha X` 并保存；切回 Markdown 撤销保存，随后切回 XMind 撤销保存。每一步另一个文档应保持当前状态；可再分别重做并撤销恢复。

```sh
# 重建到新的目录（已有同名样例时拒绝覆盖）
python3 scripts/urgent-mixed-history.py --generate --directory /tmp/deditor-mixed-acceptance-new
# 两份都修改后
python3 scripts/urgent-mixed-history.py --md-suffix M --alpha 'Alpha X'
# 仅 Markdown 撤销后
python3 scripts/urgent-mixed-history.py --alpha 'Alpha X'
# 两份均撤销恢复后
python3 scripts/urgent-mixed-history.py
```

重建后的检查命令同样添加 `--directory` 指向该目录。生成器和校验器已合并为随 Git 保存的 `scripts/urgent-mixed-history.py`；基线 zip 的压缩时间戳可不同，校验仍以 Markdown 字节和归档内容为准。

主端实际原生闭环通过：Markdown 追加 `M` 保存、XMind 双击 `Alpha` 改为 `Alpha X` 保存，校验两份编辑状态通过；切回 Markdown Cmd+Z / Cmd+S，校验 Markdown 基线且 XMind 保持修改通过；切回 XMind Cmd+Z / Cmd+S，两份基线通过。随后分别 Cmd+Shift+Z / Cmd+S，两份编辑状态通过；再分别撤销保存，两份恢复基线通过。最后关闭并重开 XMind，实际三节点显示 `Alpha` 恢复。各阶段均使用上述原文/归档校验，没有用截图代替保存一致性。

实现使用独立历史：Markdown 按 tab ID 取 session 且排除非 Markdown 文件；XMind 快捷键处理先核对 active 状态和当前 tab ID。既有独立历史实现本轮未修改。

原生样例及当时的核对器副本位于被忽略的 artifacts 目录；可通过随 Git 的入口重新生成。未修改用户文件，未新增 Windows、IME 或多窗口全屏动画结论。
