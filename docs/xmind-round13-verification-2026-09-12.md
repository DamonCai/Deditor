# XMind 第十三轮验证（2026-09-12，进行中）

整体验收仍未完成。本轮继续处理箭头、联系多行文字和归档撤销；不能以本记录或自动回归通过结束任务。

## 已修正

- 箭头按连线宽度缩放，分别使用各自的端部间距。双箭头改为两个凸三角形；鱼骨补中间横线，修正线宽；圆点、菱形、反向三角、竖线与半箭头尺寸分别校准。起点半箭头保留镜像方向。
- 联系画布草稿和格式面板改用多行输入。Shift+Enter 换行、Enter 提交；组合输入的 Enter/Escape 守卫保留。显示采用独立行，空行保留，适合窗口的边界包括完整多行高度。
- 修正 ZIP 重写使用当前时间，导致相同文档状态的归档字节不一致。完整回归曾在边界字号撤销时失败：所有成员内容完全相同，仅 content.json 的 DOS 时间戳差 2 秒。现保留原成员时间戳，补跨 2031/2041 时钟的确定性回归，未放宽原有精确撤销断言。

## 原版箭头依据及限度

本机原版 `app.asar/renderer/1857.js` 的几何定义确认单位为连线宽度：圆点半径 2、三角/方块长度 4、菱形横向 -1…4、鱼骨三个叉与中间横线、双箭头为两组三角形，半箭头尖端到 x=6。相应端部间距依次为 2/4/4/4/6/4.5/4/2/6。这里只记录几何事实，产品路径独立构造。

生成器 `scripts/create-xmind-arrow-catalog.ts` 生成三张表：1/2/4pt，全部 11 种起终点箭头，部分关系方向交换。浏览器及 Review12 原生 4pt 总览已检查；箭头样例已被原版读取（路径 `/private/tmp/deditor-xmind-review12-cases/arrow-catalog.xmind`，isDirty=false，无修复提示），当前仅取得原版第一张表实际画面。原版表链接辅助点击无效果，细节对照和不同线宽仍未全部完成。单独 arrows-2pt 原版窗口曾长时间空白，不计读取通过。

## 多行原生闭环

最终 Review13 冷启动成功，使用独立 identifier，不覆盖正式应用。

- 自建 multiline-arrows.xmind，选中 hook 联系，格式面板逐键输入 `First line`、两次 Shift+Return、`Third line`。
- 字段保持焦点时 Cmd+S；归档确认精确字符串 `First line\n\nThird line`。
- 隔一段时间改为 Temporary edit，离焦后一次 Undo 恢复已保存多行内容。
- 原生画面没有未保存标记，关闭时没有保存确认；重新打开仍有对应多行联系。
- 归档仅 `/0/relationships/10/title` 改变，所有其他 JSON 字段及 ZIP 成员内容不变。
- 原生画布双击草稿与真实中文候选定位未由以上面板测试替代。原版读取此多行保存版本仍待完成。

浏览器另复现旧版 Shift+Enter 直接关闭草稿；修复后真实按键产生“第一行 / 空行 / Third line”，提交后三个 tspan 具有不同 y 坐标，撤销一次恢复 hook。30 行草稿显示在画布内；提交后点击适合窗口，30 行完整标签的屏幕范围 y=329…585，位于画布 y=36…683 内。中文文本插入不算真实 IME 验收。

## 测试、源码和包

所有本轮证据位于被忽略目录 `tests/artifacts/xmind-round13/`。

- Review12 箭头快照：99 核心、138 组件和完整 test:all / Tauri 构建通过；包 SHA256 `6d8e5f74e9382944007fd176083047508c00b4c7469637240819b7eccbb615fa`。
- 最终 Review13：100 核心、139 组件，完整 test:all 与 TypeScript/Vite/Tauri app 构建通过。
- 最终包 `/tmp/deditor-xmind-review13-app/DEditor XMind Review13.app`，SHA256 `145723ead01902534928ac09acd341e9f529f635791b2281de4d908cf26ba5cd`。
- 固定源码 `/private/tmp/deditor-xmind-native-round13-review13`，基于前一个已验证快照，仅加入本任务修正，未混入并行 Markdown 改动。`source-review13.json` 有 933 个文件哈希，26 个 XMind 运行时文件与当前工作区一致。
- 日志 `all-review13-final.log`、`build-review13-final.log`；早期失败日志保留，不冒充最终通过日志。
- 原生保存样例 `native-review13-multiline-save.xmind`，SHA256 `8648812007853023efb2e306b2d05e68691b48c98dee4028ab7dd8ce6c5619ad`，具体断言 `native-review13-multiline-verification.json`。

## 继续项

原版最终紫色、多行文字重读；箭头粗细、切线方向及端部间距精细对照；直角整段原生拖动；候选浮窗定位；离轴反向、复杂主题组合及 Windows 全流程继续未全部验收。

原生工具本轮出现 noWindowsAvailable/cgWindowNotFound，没有明确锁屏报告，不应一概称 Mac 锁屏。文件对话框前置后重新通过方向键选择曾恢复“打开”；其它时候按钮长时间禁用或窗口空白。原版出现升级弹窗，Cmd+W 正常关闭，未购买或绕过付费功能。单个原生动作不可用时继续独立可执行项。

后续见第十四轮：单表粗线版本已原生保存，并被原版读取，AX 保留 First line / 空行 / Third line。此前三表版本仅打开了未修改的第二/第三张表，不用它冒充多行内容验收。
