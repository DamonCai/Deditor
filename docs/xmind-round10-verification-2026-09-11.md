# 第十轮：分组形状与联系控制点

状态：进行中，整体验收未完成。桌面工具再次明确报告 Mac 锁屏；按用户最新指令不重复请求确认，继续推进不依赖桌面的工作。原生与 Windows 未验证项仍保留。

## 本轮修复

- 边界新增 polygon、roundedPolygon、scallops、waves、tension、focus、cross，与既有 rect/roundedRect 共九种。多边形按成员外包框形成轮廓；开放角框和交叉框分别绘制填充与边线；外伸部分纳入适合窗口范围。
- 概要新增 angle、square、round、straight，与既有 curly 共五种。格式面板提供全部字段，保留未知字段选项，中英文同步。
- 原版 palette 字段与图标身份核对：`roundedhexagon` 实际是尖角的竖向六边形，圆弧版本是 `ellipticrectangle`。已修正文案；不能因字段名字含 rounded 就给前者添加圆角。
- 极坐标联系控制点按两端轮廓接点之间的向量计算：amount 为比例，angle 为弧度；起点是对应轮廓接点，不是主题中心。`lineEndPoints` 两项为主题中心相对向量，指定固定接点方向。
- 拖动原有极坐标控制点保持 amount/angle 表达，保存时不改另一端控制点或固定接点；原有 Cartesian 控制点继续按主题中心相对向量处理。

## 原版参考来源与限制

Mac 锁屏时仅检查已安装原版应用的静态资源和渲染/导入导出代码，不读取个人文件、最近记录或应用状态。可跟踪事实表为 `tests/fixtures/xmind-native-group-shapes.json`、`xmind-native-control-fields.json`，包含对应打包文件的 SHA-256。产品中的几何函数自行实现；原版参考 SVG 仅放临时目录用于观察，未引入产品。

字段映射、极坐标转换和固定接点存档身份已从静态源码核对。这些证据不等同于新样例已在原版打开、保存、重开，也不表示所有轮廓已像素对齐。

## 已执行验证

- 核心 86 项通过：`tests/artifacts/xmind-round10/core-polar.log`。覆盖全部分组字段、继承、有限路径、轮廓范围；极坐标水平/垂直/90°/零比例、固定上下接点、拖动反算、重连、归档及资源保留。
- 组件 128 项通过：`regression-polar.log`。新增分组形状切换/保存/一次撤销，以及极坐标拖动预览不写文件、接点不漂移、保存和一次撤销。
- TypeScript 构建和 `git diff --check` 通过。
- 真实浏览器：九种边界、五种概要整图检查；弧形概要切换方括线并一次撤销；53% 缩放的 90° 极坐标曲线实际拖动，接点保持原位且一次撤销恢复。截图在工具记录中，不伪称磁盘截图。
- 自建原生样例：`native-group-shapes.xmind`、`native-polar-controls.xmind`。可用 `scripts/create-xmind-round10.ts` 重建；当前未被原版读取，未覆盖正式安装。

## 继续项

手动联系线的额外折点、复杂分组组合及原版细节继续核对。随后固定源代码构建新的 Review6 测试包；第九轮二进制不含本轮改动。原生冷启动、保存重开与原版互通、候选浮窗定位、Windows 和矩阵剩余项未通过；不以本批检查通过结束整体工作。
