# 阅读编辑查找与替换专项（2026-09-12）

范围锁定 J01–J03；在原有搜索用例之外，补测循环与替换交错、Unicode 全词、保留查询词的替换，以及错误恢复后的连续编辑。仅自建样例，无提交推送。

## 复现与修复

自建原文 `cat cat cat`，查询 `cat`、替换为 `cat!`，连续两次“替换当前”。旧实现得到 `cat!! cat cat`，每次停在第一项。现在单次替换后，从实际插入文本末尾开始查找下一项，末尾循环；连续三次得到 `cat! cat! cat!`。全部替换逻辑不变。

只修改 `MarkdownVisualEditor.tsx` 的 `replaceMatches` 末尾，不修改搜索语义、解析器、现有匹配计数或其他编辑功能。

## 本次证据

独立脚本 `node scripts/test-markdown-search-audit.mjs`：5 组通过。

| 编号 | 新增验证 | 结果 |
| --- | --- | --- |
| J01 | Alpha/alpha/ALPHA/alphabet 大小写与全词开关组合；下划线、连字符、带重音词、emoji、补充平面字母相邻边界 | 自动化通过；选择文本与匹配数量均核对 |
| J01 | 首项 Shift Enter 循环到末项；末项 Enter 回首项；替换导致数量变少后继续循环 | 自动化通过 |
| J02 | cat→cat! 连续替换三项后回首项；保存与逐次撤销/重做 | 修复前失败，修复后通过 |
| J02 | 零宽正则不允许替换；命名捕获替换；普通模式 `$1 **X**` 保持字面量，不转换成格式 | 自动化通过 |
| J02/J03 | 非法正则禁用替换→修正为emoji查询→准确替换 UTF-16 位置→Esc关闭→另一段继续输入→两次独立撤销 | 自动化通过 |

原有 6 组搜索相关集成用例另行按过滤运行，全部通过；日志 `tests/artifacts/deditor-search-existing.log`。新增修复前后日志分别为 `tests/artifacts/deditor-search-audit.log`、`tests/artifacts/deditor-search-after.log`。

运行使用 `/tmp/deditor-operations-integrated-ytco9fpc` 的独立副本 `/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-focus-audit-sdqilu6j`，自有 `node_modules/.cache`，只向副本同步本次替换补丁，未改整合快照。

## 明确边界

已创建 `tests/markdown-search-audit.html` 自建浏览器操作页，并成功启动独立 5201 服务。但本次两次浏览器清单都为空，创建 iab 标签报不可用，因此没有本次真实浏览器操作证据；没有尝试接管主任务正在使用的原生应用。第一次 5201 服务已结束；主任务报告其浏览器恢复后，重新启动 5201。子任务再试仍不可用，已将该自建页面交给主任务补真实操作，目前服务为交接保留，结束由主任务清理。

macOS 原生“全部替换”证据由主任务持有；本次新修复“替换当前”仍需主任务的新包原生核对。不能把上述自动化通过当作真实键盘/系统输入法/Windows通过。真实中文组词期间查找仍沿用原来的未全面验证边界。

## 主任务补充真实浏览器

同一 5201 固定快照页面切到 Replacement sample，查询 cat 并启用全词，替换 cat!，连续三次点击 Replace current 得到 cat! cat! cat!，搜索循环回 1/3。关闭搜索并连续三次撤销，原文恢复 cat cat cat。完成后测试标签关闭。此证据不新增真实 IME 结论。
