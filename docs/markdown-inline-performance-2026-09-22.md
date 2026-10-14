# 阅读编辑行内源码性能（2026-09-22）

本记录只覆盖阅读编辑中的行内格式源码（强调、链接、行内代码等）事务，不代表整个 Markdown 编辑器性能或原生 IME 已验收。

## 已证实热点和修复

`inlineSource.apply` 对纯光标/选区事务仍执行 `MarkdownDocument.editInline`，即使文本未变，也重建全篇 AST 位置并重解析当前段落。同时，`find` 在每次事务、键盘和异步控件更新中用 `descendants` 扫描全篇；找到投影时返回 `false` 只跳过其子节点，并不结束整篇扫描。

只修改 `src/lib/markdownVisual/inlineSource.ts`：

- 最终 `view.state.doc` 与模型文档为同一对象时，直接沿用已同步源码。检查最终状态而非原事务 `docChanged`，保留追加事务带来的实际修改。
- 优先沿选区祖先定位投影；选区已离开时检查已知位置。结构编辑移动投影时仍保留原扫描回退。
- 输入、保存、撤销、跨块选择、只读和中文字符串行为保留，不限制文档大小或功能。

## 相同样例前后五轮

独立脚本 `scripts/perf-markdown-inline-navigation.ts` 使用实际 Crepe/ProseMirror 和行内控制器，在 JSDOM 中测试自建中文/English/强调段落。每个规模及操作各五轮；每轮重新建立模型并暖身四次选区操作。计时包含实际事务及该轮控制器微任务，排除解析、初次挂载和最后关闭投影。每轮原文逐字相等，关闭后重新解析结果与当前文档语义相等。

主端完整 `perf:all` 结束后授予独占测量时段；同一脚本先记录旧实现，再记录修复实现。单位为整个 20 次操作/20 对输入删除的毫秒数，表格取五轮中位数：

| 自建规模 | 操作 | 修改前 | 修改后 | 变化 |
| --- | --- | ---: | ---: | ---: |
| 100 段 | 20 次选区移动 | 5.007 | 1.006 | -79.9% |
| 1,000 段 | 20 次选区移动 | 11.554 | 1.539 | -86.7% |
| 100 段 | 20 对「中」输入及删除 | 12.618 | 8.961 | -29.0% |
| 1,000 段 | 20 对「中」输入及删除 | 36.083 | 29.060 | -19.5% |

选区组每轮 `editInline` 调用从 20 次降至 0 次；中文输入删除组仍为 40 次。数字反映控制器专项开销，不是浏览器事件到绘制、用户实际按键时延或中文候选窗口结果。

原始五轮结果：`tests/artifacts/markdown-editing-performance-2026-09-22/inline-navigation-before.json` 和 `inline-navigation-after.json`（artifacts 被 Git 忽略）。

## 正确性验证

- 新增 `scripts/test-markdown-inline-navigation.ts` 四组：普通段落、引用、列表和表格内投影；连续选区移动、选择事务追加中文真实编辑、跨块范围离开投影、精确源码及重新解析语义一致。全部通过。
- 当前整合 `test-markdown-visual-integration.mjs` 过滤受影响范围 7 组通过：行内格式中文输入与撤销、终端行内 HTML 保存撤销、跨块/只读/格式化、未闭合标记保存重开、多行粘贴撤销、混合列表 hard-break 导航、空目的地及跨标记选区。
- `test-markdown-format-links-audit.mjs` 全部 17 组通过，覆盖格式/链接/脚注和相关保存撤销行为。

执行命令：

```sh
npx tsx scripts/perf-markdown-inline-navigation.ts
npx tsx scripts/test-markdown-inline-navigation.ts
DEDITOR_TEST_FILTER='inline source|inline HTML|empty-item|hard-break|source boundary' node scripts/test-markdown-visual-integration.mjs
node scripts/test-markdown-format-links-audit.mjs
```

本子任务未操作原生桌面，未修改 package/AGENTS，未提交或推送。主端负责最终整合构建、完整回归和真实浏览器性能复核。
