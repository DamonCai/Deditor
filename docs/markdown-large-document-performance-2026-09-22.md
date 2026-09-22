# Markdown 大文档剩余开销优化（2026-09-22）

本轮处理阅读编辑的目录更新和首次构建重复开销。保留完整文档 DOM、表格、代码块、引用、脚注、目录及撤销；没有新增长度限制或按规模禁用功能。整合功能、真实浏览器和原生结论由主端最终验收记录补充，本记录的时间均为同机 Node/jsdom 组件测量。

## 实施

- `MarkdownDocument.sourceContext()` 共享已经建立的源文档 AST 和引用定义；保留块在来源一致时使用该上下文，避免标题编辑再做一次完整 remark 解析。首次 NodeView 构造尚未建立模型时仍使用原有按视图缓存的解析路径。
- TOC 使用原来的完整 markdown-it 解析上下文，随后只渲染目录 token。重复标题、引用标题、嵌套/setext 标题和围栏处理继续沿用原规则；不再为一个目录创建整篇表格、代码和脚注 HTML 的 template DOM。非目录保留块继续使用完整上下文路径。
- 目录与完整 HTML 共享一个有界缓存项，以 source、渲染选项和 owner 为键；销毁 owner 释放缓存，旧异步请求不得覆盖新缓存，失败允许重试。各调用者仍得到独立 HTML 字符串。
- 最终 NodeView 工厂在 EditorView 首次建 DOM 之前安装。等待 Crepe 原有异步 view 依赖后包装原始表格/图片工厂，避免先创建默认整篇 DOM、再由 `setProps(nodeViews)` 重建一次。后续事务/滚动处理仍在原有初始化位置安装。

## 冻结对照和结果

基线为 `0fe428d` 的全部 `src`，目标仅叠加上述性能实现；配对和拼写词典并行功能未混入此 A/B。两个目标使用同一份 `scripts/perf-markdown-component-profile.mjs`、依赖和 `tests/fixtures/markdown-complex.md`，按 before/after 成对顺序各运行 3 次，每次独立 Node 进程。300 节为 93,441 字符、301 表格，1,000 节为 299,244 字符、1,001 表格；每次分别执行 5 次标题输入/撤销、5 次正文输入/撤销并断言全文逐字一致。

| 规模 | 指标 | 基线 | 优化后 |
| --- | --- | ---: | ---: |
| 300 节 | 初始化就绪，3 轮中位 | 3,348.0 ms | 2,531.5 ms |
| 300 节 | 标题输入，15 次中位 | 302.6 ms | 92.3 ms |
| 300 节 | 正文输入，15 次中位 | 35.4 ms | 34.7 ms |
| 1,000 节 | 初始化就绪，3 轮中位 | 10,703.6 ms | 7,644.6 ms |
| 1,000 节 | 标题输入，15 次中位 | 1,011.1 ms | 300.4 ms |
| 1,000 节 | 正文输入，15 次中位 | 117.7 ms | 114.0 ms |

初始化中位数减少约 24% / 29%，标题输入减少约 70%；普通正文基本持平。三轮初始化原始值分别为 300 节 before 3733/3214/3348、after 2820/2312/2531 ms，1,000 节 before 10457/11278/10704、after 7533/7645/8045 ms。标题每轮 5 次中位：300 节 before 291.7/302.6/323.1、after 105.7/83.4/102.3 ms；1,000 节 before 908.2/985.0/1055.4、after 370.0/283.3/305.9 ms。

每轮最终 DOM 元素数严格保持 26,535 / 84,635，表格数保持 301 / 1,001。初始化 `document.createElement('table')` 调用由 1,204 / 4,004 减为 602 / 2,002；上游每个最终表格会构建两个 table 元素，因此该计数反映去掉重复工厂构造，不能直接当作最终表格数量。15 次标题操作的额外 `raw.sourceTree` 和完整 `raw.contextDOM` 调用均由 15 次降至 0 次。

时间包含组件和 jsdom DOM/observer 处理、每次输入后的一个异步 tick，不包含真实浏览器布局绘制或操作系统/IME 延迟。千节初始化仍有约 7.6 秒，不能宣称大文档瞬间打开；完整文档解析、实际 DOM 构造仍存在。本轮没有用 CUA 超时推算产品时延。

## 正确性验证

- `node scripts/test-markdown-fragment-context.mjs`：6 组通过。真实目录/引用/脚注和独立调用 DOM；重复/引用/嵌套/setext/围栏/CRLF 标题在亮暗主题与完整渲染逐项相同；TOC 不创建全文 template；主题/owner 清理、拒绝重试、旧请求乱序，以及 TOC 合并请求/等待中释放/失败重试。
- `node scripts/test-markdown-initial-nodeviews.mjs`：2 组通过。等待异步注册的原始 NodeView，最终工厂首次构造仅一次；之后选区、编辑、setProps 保留工厂，销毁数量匹配。
- 12 个性能进程全数通过输入、撤销与打开原文一致断言，并无运行时错误；合计 120 次输入及对应撤销。

## 复测入口与证据

当前整合代码可运行 `node scripts/perf-markdown-component-profile.mjs 300` 和 `1000`。脚本支持 `DEDITOR_PROFILE_BASE` 固定非目标源码、`DEDITOR_MARKDOWN_BASELINE` 或 `DEDITOR_MARKDOWN_TARGET` 固定目标模块，以及 `DEDITOR_PROFILE_COMPONENT` 指定只含性能修改的组件。正式 A/B 使用 `/tmp/deditor-context-before-0fe428d` 和 `/tmp/deditor-context-startup-stage-20260922`；前者全部来自基线提交，后者包含性能模块及仅性能修改的组件。并行配对功能对 `document.ts` 的段尾空白映射修改不属于本次性能快照。

原始 JSON、逐轮 profile、汇总 `final-summary.json`、目标 SHA-256 `final-target-hashes.json` 保存于 `tests/artifacts/markdown-context-next-20260922/`。该目录及 `/tmp` 快照被忽略，不随 Git 自动迁移。首次 CPU profile 和 TOC 单阶段结果也在该目录，仅用于定位，不与最终对照混用。本执行不提交、不推送；完整测试、构建与真实 UI 由主端统一收口。
