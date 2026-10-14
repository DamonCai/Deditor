# Markdown 特殊块边界检查（2026-09-12）

固定范围：A07 / I05 / I06 中图片、代码、块公式、HTML/YAML/详情保留块在文首、文末、相邻特殊块时的前后正文输入、Enter、方向键退出、删除、撤销后继续输入。起始 Git 干净，HEAD `34b8e35`。没有修改自动保存、弹窗、MarkdownVisualEditor 或文档层，没有提交推送。

## 复现并修复的三个问题

1. **代码/块公式首行开头按 ↑ 不能退出。** 浏览器在文首代码 `const x=1;` 按 Home、↑、a，旧版仍聚焦内嵌代码，源码变为 `aconst x=1;`。修复后在代码上方创建正文 `a`；一次撤销恢复原文，再输入 b 落回原代码开头。
2. **HTML/YAML/详情保留块的首尾方向键没有出口。** 浏览器在 `<div>HTML</div>` 末尾按 End、↓、a，旧版变为 `<div>HTML</div>a`。修复后正文位于块外，撤销精确恢复。HTML、YAML 和详情末尾均已浏览器验证；首尾矩阵有组件回归。
3. **代码下方紧接图片时，↓ 建立非法正文选区。** 旧固定快照组件实测 `TextSelection endpoint not pointing into a node with inline content (doc)`，选区父节点为 doc，而非 paragraph。此前代码用固定 `after + 1`，没有区分后面是否是正文。修复后在两个特殊块之间插入正文；已有正文则移动到它的首尾，不多造空段。

`blockExit.ts` 共用边界逻辑只供 `codeView.ts` / `rawView.ts` 使用。内嵌选择为空且位于源码首尾时才退出；在首尾或相邻特殊块之间插入段落，在已有可编辑文字块之间只移动光标。普通 Enter 仍编辑当前源码。图片前后方向键由既有 gap cursor 处理，本轮实测正常，未改图片节点代码。

## 自动化与浏览器证据

`scripts/test-markdown-block-boundary-audit.mjs` **15 组通过**，每组内含变体：

- 代码、公式、HTML、YAML、详情五类 × 首尾方向键，输入正文后保存、撤销、重做、组件重建。
- 六种特殊块相邻组合：代码→图片、公式→HTML、HTML→代码、YAML→代码、图片→HTML、HTML→公式。
- 上下已有正文时不增加段落，输入落在原正文边缘。
- 内嵌 Enter、撤销恢复、继续输入；Esc 选块、Delete、撤销、再进入源码输入。
- 图片 Enter 创建正文，删除/撤销后仍能继续输入且图片保留。

TypeScript 和差异格式检查通过。日志为 `tests/artifacts/block-boundary-audit.log`。

浏览器修复前快照：`/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-block-before-bj5056s6`。

浏览器修复后快照：`/var/folders/ls/ffs5872n5pz2yk47_m92ylvc0000gn/T/deditor-block-fixed-l3op8sil`。

实际键盘与点击验证包括：代码上方输入→撤销→代码继续输入；HTML 下方输入→撤销；代码与图片中间输入 a→Enter→b→两次撤销→c，最终正文为 ac；图片前后方向键输入、整张删除与撤销后 Enter 输入；公式上方输入与整块删除撤销；YAML 下方输入撤销；详情 summary 展开不修改源文，源码末尾退出输入与撤销。节点焦点、源码读取与快照哈希见 `tests/artifacts/block-boundary-audit-snapshots.json`。

详情样例最后追加到测试页面，完成一次显式测试页重载后再进行该样例验证；此前操作不与重载混算。没有拿热更新恢复初始文档当作产品行为。

## 原生最短复测

所有样例为自建内容：

- `tests/fixtures/markdown-boundary-code.md`：进入代码，Home→↑→输入 a，应出现代码前正文；撤销恢复代码；继续输入 b 应落在代码开头。
- `tests/fixtures/markdown-boundary-html.md`：进入块源码，End→↓→输入 a，应出现块后正文；撤销精确恢复 HTML。
- `tests/fixtures/markdown-boundary-adjacent.md`：进入代码 x，End→↓→a→Enter→b，应在代码和图片之间出现两段正文；撤销两次后输入 c，应为 ac，图片和 HTML 完整。

浏览器入口 `tests/markdown-block-boundary-review.html` 提供七种自建样例；不读写用户文件。自己的修复前后浏览器标签和 5199 服务均已关闭。

## 未验边界

本轮没有新增 macOS 原生、真实 IME、Windows、真实文件落盘或长期压力结论。YAML 前方插入正文会改变其处于文件开头的语义位置，属于用户插入结果，本轮没有自动重排 YAML。没有扩展到复杂嵌套列表/表格内的特殊块、远程图表服务或所有不支持的语法组合；本轮结果不能代替 I05/I06 全范围验收。
