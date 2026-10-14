# 原文件视觉一致性复核：不一致

对象：`tests/artifacts/xmind-native-review/complex-styles-original.xmind`。
应用：`/Applications/DEditor.app` 0.9.0 与 `/Applications/Xmind.app` 26.04.01341。本次使用用户当前安装版，没有用独立 Review 应用替代。

## 已由成对原生截图确认的差异

| 对象 | XMind | DEditor | 判定 |
| --- | --- | --- | --- |
| 综合样式：自由主题“06 深层结构” | 子树向左展开 | 子树向右展开 | 方向不一致 |
| 综合样式：自由主题“Floating” | “独立信息卡片”在左侧 | 子节点在右侧 | 方向不一致 |
| 综合样式：Architecture / Quality | 子分支分别继承粉色 / 紫色 | 子分支出现紫色 / 粉色错配 | 颜色不一致 |
| 综合样式：设计到交付的关系线 | 弯曲虚线，标签靠中间 | 接近竖直的虚线，标签位置不同 | 路径与标注不一致 |
| 综合样式：任务标记、备注、标签、批注 | 图标、标签胶囊、批注尖角 | task-done 等文字、普通辅助文字、折线式批注连接 | 表现不一致 |
| 组织结构：根到三个部门 | 弧线 | 直角折线及水平公共线段 | 连接几何不一致 |
| 组织结构：质量与发布 | 子树紫色 | 子树橙色 | 颜色继承不一致 |

菱形和椭圆在本次总览中没有再次看到上次的明显文字越界，但这不能代表尺寸、布局、图标、关系线和整体视觉一致。两边采用各自“适应画布/适合窗口”，缩放百分比不同；不把截图中绝对字号大小差异当作独立缺陷证据。

## 上次验收的问题

上次使用的是 `complex-styles-verified.xmind`，不能代替本次原文件。初始读取发现：

- 原文件的深层结构在 detached 自由主题中；verified 中仍是 attached 主分支。
- 自由主题坐标、附属子树组织不同。
- 原文件第四页的结构是 `org.xmind.ui.fishbone.right`；verified 使用 `org.xmind.ui.fishbone.leftHeaded`。
- DEditor `directionOf` 用 `includes("fishbone")` 识别结构，没有精确区分标识是否受支持。文件名/工作表标题含“鱼骨”不能作为渲染正确的依据。
- 单测的几何、保存和交互通过，不能作为 XMind 视觉一致性的证明。

## 截图与验证边界

可靠的成对截图位于 `tests/artifacts/xmind-original-audit/`：

- `xmind-01.png` / `deditor-01.png`：综合样式，截图标题均为 original，画面内容及选中页签已核对。
- `xmind-02.png` / `deditor-02.png`：组织结构，根为“产品研发中心”，选中组织结构页。
- `deditor-03.png`：仅 DEditor 时间轴，不算成对验证。
- `invalid-capture-main-instead-of-timeline.png`：废弃截图。切页后的控件信息报告时间轴，实际图片仍是综合样式。保留并显式标为无效，不能当作时间轴证据。

后续 XMind 切页出现控件状态与图片不对应、窗口切到 verified、坐标动作报 noWindowsAvailable 等情况。时间轴和原文件鱼骨页没有取得可靠的成对原生截图，本次不宣称这两页验证完成，也不引用 verified 鱼骨截图冒充原文件结果。

对比期间原文件字节有变化：初始 SHA-256 为 `76f4bf688d4d0a5e5b0090ab1ebf74bb4bdf75d8b2aceb7b105fae6491fe4a62`，后续为 `f350d46fd2fe7df5c79be8977495b31d16f033d1336502e59e0b12e6bbadb339`；后续压缩包出现 XMind 原生 content.xml/缩略图、revisionId 等字段。没有足够证据断言触发原因，也不能声称整个过程文件字节未改变。

本次仅做复核并纠正结论，没有修改渲染代码。结论是视觉一致性验收不通过；已确认的方向、颜色、连接线差异足以否定“两个软件显示一样”。
