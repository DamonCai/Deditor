# 阅读编辑 Command+F 正文空白

前期独立验收范围为用户报告的阅读编辑 Command+F 白屏定位、修复及相邻查找回归，使用隔离安装包，未覆盖日常应用。后续当前会话收到用户直接交付指令，已将修复合并进正式构建并安装，见 [正式安装与发布记录](release-1.0.3-search-fix-2026-11-05.md)。

## 复现与修复

使用独立 identifier、无文件关联的 `DEditor Search Diagnostic.app` 和本轮生成的 1802 行、53018 字符 Markdown。完整应用的原生菜单 Command+F 打开查找栏后，正文区域空白；Escape 关闭查找栏后正文恢复。不是仅凭组件测试判断的崩溃。

查找栏使用一个隐藏正文的 CodeMirror 视图承载原有查找控件。全局 `.cm-editor { height: 100% }` 在 macOS 独立文档渲染路径中使该承载视图占满高度，挤掉正文视口。`SearchPanel.tsx` 为这个仅承载控件的视图明确设置 `height: auto`，不改变正文编辑器高度规则。

## 本轮验证

| 用例 | 预期 | 实测与结果 |
| --- | --- | --- |
| 原生长文 Command+F | 正文与查找栏同时可见 | 修复前正文空白，修复后标题和段落持续可见，通过 |
| 原生搜索 Alpha、Enter、Shift+Enter | 前后跳转，保留正文 | 1800 处匹配，计数 1 → 2 → 1，通过 |
| 原生查找开启时切深色主题 | 正文、高亮与查找栏可见 | 主题切换后正常，通过 |
| 原生源码与阅读模式往返后重新查找 | 两种模式正常查找 | 源码查找栏可用，返回阅读后正文与 1 / 1800 匹配可见，通过 |
| 组件只读/可编辑、亮/暗及独立文档 | 打开、导航、关闭、重开，不修改原文 | `npm run test:markdown-current` 21 组通过；组件测试不验证真实布局 |

生产构建和隔离原生构建通过。原生窗口缩窄拖动未成功，不记为 720px 验收；未新增 Windows、物理输入法或系统拖放结论。

独立原生构建入口：`npx tauri build --config tests/markdown-search-native.conf.json --bundles app --features tauri/devtools`。浏览器样例为 `/tests/markdown-search-footer-review.html`，加 `?frame` 可强制使用独立文档。
