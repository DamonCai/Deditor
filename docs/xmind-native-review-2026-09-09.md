# XMind / DEditor 原生视觉对比

2026-09-09，本机 macOS。实际打开 XMind 26.04.01341 原生应用与当前本地构建的 DEditor 0.8.1（窗口名 DEditor Fullscreen Review，WKWebView）；不是浏览器模拟 IPC。此次仅创建测试文件、生成器、截图和本报告，没有修改应用源码。

## 测试文件

- 最终文件：[complex-styles-verified.xmind](../tests/artifacts/xmind-native-review/complex-styles-verified.xmind)。已在两个软件中实际打开。
- 生成器：[create-xmind-visual-fixture.mjs](../scripts/create-xmind-visual-fixture.mjs)，运行 `node scripts/create-xmind-visual-fixture.mjs` 可重新生成。
- 4 个工作表，112 个主题：综合样式 56、组织结构 22、时间轴 17、鱼骨分析 17。
- 综合页包括 6 个彩色主分支、5 层结构、中英日混排、emoji、多行及长标题、粗体/斜体、4 种形状、内嵌 PNG、备注、标签、优先级/进度/星形标记、概要、边界、批注、联系线和带子树的自由主题。
- 全部为新生成的合成内容；图片使用项目现有应用图标。

## 结论

**能够打开和阅读，但复杂布局与 XMind 仍有明显差异，不能判为视觉一致性通过。**

| 项目 | XMind 实际表现 | DEditor 实际表现 | 判断 |
| --- | --- | --- | --- |
| 文本、PNG、多行、主分支填色、基本形状 | 正常显示 | 正常显示；文字换行和节点尺寸存在差异 | 基本可读 |
| 子分支颜色继承 | 深层结构的灰色、质量分支的紫色继续传到后代连线 | 灰色主分支的后代变紫色；紫色主分支的后代变灰色；组织图的紫色部门后代变橙色 | 明确不一致 |
| 标记与标签 | 优先级、进度和星形显示为图标；标签为独立小标签 | `P1`、`task-done`、`task-half`、`star-red` 等作为文本显示；标签以文本连接 | 明确不一致 |
| 联系线 | 红色虚线以弯曲路径从视觉分支连向交付分支，标题在曲线附近 | 基本为竖直虚线，起止位置及标题位置不同 | 明确不一致 |
| 边界、概要、批注 | 有对应样式、括线和较紧凑的排布 | 能显示这些元素，但间距、包围范围、连接与位置不同 | 部分还原 |
| 自由主题 | 根图下方显示，独立子主题在左侧 | 能显示自由主题，但独立子主题在右侧 | 方向不一致 |
| 组织结构 | 主分支保留曲线、子分支使用圆角连接，层级较紧凑 | 主干和子分支统一成直角连接，横向跨度及节点间隔不同 | 明确不一致 |
| 时间轴 | 四个阶段节点位于同一轴线上；叶节点按侧向列表排布 | 阶段节点上下交替偏离轴线，叶节点横排；界面提示近似布局 | 未还原原生布局 |
| 鱼骨图 | 主分支为完整斜骨，叶节点逐条附着在斜骨上 | 主分支只通过短斜线连接主轴，叶节点成为普通组织图式横排 | 未还原原生布局 |

## 原生结构标识发现

初版样本依据当前 `scene.ts` 的 `STRUCTURES` 使用 `org.xmind.ui.fishbone.right`。XMind 格式面板将其显示为“无”，实际回退成普通思维导图，不能用这张回退图作为鱼骨效果基准。

随后在 XMind 中实际选择“鱼骨图”，保存本次创建的 [04-fishbone.xmind](../tests/artifacts/xmind-native-review/04-fishbone.xmind)，检查其 `content.json` 得到有效标识 **`org.xmind.ui.fishbone.leftHeaded`**。最终四页样本及生成器已使用该标识，并在 DEditor 中重新打开检查。DEditor 能进入近似鱼骨布局，但提示中直接露出该结构 ID。

代码对应位置：`src/lib/xmind/scene.ts` 的 `STRUCTURES`、`styleFor` 和布局计算；`src/components/XmindCanvas.tsx` 的标记文本渲染。这里记录发现，未实施修复。

## 截图对比

截图保留原始窗口画面，缩放比例不同，用于比较结构与样式，不作像素级尺寸测量。综合页两边均使用“适应画布 / Fit map”。

### 综合样式

XMind：

![XMind 综合样式](../tests/artifacts/xmind-native-review/xmind-01-overview.png)

DEditor：

![DEditor 综合样式](../tests/artifacts/xmind-native-review/deditor-01-overview.png)

[XMind 100% 局部细节](../tests/artifacts/xmind-native-review/xmind-01-detail.png)

### 组织结构

XMind：

![XMind 组织结构](../tests/artifacts/xmind-native-review/xmind-02-org.png)

DEditor：

![DEditor 组织结构](../tests/artifacts/xmind-native-review/deditor-02-org.png)

### 时间轴

XMind：

![XMind 时间轴](../tests/artifacts/xmind-native-review/xmind-03-timeline.png)

DEditor：

![DEditor 时间轴](../tests/artifacts/xmind-native-review/deditor-03-timeline.png)

### 有效结构的鱼骨图

XMind：

![XMind 鱼骨图](../tests/artifacts/xmind-native-review/xmind-04-fishbone.png)

DEditor（最终四页样本）：

![DEditor 鱼骨图](../tests/artifacts/xmind-native-review/deditor-04-fishbone.png)

## 验证范围与复现说明

- `npm run test:xmind -- tests/artifacts/xmind-native-review/complex-styles-verified.xmind` 通过：4 页分别建立 56 / 22 / 17 / 17 个场景节点。该检查只证明解析和场景构建成功，视觉差异以上述原生截图为准。
- 综合页与最终鱼骨页截图使用修正后的最终文件。组织页与时间轴的内容和样式在最终样本中保持相同；XMind 组织页为同一工作表提取的独立 `02-org.xmind`，鱼骨页为 XMind 保存过的独立副本。
- 初版 `complex-styles-original.xmind` 留作结构标识问题的复现文件，不作为最终推荐样本。
- 中途窗口被操作以及 XMind 全屏退出后出现截图与可访问性文本不同步；最终保留的组织页、鱼骨页截图已通过独立文件重新打开核对，错误页截图已覆盖。
- 本轮没有验证 DEditor 编辑保存后的跨软件往返、Windows、安装包分发或所有 XMind 特性，也没有运行与这次样本创建无关的全量性能测试。
