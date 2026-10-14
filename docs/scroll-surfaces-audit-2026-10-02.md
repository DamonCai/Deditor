# 滚动交互横向检查（2026-10-02）

## 确认并修复

XMind 画布的非 passive `wheel` 监听器只排除了输入框，没有排除内部可滚动的右键菜单。小窗口中菜单内容溢出时，滚轮被画布 `preventDefault()` 接管，菜单不滚动，背景地图反而平移。

在 `XmindCanvas.tsx` 的排除目标中加入 `.xm-context`；菜单及内部按钮的滚轮交给浏览器处理，原有画布平移/缩放与文本框滚动保持。没有修改文档模型或归档。

真实内置 Chromium 的 720×320 自建样例：菜单 clientHeight=153、scrollHeight=280。修复前向下滚轮后菜单 scrollTop=0，画布 viewBox 的 y 从 -159.2 变成 1382.5485；修复后菜单 scrollTop=127，viewBox 保持不变。亮暗主题均验证。

## 横查范围

检索滚轮监听、preventDefault、pointer-events、绝对定位覆盖层及滚动容器，并使用本轮生成的内容在 `tests/scroll-surfaces-review.html` 挂载真实 EditorGroups。以下均为浏览器证据，不能代替原生 WebView 验收。

| 范围 | 实测或审查结果 |
| --- | --- |
| JSON / XML / 纯文本 | 右侧命中 cm-scroller；拖动后 scrollTop 分别约 19576 / 19537 / 19634.5 |
| 源码缩略图开关 | 开启后右侧拖动到 19654.5；关闭后缩略图移除、滚动位置保持 |
| CSV 阅读 | 右侧拖动后 scrollTop=1742.5 |
| Markdown 阅读编辑 | 目录与正文滚动条不重叠；正文拖动到 6340 |
| Markdown 分栏预览 | 预览拖动到 5170.5 |
| Markdown 表格右键菜单 | 720×320 下 scrollHeight=408、clientHeight=310；拖动从 0 到 98。虽然鼠标处理有 preventDefault，本次实际拖动正常，没有据此修改 |
| 文件对比 | 右侧命中 diff-scroll，拖动到 17998.5；概览使用独立布局列 |
| 普通标签菜单 | 720×320 下菜单完整可见，没有覆盖编辑器滚动条的全高透明层 |
| HTML iframe | 当前控制路径下拖动/滚轮后 scrollTop=0；无产品代码、相同 sandbox 配置的 iframe 也出现同样结果；不带 sandbox 的 iframe 滚轮到 705，顶层页面到 720。不能将该现象归因为产品或直接计通过，待原生环境核查 |
| 提示、图块落点线、隐藏工具条 | 代码审查：非交互装饰使用 pointer-events:none，隐藏视图使用 display:none / hidden；未新增确认缺陷 |

HTML 对照存于忽略目录 `tests/artifacts/scroll-audit-2026-10-02/`，完全由本轮构造。没有删除或放宽产品 sandbox，也未改 HTML 预览。

## 三轮专项与回归

轮 1 — 用例：真实 XmindCanvas 菜单背景和按钮滚轮。
  期望：原生菜单滚动可执行、相机不动、没有文档修改命令。
  实测：事件未取消、相机保持、命令数为零；真实浏览器菜单滚到底部。
  结果：通过。

轮 2 — 用例：横向、反向、Ctrl/Command、按行滚轮与菜单边缘。
  期望：菜单事件不进入画布平移/缩放。
  实测：专项全部保持相机状态；亮暗窄窗菜单均可滚动。
  结果：通过。

轮 3 — 用例：Esc 关闭、画布平移/缩放、编辑输入框和销毁重挂。
  期望：各区域原有滚轮职责保持，重开菜单仍隔离。
  实测：菜单正确关闭；画布 wheel 仍取消默认事件并更新位置/缩放；输入框默认滚动保持；重挂菜单不移动背景。
  结果：通过。

新增 `npm run test:xmind-scroll-routing` 接入 `test:regression`。完整 `test:regression`、119 项 `test:xmind`、9 组 `test:xmind-composition-target`、生产构建和 `git diff --check` 通过。未运行全量 `test:all`，未打原生包，未替换日常应用，未提交或推送。临时浏览器与服务已关闭。
