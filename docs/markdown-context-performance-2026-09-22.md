# 阅读编辑保留块上下文性能（2026-09-22）

## 现象与定位

主端在自建 `markdown-visual-review.html?long&sections=1000` 中看到工具查询持续超时。独立 JSDOM 真实 `MarkdownVisualEditor` 组件复现了规模成本：100 节初次 ready 约 1.90 秒，1,000 节约 15.28 秒，后者产生 1,001 个表格和 84,665 个 DOM 节点。初始表格 NodeView 创建累计约 2.78 秒；初始化完成后观察的一秒内只有 15 条 DOM mutation，没有继续执行的事务/observer 循环证据。

这不排除真实浏览器布局或辅助功能树成本，不能把截图或工具调用耗时当产品 CPU 时长。JSDOM 不执行真实浏览器布局。

CPU profile 找到另一个实际热点：每个保留块 `rawView.render` 都解析整篇源文档；共享的 `renderMarkdownFragment` 原先只缓存整篇 HTML 字符串，每个上下文块还要把全文转为模板 DOM。含 TOC 的标题编辑会再次执行全文上下文渲染。

## 修改与生命周期

仅修改 `rawView.ts` 和 `markdownFragments.ts`：

- 用 `WeakMap<EditorView,...>` 保存每个阅读视图最新源码版本的 AST 与引用定义，各保留块复用。旧版本被替换，视图释放后可回收。
- 全局最多保留一个源码/主题/owner 对应的只读模板 Promise。每次仍返回独立 HTML 字符串，消费者自行创建 DOM，不移动共享节点。
- 任一 owner 的 raw 节点销毁时清理该 owner 的当前缓存，并清空 owner、源码、主题及 Promise；其他视图销毁不会清错缓存。
- 当前请求失败时清缓存，允许重试；迟到的旧请求失败不能清除新缓存。输出仍通过原 generation/destroyed 检查，路径图片处理、主题及上下文渲染语义保留。

代价是活跃视图保留最新 AST、模块保留一个惰性模板 DOM，比旧 HTML 字符串缓存占用更多内存；已经绑定销毁清理，不累计历史文档。没有限制文件大小或表格数量。

## 可复建测量

新增 `scripts/perf-markdown-component-profile.mjs`，默认 100 节，可传位置参数 300 或 1000。使用真实组件及与浏览器相同的自建复杂文档扩展方式，采集初始化、表格创建、模型与 Prose 事务、MutationObserver、上下文解析/模板构造、标题/正文输入及撤销。

输入计时包含 DOM input 到 `act` 刷新的耗时，只用 `pause(0)` 交付 observer，没有 100ms 或 1s 人工等待。另设的一秒空闲观察不算输入耗时。每次输入及撤销都与完整预期源码逐字比较；计时包含 JSDOM/React 的成本，不能称为原生端到端按键时延。

对照时仅通过 `DEDITOR_RAW_BASELINE` 替换上述两个目标模块，其余源码与脚本相同。旧模块取自 `c2adcee` 基线，临时副本 `/tmp/deditor-raw-perf-before-20260922`；可以从该 Git 版本重建同目录结构。结果生成至被忽略的 `tests/artifacts/markdown-editing-performance-2026-09-22/`。

```sh
node scripts/perf-markdown-component-profile.mjs 100
DEDITOR_RAW_BASELINE=/path/to/before node scripts/perf-markdown-component-profile.mjs 300
node scripts/perf-markdown-component-profile.mjs 300
node scripts/test-markdown-fragment-context.mjs
```

300 节前后各三个独立进程，串行执行（每个进程另含五次标题编辑）：

| 项目 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 三轮 ready，毫秒 | 4448.0 / 4492.5 / 4697.0 | 3572.4 / 3688.3 / 4240.1 |
| ready 中位数 | 4492.5 | 3688.3（-17.9%） |
| 每次初始化整篇 AST 解析 | 8 次 | 1 次 |
| 首轮初始 AST 累计 | 753.0 ms | 112.6 ms |
| 首轮异步上下文模板构造 | 2 次 / 237.8 ms | 1 次 / 108.3 ms |
| 三轮共十五次标题输入中位数 | 331.1 ms | 310.6 ms |
| 最后一轮五次普通正文输入中位数 | 38.1 ms | 43.3 ms |

启动的重复上下文开销已减少。普通正文样本存在波动，未证明本次缓存能改善正文输入；标题变化仍须更新 TOC，全文上下文渲染仍是大文档的剩余开销，不宣称卡顿全部消失。

补充 1,000 节相同脚本的单轮规模复核（每轮仍有五次编辑，不能当三轮启动中位数）：ready 17638.1 → 10095.4 ms；标题输入中位数 982.6 → 896.6 ms；普通正文输入中位数 131.8 → 113.0 ms。两侧均保留 84635 个 DOM 节点、1001 个表格，所有输入与撤销逐字一致。

## 回归

`test-markdown-fragment-context.mjs` 四组通过：实际 TOC/引用/脚注输出与独立调用方 DOM，主题与 owner 清理，失败重试，并发旧源码/主题乱序完成及迟到失败保护。子任务交叉审查确认模板和 owner 的显式清理、迟到 Promise 不重新挂回缓存，未发现新增正确性阻断。

第一次新基准曾断言失败：脚本把追加字符的预期写在 frontmatter 第一行，但实际修改的是第一个 h1。已纠正为标题行并重新执行；修正后的 before/after 全部输入和 undo 精确一致，不是产品内容保真失败。

产品已冻结；主端执行最终完整回归、构建和真实 UI 验证。此子任务没有提交、推送、原生桌面操作或替换安装包。
