# 保存期间状态变化检查（2026-09-12）

本次限定 K04/K06：自动保存/手动保存等待格式化或图片路径处理时，文档发生输入、撤销、磁盘冲突、重载或关闭。只用自建样例。

## 复现与修复

保存开始时取得内容快照，随后等待异步格式化；原代码在等待完成后直接写入，未重新校验文档是否仍有效。确定性失败包括：自动保存期间收到外部冲突仍覆盖磁盘；用户已重载外部新内容却又写入旧草稿；已关闭并重新打开同路径仍被旧保存写入；自动保存等待期间撤销或继续输入，旧内容仍被写入。

`fileio.ts` 现在在真正发出写入前复查标签存在、路径、已保存版本和外部冲突快照；自动保存额外检查内容仍与本次快照一致。失效即取消此次写入。用户明确手动保存已有冲突的行为保留；手动保存期间继续输入仍保存原请求快照，新输入保持未保存状态。相同根因的多种表现合计为 1 类问题，不按失败用例数拆分。

这不是文件系统事务：已经发出的写入不会被撤回，系统外部修改也可能早于轮询检测。本次保证只适用于写入前应用已获知的状态变化。

## 不同维度验证

1. 原故障：受控格式化等待期间产生冲突、重载、关闭及撤销；修复前 8 组中 5 组失败，修复后全部通过。
2. 边界：关闭后重开同路径、显式保存已有冲突、确认前新冲突、自动保存期间新输入。
3. 交互：切换到另一个标签后仍只保存原目标；固定副本真实阅读输入配合按钮触发受控等待，冲突/重载/关闭三条链均没有写入；正常链恰写 1 次且当前正文与模拟磁盘一致。
4. 异常：写入失败后下一次保存恢复；已经开始的 IPC 完成后，新输入仍保留并显示未保存。
5. 相邻回归：由最终整合的完整回归及生产构建记录，不能仅以本专项通过代替。

正式脚本 `scripts/test-markdown-save-races.mjs` 共 8 组。前后日志 `tests/artifacts/operation-round2-save-before.log` / `operation-round2-save-after.log`。浏览器使用 `tests/markdown-save-races-review.html` / `.tsx`，测试专用配置拦住格式化等待并模拟磁盘；固定副本与文件摘要见 `operation-round2-save-snapshot.json`，实际 DOM 结果见 `operation-round2-save-browser.json`。首次复制漏掉 tsconfig.node.json 的开发装配错误已补齐后重载，不算产品缺陷。

浏览器按钮调用真实保存函数，格式化时序和磁盘 IO 为测试替身；不等于原生自动保存定时器、系统磁盘竞争或真实输入法验收。服务与测试标签已关闭。未提交推送。

## English

One stale-save race was fixed by revalidating document identity, path, saved version and conflict state immediately before I/O. Automatic saves also reject outdated content. Eight controlled groups and four fixed-snapshot browser flows passed. Already-issued I/O and external changes not yet detected by the application remain outside this guarantee; native filesystem validation is recorded separately by the integrated audit.
