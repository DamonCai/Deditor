# 第十一轮：智能主题文字与字号交互

后续接续：Review10冷启动和主题字号原生互通已补齐，Review11进一步完成边界/联系字号和取色器流程，并修正边框与辅助选择。以下为第十一轮历史状态，最新见[第十二轮记录](xmind-round12-verification-2026-09-11.md)。

整体仍未完成。第十轮保存互通成果不代表所有模板、候选定位和 Windows 已验收。原版智能主题新样例读取时工具明确报告 Mac 锁屏，未要求用户重复确认，继续完成本地修正和浏览器验证。

## 已修复

- 原版静态样式规则确认：自动文字优先选对比度大于 3:1 的白色，再选择主题色板中对比度最高且大于 3:1 的颜色，最后黑色。彩虹主主题使用黑白候选，子主题使用白色与分支色相的 HSL 20% 明度候选；无填充中心主题可沿用达到对比要求的主题填充色。
- 修正主题自动文字、联系在工作表背景上的文字，以及边界标题在边框色上的文字。显式文字色仍优先，不把计算结果写回原始主题/色板。共用纯颜色模块 `src/lib/xmind/colors.ts`，事实依据补入 `tests/fixtures/xmind-native-color-fields.json`。这只是已核实字段的修正，不是所有智能主题像素一致声明。
- 边界面板补文字色、字号和加粗，标题尺寸随字号重新测量，折行和外框范围同步。概要文字仍归概要主题自身编辑。
- 浏览器真实逐键复现字号 14 无法改为 28：输入第一位 2 时受控数字框立即拒绝临时值。主题、联系和边界字号现保留本地草稿，回车/离焦提交一次，Esc 取消；无效值离焦恢复。保存时已有文档刷新桥会提交焦点字段，不丢未离焦字号。

## 验证证据

- 98 项核心通过：`tests/artifacts/xmind-round11/core-smart.log`。含浅/深背景、灰底优先白字、色板文字、颜色 alpha、无填充中心、显式覆盖、联系/边界独立背景及归档不改原始样式。
- 136 项组件通过：`regression-number-fields-final.log`。含边界颜色/字号/加粗保存和三步撤销；三种字号框的临时数字、Esc、未离焦保存、一步撤销和无效值恢复。旧线宽测试改为按明确标签选择线宽，避免新增字号控件后误选第一个数字框。
- 真实浏览器入口 `tests/xmind-review.html?probe=smart-colors`：浅深两表显示、主题和联系面板颜色一致；联系文字编辑并离焦、一步撤销通过。浏览器颜色控件 fill 仅改变控件临时值，未触发颜色提交，未把它计为真实取色器通过；通过切换对象清除该临时值。
- 浏览器逐键输入边界字号 28，离焦后标题放大并换行；加粗后两次撤销恢复原字号和字重。主题字号 20→28 回车、一次撤销恢复 20；联系字号 12→28 Esc 恢复 12，再次输入回车提交并一步撤销。截图在 CUA 工具记录中。
- 原版待测输入：`tests/artifacts/xmind-round11/native-smart-colors.xmind` 是最初主题样例；`with-labels/native-smart-colors.xmind` 是补充联系和整体边界后的独立样例。两者均保留，生成器用排他写入防止覆盖已编辑结果。`scripts/create-xmind-smart-colors.ts` 可指定新的输出目录。
- 第一份 Review10 固定快照全量 `npm run test:all`、性能和原生构建通过，证据 `all-review10-snapshot.log` / `perf-review10-snapshot.log` / `build-review10-smart-only-verification.json`。该包早于边界文字入口和字号草稿修正，不能冒充最终包。当前全部修正的最终快照与新构建继续执行。

## 原生剩余项

Review9 已冷启动且显示整段拖动控件，鼠标操作持续报 noWindowsAvailable；随后原版工具明确报告锁屏。Review9 的 n/i/h/a/o + 空格仍为英文直输，未作为真实 IME 验收；Esc 已取消探针草稿。Review8 虚拟折点和 Review7 整体边界已经完成原版读取，见第十轮记录。最新智能文字、字号与直角整段拖动仍须实际原生保存、重开和原版读取。候选浮窗、精细几何、未覆盖主题组合及 Windows 仍未通过。正式应用没有替换，本任务没有提交或推送。


## 最新固定快照结果

`source-final-snapshot.json` / `build-final-verification.json` 对应包含智能颜色、边界标题控件及字号草稿的 931 文件快照；`npm run test:all` 全部通过（XMind 98、组件 136），TypeScript/Vite/Tauri 构建成功，源码快照未发生变化。测试包 `/tmp/deditor-xmind-review10-app/DEditor XMind Review10.app` 的 SHA-256 为 `49c2dc4f9da5b83968f99b3fbc06eaff64d36eeb989f31db9f2d8fd5ffd2e20b`。这是当前 XMind 修正快照，构建期间其它任务继续更新的三个 Markdown 文件已记录为差异并保留，未覆盖它们。

启动这个包时 CUA 明确返回 Mac 已锁屏且无法解锁，故最新包冷启动、原生字号/颜色操作和保存互通不能计通过。所有可完成的本地回归、构建和本轮浏览器操作已经完成；剩余工作需原生桌面或 Windows 环境。`current-verification-status.json` 列出准确的文件和待执行动作。未请求重复授权，未安装正式应用，未提交或推送。
