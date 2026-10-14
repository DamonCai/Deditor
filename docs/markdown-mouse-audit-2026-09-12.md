# 阅读编辑真实鼠标与目录操作审计（2026-09-12）

本组按[检查缺口盘点](markdown-unchecked-operation-types-2026-09-12.md)第 3 类，以及第 6/7 类相关入口、布局操作执行。仅使用自建文档。新增确认并修复 **1 类问题：目录鼠标操作意外改变正文位置、选区或焦点**。其他已通过检查点不计为新修复。

## 固定检查点及结果

| 点位 | 实际执行与结果 | 本次仍未覆盖 |
| --- | --- | --- |
| M1 双击选词 | 坐标双击 `bravo`，实际选中该词；逐键 `x`、`y` 得到 `Alpha xy charlie delta.`；一次撤销恢复原文和 `bravo` 选区；直接 `q` 替换到原位置。通过。 | 系统原生双击速度偏好及 Windows。 |
| M2 三击选段 | 坐标三击第一段，Backspace 清空该段，其他段落不变；撤销恢复完整段落选区；直接 `q` 替换整段。通过。 | 三击嵌套列表、表格和每类特殊块的全部组合。 |
| M3 Shift 点击 | 真实点击首段开头，Shift 点击第二段末尾，选中两段，输入 `x` 仅替换两段；一次撤销恢复内容和选区。反向由第二段末尾 Shift 点击首段末尾，选中段间边界与第二段，输入后只合并替换目标范围，撤销恢复。通过。 | 更多跨特殊块及平台原生选区组合。 |
| M4 正反向跨格式拖选 | 坐标正向、反向拖过粗体、斜体、行内代码，替换后分别为普通正文 `xy`、`q`；一次撤销精确恢复 `Alpha **bravo** and *charlie* then \`delta\` finish.` 以及整段选区。通过。 | 跨图片、保留块等非文本节点由另组负责，不能套用本项结论。 |
| M5 长文边缘拖选 | 80 段文档由第一段拖至编辑区下边缘，选区覆盖第 1 至第 9 段的一部分，观察到滚动容器从 0 到 6.5px；输入 `x` 后仅所选范围被替换，撤销全文精确一致。单次边缘动作通过。 | 工具只有一次完整 drag，没有按住鼠标并在边缘持续停留的 API；**持续跨多屏自动滚动未验证**。不能由这 6.5px 推断完整跨屏通过。 |
| M6 折行释放 | 480px 编辑容器中，从第一显示行开始拖至第二显示行末 `romeo` 后释放；替换保留后面的 ` sierra…`；撤销恢复原文和选区。通过。 | 所有特殊块边缘释放和浏览器缩放组合。 |
| M7 真实链接悬浮入口 | 工具没有纯指针移动/hover 方法；未调用测试按钮或伪造 hover 事件充当真实操作。 | **纯悬浮链接编辑入口仍未验证**。既有链接弹窗后续写结论继续保留。 |
| M8 布局变化中的选区 | 折行跨行选区撤销恢复后，将编辑容器由 480px 扩至宽屏，原选区保留，直接 `q` 替换同一范围。另发现目录操作问题，修复后真实展开、固定、取消固定均保留选区及输入目标，详见下节。 | 这里改的是自建页面中真实编辑宿主宽度，不是系统窗口缩放；系统缩放、图像/公式/图表异步高度变化未测。 |

全部鼠标选区使用浏览器实际 `click(clickCount:2/3)`、`drag`、Shift 点击。没有用 DOM Range、ProseMirror 选区接口或辅助按钮产生正文选区。替换输入使用逐键操作。页面的 Selected 区域只读取浏览器选区；原文区域读取真实编辑 store。

## 目录问题与修复

### 复现

在 1280×720 的自建页面中，收起的目录轨道位于右侧 `(1260,143)`，其首目录项会在展开后覆盖同一位置：

1. 长文第一段选中 `01`，或者仅将光标放在第一段。
2. 真实鼠标点击收起轨道。
3. 悬浮先触发立即展开，轨道隐藏；随后的点击落在新出现的首目录项。
4. 页面跳到 H1 `Mouse audit`，选区丢失，目录随后收起。

有选区、无选区两组均复现。无标题文档不发生误导航，但鼠标按下会清除浏览器可见选区。它们共同暴露了目录展开/固定本应只改变布局，却改变正文编辑目标的问题。

### 实施

仅修改 `src/components/MarkdownOutline.tsx`：

- 记录本次悬浮展开前轨道的矩形区域。在鼠标离开原轨道区域前，消耗同一区域的一次点击，避免点击落到刚出现的目录项。
- 鼠标真正移进目录面板后允许正常导航；再次明确点击也允许导航。
- 键盘激活（detail=0）不受该保护影响。
- 轨道/固定按钮的左键按下保留正文焦点和选区。键盘 Tab 聚焦、Enter 操作仍然有效。
- 不改共享目录 CSS、宽度、位置或明暗样式。

### 修复后的不同维度验证

1. **真实鼠标与编辑结果**：选中 `01` 后点击轨道，目录展开、选区仍为 `01`；固定目录后逐键 `xy` 只替换该词；一次撤销恢复 `01` 选区；取消固定后 `q` 仍替换同处。无选区时打开目录仍停在第一段。移入面板明确点击、固定面板中明确点击首项，均正常导航 H1。
2. **真实键盘入口**：从页面控件反向 Shift+Tab 到目录轨道，Enter 打开并聚焦固定按钮，Tab 到首目录项，Enter 正常导航。正文未被改动。编辑器中的 Tab 按产品现有规则用于缩进，本组未把它当作页面焦点跳转。
3. **自动回归与既有共用组件检查**：新增 6 组事件回归通过（替换落点、轨道内移动、移入面板、键盘激活、固定焦点、离开重进）；原有 2 组目录集成通过，包括真实 Preview 使用同一组件；TypeScript 检查通过。这些事件测试明确不计为真实鼠标证据。

## 重跑和边界

- 自建入口：`tests/markdown-mouse-audit-review.html` / `.tsx`。包含 plain / format / link / wrap / long 样例，以及只改变宿主宽度的测试控件。
- 新增自动回归：`node scripts/test-markdown-mouse-audit.mjs`（6 组）。
- 既有目录回归：`DEDITOR_TEST_FILTER='outline:' node scripts/test-markdown-visual-integration.mjs`（2 组）。
- 类型检查：`npx tsc --noEmit` 通过。
- 真实浏览器证据为本任务操作记录中的 AX 状态、截图及原文读取。源文件核对不是原生磁盘保存/重开，本组没有新增原生包或原生保存结论。
- 本组浏览器使用当时工作区的独立开发服务；其他 agent 同时修改其他模块，最终固定快照整合验证由主 agent 统一执行。本组结果不替代整合版本全量验收。
- 本组未操作用户原生应用、未提交推送、未修改 XMind。浏览器标签及 5193 测试服务在结束时清理。
- 这 8 个固定点中 M5/M7/M8 仍保留上述明确缺口，不能说八类全部验收完成。

## English summary

This audit used real browser double/triple clicks, Shift-clicks and forward/reverse drags on generated documents. Word/paragraph replacement, undo selection restoration, mixed inline-format selection and wrapped-line release passed. One defect was reproduced and fixed: hovering over the outline replaced its rail before the pending click, causing accidental heading navigation. The opening click is now guarded, and mouse pin/unpin preserves editor focus and selection; deliberate pointer navigation and keyboard Enter still work. Six event regression groups, two existing outline integration groups and TypeScript checks passed. Sustained drag autoscroll, the actual link-hover entry point, native platforms and asynchronous layout changes remain unverified.
