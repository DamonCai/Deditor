# 多窗口收尾（2026-09-22）

## 本次修复

审查 `editorWindows.ts`、恢复持久化、Rust 窗口管理、Dock 和全屏按窗口实现，补齐以下可复现的关闭竞态：

1. 关闭期间暂停自动恢复写盘，取消关闭原先只恢复布尔开关。如果等待另一个窗口时继续编辑、随后取消退出，新增内容要等下一次操作才排定恢复写盘。现在取消时重新排定当前快照，恢复回调幂等。
2. 旧关闭的慢写盘等待期间取消并立即重试，旧 Promise 原先会确认新关闭请求，跳过新快照。现在取消使旧确认失效，重试等待旧写盘后重新取快照；生命周期卸载也使旧确认失效。
3. 正常关闭等待磁盘时继续输入，原先写盘内容已经捕获，而完成时 `hasDirty` 来自较新的正文，可能关闭后恢复缺少末次输入。现在每次完成写盘后同步编辑器事务，正文标签引用有变化便再写一次，稳定后再确认关闭。
4. 一个窗口已写完、其他窗口仍在写盘期间，已完成窗口的编辑区域暂设 `inert`，避免确认后继续产生未持久化输入；取消或卸载时恢复原状态。主 agent 同步给原生菜单、键盘、拖放和系统文件打开入口增加关闭阶段保护。

5. 原生验收复现 **Cmd+Q 丢失已经显示的末次输入**：`d` 在 AX 中明确显示为 `abcdWindow A baseline.` 后紧接退出，旧快照仍只有 `abc`。本地依赖源码定位到 muda 预定义 Quit 调用 AppKit `terminate:`，Tao 仅监听 `applicationWillTerminate`，绕过了可取消的 `ExitRequested`。现在在已有 delegate 增加其尚未实现的 `applicationShouldTerminate:`，取消直接终止并转入 Tauri 退出握手；全部窗口写盘后正常退出。没有任意等待或延迟。

没有替换用户日常应用，也没有提交或推送。

## 自动化证据

- 持久化新增回归使用真实 store 和串行写盘队列：修复前取消后定时器为 0（期望 1），修复后无后续编辑也落盘最新内容。7 组通过。
- 生命周期旧 HEAD 在“取消使旧关闭确认失效”断言失败；新增快速取消重试、慢写盘中输入、卸载中断断言。最终 10 组通过，包括关闭确认后的编辑锁和取消恢复。
- TypeScript 类型检查、独立输出的生产前端构建通过（保留原有大 chunk 警告）。
- 通用回归 147 项及分隔线 8 组通过；Rust 窗口恢复 3 项通过。
- 主 agent 提取 `windowCloseGuard` 并补异步编辑保护后，再跑 10 生命周期 / 7 持久化仍全部通过；本节原生结果对应提取前的隔离前端快照，主 agent 最终整合包另验。

## 原生验收

- 使用独立自建 `window-a.txt`：修复前“`d` → AX 确认可见 → Cmd+Q”可复现丢失最后字符；修复后同一路径快照精确含 `abcd`，重开实际显示一致。
- 继续连续逐键 `e/f/g` 紧接 Cmd+Q，同一工具调用耗时约 0.09 秒；退出快照精确为 `abcdefgWindow A baseline.\n`。再重开并保存，磁盘内容精确一致。
- 两窗口：A 已保存，B 独立打开 `window-b.txt`，输入 `bc` 后整体退出；A 与 B 快照独立，重开 B 显示 `Window B baseline.\nbc`，保存磁盘精确一致。
- 第二窗口进入与退出全屏：实际 B 全屏截图及原生 controls installed/removed 日志通过；窗口菜单能够切换到 A，A 原文未变。切换 A 时截图返回 unavailable，坐标操作多次 `noWindowsAvailable`，**不将其算作完整多窗口跨屏动画验收**。
- 新建窗口时系统输入源自行切回简体拼音，一次 Cmd+Q 输入为字母。校正自建文本并明确确认 ABC 后，上述立即退出通过；不将该轮当真实中文 IME 候选验收。
- Dock `getApp(com.apple.dock)` 再次 `timeoutReached`，Dock 新建窗口显示/点击仍未实机验收。外部拖放依赖坐标控制，本次未形成可靠闭环。
- 最终 A、B 均已保存并关闭，辅助恢复快照为 0，主恢复快照不含具名测试文档；原生菜单 Quit 进入新退出握手，进程确认退出。没有关闭用户日常 DEditor。
- 当前 ABC 输入源与初始简体拼音差异已交主 agent 最终恢复，避免中途影响后续串行原生验收。

独立包：`DEditor Window Closeout.app`，标识 `com.deditor.window-closeout-20260922`。前端输出 `/tmp/deditor-window-closeout-dist-20260922`，不替换默认 dist 和日常安装包。

Windows 环境、真实中文候选输入没有本次验收证据；不能将构建或 DOM 测试当成这些平台的原生通过。

## 可复现构建与证据

配置：`/tmp/deditor-window-closeout-20260922.json`。使用 Node v24.16.0：

```sh
npx vite build --outDir /tmp/deditor-window-closeout-dist-20260922 --emptyOutDir
npx tauri build --debug --config /tmp/deditor-window-closeout-20260922.json --bundles app
```

本次最后 AppKit 修复直接用已生成前端输出增量构建。日志位于 `/tmp/deditor-window-closeout-*-20260922.log`，原生日志为 `~/Library/Logs/com.deditor.window-closeout-20260922/deditor.log`。测试样例和源哈希清单为 `/tmp/deditor-window-closeout-20260922/`；临时路径不随 Git 迁移。
