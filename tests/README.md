# 测试入口与维护

## 当前入口

| 用途 | 入口 |
| --- | --- |
| 自动回归 | `npm run test:all`；分项命令见 [package.json](../package.json) |
| 表格编辑与表格内列表渲染 | `npm run test:markdown-table`（包含两个脚本，保留独立断言） |
| 性能 | `npm run perf:all`；store / React 可单独运行 `perf:store`、`perf:react` |
| 代码焦点、文末代码和长行 | [代码焦点页面](markdown-code-focus-review.html)，选择“文末代码样例 / 文末长行样例” |
| 表格编辑、回车和选区 | [表格页面](markdown-table-audit-review.html)，选择“表格回车样例”；保留窄窗、720px、主题和撤销/重做 |
| HTML 自建样例与性能 | [大小写/SVG 页面](markdown-html-case-review.html)、[动态预览页面](html-preview-review.html)、`npm run perf:markdown-editing` |
| 普通原生隔离配置 | [Markdown](markdown-native-review.conf.json)、[XMind](xmind-native-acceptance.conf.json)；均禁用文件关联 |
| 原生验收样例 | [XMind prepare/check](../scripts/xmind-native-acceptance.ts)；诊断入口见 [diagnostics](diagnostics/) |

HTML 页面通过仓库 Vite 服务使用，不直接双击文件；没有独立 npm 命令不等于已经废弃。原生包只使用自建样例，是否启动或操作外部应用须按用户明确授权范围判断。

## 2026-10-08 精简记录

本轮删除 13 个旧文件（删除前共 13,979 字节），没有删除现行自动回归断言，也没有移动整个测试目录。

| 删除范围 | 原因与替代 |
| --- | --- |
| `markdown-extended-native-review.conf.json`、`markdown-p1p3-native-review.conf.json` | 旧批次身份配置；复跑使用保留的 Markdown 隔离配置，历史应用名称保留在原记录中 |
| `xmind-native-review.conf.json`、`xmind-native-review-round6.conf.json` | 旧 Review3/6 身份配置；复跑使用保留的 XMind 隔离配置 |
| `markdown-html-current-review.html/.tsx`、`markdown-html-performance-review.html/.ts` | 静态导入被 Git 忽略的旧本地文档副本，新检出不可复现；保留自建 HTML 页面和独立性能脚本，本轮没有读取旧副本文档 |
| `markdown-document-end-review.html/.tsx` | 两个独特的文末样例原样保留到代码焦点页面，去掉重复页面外壳 |
| `markdown-table-enter-review.html/.tsx` | 回车样例原样保留到表格页面；现行表格与块边界自动回归继续覆盖行为 |
| `scripts/perf-probe.js` | 依赖临时暴露全局 store 并修改当前文档的旧手工探针；使用自建状态的 store / React 性能脚本替代 |

旧文件可从 Git 历史恢复，例如 `git show f76af1d:tests/markdown-document-end-review.tsx`。相关历史文档的复跑入口已同步，历史验收结果没有改写。

保留 XMind round6–10 等样例和生成器：部分样例直接被 `test-xmind.ts` 使用，生成器仍能重建不同原生归档，没有据日期删除。组合输入、桌面拖放、分隔线及长跑诊断也保留。此前未接入 npm 的 `test-markdown-table-lists.mjs` 有 28 个有效渲染用例，现接入已有表格测试命令。

原生 XMind 样例工具的源码快照现在收集当前存在的已跟踪及未忽略新文件，避免清理尚未提交时读取已删除的索引文件而失败。

验证分四轮，使用不同场景：

| 轮次 | 用例与期望 | 实测与结果 |
| --- | --- | --- |
| 1 | 入口和迁移边界：没有悬空调用，保留原样例 | npm 目标、剩余 HTML 入口和代码引用无缺失；三个迁移样例逐字节一致，通过 |
| 2 | 编辑回归：表格、列表、文末代码的输入/历史/渲染行为保持 | 34 表格 + 28 列表渲染 + 19 块边界 + 12 代码焦点检查通过 |
| 3 | 原生验收工具组合与异常：当前工作树可生成，错误结果不可通过 | 六组自建归档正确结果通过；错误编辑及重复输出目录被拒绝；快照排除删除文件并包含未跟踪的新回归脚本，通过 |
| 4 | 类型与构建：保留入口可编译 | 继承项目 strict 与声明文件的检查、两个保留页面构建、生产构建均通过 |

最初的临时类型命令没有沿用 strict；随后配置又漏带项目声明文件，均保留失败日志。补齐配置后还修正保留页面对可选 navigate 方法的调用，最终检查通过。引用检查最初把 `.tsx` 截成 `.ts`，修正扩展名匹配后完整通过，没有据误报删除文件。

日志保存在忽略目录 `tests/artifacts/test-cleanup-2026-10-08/`。本轮未重跑完整 test:all/perf:all，没有执行原生 UI 或外部应用验收。

## 后续清理规则

- 先核对 npm / CI、脚本导入、页面入口、当前待办和手工复跑用途；年龄与未接入 npm 都不能单独作为删除依据。
- 独特用例保留或先迁入现有入口，确认原文与断言覆盖后再删除重复外壳。
- 批次配置和一次性本地样例依赖可在验收结束后清退，同步复跑文档；不复制一份 archive 继续积累。
- `tests/artifacts/` 中的日志、截图、测试包属于本地证据，与跟踪的测试源码分开管理。本轮没有清理这些证据。
