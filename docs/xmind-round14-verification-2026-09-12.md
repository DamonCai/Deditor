# XMind 第十四轮验证（2026-09-12，进行中）

整体验收仍未完成；本记录是连续推进中的一批结果。

## 反向离轴结构

原版 renderer/1857.js 结构枚举与方向映射明确包含 `org.xmind.ui.timeline.sided.horizontal.rtl`，与 sided.horizontal 组成 right/left 对。此前本地没有登记此字段，会落入通用时间轴布局。

现加入向左离轴主轴、上下交替里程碑与镜像明细，并提供中英文格式入口。普通、长标题、混合组织图、边界、不同折叠状态的既有回归矩阵自动覆盖新增样例；范围手柄按实际反向顺序判断。原版还列有 through.vertical.btt、through.symmetric.vertical 等变体，本轮没有把它们标为已支持或已验收。

浏览器实际操作：

- 向左离轴图四个主分支按 1→4 从右向左排列，明细位于正确上下侧。
- 多选分支 1/2 创建边界，点击边界标题选中；结束手柄位于左侧。
- 从结束手柄 (351,327) 拖到第三分支 (355,270)，范围结束值从 1 变 2；一次撤销后重新选中边界确认恢复 1。
- 先选中分支 1，再点击可见折叠按钮，明细 1 A/B 消失，其余分支保留。直接定位隐藏的折叠按钮不能当作有效点击证据。

Review14 原生冷启动及混合样例通过。包含很长的中英标题、嵌套明细边界、前两阶段外边界、组织图子树及跨阶段双行联系。实际选中分支 1 后 Cmd+/ 折叠，Cmd+S 保存，关闭重开仍为 collapsed，Leftward off-axis timeline 字段保留。原生辅助 Collapse 调用没有产生状态改变，最终通过的是实际快捷键。

原版随后读取准确 reverse-grouped 路径，isDirty=false、100% 整图无修复提示：中心在右、阶段向左排列，第一阶段显示 2 个已折叠明细，前两阶段边界与第三阶段嵌套边界、双行联系均保留。边界组合会影响原版上下排列，尚未宣称所有节点坐标逐像素一致。

## 多行与粗线箭头互通

为避免原版当前工作表切换阻碍检查，新增独立 ID 的单表自建样例，并在 Review14 实际输入和保存，未将改造归档冒充原来的三表文件。

multiline-single.xmind 使用 4pt 双端箭头，原生格式面板逐键输入 First line、两次 Shift+Return、Third line，在焦点仍位于字段时 Cmd+S。原版成功读取准确路径 `/private/tmp/deditor-xmind-review14-cases/multiline-single.xmind`，isDirty=false，无修复提示，AX 精确保留两处换行。随后原版适应画布到 82%，整图实际显示全部 11 种粗线双端箭头，以及 First line / 空行 / Third line。形状、方向和空行已完成这份样例的原版比对；未将不同字体的行距或每个像素宣称完全一致。

## 自动化、包与证据

- Review14 固定快照完整 test:all 通过：100 核心、139 组件；TypeScript/Vite/Tauri app 构建通过。
- `/tmp/deditor-xmind-review14-app/DEditor XMind Review14.app`，SHA256 `b078204930b9b8f80ced779e87c86bf3e3b1078dc5280f63e42e74bc29194dbd`。
- 固定源码 `/private/tmp/deditor-xmind-native-round14-review14`，基于 Review13，仅加入 XMind 修改；并行 Markdown 改动未混入测试包。
- 被忽略证据 `tests/artifacts/xmind-round14/`：all-review14.log、build-review14.log、source-review14.json、build-review14.json。
- 反向保存 `native-review14-reverse-grouped-save.xmind` SHA256 `af729ab81808302d9aa4b7f62d0f78b4b0d8eebbaadac1a6d6ff6d87b5168032`。只有第一主分支 branch=folded 变化，其他 JSON/成员内容全部保持。
- 单表保存 `native-review14-multiline-single-save.xmind` SHA256 `7b9c526934862e7518337622ad85cb614e1bcd332e0c762e47ecc95c1923589c`。相对自建独立 ID 单表基线，仅最后一条联系标题改变，其余字段/成员内容保持。各有 verification.json。
- 可重复生成三类反向样例：`scripts/create-xmind-reverse-timeline.ts`，输出采用独占创建，不覆盖已编辑证据。

继续原版反向结构/最终紫色/箭头端部对照，以及原生整段拖动、候选浮窗、其他复杂变体和 Windows。工具有窗口不可用和 ScreenCaptureKit -3811 间歇错误，不得把失败调用当作通过，也不能用它停止所有独立工作。
