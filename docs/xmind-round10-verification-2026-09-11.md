# 第十轮：分组形状与联系控制点

状态：进行中，整体验收未完成。Review7 冷启动和分组/极坐标/手动折点保存互通已通过；Review6 启动阻塞为历史状态。继续修复与验证，不请求重复确认。Windows 等未验证项仍保留。

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


## 后续手动路径与复杂分组修正

- 手动曲线/折线/直角线使用 `flexibleControlPoints` 的全部主题中心相对向量，显示对应折点手柄；曲线使用弦长参数自然三次样条，直角线选择避免相邻立即折返的路径。原版对尖角有额外平滑优化，完整像素一致性仍须原版样例比较。
- 拖动预览不写文件，Escape/失去捕获取消；保存只改所拖折点，保留其它折点原始数值及自定义字段。曾捕获未修改坐标产生浮点噪声的问题并修正。
- 真实浏览器复现联系文字遮挡折点导致拖不动，现手柄在文字之上绘制，编辑文字时隐藏手柄。同一重叠位置复测拖动及一次撤销通过。
- 镜像时间轴/鱼骨图重新按实际成员和左对齐标签测量多边形轮廓；外层分组包含内层边框、标题、概要和批注。粗边框扩大内边距，鱼骨斜骨为分组标题和边框预留空间。
- 外层填充先绘制，避免盖住内层边框和标题；边框命中范围保持屏幕尺寸。反向时间轴和右头鱼骨嵌套样例已浏览器检查；鱼骨标题/粗边框曾与分支主题重叠，修正后再次截图通过。
- 补 `range: master` 整个主题分支的边界。包括主题自身、子主题、概要、批注和内层边界；折叠后仍保留整体边界。自由主题和概要主题可创建这种边界，面板说明其范围，不显示错误的首末成员手柄。概要按钮在非附属兄弟主题上禁用，跨父级/不连续选择的分组按钮也禁用。
- 浏览器在独立自由主题创建整体边界，格式面板显示“覆盖整个主题分支”，一次撤销恢复，已通过。

## 原生连接恢复与样例问题

本轮后段桌面连接恢复，已继续原版读取，不再沿用“当前锁屏”作为最新状态。

原版拒绝 `round9/native-current-case/groups.xmind`，错误为 `Cannot create property 'name' on string 'XMind'`。排查发现通用测试样例的 metadata.creator 被生成成字符串，原生保存忠实保留了这个原有错误；它不是该次保存新引入的数据损坏。已修正 `sampleArchive` 的 creator 对象和 manifest 条目，并新增结构检查。失败文件保存在 `round10/invalid-metadata-inputs/`；记录为 `native-metadata-failure.json`。新建有效输入 `native-group-save-retest.xmind` 恢复原始 (0,1) 范围，必须重新执行原生编辑/保存/重开/原版读取，不能通过直接修补旧输出就宣称互通成功。

颜色文件使用另一生成器，metadata 原本有效。原版已打开浅/深两表，深色表显示保存的“透明填充保存验证”，无修复提示，记录为 `native-colors-read-verification.json`。视觉比较发现原版浅填充默认使用白字，主题 `svg:fill-opacity` 没有按 DEditor 的方式乘到颜色 alpha；此差异仍需校准，未标视觉一致。

最新自动回归：核心 **92** 项（`core-master-final.log`）、组件 **131** 项（`regression-master-final.log`）通过；TypeScript 和差异检查通过。性能样例 1,001 主题/1 MB 附件，10 次布局中位约 78.2 ms、10 次归档约 3.90 ms，仅代表本机测量。

构建版本需区分：`build-verification.json` 的 `ffe1f7…` 包包含手动路径但不含嵌套修正；`build-nested-verification.json` 的 `90cb6f…` 包包含嵌套修正但不含 master。最新完整快照 `/tmp/deditor-xmind-native-round10-master` 已构建成功（SHA-256 `efb2db9534c6f3577fe4f6a7abead8b1622276d7a984904672dd2146d2cb9f2f`），清单为 `source-master-snapshot.json`，日志 `native-build-master.log`；上述两个包均未在本轮冷启动验证。正式应用未覆盖。

本任务没有执行提交或推送；共享工作区期间 HEAD 由其它操作变为 `ab169be`，部分较早 XMind 改动已进入该提交。继续保留其它任务正在修改/暂存的 Markdown 文件。


## 原版分组实测后的修正与启动诊断

- 原版成功读取有效 `native-group-shapes.xmind`，九种边界和五种概要分别适配画布并截图。发现 polygon / roundedPolygon 的标题本应隐藏、轮廓外侧应平直。已据原版实际画面和静态字段实现修正，原文标题仍保留在归档和面板中；镜像后同步改变轮廓方向。波浪与张力框的二次曲线亦已校准。
- 浏览器重新打开九种边界复测，两个多边形标题正确隐藏且轮廓方向正确。最新核心 **93** 项、组件 **131** 项通过，TypeScript 和 diff check 通过。记录：`core-native-shapes.log`、`regression-native-shapes.log`。这次新增修正晚于 efb2db 包，不能算进该二进制。
- 原版极坐标样例成功打开。选中固定上下接点后，手柄确认位于两主题顶/底中心；未选中时线段被主题填充遮住造成边缘位置的视觉错觉，不据此改动正确坐标基准。原版控制柄坐标拖动多次无状态变化（重建 CUA 和 Raise 后仍然如此），未计拖动通过。
- efb2db 包已退出旧进程后启动新进程，但窗口获取持续超时。进程采样显示主线程在 WebKit URL scheme 回调中的 `open` 阻塞；日志仅到 webview ready，尚未完成状态恢复。原版窗口仍正常，不能称整个桌面锁屏。证据 `native-startup-blocked-sample.txt`。安全检查拒绝读取系统通知应用，未绕过限制，未声称已确定系统权限是原因。继续允许的诊断和其它验收。


## 手动折点与整体边界原版比对

- 原版 `native-polar-controls.xmind` 通过双击联系文字编辑、保存，磁盘标题为“90° / 50% 原版保存”，极坐标和固定接点逐项保留（`native-polar-original-save.json`）。原始输入已备份至 `native-input-baselines/`，不能重新生成覆盖这个原版输出。DEditor 新包互通仍待完成。
- 原版 `native-flexible-controls.xmind` 已加载并截图。三种路径全部显示；原先直角线中间折点被强制放在垂直拐角，与原版不一致。路由增加中段转折候选，在等长路径中优先让内部保存折点直行通过。再次浏览器比对，三段走势相符；52% 缩放实际拖动中间折点并一次撤销通过。
- 原版 `native-master-boundaries.xmind` 已打开，整体边界正确包围附属主题、概要和批注并排除独立自由主题。实测发现默认标题位置、概要线型和批注间距差异，已修正为边界标题靠左且按可用宽度换行、默认 round 概要、默认批注 5px 间距和绿色填充白字。显式批注位置及主题/分组样式继续保留。浏览器截图再次核对，长尾与标题居中差异已消除。
- 新增默认样式、标题与显式批注坐标回归；`core-native-defaults.log` 为最新核心结果，组件运行记录 `regression-native-defaults.log`。这些修正均晚于 efb2db 包，原生包须重新构建后验收。


## Review7 原生恢复与分组互通闭环

系统日志确认 Review6 新签名未匹配旧文稿目录权限，导致原生 open 等待提示；没有更改系统权限。通过活动监视器核对 PID 39987 后结束该未完成状态恢复的测试进程（普通退出无效，强制退出完成）。其它 Markdown / IME 测试应用未停止。

最新修复以完整快照 `/tmp/deditor-xmind-native-round10-clean` 构建 Review7，独立 identifier `com.deditor.xmindreview7`，不注册文件关联。临时运行路径 `/tmp/deditor-xmind-review7-app/DEditor XMind Review7.app`，SHA-256 `b024eda0e2989973bf730641acd82487edb77b530c9d91aa2b05cf2549c0a9cb`。源码快照无变化；清单 `build-clean-verification.json`。94 核心 / 131 组件通过。

Review7 冷启动成功，仅加载临时目录内自建样例。有效分组样例完成原生 Cmd+O、点击标题选中边界、拖末端纳入图片主题、Cmd+S、关闭并从磁盘重开；原版随后读取同一结果，无修复提示，首表边界包含三个主题和图片，第二表结构仍存在。归档逐项比较只有 `range: (0,1) → (0,2)`，所有其它内容和非 content.json 条目完全一致。证据 `native-review7-group-save.json` / `.xmind`。此前无效 metadata 的旧文件仍保留为失败证据，未将直接修补旧文件当成通过。

继续 Review7 极坐标/手动折点/整体边界编辑保存互通、真实候选定位及矩阵剩余项；这次闭环不代表整体验收完成。


## Review7 极坐标与手动折点互通

极坐标样例由原版修改联系标题并保存后，在 Review7 拖动第二控制点、一次撤销及重做、保存、关闭重开，随后原版再次打开同一输出，77% 适配显示新曲线且无修复提示。归档只改变第二控制点 amount/angle，其它字段及条目逐项相等；证据 `native-review7-polar-save.json` / `.xmind`。

手动直角线在 Review7 51% 缩放拖动中间折点后保存，关闭重开为干净标签，49% 适配显示新路径；原版打开同一输出并 72% 适配，三条路径及修改后的直角线均显示，无修复提示。归档只改变 `relationships/2/flexibleControlPoints/1` 的 x/y，其它折点和归档条目不变；证据 `native-review7-flexible-save.json` / `.xmind`。整体边界原生编辑、真实候选定位及矩阵剩余项继续执行。


## Review7 整体边界与后续颜色修正

Review7 在独立自由主题创建整体边界，格式面板正确显示整个分支说明，不显示错误的起止成员手柄。面板改名后未离焦保存、关闭重开通过，归档只新增该主题的一个 `range: master` 边界。证据 `native-review7-master-save.json` / `.xmind`。原版读取过程中工具再次报告锁屏，此项没有计通过。随后接续时旧临时目录和进程已不存在；归档证据均已保存在项目证据目录，不能据此重复覆盖已编辑输出。

原版已观察的浅填充白字、主题 alpha 差异进一步通过静态导入/渲染字段确认：主题不消费 `svg:fill-opacity` 或边界透明度字段；边界使用 `svg:opacity`。现修正主题缺省文字色不再跟随显式填充自动改色、主题 alpha 不再乘未知透明度字段，保留已有继承层级的浅填充规则及所有原始字段。边界改用原版字段。浅深两表真实浏览器复测通过；第九轮旧的自动对比色测试结论被本次原版证据修正。事实表 `tests/fixtures/xmind-native-color-fields.json`。无填充和更广智能主题规则仍须继续校准。

联系文字缺省颜色改为独立的深灰，与原版手动路径截图及缺省样式一致；格式面板同步，显式文字色优先。文字描边背景尊重工作表显式背景，避免在深色画布留下白色描边。相关保存/一次撤销组件回归通过。

## 手动曲线与折线新增折点

手动曲线和折线显示段间虚拟手柄，拖动新增一个折点；多个 pointermove 只产生一次插入，Escape 取消预览，保存保留旧折点原始坐标和自定义字段。右键已有折点可删除（保留至少一个），删除和新增分别可一步撤销。曲线虚拟点取实际三次曲线中点，折线取线段中点；原版对应行为已由静态工具模型确认，直角线按段移动的虚拟控件仍待补。非零手动控制向量的十单位最小长度按原版读取规则处理，零向量和存档保持原值。

95 项核心、133 项组件通过（`core-virtual-controls.log` / `regression-virtual-controls.log`），TypeScript 通过。真实浏览器 52% 下拖动曲线虚拟点，3→4 控制点；右键删除恢复 3 点，两次撤销依次恢复插入结果和原始曲线，工具栏 Undo 最后禁用。新建浏览器环境 `/tmp/deditor-xmind-round10-preview-virtual`，端口 5174。Review8 已从固定源码快照开始构建，`source-review8-snapshot.json` / `native-build-review8.log`；尚未取得新包原生证据。


## Review8 虚拟折点原生闭环与直角线段控件

Review8 固定快照构建成功并冷启动，二进制 SHA-256 `7704b44c088b4b43ff9fb3e4bb773173b92dd58264a67f0f882a3939b96fc61a`，记录 `build-review8-verification.json`。原生 51% 下拖动曲线虚拟手柄新增折点，保存、关闭重开后保持；原版随后打开同一归档，76% 适应画布显示新的下弯曲线、其它两条路径及七个主题，无修复提示。归档只新增一个控制点，其它 JSON 内容及所有其它条目完全保留。证据 `native-review8-virtual-save.json` / `.xmind`。Review8 浅/深颜色工作表已原生显示核对，白色 alpha 不再错误乘 20%；无填充与更广智能主题规则仍未全部校准。

直角联系新增整段移动手柄：沿线段法向移动整个水平或垂直段，保留两端固定短线和端点，原始控制点自定义字段保留。拖动预览、失焦取消、保存、一步撤销的核心及组件回归通过。真实浏览器在 42% 拖动中间水平线段向下，整段移动而两端不变，Undo 一次恢复三个原始控制点并禁用 Undo。该修改晚于 Review8 二进制；新的 Review9 原生流程仍待执行。

长路径检查复现路由反复复制前缀导致平方级耗时。改为共享候选路径前缀、最后一次重建，500 组确定性随机路径以及 100/1,000/5,000/10,000 点路径与优化前完整结果逐项相等。10,000 点单次从约 1.4 秒降到约 17 ms；新增性能检查确认保存折点顺序和正交线段。证据 `flexible-perf-comparison.json` / `perf-route-final.log`。本机 1,001 主题/1 MB 附件的 10 次布局中位 72.0 ms、10 次保存中位 4.30 ms。

最新核心 96、组件 134 项通过（`core-route-final.log` / `regression-route-final.log`），TypeScript 与 diff check 通过。Review9 第一次快照沿用旧文件清单，遗漏并行 Markdown 更新新增的 `blockHint.ts`，构建正确报缺模块而未产生交付包；已改按当前文件清单补齐并重新记录快照，重新构建中。首次失败日志保留为 `native-build-review9-attempt1.log`，不改动或回退 Markdown 功能。


后续收口：Review7 整体边界已被原版 80% 全图读取，新独立主题边界及嵌套分支、概要、批注保留，无修复提示（`native-review7-master-save.json`）。Review9 包 `39588248…` 构建并冷启动，显示整段移动控件，鼠标拖动尚未完成；随后工具明确报告 Mac 锁屏。智能颜色规则和逐键字号问题继续修复，见[第十一轮记录](xmind-round11-verification-2026-09-11.md)。
