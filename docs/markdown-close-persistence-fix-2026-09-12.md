# 关闭文档后立即退出的恢复记录修复（2026-09-12）

范围仅限 K03：旧草稿已写入恢复记录后，点击磁盘重载，立即关闭文档并退出，下一次启动不应重新打开已经关闭的旧草稿。

## 原因与修复

原实现的 `closeTabById` 只更新标签状态，随即返回成功。状态订阅将恢复记录写入延迟 500ms；重载和关闭都会重新计时。因此，即使关闭 Promise 已完成，磁盘上的恢复记录仍可能是旧 dirty 草稿。用户逐步关闭后再退出正常，是给防抖写入留下了时间。

现关闭标签后立即调用并等待 `flushPersist()`。立即写入沿用最近一次 UI 尺寸，取消待处理防抖；所有恢复记录写入按顺序执行，避免更早的在途快照覆盖关闭结果。写入失败会使关闭 API 返回 false，直接 flush 会拒绝；失败不会阻断之后的重试。普通编辑仍保持原有防抖。

持久化模块在会话恢复完成、UI 首次安排保存后开始工作；关闭使用懒加载，避免扩大文件读取与恢复模块的初始化依赖。没有改动图片异步处理、文件内容保存或原生退出架构。

## 确定性验证

正式脚本：`scripts/test-close-persistence-audit.mjs`。通过模拟 IPC 与受控的 500ms 计时器运行真实关闭、状态和恢复模块，仅用自建路径，不读写用户文件。

- 旧 dirty 已落盘→磁盘重载→关闭：没有运行 500ms 计时器即提交新状态；IPC 未完成时关闭 Promise 保持未完成，完成后重新加载恢复记录不含旧文件/旧草稿；侧栏与预览尺寸 271/43 保留。
- 旧 dirty 写入仍在途时关闭：后一个写入等前一个完成，最终恢复记录没有已关闭文件。
- 写入失败：关闭返回 false，直接 flush 拒绝；下一次成功写入恢复正常。
- 取消关闭不写关闭快照；关闭目标文档后，其他 dirty 标签与其内容保留，重新加载一致。

四组通过，日志 `tests/artifacts/deditor-close-persistence-audit.log`。修复前受控复现见 `tests/artifacts/deditor-close-persistence-probe.log`：关闭已经返回 true，但磁盘仍只有旧 dirty 快照，执行剩余计时器才更新。

## 边界

本补丁移除的是关闭后的 500ms 延迟，并保证关闭 Promise 成功完成前已经写完恢复记录。系统退出入口仍独立于该 Promise；若 IPC 尚未完成就强制结束进程，不属于此保证。v5 最终原生包已补真实验证：确认旧 dirty 草稿已落盘后，触发磁盘冲突，连续点击重载、Cmd W、Cmd Q，中间不额外等待；退出后的 state.json 无旧路径，下一次冷启动只有新指定文件，旧草稿未恢复。测试文档关闭、应用退出。见 `tests/artifacts/operation-integrated-v5-native.log` 与 `operation-integrated-v5-native-result.json`。专项自动化与原生证据分别保留。

## English

Closing a tab now awaits an immediate, ordered recovery-state write instead of leaving a 500 ms debounce window. Four deterministic groups and the final macOS reload–close–quit–cold-start sequence passed. Force termination before IPC completion remains outside this guarantee.
