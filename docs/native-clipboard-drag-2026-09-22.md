# 原生跨应用剪贴板与拖选验收（2026-09-22）

基线 `17dbfb2`。仅用自建文档；主 agent 独占原生桌面和浏览器，本子任务未操作系统剪贴板或用户应用。未发送钉钉消息或修改他人文档。本文不把 DOM 事件测试计为原生验收。

## 样例与复现

可随 Git 迁移的原始样例在 `tests/fixtures/native-clipboard-drag/`。本机验收副本位于 `tests/artifacts/native-clipboard-drag-2026-09-22/`，包含各 `.md.original` 和初始 SHA-256 清单。原生中只打开 artifacts 副本；空目标为 `table-destination.md` 和 `rich-destination.md`。

### Excel 表格往返

本机有 Microsoft Excel、Word 与 WPS，不需要访问现有用户文档。

1. DEditor 阅读编辑打开 `table-source.md`，点击 Alpha 单元格，确保没有普通文本选区；工具栏“复制与粘贴格式”→“复制为 Excel 表格”。这是应用实际复制入口。
2. Excel 新建空白工作簿，在 A1 粘贴。选 A1:D4，确认 16 个单元格与下表相同；不要将整段当成一个单元格输入。
3. Excel 实际 Cmd+C，返回 DEditor 的空白 `table-destination.md` 阅读编辑并 Cmd+V，Cmd+S。
4. 执行 table 校验。一次撤销后保存应恢复空目标；重做保存后再次校验，再关闭/重开核对。Excel 测试工作簿只保存到自建 artifacts 目录，最后关闭。

| Name | Count | Note | Empty |
| --- | --- | --- | --- |
| Alpha | 12 | 中文 |  |
| Bravo | 34 | "quoted" | tail |
| Pipe\|value | 56 | last |  |

TSV 路径测试表格单元格值与边界；不据此宣称富文本格式已保留。

### Word/WPS 富文本往返

1. DEditor 打开 `rich-source.md`，使用“复制为富文本”（无选区复制全文）。
2. Word/WPS 新建空白本地文档并普通粘贴，观察 BOLD_KEEP 粗体、ITALIC_KEEP 斜体、LINK_KEEP 链接和中文/emoji。
3. 在 Word/WPS 用 Cmd+A、Cmd+C，再粘贴到 DEditor 空白 `rich-destination.md`，保存执行 rich 校验。
4. 一次撤销保存为空、重做后校验；关闭/重开后再校验。外部编辑器测试文档仅保存本地自建路径，完成关闭。

如果某应用不提供 text/html，须记录实际降级结果；纯文本成功不等价于富文本通过。不能通过脚本把预制 HTML 填入系统剪贴板代替跨应用复制。

### 持续跨屏拖选

`drag-source.md` 有 BEGIN/END 标记和 ROW_001–036 连续段落，避免格式切换干扰。应使用真实鼠标按住拖选并跨越当前编辑器视口的上下边缘；确认滚动后选区仍持续增长，再松手。反向拖选再做一次。

复制选择到仅用于本次的 `drag-copied.txt`，用 drag 校验确认内容是原文连续子串、行号无漏无重。该校验只证明文本连续性；实际是否跨视口、是否一直按住及滚动过程必须由原生操作和截图证明。键盘扩选、一次全选或分段重新选择不能替代持续鼠标拖选。这里“跨屏”指跨编辑器视口滚动；不宣称多显示器验收。

### 主实时预览分隔线

打开 `divider-source.md`，切“实时预览”，使用源码与预览之间的**主分隔线**（不是图表内部中线）。当前产品分隔线只有 4px 宽，应先以截图/DOM只读几何确认命中，不用文字边界估算。

1. 在没有正文选区时，把主分隔线水平拖动到左右不同位置；应有明显宽度变化，不能出现新文字选区。
2. 松手后实际拖选预览正文，确认选择恢复；保留此已有选区再拖分隔线，已有文字选择应保持，不能新增选择。
3. 暗色/窄窗往返拖动；保存 source 并执行 unchanged 校验。

实现当前使用 pointer capture + preventDefault + 临时 user-select/selectstart 保护，在 pointerup/cancel、失焦、捕获丢失、节点卸载恢复；比例按当前 editor-group bounds 计算并保持 15–85%。此前浏览器已过，9/13 原生记录未可靠命中；本轮仍须以新原生证据补齐，不重复记 DOM 为 native。

## 核对命令

使用本机 Node 路径：`PATH=/Users/damon/.nvm/versions/node/v24.16.0/bin:$PATH`。

```sh
node scripts/verify-native-clipboard-drag.mjs table tests/artifacts/native-clipboard-drag-2026-09-22/table-destination.md
node scripts/verify-native-clipboard-drag.mjs rich tests/artifacts/native-clipboard-drag-2026-09-22/rich-destination.md
node scripts/verify-native-clipboard-drag.mjs unchanged tests/artifacts/native-clipboard-drag-2026-09-22/divider-source.md tests/artifacts/native-clipboard-drag-2026-09-22/divider-source.md.original
node scripts/verify-native-clipboard-drag.mjs drag tests/artifacts/native-clipboard-drag-2026-09-22/drag-copied.txt tests/artifacts/native-clipboard-drag-2026-09-22/drag-source.md.original
```

校验器只读指定文件，不访问系统剪贴板。table 检查矩阵全部值；rich 独立解析 Markdown 检查文字、粗体、斜体和 href；unchanged 检查原文；drag 对空白归一化后检查连续子串及行序，输出实际起止编号而不假称跨屏完成。

## 当前证据层级

- 准备与核对脚本：原始 table/rich 样例通过校验器，属于样例/校验逻辑自检。
- 产品源码审查：确认复制入口按选择/当前表格生成 TSV，富文本写 text/plain + text/html；随后按下节真实 Excel 缺陷修复粘贴。
- 本轮原生 Excel 与 Word 结果见下方最终复验；WPS、钉钉和持续拖选没有新增原生结论。
- 本子任务未跑全量测试、未构建、未提交；未新增 Windows/真实 IME 或钉钉验收。

## Excel 实测缺陷与修复

主 agent 在 `17dbfb2` 原生包按实际工具栏 → Excel 新建 Book1 的 A1 粘贴，截图核对 A1:D4 正确；再从 Excel 真实复制 A1:D4 到空目标。保存结果保留原 16 格值及 bottom 对齐，却新增全空表头成为 5 行。现场为 artifacts 下 `table-destination.md`；该失败不计往返通过。

根因是 Excel HTML 使用全 `td` 表格，GFM schema 必须先有 header row，于是 DOM 解析自动补头。项目为历史修复将 header row 设为至少一格后，上游只处理“零格空头”的提升逻辑不再适用。现仅在没有显式 `th` 的 HTML 表格解析前把实际首行转换为 `th`，复制全部属性和内容；不事后猜测删除空行，真实空首行与已有空 `th` 都保留。

补充定向测试发现 HTML 粘到已有表格时，会先被通用粘贴处理器消费并拆开表格。现把已解析的 slice 先交成熟的表格粘贴处理器，保留单元格格式并覆盖目标矩形，不改变纯文本 TSV 入口。

专项复现日志 `excel-before.log` 确认 4×4 变 5×4，真实空首行 2 行变 3 行。修复后的定向组位于 `scripts/test-markdown-input-clipboard-audit.mjs`，执行：

```sh
DEDITOR_TEST_FILTER='EXCEL|UX vertical|C09|C05|C03' node scripts/test-markdown-input-clipboard-audit.mjs
```

覆盖完整 16 格、底部对齐、真实空首行、显式空表头、粗体、已有表格目标、富文本复制/整篇往返，以及保存、单次撤销、重做、重新挂载后的精确文本与结构。日志 `excel-after.log`；DOM 测试只证明产品解析与编辑链，修复版真实 Excel 重验由主 agent 单独补充。

最终定向结果：7 组 input/clipboard、2 组原有 F05 TSV 专项、`tsc --noEmit`、`git diff --check` 全部退出 0。原有 TSV 引号换行、空格、Unicode、字面标记与竖线保留路径通过，未跑全量或构建。产品改动仅 `tablePaste.ts`、`tableLists.ts` 与 `MarkdownVisualEditor.tsx` 中传入已解析 slice 的一处调用。

原生分隔线未命中排查：1228px 宽、默认 50% 预览时，右区614px、左区610px，中线范围推算为 `[610,614)`；x614 已是预览首像素，建议主端真实拖动 x612 中心。该结果是布局源码推导，不是原生成功证据，不能据此标通过。

## 主端最终原生复验与收尾

在最终修复源码上生产前端与独立 macOS debug 包均构建通过；隔离应用标识仍为 `com.deditor.fouritems-review20260922`，未替换日常安装包。

- **Excel 完整往返通过**：旧包工具栏实际复制 TSV → Excel 自建 Book1 A1:D4 → Excel Cmd+C → 修复包空白 `table-destination-fixed.md` Cmd+V/S。真实保存后为4行16格，无附加空头；Unicode、引号、竖线及空格值全部通过校验，bottom 对齐保留。一次 Cmd+Z/S 文件为0字节；重做、关闭、重开后与首次保存副本逐字节相同。
- **Excel 既有表格粘贴通过**：实际选择 A2:B3 的 Alpha/12、Bravo/34，粘到自建3列表格 v11 单元格。保存后仍是一张4行3列表格，H1/H2/H3、v13/v23及末行v31/v32/v33保持，目标四格精确替换。一次撤销保存与97字节原文完全一致；重做、关闭后用 Cmd+Shift+T 重开，保存与405字节修改副本一致。
- **Word 富文本往返通过**：工具栏复制富文本 → Word 新空文档普通粘贴，实际显示粗体、斜体及链接 → Word Cmd+A/C → DEditor 空目标粘贴保存。rich校验确认文字、粗斜体、URL、中文及emoji；一次撤销保存0字节，重做、关闭重开后内容保留。Word引入的NBSP、黑色span及尾空段如实保留，未宣称与原始Markdown字节相同。此路径在修复前基线包完成；本次产品修改仅针对表格。
- **该批次分隔线未通过（后续已收口）**：1228px截图下 x614 拖至790产生预览文字选区而未改宽，清理选区后改用推算中线 x612 仍未观察到宽度变化。本次没有取得原生事件命中证据，不将其归因为确定产品缺陷或工具问题，保留待验。跨视口持续拖选、多显示器拖选本轮未执行。

完整相关回归：26组剪贴板、34组表格、107项阅读集成全部通过；另7组定向、2组TSV、TypeScript检查及差异检查通过。本轮未跑完整 test:all 或 perf:all，不新增Windows、真实中文候选或钉钉验收。

原生证据文件在上述 artifacts 目录，包括 `table-destination.md` 失败现场、`table-destination-fixed.md`、`table-fixed.saved.md`、`table-existing-fixed.md`、`table-existing.baseline.md`、`table-existing.saved.md`、`rich-destination.md`、`word-roundtrip.docx` 与 `ClipboardReview.xlsx`；日志为 `build.log`、`native-build.log`、`clipboard-all.log`、`table-all.log`、`integration.log`。这些本机证据被Git忽略，跨机需单独迁移。自建源文档与初始副本一致；测试文档已保存关闭，DEditor隔离实例、Excel及Word退出，输入源保留简体拼音。


## 后续主实时预览分隔线闭环

基线 `3a4e2db` 后借助独立原生事件诊断，确认命中与捕获成功，但实际投递的down/move.buttons均为0，触发现有提前松手保护。补已捕获手势的有界兼容后，12组专项通过；普通最终包两次正反向实际拖动改变边界约611→786→464px，没有新增正文选区，松手后真实正文拖选成功。Cmd+S/W/Q保存关闭退出，样例与原始副本逐字节一致（SHA-256 `2507db0a99c2f50da7104420a72e6498b9c4a6cf7d228fcdfb00a0a16b610918`）。CLIP-04已从待办移除，详见[原生分隔线完整证据及边界](native-pane-resize-diagnostic-2026-09-22.md)。未扩大到携带已有选区再拖、跨视口或跨显示器拖选。
