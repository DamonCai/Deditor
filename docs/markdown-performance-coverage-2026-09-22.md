# Markdown 性能覆盖补充：源码、预览、搜索、历史与图表

本次按用户要求盘点全部 Markdown 路径，阅读编辑核心、HTML 文档预览/文件打开由并行任务负责。本记录只认实际测试范围，不把 jsdom 时间等同于真实逐键输入延迟。

## 覆盖矩阵

| 路径 | 已有可执行覆盖 | 本次审计与可落实补测 |
| --- | --- | --- |
| 源码输入与共享历史 | `perf-markdown-history.ts`：Unicode/CRLF/长共同前后缀 diff 与 100 次撤销重做；`test-preview-visibility.mjs`：隐藏源码投影延迟、激活同步 | 源码 `Editor` 已跳过自身回声和隐藏 Markdown 的全量字符串同步。每次实际源码编辑仍需输出完整字符串；现有 `perf:react` 是 selector 探针，**不是真实 Editor 输入基准**。待以 100KB/1MB 自建文档，头/中/尾各 30 键+撤销，在 source/split 各测帧延迟与原文一致。 |
| 实时预览解析/高亮 | `perf-markdown-highlight.ts`：100 围栏、仅正文变化时高亮缓存；`test-markdown-highlight-cache.ts`：LRU/容量/主题/代码键；`test-markdown-preview-document.mjs`：块 DOM 复用 | 全文 Markdown parse 仍发生，80ms 合并编辑避免每键渲染。应将单块代码编辑、主题切换和 300 围栏超缓存窗口纳入实际帧延迟；缓存容量限制只影响复用，不隐藏内容。 |
| 预览滚动/隐藏标签 | `perf-preview-scroll.ts`：0/1/30/2000 marker 与异步尺寸/CSS/宽度/焦点/主题；`test-preview-visibility.mjs`：隐藏解析跳过、重新显示 | 已有 geometry reuse；保留 8 个 DOM 的 MRU 只释放冷视图，标签内容与历史保留。不要将此缓存预算误判为最多支持 8 个文件。 |
| 模式/标签切换 | `test-markdown-tab-switch.mjs`，`perf:markdown-tabs`：600 段旧/新暖切换；`test-markdown-mode-focus.mjs`：源码/阅读/预览焦点、撤销 | 已有暖切换，但缺超过 8 标签淘汰后的 1MB 冷恢复计时，以及 source/split/visual 交叉切换 p95；应核对滚动/光标/历史恢复后再对比时间。 |
| 实时预览搜索 | 过去 `test:markdown-search` 主要验证阅读编辑和全局导航；未测大量预览命中下连续下一项的 DOM 修改数 | 本次新增 `perf-preview-search.ts`：10,000 命中/100 次导航、精确 class 操作数、重复居中、无效索引、独立结果集、SVG 排除、格式与原文还原；独立浏览器页验证实际居中与亮暗。 |
| 全局搜索 | `test-global-search-navigation.mjs`：首次就绪/取消旧定位/阅读与预览命中 | 未测大量磁盘目录 I/O 的系统基准；本次不将 stub 文件搜索等同磁盘性能。渲染命中依赖实际可见文本，源码专有匹配转源码展示属功能设计。 |
| 历史 diff | `test-markdown-history-diff.mjs`：11 组；10,000 行稀疏编辑在纯 diff/折叠层覆盖 | `DiffView` 全展开会渲染每行，切换 active hunk 时也参与 React render。现有 10k 测试**没有大 DOM 展开计时**。后续独立 probe 应测 1k/10k 行稀疏和密集修改、折叠/展开/20 次导航，记录 Profiler 与 DOM 行数；没有复现前不盲目加文件上限或改变内容。 |
| Mermaid | `test-mermaid-queue.mjs`：串行/取消/主题与导出隔离；`test-markdown-diagram-modes.mjs`：模式/全览/编辑撤销 | 本次发现上游默认 50,000 字符/500 边限制被原样继承；超过前者替换为错误图，后者抛出错误，文内配置不能覆写 secure 设置。新增自建长源码及 501 边真实浏览器前后对照。 |
| PlantUML | `perf-hydrate.ts` 与模式测试；本地磁盘缓存只解析一次、请求去重 | 仍依赖远程服务/5 秒超时。离线 SVG stub 不代表远程大图成功。保留超时是可恢复错误，不清空用户源码；本次不修改服务策略或伪称完成远程性能验收。 |

## 已确认改动

预览搜索原先每次跳转对全部命中执行 `classList.toggle`。现在结果数组以 WeakMap 持有上一个 current 节点，每次只删除旧 current 并添加新 current；重新搜索、关闭、清空均不保留旧数组。保持每次 scrollIntoView（重复单结果 Enter 仍居中），独立传入结果数组第一次清理已有 current，避免双高亮。

## 限制分类

- Rust Markdown 历史 2MiB/版本、30 版本/文档、100MiB 总量是 UI 明示的保留策略；不妨碍 Markdown 打开/编辑。本次按主端决定记录而不仓促更改存储策略。
- 8 个保留视图、256 高亮缓存项/8MiB 是缓存预算，淘汰后可重新生成；不削减用户文档。
- Mermaid 50k/500 会让合法图显示错误，属于本次要实测消除的功能门槛。
- 阅读搜索的“选择全部匹配”目前禁用，因为编辑器未支持离散编辑选区；单纯启用会制造错误行为，不以去掉 disabled 假称支持。

## 执行状态

独占搜索测量 `npx tsx scripts/perf-preview-search.ts` 已通过：10,000 命中、100 次导航，旧实现 467.92ms / 1,000,000 次 class 操作，新实现 0.925ms / 199 次 class 操作。计数是确定性断言；时间仅为本机 jsdom 样本，不含真实布局、滚动和绘制。重复居中、无效索引、已有 current 的独立结果集、SVG 排除、格式与原文还原均通过。

`node scripts/test-mermaid-size-limits.mjs` 使用真实 Mermaid 11.14 parser，默认配置确实拒绝 501 边；应用生产配置后完整保留 501 边，错误语法依然拒绝。生产配置解除 maxTextSize/maxEdges 两项嵌入页面默认数字门槛，其余渲染/错误回退/导出路径保持。`node scripts/test-mermaid-queue.mjs` 5 组通过，100 个被取消任务的 renderCalls 仍为 2、obsoleteRenderCalls=0。

真实浏览器页：`/tests/markdown-search-diagram-performance-review.html`。首版 57,654 字符“长注释”样例未触发 50k 门槛，因为 Mermaid 在计数前删除注释；**该例不能作为 50k 拒绝证据**。已替换为实际标签含 50,020 个 X 的合法双节点图：主端真实浏览器确认原配置将 50,073 字符图替换为 `Maximum text size…` 错误图，501 边原配置也明确报错。生产配置在亮色和暗色均通过：2 个 SVG、0 错误，长标签完整保留 50,041 字符，实际边路径共 502（长图 1 + 多边图 501）。两次页面运行约 419/442ms，仅为单次页面观察，不作为稳定性能保证。

没有启动原生桌面，没有修改用户文件，没有提交。

主端最终将搜索基准扩为五轮，整合运行旧实现中位 354.817ms，新实现 0.673ms；每轮 class 操作仍为 1,000,000→199，原文均恢复。JSDOM 不含布局，真实浏览器 100 步的 68.1ms 不与该数直接对比。
